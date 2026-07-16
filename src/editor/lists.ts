// Line/list editing commands (spec §10 neighbourhood). Explicit user actions that edit
// the document as a single undo step — never automatic. US spelling throughout.
import { EditorSelection, type ChangeSpec, type StateCommand } from "@codemirror/state";
import { completionStatus } from "@codemirror/autocomplete";
import { markdownLanguage } from "@codemirror/lang-markdown";

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

// ---- Tight list continuation on Enter ----------------------------------------------
// lang-markdown's insertNewlineContinueMarkup preserves list "looseness": in a list whose
// items are separated by blank lines, Enter inserts a blank line + marker (\n\n). This runs
// above it in the keymap and always continues with a single newline. Everything it doesn't
// own — blockquotes, code, non-markdown docs, mid-marker carets, selections, an open
// completion popup — falls through by returning false.
const ITEM_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/;
const ORDERED_FOLLOW = /^(\s*)(\d+)[.)]\s/;

export const listEnterTight: StateCommand = ({ state, dispatch }) => {
  if (completionStatus(state) === "active") return false;
  for (const r of state.selection.ranges) {
    if (!r.empty) return false;
    if (!markdownLanguage.isActiveAt(state, r.head)) return false;
    const line = state.doc.lineAt(r.head);
    const m = ITEM_RE.exec(line.text);
    if (!m || r.head < line.from + m[0].length) return false;
  }
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    const m = ITEM_RE.exec(line.text)!;
    const markerEnd = line.from + m[0].length;
    if (line.text.slice(m[0].length).trim() === "") {
      // Enter on an empty item ends the list: drop the marker, stay on the (now plain) line.
      return {
        changes: { from: line.from, to: markerEnd, insert: "" },
        range: EditorSelection.cursor(line.from),
      };
    }
    const ordered = /\d/.test(m[2]);
    const marker = ordered ? String(parseInt(m[2], 10) + 1) + m[2].slice(-1) : m[2];
    const cont = "\n" + m[1] + marker + m[3] + (m[4] ? "[ ] " : "");
    const changes: ChangeSpec[] = [{ from: range.head, insert: cont }];
    if (ordered) {
      // Keep the numbers below in sequence — same indent level; deeper items ride along.
      let n = parseInt(m[2], 10) + 2;
      for (let ln = line.number + 1; ln <= state.doc.lines; ln++) {
        const l = state.doc.line(ln);
        const f = ORDERED_FOLLOW.exec(l.text);
        if (f && f[1] === m[1]) {
          const from = l.from + f[1].length;
          changes.push({ from, to: from + f[2].length, insert: String(n++) });
        } else if (ITEM_RE.exec(l.text)?.[1] != null && ITEM_RE.exec(l.text)![1].length > m[1].length) {
          continue;
        } else break;
      }
    }
    return { changes, range: EditorSelection.cursor(range.head + cont.length) };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
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
