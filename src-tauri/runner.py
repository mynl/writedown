"""Writedown python cell runner — JSON-lines protocol on stdin/stdout.

Embedded in the app via include_str! and written to ~/.writedown/cache/runner.py at each
kernel spawn (cache is disposable; a real file is debuggable and avoids -c quoting).
Spawned as `<python> -u runner.py` with MPLBACKEND=Agg so the backend is fixed before any
user import. One JSON object per line in, one per line out:

  -> {"id": 1, "code": "...", "reset": true, "cwd": "C:/docs/paper",
      "fig_format": "png", "fig_dpi": 150, "traceback_mode": "context"}
  <- {"id": 1, "stdout": "...", "stderr": "...", "result_text": null,
      "result_html": null, "figures": [{"format": "png", "b64": "..."}],
      "error": null, "ms": 12}

The last expression's value is reported the way Jupyter would: `text/html` from its MIME
bundle, else `_repr_html_()`, else an `image/png` / `image/svg+xml` from the bundle (as a
figure), else `text/plain` from the bundle, else `repr()`.

`reset: true` (the first cell of every render) starts a fresh namespace while sys.modules
survives — imports are paid once, yet each render is a deterministic clean top-to-bottom
run. `cwd` is applied to every cell, not just the reset, so Run This Cell against another
document re-anchors relative paths (issue D.10).

`traceback_mode` (issue D.09) selects how a failure is reported: minimal / plain / context
(default) / verbose (locals per frame) / docs (docstring per frame). There is no IPython
here and no CPython flag for any of this — but this runner IS the formatter, so the modes
cost nothing and run only when a cell raises. An in-cell `%xmode <mode>` overrides it; it
is the one magic that is interpreted rather than blanked.

On stdin EOF the runner exits 0, so a dead app never leaves an orphan. Internal failures
become error replies; the runner itself never crashes.
"""

import ast
import base64
import contextlib
import io
import json
import linecache
import os
import re
import sys
import time
import traceback

# The app writes requests as raw UTF-8 JSON, but a piped stdin on Windows defaults to the
# locale codepage (cp1252) — non-ASCII in cell code would arrive mojibake'd (λ -> Î»).
# Replies are safe either way: json.dumps escapes non-ASCII by default.
sys.stdin.reconfigure(encoding="utf-8", errors="replace")

ns = {"__name__": "__main__"}


