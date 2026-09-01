// Bridge to the live CodeMirror view so the outline and preview can drive/observe it
// (jump to a heading, sync scroll). One active editor at a time.
import { EditorView } from "@codemirror/view";
import type { StateEffect } from "@codemirror/state";

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

/** A jump to perform once `path` becomes the active document. Find in Files opens a
 *  file and lands on the hit in one motion: the cursor restore in Editor.tsx runs after
 *  the doc swap and consumes this INSTEAD of the remembered position, which is the only
 *  moment the new document's view is guaranteed to be the one on screen. */
let pendingJump: { path: string; line: number; col?: number } | null = null;
export function setPendingJump(path: string, line: number, col?: number) {
  pendingJump = { path, line, col };
}
export function clearPendingJump() {
  pendingJump = null;
}
/** The pending jump for `path`, if any — cleared on the way out. */
export function takePendingJump(path: string): { line: number; col?: number } | null {
  if (!pendingJump || pendingJump.path !== path) return null;
  const { line, col } = pendingJump;
  pendingJump = null;
  return { line, col };
}

/** Where the viewport was, in LINE terms, so a spot survives the document being replaced
 *  wholesale by an external-change reload (issue A.28b). Character offsets are useless here
 *  — an edit above the viewport shifts every one of them — and the scroll snapshot is
 *  deliberately invalidated when the document length changes, which a reload guarantees. */
export type ReloadAnchor = { topLine: number; cursorLine: number; cursorCol: number };
const reloadAnchors = new Map<string, ReloadAnchor>();

/** Capture the anchor just BEFORE a reload replaces the document. */
export function captureReloadAnchor(path: string, view: EditorView): void {
  const { state } = view;
  const head = state.selection.main.head;
  const cur = state.doc.lineAt(head);
  const top = state.doc.lineAt(view.lineBlockAtHeight(view.scrollDOM.scrollTop).from);
  reloadAnchors.set(path, {
    topLine: top.number,
    cursorLine: cur.number,
    cursorCol: head - cur.from,
  });
}

/** Take (and clear) the anchor stored for `path`. One-shot: it describes one reload. */
export function takeReloadAnchor(path: string): ReloadAnchor | undefined {
  const a = reloadAnchors.get(path);
  reloadAnchors.delete(path);
  return a;
}

/** Move a document's remembered position (and scroll snapshot) to a new path — for a
 *  scratch buffer renamed in place (issue A.27), where the path changes but the buffer,
 *  and therefore the spot the user was at, does not. */
export function renameDocPosition(from: string, to: string): void {
  const pos = docPositions.get(from);
  if (pos) {
    docPositions.set(to, pos);
    docPositions.delete(from);
  }
  const snap = docScrollSnaps.get(from);
  if (snap) {
    docScrollSnaps.set(to, snap);
    docScrollSnaps.delete(from);
  }
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

// ---- Line-anchored scroll snapshots (same-session tab switches, issue Sa 8) -------
// A raw scrollTop restore drifts on long docs: CodeMirror re-measures estimated line
// heights for many frames after a doc swap, re-anchoring the viewport each time. A
// scrollSnapshot() effect is line-anchored — applied in CM's measure phase and then
// HELD by CM's own scroll anchoring — so the restored spot survives re-measurement.
// In-memory only; the px in DocPosition stays the persisted (session) fallback.
type ScrollSnap = { effect: StateEffect<unknown>; docLength: number };
const docScrollSnaps = new Map<string, ScrollSnap>();

export function captureDocScrollSnapshot(path: string, view: EditorView): void {
  docScrollSnaps.set(path, {
    effect: view.scrollSnapshot(),
    docLength: view.state.doc.length,
  });
}

/** The stored snapshot, or null when none exists or the document changed since it was
 *  taken (length check; byte identity is implied by the content store). */
export function docScrollSnapshot(path: string, docLength: number): StateEffect<unknown> | null {
  const s = docScrollSnaps.get(path);
  return s && s.docLength === docLength ? s.effect : null;
}

// Stamped when the user navigates deliberately (outline jump). The scroll recorder in
// Editor.tsx treats it like a gesture, so a jumped-to spot is remembered even though
// the scroll itself was programmatic.
let lastUserNavAt = 0;
export const userNavAt = () => lastUserNavAt;

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
export function jumpToLine(line: number, col?: number) {
  const view = activeView;
  if (!view) return;
  lastUserNavAt = performance.now();
  const n = Math.min(Math.max(line, 1), view.state.doc.lines);
  const ln = view.state.doc.line(n);
  // Optional 1-based column (Find in Files lands ON the match, not at the line start);
  // clamped so a column past the end still selects the line's last position.
  const pos = ln.from + (col ? Math.min(Math.max(col - 1, 0), ln.length) : 0);
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
