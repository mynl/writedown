"""Writedown python cell runner — JSON-lines protocol on stdin/stdout.

Embedded in the app via include_str! and written to ~/.writedown/cache/runner.py at each
kernel spawn (cache is disposable; a real file is debuggable and avoids -c quoting).
Spawned as `<python> -u runner.py` with MPLBACKEND=Agg so the backend is fixed before any
user import. One JSON object per line in, one per line out:

  -> {"id": 1, "code": "...", "reset": true, "cwd": "C:/docs/paper",
      "fig_format": "png", "fig_dpi": 150}
  <- {"id": 1, "stdout": "...", "stderr": "...", "result_text": null,
      "result_html": null, "figures": [{"format": "png", "b64": "..."}],
      "error": null, "ms": 12}

The last expression's value is reported the way Jupyter would: `text/html` from its MIME
bundle, else `_repr_html_()`, else an `image/png` / `image/svg+xml` from the bundle (as a
figure), else `text/plain` from the bundle, else `repr()`.

`reset: true` (the first cell of every render) starts a fresh namespace while sys.modules
survives — imports are paid once, yet each render is a deterministic clean top-to-bottom
run. On stdin EOF the runner exits 0, so a dead app never leaves an orphan. Internal
failures become error replies; the runner itself never crashes.
"""

import ast
import base64
import contextlib
import io
import json
import os
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


def clean(code):
    # Blank IPython-isms (%magic, !shell, ?help) and #| option lines, preserving line
    # numbering so tracebacks map back to the cell (mirrors the app's syntax checker).
    out = []
    for line in code.split("\n"):
        t = line.lstrip()
        out.append("" if t.startswith(("%", "!", "?", "#|")) else line)
    return "\n".join(out)


def run_cell(code):
    """exec the cell; if the last statement is an expression, eval it for its value."""
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
    global ns
    t0 = time.perf_counter()
    if req.get("reset"):
        ns = {"__name__": "__main__"}
        cwd = req.get("cwd")
        if cwd:
            try:
                os.chdir(cwd)  # relative pd.read_csv("data.csv") works like Quarto
            except OSError:
                pass
        plt = sys.modules.get("matplotlib.pyplot")
        if plt is not None:
            plt.close("all")

    out_io, err_io = io.StringIO(), io.StringIO()
    result, error = None, None
    try:
        with contextlib.redirect_stdout(out_io), contextlib.redirect_stderr(err_io):
            result = run_cell(clean(req.get("code", "")))
    except BaseException as e:  # report everything (incl. SystemExit), never crash
        error = {
            "message": "%s: %s" % (type(e).__name__, e),
            "traceback": traceback.format_exc(),
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