def reply(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


TB_MODES = ("minimal", "plain", "context", "verbose", "docs")
# Traceback verbosity. Two layers, because a render is many requests:
#   tb_mode      — what the app asked for ([render] traceback_mode or `wd-traceback:`),
#                  refreshed from every request;
#   xmode_override — an in-cell `%xmode`, which must outlive the CELL it appears in and
#                  apply to the rest of the render, then be forgotten when the next render
#                  starts. Cleared on `reset`.
# Keeping them apart is the whole fix for "%xmode in cell 1, failure in cell 2 ignored it".
tb_mode = "context"
xmode_override = None
# The last cwd this runner applied, so a cell's own os.chdir() survives the rest of the
# render while a switch to another document still re-anchors (issue D.10).
applied_cwd = None


def clean(code):
    # Blank IPython-isms (%magic, !shell, ?help) and #| option lines, preserving line
    # numbering so tracebacks map back to the cell (mirrors the app's syntax checker).
    #
    # ONE exception (issue D.09): `%xmode <mode>` is interpreted rather than discarded.
    # There is no IPython here, but we ARE the traceback formatter, so the mode is ours to
    # honour — and it costs nothing, since it is read while the line is being blanked
    # anyway. Every other magic is still deleted.
    global xmode_override
    out = []
    for line in code.split("\n"):
        t = line.lstrip()
        if t.startswith("%"):
            parts = t[1:].split()
            if parts and parts[0] in ("xmode", "xmode?") and len(parts) > 1:
                m = parts[1].strip().lower()
                if m in TB_MODES:
                    xmode_override = m
            out.append("")
        elif t.startswith(("!", "?", "#|")):
            out.append("")
        else:
            out.append(line)
    return "\n".join(out)


def run_cell(code):
    """exec the cell; if the last statement is an expression, eval it for its value."""
    # Make the cell's own source visible to linecache, so traceback frames show the line
    # that failed instead of a bare file/line pair (`<cell>` is not a real file). This is
    # what IPython does, and it improves EVERY mode, plain included.
    linecache.cache["<cell>"] = (len(code), None, code.splitlines(keepends=True), "<cell>")
    tree = ast.parse(code, "<cell>", "exec")
    result = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        last = ast.Expression(tree.body[-1].value)
        ast.copy_location(last, tree.body[-1])
        del tree.body[-1]
        exec(compile(tree, "<cell>", "exec"), ns)
        result = eval(compile(last, "<cell>", "eval"), ns)
    else:
        exec(compile(tree, "<cell>", "exec"), ns)
    return result


def error_line(exc):
    """Cell-relative 1-based line of the failure (last <cell> frame; SyntaxError direct)."""
    if isinstance(exc, SyntaxError) and exc.filename == "<cell>":
        return exc.lineno
    line = None
    for fs in traceback.extract_tb(exc.__traceback__):
        if fs.filename == "<cell>":
            line = fs.lineno
    return line


def _short_repr(value, limit=200):
    """repr() that can neither explode nor flood the pane. A broken __repr__ is common in
    exactly the half-constructed objects you are debugging, so it must not mask the real
    error."""
    try:
        r = repr(value)
    except BaseException as e:
        return "<repr failed: %s>" % type(e).__name__
    r = " ".join(r.split())
    return r if len(r) <= limit else r[: limit - 1] + "…"


def _frame_locals(frame, src):
    """Interesting locals of one frame, as `name = repr` lines. Modules and dunders are
    noise; `self` is kept because it usually is the point.

    At MODULE level `f_locals` is the entire cell namespace — every variable you have
    defined — which buries the failure instead of explaining it. There, show only names
    that actually appear in the failing source line (what IPython's Verbose does), so a
    top-level `df.merge(other)` reports `df` and `other` and nothing else.
    """
    import types

    at_module = frame.f_code.co_name == "<module>"
    wanted = set(re.findall(r"[A-Za-z_]\w*", src)) if at_module else None
    lines = []
    for name, value in list(frame.f_locals.items()):
        if name.startswith("__") or isinstance(value, types.ModuleType):
            continue
        if wanted is not None and name not in wanted:
            continue
        lines.append("        %s = %s" % (name, _short_repr(value)))
        if len(lines) >= 25:
            lines.append("        ...")
            break
    # Say so rather than print nothing. A frame with no bindings worth showing — `import
    # missing_mod` is the canonical case — otherwise renders identically to `context`, and
    # the mode reads as broken when it is merely quiet.
    return lines or ["        (no locals)"]


def _frame_doc(frame):
    """First lines of the docstring of the function this frame is running, best-effort.

    A frame carries a code object, not a function, so the function has to be recovered:
    module-level by name from globals, methods via `self`/`cls`. Closures and some
    decorated functions cannot be resolved — say so rather than show nothing, so the mode
    never looks broken when it is merely defeated.
    """
    import inspect

    name = frame.f_code.co_name
    if name == "<module>":
        return []  # module level: there is no function, so there is nothing to document
    fn = None
    obj = frame.f_locals.get("self") or frame.f_locals.get("cls")
    if obj is not None:
        fn = getattr(type(obj) if not isinstance(obj, type) else obj, name, None)
    if fn is None:
        fn = frame.f_globals.get(name)
    if fn is None:
        return ["        (docstring unavailable: closure or decorated function)"]
    try:
        doc = inspect.getdoc(fn)
    except Exception:
        doc = None
    if not doc:
        return ["        (no docstring)"]
    body = doc.strip().split("\n")[:5]
    return ["        " + ln for ln in body]


def format_error(exc, mode):
    """The traceback text for `mode` (issue D.09).

    CPython has no flag for any of this — `-X no_debug_ranges` is the only `-X` that
    touches traceback shape and it goes the wrong way — but it needs none, because this
    function IS the formatter. Nothing here runs unless a cell raises.
    """
    if mode == "minimal":
        return "".join(traceback.format_exception_only(type(exc), exc)).rstrip()
    if mode == "plain":
        return traceback.format_exc().rstrip()

    # context / verbose / docs: drop our own frames (handle → run_cell → exec), which are
    # noise the author never wrote, and keep everything from <cell> down.
    frames = list(traceback.walk_tb(exc.__traceback__))
    start = next((i for i, (f, _) in enumerate(frames) if f.f_code.co_filename == "<cell>"), 0)
    frames = frames[start:]

    out = ["Traceback (most recent call last):"] if frames else []
    for frame, lineno in frames:
        code = frame.f_code
        where = "<cell>" if code.co_filename == "<cell>" else code.co_filename
        out.append('  File "%s", line %d, in %s' % (where, lineno, code.co_name))
        src = linecache.getline(code.co_filename, lineno).strip()
        if src:
            out.append("    " + src)
        if mode == "verbose":
            out.extend(_frame_locals(frame, src))
        elif mode == "docs":
            out.extend(_frame_doc(frame))
    out.extend(ln.rstrip("\n") for ln in traceback.format_exception_only(type(exc), exc))
    return "\n".join(out).rstrip()


def mime_bundle(obj):
    """The object's Jupyter MIME bundle, or None (issue C.06).

    Asking only for ``_repr_html_`` misses objects that publish a bundle instead —
    greater_tables' ``GT`` is the case in point: no ``_repr_html_``, and its ``__repr__``
    is deliberately the *text* table, so we used to take the text fallback and show a
    monospace grid where Jupyter and Quarto show HTML.
    """
    fn = getattr(obj, "_repr_mimebundle_", None)
    if not callable(fn):
        return None
    try:
        bundle = fn(include=None, exclude=None)
    except TypeError:  # implementations that take no keywords
        try:
            bundle = fn()
        except Exception:
            return None
    except Exception:
        return None
    if isinstance(bundle, tuple) and bundle:
        bundle = bundle[0]  # (data, metadata)
    return bundle if isinstance(bundle, dict) else None


def as_text(value):
    """A bundle entry as a string — nbformat allows a list of lines as well as a string."""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)) and all(isinstance(v, str) for v in value):
        return "".join(value)
    return None


