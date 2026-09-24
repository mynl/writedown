// Reflow paragraph (issue I.06): Emacs M-q / Sublime Alt+Q — hard-wrap the paragraph at the
// caret (or each paragraph a selection touches) to `[editor] fill_column` (default 80).
// Explicit command only — never automatic, never on save. One undo step, like any edit.
//
// Markdown awareness: list items keep their prefix and get a hanging indent, and a reflow
// never merges adjacent items; blockquote prefixes (nested included) are stripped, re-applied
// per line. Fences, table rows, headings, YAML front matter and display math are refused with
// a status-bar note and no change — those constructs are line-structured, not prose.
import type { StateCommand } from "@codemirror/state";
import { mathRegions } from "./math";
import { useStore } from "../store";

export const DEFAULT_FILL_COLUMN = 80;

// A list-item opener: bullet or ordered marker, optional checkbox. Its matched width sets
// the hanging indent for the item's continuation lines.
const LIST_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
// One or more `>` quote markers (nested `> >` matches whole) with their spacing.
const QUOTE_RE = /^\s*(?:>\s?)+/;

type LineKind = "text" | "blank" | "special";

/** Classify every document line: prose ("text"), paragraph break ("blank"), or a construct
 *  reflow must not touch ("special": front matter, fences and their interiors, headings,
 *  table rows). Same fence/front-matter tracking pattern as outline/parse.ts. */
function classifyLines(lines: string[]): LineKind[] {
  const kinds: LineKind[] = new Array(lines.length);
  let i = 0;
  if (lines[0]?.trim() === "---") {
    let j = 1;
    while (j < lines.length && lines[j].trim() !== "---") j++;
    if (j < lines.length) {
      for (let k = 0; k <= j; k++) kinds[k] = "special";
      i = j + 1;
    }
  }
  let inFence = false;
  let fenceChar = "";
  for (; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        inFence = false;
      }
      kinds[i] = "special";
      continue;
    }
    if (inFence) kinds[i] = "special";
    else if (line.trim() === "") kinds[i] = "blank";
    else if (/^\s*#{1,6}\s/.test(line)) kinds[i] = "special"; // ATX heading
    else if (/^\s*[|+]/.test(line)) kinds[i] = "special"; // table row / grid-table rule
    else kinds[i] = "text";
  }
  return kinds;
}

/** Greedy fill: words onto lines of at most `fill` columns (prefix included). A word that
 *  alone exceeds the fill column stays on its own line unbroken — no word is ever split. */
function wrap(words: string[], firstPrefix: string, hangPrefix: string, fill: number): string {
  const out: string[] = [];
  let line = firstPrefix;
  let bare = true; // no word on this line yet — the first word always fits
  for (const w of words) {
    if (!bare && line.length + 1 + w.length > fill) {
      out.push(line);
      line = hangPrefix;
      bare = true;
    }
    line = bare ? line + w : line + " " + w;
    bare = false;
  }
  out.push(line);
  return out.join("\n");
}

/** Reflow one paragraph (lines `lo..hi` inclusive): compute its quote/list prefixes, join
 *  and re-wrap. Returns the replacement text, or null when the paragraph is a single word
 *  situation with nothing to do (caller compares against the original anyway). */
function reflowBlock(lines: string[], lo: number, hi: number, fill: number): string {
  const first = lines[lo];
  const quote = QUOTE_RE.exec(first)?.[0] ?? "";
  const afterQuote = first.slice(quote.length);
  const list = LIST_RE.exec(afterQuote);
  let firstPrefix: string;
  let hangPrefix: string;
  if (list) {
    firstPrefix = quote + list[0];
    hangPrefix = quote + " ".repeat(list[0].length);
  } else {
    const indent = /^\s*/.exec(afterQuote)![0];
    firstPrefix = hangPrefix = quote + indent;
  }
  const words: string[] = [];
  for (let i = lo; i <= hi; i++) {
    let body = lines[i].replace(QUOTE_RE, "");
    if (i === lo && list) body = body.slice(list[0].length);
    for (const w of body.split(/\s+/)) if (w) words.push(w);
  }
  return wrap(words, firstPrefix, hangPrefix, fill);
}

/** The Alt+Q command. Operates on the primary selection: the blank-line-delimited paragraph
 *  at the caret, or every paragraph a selection touches, each processed independently. */
export const reflowParagraph: StateCommand = ({ state, dispatch }) => {
  const st = useStore.getState();
  const fill = st.editorSettings?.fill_column ?? DEFAULT_FILL_COLUMN;
  const doc = state.doc;
  const text = doc.toString();
  const lines = text.split("\n");
  const kinds = classifyLines(lines);

  // Display math is region-, not line-shaped: mark every line a `$$…$$` block touches.
  // (mathRegions also reports inline `$…$`, which reflow handles fine — filter to display.)
  for (const [a, b] of mathRegions(text)) {
    if (text.slice(a, a + 2) !== "$$") continue;
    const from = doc.lineAt(a).number - 1;
    const to = doc.lineAt(Math.max(a, b - 1)).number - 1;
    for (let k = from; k <= to; k++) if (kinds[k] === "text") kinds[k] = "special";
  }

  const sel = state.selection.main;
  let lo = doc.lineAt(sel.from).number - 1; // 0-based line indices
  let hi = doc.lineAt(sel.to).number - 1;
  // A bare caret extends to its whole paragraph; a selection already names its lines and
  // is only widened to complete the paragraphs at its two ends.
  while (lo > 0 && kinds[lo - 1] === "text" && kinds[lo] === "text" && !LIST_RE.test(lines[lo].replace(QUOTE_RE, ""))) lo--;
  while (hi < lines.length - 1 && kinds[hi + 1] === "text" && kinds[hi] === "text" && !LIST_RE.test(lines[hi + 1].replace(QUOTE_RE, ""))) hi++;

  // Split [lo, hi] into paragraphs: runs of "text" lines, further split where a list item
  // begins — so a reflow never merges adjacent items.
  const paras: Array<[number, number]> = [];
  let start = -1;
  for (let i = lo; i <= hi + 1; i++) {
    const isText = i <= hi && kinds[i] === "text";
    const opensItem = isText && i > start && start >= 0 && LIST_RE.test(lines[i].replace(QUOTE_RE, ""));
    if (isText && start >= 0 && !opensItem) continue;
    if (start >= 0) paras.push([start, i - 1]);
    start = isText ? i : -1;
  }

  if (paras.length === 0) {
    st.showStatusMessage("Reflow: nothing to wrap here (fence, table, heading, front matter, or math)");
    return true;
  }

  const changes = [];
  for (const [a, b] of paras) {
    const from = doc.line(a + 1).from;
    const to = doc.line(b + 1).to;
    const replaced = reflowBlock(lines, a, b, fill);
    if (replaced !== state.sliceDoc(from, to)) changes.push({ from, to, insert: replaced });
  }
  if (changes.length === 0) return true; // already wrapped — nothing to change
  dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input.reflow" }));
  return true;
};
