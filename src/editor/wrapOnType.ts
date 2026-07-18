// Sublime-style type-to-wrap: with a non-empty selection, typing a quote, bracket,
// backtick, or * SURROUNDS the selection instead of replacing it. Empty cursors in
// the same multi-selection still type the character normally, and with no selection
// anywhere the handler declines — ordinary typing stays on the fast path, and
// closeBrackets stays deliberately off (nothing auto-inserts at an empty caret).
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const PAIRS: Record<string, string> = {
  '"': '"',
  "'": "'",
  "`": "`",
  "*": "*",
  "(": ")",
  "[": "]",
  "{": "}",
};

export const wrapSelectionOnType = EditorView.inputHandler.of((view, _from, _to, text) => {
  const close = PAIRS[text];
  if (close === undefined) return false;
  const sel = view.state.selection;
  if (sel.ranges.every((r) => r.empty)) return false;
  const tr = view.state.changeByRange((range) =>
    range.empty
      ? {
          changes: { from: range.from, insert: text },
          range: EditorSelection.cursor(range.from + text.length),
        }
      : {
          changes: [
            { from: range.from, insert: text },
            { from: range.to, insert: close },
          ],
          // Keep the text selected (shifted past the opener), like ST — wrap again to
          // nest, or keep typing to replace.
          range: EditorSelection.range(range.from + text.length, range.to + text.length),
        },
  );
  view.dispatch(view.state.update(tr, { scrollIntoView: true, userEvent: "input.type" }));
  return true;
});
