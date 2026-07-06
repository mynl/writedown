// Bridge to the live CodeMirror view so the outline (and future features) can drive it
// imperatively — jump to a heading line, etc. One active editor at a time.
import { EditorView } from "@codemirror/view";

let activeView: EditorView | null = null;

export function setActiveView(v: EditorView | null) {
  activeView = v;
}

/** Move the cursor to `line` (1-based), scroll it into view, and focus the editor. */
export function jumpToLine(line: number) {
  const view = activeView;
  if (!view) return;
  const n = Math.min(Math.max(line, 1), view.state.doc.lines);
  const l = view.state.doc.line(n);
  view.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
  view.focus();
}
