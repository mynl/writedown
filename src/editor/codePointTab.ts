// `u+XXXX` + Tab → the character; bare `u+` + Tab → open the picker (issue D.12).
//
// ONE regex serves both gestures, and it runs ONLY on a Tab keypress — never on the
// keystroke path — so this costs nothing while you type. It sits at high precedence, ahead
// of the word completer, because `u+2299` is not a word and the completer has nothing to
// say about it.
//
// A code point that names nothing drawable (unassigned, a lone surrogate, private use,
// a C1 control) DECLINES: the text is left exactly as typed rather than becoming a box.
import { Prec } from "@codemirror/state";
import { keymap, type EditorView } from "@codemirror/view";
import { charFromHex } from "./symbols";

/** `u+`, optionally followed by 2–6 hex digits, immediately before the cursor. */
const CODE_POINT_BEFORE = /(?:^|[^0-9a-zA-Z\\])([uU]\+([0-9a-fA-F]{0,6}))$/;

export type CodePointTabOpts = {
  /** Open the Unicode picker (bare `u+` + Tab). */
  openPicker: () => void;
  /** Report a rejected code point in the status bar, rather than failing silently. */
  notify: (message: string) => void;
};

export function codePointTab(opts: CodePointTabOpts) {
  const run = (view: EditorView): boolean => {
    const { state } = view;
    const range = state.selection.main;
    if (state.selection.ranges.length !== 1 || !range.empty) return false;
    const line = state.doc.lineAt(range.head);
    const before = line.text.slice(0, range.head - line.from);
    const m = CODE_POINT_BEFORE.exec(before);
    if (!m) return false;
    const from = range.head - m[1].length;
    const hex = m[2];

    if (!hex) {
      // Bare `u+`: you meant to type a code point and do not know it. Remove the marker
      // and hand over to the picker, which searches by name instead.
      view.dispatch({ changes: { from, to: range.head }, userEvent: "input" });
      opts.openPicker();
      return true;
    }
    const ch = charFromHex(hex);
    if (!ch) {
      opts.notify(`U+${hex.toUpperCase()} is not a character you can insert`);
      return true; // consumed: indenting the line here would be a baffling answer
    }
    view.dispatch({
      changes: { from, to: range.head, insert: ch },
      selection: { anchor: from + ch.length },
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  };
  // Prec.highest so it beats the word-completion Tab (which is Prec.high) — `u+2299` is
  // not a word, and the completer would only swallow the keypress with "no completions".
  return Prec.highest(keymap.of([{ key: "Tab", run }]));
}
