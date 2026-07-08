// Line/list editing commands (spec §10 neighbourhood). Both are explicit user actions
// that edit the document as a single undo step — never automatic. US spelling throughout.
import { type ChangeSpec, type StateCommand } from "@codemirror/state";

// ---- Join lines (Ctrl+Shift+J), Sublime-style -------------------------------------
// Empty selection → join the current line with the next. A multi-line selection →
// collapse all of its lines into one. The seam becomes a single space, unless the upper
// line is empty or already ends in whitespace; the lower line's indentation is dropped.
export const joinLines: StateCommand = ({ state, dispatch }) => {
  const doc = state.doc;
  const changes: ChangeSpec[] = [];
  for (const range of state.selection.ranges) {
    const first = doc.lineAt(range.from);
    const lastLine = doc.lineAt(range.to);
    let lastNo = lastLine.number;
    if (range.empty) lastNo = Math.min(first.number + 1, doc.lines);
    // A selection that ends exactly at a line start hasn't really touched that line.
    else if (range.to === lastLine.from && lastNo > first.number) lastNo--;
    for (let n = first.number; n < lastNo; n++) {
      const line = doc.line(n);
      const next = doc.line(n + 1);
      const lead = /^\s*/.exec(next.text)![0].length;
      const sep = line.text.length === 0 || /\s$/.test(line.text) ? "" : " ";
      changes.push({ from: line.to, to: next.from + lead, insert: sep });
    }
  }
  if (!changes.length) return false;
  dispatch(state.update({ changes, scrollIntoView: true, userEvent: "input.joinLines" }));
  return true;
};

// ---- Renumber an ordered list (palette: "Renumber Ordered List") -------------------
// Operates on the ordered list around the cursor, or on the ordered items within a
// multi-line selection. Each indent level is numbered independently and restarts when a
// deeper level intervenes; the first item at a level keeps its written start number (a
// list that starts at 3 stays 3, 4, 5…). The `.`/`)` delimiter is preserved — only the
// digits change. Unordered bullets and continuation lines are left alone.
const ORDERED = /^(\s*)(\d+)[.)]\s/;
const LISTITEM = /^\s*(?:\d+[.)]|[-*+])\s/;

export const renumberOrderedList: StateCommand = ({ state, dispatch }) => {
  const doc = state.doc;
  const sel = state.selection.main;
  const fromLine = doc.lineAt(sel.from).number;
  const toLine = doc.lineAt(sel.to).number;

  const isItem = (n: number) => LISTITEM.test(doc.line(n).text);
  const blank = (n: number) => doc.line(n).text.trim() === "";

  // Block = the selection (when it spans lines), else expand from the cursor across
  // contiguous list-item lines, tolerating single blank-line gaps in loose lists.
  let start = fromLine;
  let end = toLine;
  if (fromLine === toLine) {
    if (!isItem(start)) return false;
    while (start > 1 && (isItem(start - 1) || (blank(start - 1) && start > 2 && isItem(start - 2)))) start--;
    while (end < doc.lines && (isItem(end + 1) || (blank(end + 1) && end < doc.lines - 1 && isItem(end + 2)))) end++;
  }

  const next = new Map<number, number>(); // indent length → next number to assign
  const changes: ChangeSpec[] = [];
  for (let n = start; n <= end; n++) {
    const line = doc.line(n);
    const m = ORDERED.exec(line.text);
    if (!m) continue; // blank, unordered, or continuation line
    const indent = m[1].length;
    for (const k of [...next.keys()]) if (k > indent) next.delete(k); // deeper level restarts
    const value = next.has(indent) ? next.get(indent)! : parseInt(m[2], 10);
    const numFrom = line.from + indent;
    if (String(value) !== m[2]) changes.push({ from: numFrom, to: numFrom + m[2].length, insert: String(value) });
    next.set(indent, value + 1);
  }
  if (!changes.length) return false;
  dispatch(state.update({ changes, userEvent: "input.renumber" }));
  return true;
};
