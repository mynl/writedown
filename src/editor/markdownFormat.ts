// Markdown emphasis commands: wrap the selection in **bold** / *italic* markers, or remove
// them when already present (a toggle). Multi-cursor aware; a single undo step. Mirrors the
// StateCommand style of tables.ts / lists.ts.
import { EditorSelection, type StateCommand } from "@codemirror/state";

// A marker sits "cleanly" against a boundary only if it isn't part of a longer run of the same
// character — so applying italic (*) just inside **bold** doesn't strip one of the bold stars.
function cleanBefore(text: string, pos: number, marker: string): boolean {
  const len = marker.length;
  if (pos < len || text.slice(pos - len, pos) !== marker) return false;
  return pos - len === 0 || text[pos - len - 1] !== marker[0];
}
function cleanAfter(text: string, pos: number, marker: string): boolean {
  const len = marker.length;
  if (pos + len > text.length || text.slice(pos, pos + len) !== marker) return false;
  return pos + len === text.length || text[pos + len] !== marker[0];
}

function toggleSurround(marker: string): StateCommand {
  const len = marker.length;
  return ({ state, dispatch }) => {
    const text = state.doc.toString();
    const tr = state.changeByRange((range) => {
      const { from, to } = range;
      const inner = text.slice(from, to);

      // Markers just outside the selection → unwrap them.
      if (from !== to && cleanBefore(text, from, marker) && cleanAfter(text, to, marker)) {
        return {
          changes: [
            { from: from - len, to: from },
            { from: to, to: to + len },
          ],
          range: EditorSelection.range(from - len, to - len),
        };
      }
      // Markers inside the selection (selection includes them) → unwrap them.
      if (inner.length >= 2 * len && inner.startsWith(marker) && inner.endsWith(marker)) {
        return {
          changes: [
            { from, to: from + len },
            { from: to - len, to },
          ],
          range: EditorSelection.range(from, to - 2 * len),
        };
      }
      // Otherwise wrap. Empty selection → caret lands between the two markers.
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range:
          from === to
            ? EditorSelection.cursor(from + len)
            : EditorSelection.range(from + len, to + len),
      };
    });
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: "format.emphasis" }));
    return true;
  };
}

export const toggleBold: StateCommand = toggleSurround("**");
export const toggleItalic: StateCommand = toggleSurround("*");
