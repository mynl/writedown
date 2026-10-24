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
  // Named for what the author calls it, not for what the file is called: he searched the
  // palette for "large word report" and found nothing, because the verb was titled "Word
  // Frequency Report". The palette matches on the title, so the title carries both.
  "Large Word Report (word frequency, from Tab completion)": [
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

// A snippet field (`${}`, `${1}`, `${1:text}`, `${name}`, `#{…}`) or an escaped brace, as
// CodeMirror's Snippet.parse reads them, kept to one line as it does.
const FIELD_OR_ESCAPE = /[#$]\{(?:(\d+)(?::([^{}\n]*))?|((?:\\[{}]|[^{}\n])*))\}|\\([{}])/g;

/** A template fragment as the plain text the snippet would insert: each field becomes its
 *  placeholder text (empty for `${}`), `\{` and `\}` lose their backslash, exactly as
 *  Snippet.parse does. `field` is the offset of the first field, or null. */
function literalOf(part: string): { text: string; field: number | null } {
  let text = "";
  let field: number | null = null;
  let last = 0;
  for (const m of part.matchAll(FIELD_OR_ESCAPE)) {
    text += part.slice(last, m.index);
    if (m[4] !== undefined) {
      text += m[4];
    } else {
      if (field === null) field = text.length;
      text += (m[2] || m[3] || "").replace(/\\([{}])/g, "$1");
    }
    last = m.index + m[0].length;
  }
  return { text: text + part.slice(last), field };
}

/** Wrap a non-empty selection in a template containing `${SELECTION}` (issue J.17).
 *
 *  The selected text goes in VERBATIM. CodeMirror's `snippet()` cannot carry it: its parser
 *  drops the backslash from `\{` and `\}` (a Python `r"\{"` or LaTeX `\{` lost it) and makes
 *  fields of any `${…}` in the selection, and its instantiate step re-indents every line
 *  after the first and turns leading tabs into spaces. So the template's literal parts are
 *  resolved here and one plain change is dispatched: one undo step, no tab stops.
 *
 *  A block template (body ending in a newline, as both built-ins do) takes whole lines, so
 *  a selection starting mid-line still puts the opening fence on its own line. A selection
 *  ending at column 0 of a later line stops at the previous line's end. The caret lands on
 *  the template's first field, else after the block. */
function wrapSelection(view: EditorView, body: string): void {
  const { state } = view;
  const sel = state.selection.main;
  const block = body.endsWith("\n");
  let from = sel.from;
  let to = sel.to;
  if (block) {
    const first = state.doc.lineAt(sel.from);
    let last = state.doc.lineAt(sel.to);
    if (sel.to === last.from && last.number > first.number) last = state.doc.line(last.number - 1);
    from = first.from;
    to = last.to;
  }
  const selected = state.sliceDoc(from, to);
  const at = body.indexOf("${SELECTION}");
  const pre = literalOf(body.slice(0, at));
  // A second ${SELECTION} (unusual) gets the same text; fields after the first are inert.
  const postParts = body.slice(at + "${SELECTION}".length).split("${SELECTION}").map(literalOf);
  let post = postParts.map((p) => p.text).join(selected);
  // The whole-line range stops before the last line's newline; the document's own newline
  // then ends the block, so the template's final one would leave a blank line behind it.
  if (block && to < state.doc.length && post.endsWith("\n")) post = post.slice(0, -1);
  const insert = pre.text + selected + post;
  const cursor =
    pre.field !== null
      ? from + pre.field
      : postParts[0].field !== null
        ? from + pre.text.length + selected.length + postParts[0].field
        : from + insert.length;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: Math.min(cursor, from + insert.length) },
    scrollIntoView: true,
    userEvent: "input.snippet",
  });
}

/** Apply a snippet body at the current selection (replacing it); Tab walks the ${} stops.
 *  A non-empty selection with a `${SELECTION}` template is wrapped verbatim instead (see
 *  wrapSelection); an empty selection keeps the snippet path and its fields. */
export function insertSnippet(view: EditorView, body: string): void {
  const sel = view.state.selection.main;
  if (!sel.empty && body.includes("${SELECTION}")) {
    wrapSelection(view, body);
    view.focus();
    return;
  }
  const tpl = body.split("${SELECTION}").join("");
  snippet(tpl)(view, null, sel.from, sel.to);
  view.focus();
}