def bundle_figure(bundle):
    """A bundle's image as a figure dict, or None. PNG/JPEG arrive base64-encoded per the
    Jupyter convention; SVG arrives as markup, so encode it to match the transport."""
    png = as_text(bundle.get("image/png"))
    if png is not None:
        return {"format": "png", "b64": "".join(png.split())}
    svg = as_text(bundle.get("image/svg+xml"))
    if svg is not None:
        return {"format": "svg", "b64": base64.b64encode(svg.encode("utf-8")).decode("ascii")}
    return None


def collect_figures(fmt, dpi):
    figs = []
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return figs
    try:
        for num in plt.get_fignums():
            buf = io.BytesIO()
            plt.figure(num).savefig(buf, format=fmt, dpi=dpi, bbox_inches="tight")
            figs.append(
                {"format": fmt, "b64": base64.b64encode(buf.getvalue()).decode("ascii")}
            )
    finally:
        plt.close("all")
    return figs


def handle(req):
    global ns, tb_mode, xmode_override, applied_cwd
    t0 = time.perf_counter()
    mode = req.get("traceback_mode")
    tb_mode = mode if mode in TB_MODES else "context"
    if req.get("reset"):
        # A new render: a %xmode from the previous one must not leak into it.
        xmode_override = None
        ns = {"__name__": "__main__"}
        plt = sys.modules.get("matplotlib.pyplot")
        if plt is not None:
            plt.close("all")

    # cwd on EVERY cell, not only on reset (issue D.10). It used to ride along with the
    # namespace reset, so "Run This Cell" against a document in another folder inherited
    # whichever folder the last full render had chdir'd to — a relative read_csv silently
    # resolved against the wrong document.
    #
    # The comparison is against the cwd WE last applied, not against os.getcwd(): a cell
    # that calls os.chdir() itself must keep its effect for the rest of the render, and
    # comparing with the live cwd would undo it on the very next cell.
    cwd = req.get("cwd")
    if cwd and (req.get("reset") or cwd != applied_cwd):
        try:
            os.chdir(cwd)  # relative pd.read_csv("data.csv") works like Quarto
            applied_cwd = cwd
        except OSError:
            pass

    out_io, err_io = io.StringIO(), io.StringIO()
    result, error = None, None
    try:
        with contextlib.redirect_stdout(out_io), contextlib.redirect_stderr(err_io):
            result = run_cell(clean(req.get("code", "")))
    except BaseException as e:  # report everything (incl. SystemExit), never crash
        error = {
            "message": "%s: %s" % (type(e).__name__, e),
            # An in-cell %xmode wins over the configured mode — including one written in an
            # EARLIER cell of the same render, which is the point of keeping it separate.
            "traceback": format_error(e, xmode_override or tb_mode),
            "line": error_line(e),
        }

    # Richest representation of the last expression's value, in Jupyter's own order:
    # HTML (bundle first, then _repr_html_ — pandas tables), else an image from the bundle,
    # else text (the bundle's text/plain, else repr).
    result_text, result_html, result_figure = None, None, None
    if error is None and result is not None:
        bundle = mime_bundle(result) or {}
        result_html = as_text(bundle.get("text/html"))
        if result_html is None:
            fn = getattr(result, "_repr_html_", None)
            if callable(fn):
                try:
                    result_html = as_text(fn())
                except Exception:
                    result_html = None
        if result_html is None:
            result_figure = bundle_figure(bundle)
            if result_figure is None:
                result_text = as_text(bundle.get("text/plain")) or repr(result)

    try:
        figures = collect_figures(req.get("fig_format", "png"), req.get("fig_dpi", 150))
    except Exception:
        figures = []
    # The value's own image comes after any matplotlib figures the cell drew — output order
    # follows the cell, and the last expression is the last thing in it.
    if result_figure is not None:
        figures.append(result_figure)

    return {
        "id": req.get("id"),
        "stdout": out_io.getvalue(),
        "stderr": err_io.getvalue(),
        "result_text": result_text,
        "result_html": result_html,
        "figures": figures,
        "error": error,
        "ms": int((time.perf_counter() - t0) * 1000),
    }


def main():
    reply({"ready": True, "python": sys.version.split()[0]})
    for raw in sys.stdin:  # EOF -> exit 0
        try:
            req = json.loads(raw)
        except Exception:
            continue
        try:
            reply(handle(req))
        except Exception:
            reply(
                {
                    "id": req.get("id"),
                    "stdout": "",
                    "stderr": "",
                    "result_text": None,
                    "result_html": None,
                    "figures": [],
                    "error": {
                        "message": "runner internal error",
                        "traceback": traceback.format_exc(),
                        "line": None,
                    },
                    "ms": 0,
                }
            )


if __name__ == "__main__":
    main()
