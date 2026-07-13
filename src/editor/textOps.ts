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
