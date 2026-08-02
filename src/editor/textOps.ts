// Small text-manipulation commands drawn from the Sublime keymap that CodeMirror 6 doesn't ship
// as built-ins. StateCommand style (like lists.ts / tables.ts); single undo step; multi-cursor
// aware where it makes sense. Registered in commandRegistry.ts; bind them via config [keys].
import { EditorSelection, type StateCommand } from "@codemirror/state";

// Uppercase / lowercase each non-empty selection.
function transformCase(fn: (s: string) => string): StateCommand {
  return ({ state, dispatch }) => {
    const changes = [];
    for (const r of state.selection.ranges) {
      if (r.empty) continue;
      changes.push({ from: r.from, to: r.to, insert: fn(state.sliceDoc(r.from, r.to)) });
    }
    if (changes.length === 0) return false;
    dispatch(state.update({ changes, userEvent: "input.case" }));
    return true;
  };
}

export const upperCase = transformCase((s) => s.toUpperCase());
export const lowerCase = transformCase((s) => s.toLowerCase());
// Sublime-style Title Case: first letter of every word up, the rest down.
export const titleCase = transformCase((s) =>
  s.replace(/[\p{L}\p{N}][\p{L}\p{N}']*/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
);

/** Sublime's Ctrl+Shift+D: duplicate the SELECTION when there is one, else the whole line
 *  (issue A.06). CodeMirror's `copyLineDown` is line-only; this returns false when every
 *  range is empty so the caller falls back to it — the no-selection behaviour is exactly
 *  what it always was. The inserted copy is left selected, so pressing again keeps going. */
export const duplicateSelection: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.every((r) => r.empty)) return false;
  dispatch(
    state.update(
      state.changeByRange((range) => {
        if (range.empty) return { range };
        const text = state.sliceDoc(range.from, range.to);
        return {
          changes: { from: range.to, insert: text },
          range: EditorSelection.range(range.to, range.to + text.length),
        };
      }),
      { userEvent: "input.duplicate", scrollIntoView: true },
    ),
  );
  return true;
};

// Word chars for transpose: letters/digits/underscore with internal apostrophes ("don't").
const WORD_RE = /[\p{L}\p{N}_]+(?:'[\p{L}\p{N}_]+)*/gu;
// How far around the caret to look for the two words (crosses newlines, like emacs).
const TRANSPOSE_WINDOW = 500;

// Emacs M-t: swap the word at/before the caret with the word after it; the caret ends after
// the pair (so repeated presses drag a word rightward). Multi-cursor aware.
export const transposeWords: StateCommand = ({ state, dispatch }) => {
  const changes = [];
  const ends: number[] = [];
  for (const r of state.selection.ranges) {
    if (!r.empty) continue;
    const base = Math.max(0, r.head - TRANSPOSE_WINDOW);
    const text = state.sliceDoc(base, Math.min(state.doc.length, r.head + TRANSPOSE_WINDOW));
    const rel = r.head - base;
    const words: { from: number; to: number; text: string }[] = [];
    for (const m of text.matchAll(WORD_RE)) {
      words.push({ from: m.index, to: m.index + m[0].length, text: m[0] });
    }
    // A = the word containing the caret, else the last word ending at/before it; B = the next.
    let i = words.findIndex((w) => w.from < rel && rel < w.to);
    if (i < 0) {
      i = -1;
      for (let k = 0; k < words.length; k++) if (words[k].to <= rel) i = k;
    }
    const a = i >= 0 ? words[i] : undefined;
    const b = i >= 0 ? words[i + 1] : undefined;
    if (!a || !b) continue;
    changes.push({ from: base + a.from, to: base + a.to, insert: b.text });
    changes.push({ from: base + b.from, to: base + b.to, insert: a.text });
    ends.push(base + b.to); // total region length is unchanged by the swap
  }
  if (changes.length === 0) return false;
  dispatch(
    state.update({
      changes,
      selection: EditorSelection.create(ends.map((e) => EditorSelection.cursor(e))),
      scrollIntoView: true,
      userEvent: "input.transpose",
    }),
  );
  return true;
};

// Sort the lines spanned by the primary selection (or the whole document region it covers).
export const sortLines: StateCommand = ({ state, dispatch }) => {
  const sel = state.selection.main;
  const from = state.doc.lineAt(sel.from).from;
  const to = state.doc.lineAt(sel.to).to;
  if (from === to) return false;
  const lines = state.sliceDoc(from, to).split("\n");
  lines.sort((a, b) => a.localeCompare(b));
  dispatch(state.update({ changes: { from, to, insert: lines.join("\n") }, userEvent: "sort.lines" }));
  return true;
};

// Open a new (indent-matched) line below / above each cursor and move there — regardless of the
// caret's column (Sublime's Ctrl+Enter / Ctrl+Shift+Enter).
export const insertLineAfter: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    const indent = /^\s*/.exec(line.text)![0];
    const insert = "\n" + indent;
    return {
      changes: { from: line.to, insert },
      range: EditorSelection.cursor(line.to + insert.length),
    };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

// Insert the local date-time as `YYYY-MM-DD HH:MM:SS` at every cursor (replacing any
// selection) — note/journal timestamps.
export const insertDateTime: StateCommand = ({ state, dispatch }) => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  dispatch(state.update(state.replaceSelection(stamp), { scrollIntoView: true, userEvent: "input" }));
  return true;
};

export const insertLineBefore: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    const indent = /^\s*/.exec(line.text)![0];
    const insert = indent + "\n";
    return {
      changes: { from: line.from, insert },
      range: EditorSelection.cursor(line.from + indent.length),
    };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};
