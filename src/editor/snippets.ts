// Palette "Insert: <name>" snippets. Built-ins below; config [snippets] adds or overrides
// by display name (setting a name to "" removes it — same override rules as [keys]).
// Bodies use CodeMirror's snippet-field syntax — ${} marks a tab-through cursor stop —
// plus ${SELECTION}, replaced with the current selection before the template applies,
// so wrap-around snippets work. Insertion is palette-time only: zero baseline cost.
import { snippet } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";

// The author's two most-used inserts ship as defaults (issues list item 9).
export const DEFAULT_SNIPPETS: Record<string, string> = {
  "Aligned Math": "$$\n\\begin{aligned}\n${SELECTION}${}\n\\end{aligned}\n$$\n",
  "Python Code Cell": "```{python}\n${SELECTION}${}\n```\n",
  // Issue D.07: a ready-made analysis of the Tab-completion frequency store. The lowercase
  // fold mirrors what the completer actually queries (wordFreq.ts buildAggregate), so these
  // numbers agree with what Tab offers you. Static text — no backend call, nothing to keep
  // in sync. The store holds at most 50 files × 250 words, so this is small and fast.
  "Word Frequency Report": [
    "```{python}",
    "import json, pandas as pd",
    "from pathlib import Path",
    'd = json.loads((Path.home() / ".writedown" / "word-frequency.json").read_text("utf-8"))',
    "df = pd.DataFrame(",
    '    [(f, w, n) for f, e in d["files"].items() for w, n in e["words"].items()],',
    '    columns=["file", "word", "n"],',
    ")",
    "top = (df.groupby(df.word.str.lower())",
    '         .agg(total=("n", "sum"), files=("file", "nunique"), form=("word", "first"))',
    '         .sort_values("total", ascending=False))',
    "${}top.head(10)",
    "```",
    "",
  ].join("\n"),
};

/** Effective snippets: defaults overlaid with config `[snippets]` ("" removes). */
export function mergedSnippets(user?: Record<string, string> | null): Map<string, string> {
  const map = new Map(Object.entries(DEFAULT_SNIPPETS));
  if (user) {
    for (const [name, body] of Object.entries(user)) {
      const b = String(body);
      if (b.trim() === "") map.delete(name);
      else map.set(name, b);
    }
  }
  return map;
}

/** Apply a snippet body at the current selection (replacing it); Tab walks the ${} stops. */
export function insertSnippet(view: EditorView, body: string): void {
  const sel = view.state.selection.main;
  const selected = view.state.sliceDoc(sel.from, sel.to);
  const tpl = body.split("${SELECTION}").join(selected);
  snippet(tpl)(view, null, sel.from, sel.to);
  view.focus();
}
