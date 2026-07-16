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

    result_text, result_html = None, None
    if error is None and result is not None:
        html = getattr(result, "_repr_html_", None)
        if callable(html):
            try:
                result_html = html()  # pandas tables!
            except Exception:
                result_html = None
        if result_html is None:
            result_text = repr(result)

    try:
        figures = collect_figures(req.get("fig_format", "png"), req.get("fig_dpi", 150))
    except Exception:
        figures = []

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
