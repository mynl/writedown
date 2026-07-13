// The action-name → command registry: the single place that maps a stable string name (what the
// user types in config [keys], and what the F1 help shows) to a CodeMirror command. A StateCommand
// is usable where a Command is expected (a view supplies { state, dispatch }).
import { EditorSelection, type StateCommand } from "@codemirror/state";
import { type Command } from "@codemirror/view";
import {
  copyLineDown,
  cursorSubwordBackward,
  cursorSubwordForward,
  deleteLine,
  deleteToLineEnd,
  moveLineDown,
  moveLineUp,
  selectLine,
  toggleComment,
} from "@codemirror/commands";
import { gotoLine, openSearchPanel, selectNextOccurrence } from "@codemirror/search";
import { foldAll, foldCode, unfoldAll, unfoldCode } from "@codemirror/language";
import { joinLines, renumberOrderedList } from "./lists";
import { reformatTables } from "./tables";
import { toggleBold, toggleItalic } from "./markdownFormat";
import { insertLineAfter, insertLineBefore, lowerCase, sortLines, upperCase } from "./textOps";
import { toggleWordWrap } from "./wrap";
import { useStore } from "../store";

// Add a cursor on the line above (-1) / below (+1) each cursor, same column. Lives here (not
// keymap.ts) so the registry never imports the keymap — keymap.ts imports this, one direction.
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

// Wrap a zero-arg store/UI action as a CM Command (always reports "handled").
const act = (fn: () => void): Command => () => {
  fn();
  return true;
};
const s = useStore.getState;

export type RegistryEntry = { run: Command; label: string; category: string };

// Categories mirror the F1 help groups. `label` is the human description shown there.
export const COMMAND_REGISTRY: Record<string, RegistryEntry> = {
  // Selection & cursors
  selectNextOccurrence: { run: selectNextOccurrence, label: "Select next occurrence", category: "Selection & cursors" },
  selectLine: { run: selectLine, label: "Select line", category: "Selection & cursors" },
  addCursorAbove: { run: addCursorVertically(-1), label: "Add cursor above", category: "Selection & cursors" },
  addCursorBelow: { run: addCursorVertically(1), label: "Add cursor below", category: "Selection & cursors" },
  subwordLeft: { run: cursorSubwordBackward, label: "Move to previous subword", category: "Selection & cursors" },
  subwordRight: { run: cursorSubwordForward, label: "Move to next subword", category: "Selection & cursors" },

  // Editing
  duplicateLine: { run: copyLineDown, label: "Duplicate line down", category: "Editing" },
  moveLineUp: { run: moveLineUp, label: "Move line up", category: "Editing" },
  moveLineDown: { run: moveLineDown, label: "Move line down", category: "Editing" },
  joinLines: { run: joinLines, label: "Join lines", category: "Editing" },
  toggleComment: { run: toggleComment, label: "Toggle comment", category: "Editing" },
  killToLineEnd: { run: deleteToLineEnd, label: "Delete to end of line", category: "Editing" },
  deleteLine: { run: deleteLine, label: "Delete line", category: "Editing" },
  renumberList: { run: renumberOrderedList, label: "Renumber ordered list", category: "Editing" },
  upperCase: { run: upperCase, label: "Uppercase selection", category: "Editing" },
  lowerCase: { run: lowerCase, label: "Lowercase selection", category: "Editing" },
  sortLines: { run: sortLines, label: "Sort lines", category: "Editing" },
  insertLineAfter: { run: insertLineAfter, label: "Insert line below", category: "Editing" },
  insertLineBefore: { run: insertLineBefore, label: "Insert line above", category: "Editing" },

  // Markdown
  bold: { run: toggleBold, label: "Bold (**…**)", category: "Markdown" },
  italic: { run: toggleItalic, label: "Italic (*…*)", category: "Markdown" },
  reformatTable: { run: reformatTables, label: "Reformat table(s)", category: "Markdown" },

  // View
  togglePreview: { run: act(() => s().cycleView()), label: "Toggle preview (editor / split / preview)", category: "View" },
  zoomIn: { run: act(() => s().setEditorZoom(1)), label: "Editor zoom in", category: "View" },
  zoomOut: { run: act(() => s().setEditorZoom(-1)), label: "Editor zoom out", category: "View" },
  zoomReset: { run: act(() => s().setEditorZoom("reset")), label: "Editor zoom reset", category: "View" },
  toggleWordWrap: { run: act(() => toggleWordWrap()), label: "Toggle word wrap", category: "View" },
  toggleSpell: { run: act(() => s().toggleSpell()), label: "Toggle spell check", category: "View" },
  build: { run: act(() => void s().renderActive()), label: "Build (render document)", category: "View" },
  foldCode: { run: foldCode, label: "Fold", category: "View" },
  unfoldCode: { run: unfoldCode, label: "Unfold", category: "View" },
  foldAll: { run: foldAll, label: "Fold all", category: "View" },
  unfoldAll: { run: unfoldAll, label: "Unfold all", category: "View" },

  // Search
  find: { run: openSearchPanel, label: "Find", category: "Search" },
  replace: { run: openSearchPanel, label: "Replace", category: "Search" },
  gotoLine: { run: gotoLine, label: "Go to line", category: "Search" },

  // Tabs & palette
  nextTab: { run: act(() => s().nextTab(1)), label: "Next tab", category: "Tabs & palette" },
  prevTab: { run: act(() => s().nextTab(-1)), label: "Previous tab", category: "Tabs & palette" },
  filePalette: { run: act(() => s().openPalette("files")), label: "Quick open file", category: "Tabs & palette" },
  commandPalette: { run: act(() => s().openPalette("commands")), label: "Command palette", category: "Tabs & palette" },
};
