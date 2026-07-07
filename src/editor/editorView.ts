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

/** Move the cursor to `line` (1-based), scroll sensibly, and focus the editor.
 *  If the target sits below the viewport midpoint (or above the viewport), it is
 *  brought near the TOP of the page — clicking an outline entry means "show me this
 *  section", not "barely reveal its first line at the bottom". */
export function jumpToLine(line: number) {
  const view = activeView;
  if (!view) return;
  const n = Math.min(Math.max(line, 1), view.state.doc.lines);
  const l = view.state.doc.line(n);
  view.dispatch({ selection: { anchor: l.from } });

  const sc = view.scrollDOM;
  const top = view.lineBlockAt(l.from).top; // document-space y of the target line
  const midpoint = sc.scrollTop + sc.clientHeight / 2;
  if (top > midpoint || top < sc.scrollTop) {
    sc.scrollTo({ top: Math.max(0, top - sc.clientHeight * 0.12) });
  } else {
    view.dispatch({ effects: EditorView.scrollIntoView(l.from) });
  }
  view.focus();
}
