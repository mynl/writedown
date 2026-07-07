// Document checks for Markdown/Quarto docs: Python syntax in ```{python} cells and
// duplicate Quarto labels. Parsing happens in Rust (rustpython-parser compiled into the
// app) — no external Python or environment, deliberately (the Quarto-render lesson).
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { checkDocument } from "../api";

export const documentLint = [
  lintGutter(),
  linter(
    async (view) => {
      let checks;
      try {
        checks = await checkDocument(view.state.doc.toString());
      } catch {
        return []; // backend unavailable — never block editing
      }
      const doc = view.state.doc;
      const out: Diagnostic[] = [];
      for (const c of checks) {
        if (c.line < 1 || c.line > doc.lines) continue;
        const l = doc.line(c.line);
        const from = l.from + Math.min(c.col, l.length);
        const to = l.to > from ? l.to : Math.min(doc.length, from + 1);
        out.push({ from, to, severity: c.severity, message: c.message });
      }
      return out;
    },
    { delay: 500 },
  ),
];
