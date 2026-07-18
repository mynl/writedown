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

// ---- Per-document cursor/scroll memory --------------------------------------------
// One EditorView is reused across tab switches, so without this the previous doc's raw
// cursor offset gets carried (clamped) into whichever doc appears next — "the same
// position overlaid on every file". Editor.tsx records the real position per path and
// restores it after each doc swap; open tabs persist through the session.
export type DocPosition = { anchor: number; head: number; scroll: number };
const docPositions = new Map<string, DocPosition>();

export function recordDocSelection(path: string, anchor: number, head: number): void {
  const p = docPositions.get(path);
  if (p && p.anchor === anchor && p.head === head) return;
  docPositions.set(path, { anchor, head, scroll: p?.scroll ?? 0 });
}

export function recordDocScroll(path: string, scroll: number): void {
  const p = docPositions.get(path);
  docPositions.set(path, { anchor: p?.anchor ?? 0, head: p?.head ?? 0, scroll });
}

export function docPosition(path: string): DocPosition | undefined {
  return docPositions.get(path);
}

/** Positions for session persistence, restricted to the given (open-tab) paths. */
export function snapshotDocPositions(paths: string[]): Record<string, DocPosition> {
  const out: Record<string, DocPosition> = {};
  for (const p of paths) {
    const pos = docPositions.get(p);
    if (pos) out[p] = pos;
  }
  return out;
}

/** Seed from a restored session. Live entries win — only blanks are filled. */
export function seedDocPositions(rec: Record<string, DocPosition>): void {
  for (const [path, pos] of Object.entries(rec)) {
    if (!docPositions.has(path)) docPositions.set(path, pos);
  }
}

// Frames the post-jump settle loop may run: lineBlockAt uses ESTIMATED heights for
// never-drawn lines, so the first computed target y lands short/long; scrolling forces
// real measurement, and re-deriving the target for a few frames converges on it. This
// is the editor twin of the preview's settle loop (Preview.tsx, 1.73.2) — the editor
// side never got one, hence "first outline click imperfect, second click lands".
const JUMP_SETTLE_FRAMES = 8;
let jumpSeq = 0; // supersedes an in-flight settle when a newer jump starts

/** Move the cursor to `line` (1-based), scroll sensibly, and focus the editor.
 *  If the target sits below the viewport midpoint (or above the viewport), it is
 *  brought near the TOP of the page — clicking an outline entry means "show me this
 *  section", not "barely reveal its first line at the bottom". */
export function jumpToLine(line: number) {
  const view = activeView;
  if (!view) return;
  const n = Math.min(Math.max(line, 1), view.state.doc.lines);
  const pos = view.state.doc.line(n).from;
  view.dispatch({ selection: { anchor: pos } });

  const sc = view.scrollDOM;
  // Target scrollTop for the top-anchored jump, or null when the line already sits
  // comfortably in the upper half of the viewport (small nudge is enough).
  const target = (): number | null => {
    const top = view.lineBlockAt(pos).top; // document-space y of the target line
    const midpoint = sc.scrollTop + sc.clientHeight / 2;
    if (top > midpoint || top < sc.scrollTop) return Math.max(0, top - sc.clientHeight * 0.12);
    return null;
  };
  const first = target();
  if (first === null) {
    view.dispatch({ effects: EditorView.scrollIntoView(pos) });
  } else {
    sc.scrollTo({ top: first });
    const seq = ++jumpSeq;
    let frames = JUMP_SETTLE_FRAMES;
    const settle = () => {
      if (seq !== jumpSeq || --frames < 0) return;
      const t = target();
      if (t !== null && Math.abs(sc.scrollTop - t) > 1) sc.scrollTo({ top: t });
      requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  }
  view.focus();
}
