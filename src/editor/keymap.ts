// Sublime-style editing, implemented as one command layer (spec §10) rather than
// scattered handlers. Multicursor edits are single undo steps (CodeMirror default).
import {
  crosshairCursor,
  keymap,
  rectangularSelection,
} from "@codemirror/view";
import { EditorSelection, Prec, type StateCommand } from "@codemirror/state";
import {
  copyLineDown,
  moveLineDown,
  moveLineUp,
  selectLine,
  toggleComment,
} from "@codemirror/commands";
import { gotoLine, openSearchPanel, selectNextOccurrence } from "@codemirror/search";
import { useStore } from "../store";

/** Add a cursor on the line above (-1) or below (+1) each existing cursor, same column. */
function addCursorVertically(dir: -1 | 1): StateCommand {
  return ({ state, dispatch }) => {
    const doc = state.doc;
    const extra = [];
    for (const r of state.selection.ranges) {
      const line = doc.lineAt(r.head);
      const col = r.head - line.from;
      const target = line.number + dir;
      if (target < 1 || target > doc.lines) continue;
      const tline = doc.line(target);
      extra.push(EditorSelection.cursor(Math.min(tline.from + col, tline.to)));
    }
    if (!extra.length) return false;
    dispatch(
      state.update({
        selection: EditorSelection.create([...state.selection.ranges, ...extra]),
        scrollIntoView: true,
      }),
    );
    return true;
  };
}

/** Split each non-empty selection into one cursor per line it spans (Ctrl+Shift+L). */
const splitSelectionIntoLines: StateCommand = ({ state, dispatch }) => {
  const doc = state.doc;
  const ranges = [];
  for (const r of state.selection.ranges) {
    if (r.empty) {
      ranges.push(r);
      continue;
    }
    const from = doc.lineAt(r.from).number;
    const to = doc.lineAt(r.to).number;
    for (let n = from; n <= to; n++) {
      const line = doc.line(n);
      ranges.push(EditorSelection.cursor(Math.min(r.to, line.to)));
    }
  }
  dispatch(state.update({ selection: EditorSelection.create(ranges) }));
  return true;
};

/** Column selection (Alt+drag) + the Sublime key bindings, at highest precedence. */
export const sublimeEditing = [
  rectangularSelection(),
  crosshairCursor(),
  Prec.highest(
    keymap.of([
      { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
      { key: "Mod-l", run: selectLine, preventDefault: true },
      { key: "Mod-Shift-d", run: copyLineDown, preventDefault: true },
      { key: "Mod-Shift-ArrowUp", run: moveLineUp, preventDefault: true },
      { key: "Mod-Shift-ArrowDown", run: moveLineDown, preventDefault: true },
      { key: "Mod-/", run: toggleComment, preventDefault: true },
      { key: "Mod-Alt-ArrowUp", run: addCursorVertically(-1), preventDefault: true },
      { key: "Mod-Alt-ArrowDown", run: addCursorVertically(1), preventDefault: true },
      { key: "Mod-Shift-l", run: splitSelectionIntoLines, preventDefault: true },
      // Find / replace / go-to-line (Sublime: Ctrl+F, Ctrl+H, Ctrl+G).
      { key: "Mod-f", run: openSearchPanel, preventDefault: true },
      { key: "Mod-h", run: openSearchPanel, preventDefault: true },
      { key: "Mod-g", run: gotoLine, preventDefault: true },
      // Tab switching also bound here so it works while the editor has focus.
      {
        key: "Ctrl-Tab",
        run: () => (useStore.getState().nextTab(1), true),
        preventDefault: true,
      },
      {
        key: "Ctrl-Shift-Tab",
        run: () => (useStore.getState().nextTab(-1), true),
        preventDefault: true,
      },
    ]),
  ),
];
