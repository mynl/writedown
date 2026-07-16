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
