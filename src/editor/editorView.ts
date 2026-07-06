// Bridge to the live CodeMirror view so the outline and preview can drive/observe it
// (jump to a heading, sync scroll). One active editor at a time.
import { EditorView } from "@codemirror/view";

let activeView: EditorView | null = null;
const listeners = new Set<() => void>();

export function setActiveView(v: EditorView | null) {
  activeView = v;
  listeners.forEach((f) => f());
}

export function getActiveView(): EditorView | null {
  return activeView;
}

/** Notified whenever the active view changes (e.g. the editor mounts). */
export function onActiveViewChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
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
