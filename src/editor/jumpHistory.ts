// Jump history (issue K.02): Alt+- steps back through the places you navigated from, and
// Alt+Shift+- forward again, within the current file. Each file keeps its own history while
// you work in others, and nothing here ever moves to another file (author, 2026-10-29: Sublime
// does that "and it is annoying"). Navigation only, not every place the caret rested: outline
// clicks, Find in Files hits and palette go-tos (all through editorView's jumpToLine), find
// next and previous, Go to Line, Ctrl+Home and Ctrl+End. Typing, arrows, paging, clicks,
// scrolling and undo record nothing. Session only, never persisted.
//
// The record, merge, step and map logic is pure (the exported functions taking a History);
// the editor wiring below it is a thin layer. No store import: commandRegistry and Editor.tsx
// call in, and the status notes go back through their return values.
import { EditorSelection, type ChangeDesc, type Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** One file's history. `list`: document offsets of the places navigated from, oldest first.
 *  `index`: the entry back or forward last moved to, or `list.length` when not stepping
 *  through it. `kind` and `landed`: the newest navigation's kind and where it left the caret,
 *  so a run of the same navigation (ten F3 presses) records once. */
export type History = { list: number[]; index: number; kind: string | null; landed: number | null };

export const MAX_PER_FILE = 100;
export const MAX_FILES = 200;

export const emptyHistory = (): History => ({ list: [], index: 0, kind: null, landed: null });

/** Keep the newest MAX_PER_FILE entries, moving `index` with them. */
function cap(list: number[], index: number): { list: number[]; index: number } {
  const drop = list.length - MAX_PER_FILE;
  return drop > 0 ? { list: list.slice(drop), index: Math.max(0, index - drop) } : { list, index };
}

/** Record a navigation of `kind` from `from` that left the caret at `to`; `lineOf` gives a
 *  position's line. Skipped: the next step of a run (the newest record is the same kind and
 *  the caret is still where it left it) and a place on the same line as the newest record.
 *  Recording after a step back drops the forward part, as a browser does. */
export function record(h: History, from: number, to: number, kind: string, lineOf: (pos: number) => number): History {
  if (h.kind === kind && h.landed === from) return { ...h, landed: to };
  const list = h.index < h.list.length ? h.list.slice(0, h.index + 1) : h.list.slice();
  const newest = list[list.length - 1];
  if (newest === undefined || lineOf(newest) !== lineOf(from)) list.push(from);
  const c = cap(list, list.length);
  return { list: c.list, index: c.list.length, kind, landed: to };
}

/** Step back from the caret at `cur`. At the newest end the current place is recorded first
 *  (unless on the newest record's line), so forward can return to it. `target` is null at the
 *  oldest entry. */
export function back(h: History, cur: number, lineOf: (pos: number) => number): { h: History; target: number | null } {
  let list = h.list;
  let index = h.index;
  if (index >= list.length) {
    const newest = list[list.length - 1];
    if (newest === undefined || lineOf(newest) !== lineOf(cur)) list = [...list, cur];
    ({ list, index } = cap(list, list.length - 1));
  }
  if (index <= 0) return { h: { ...h, list, index: Math.max(0, index) }, target: null };
  index -= 1;
  return { h: { list, index, kind: null, landed: null }, target: list[index] };
}

/** Step forward; `target` is null at the newest entry or when not stepping through. */
export function forward(h: History): { h: History; target: number | null } {
  if (h.index >= h.list.length - 1) return { h, target: null };
  const index = h.index + 1;
  return { h: { ...h, index, kind: null, landed: null }, target: h.list[index] };
}

/** Every position of `h` through `map` (an edit's mapPos, or a whole-document remap). */
export function mapHistory(h: History, map: (pos: number) => number): History {
  return { ...h, list: h.list.map(map), landed: h.landed === null ? null : map(h.landed) };
}

/** A position in `oldDoc` to the same line and column in `newDoc`, clamped: for a change that
 *  replaces the whole document (a file reloaded after an outside edit), where offsets mean
 *  nothing but lines still do. */
export function byLineCol(oldDoc: Text, newDoc: Text): (pos: number) => number {
  return (pos) => {
    const line = oldDoc.lineAt(Math.min(pos, oldDoc.length));
    const target = newDoc.line(Math.min(line.number, newDoc.lines));
    return target.from + Math.min(pos - line.from, target.length);
  };
}

// ---- Editor wiring -------------------------------------------------------------------------

/** Histories by normalized path, least recently used first (a Map keeps insertion order). */
const histories = new Map<string, History>();
/** The file the shared editor view holds now: set at creation and on every document swap. */
let currentFile: string | null = null;

const keyOf = (path: string) => path.replace(/\//g, "\\").toLowerCase();

function load(path: string): History {
  const k = keyOf(path);
  const h = histories.get(k) ?? emptyHistory();
  histories.delete(k); // re-insert as most recently used
  histories.set(k, h);
  if (histories.size > MAX_FILES) histories.delete(histories.keys().next().value as string);
  return h;
}

const store = (path: string, h: History) => void histories.set(keyOf(path), h);

const linesOf = (doc: Text) => (pos: number) => doc.lineAt(Math.min(pos, doc.length)).number;

/** The view was created holding `path` (Editor.tsx, on mount). */
export function setJumpFile(path: string): void {
  currentFile = path;
}

/** A document swap put `path` into the view (Editor.tsx's `docSwap` transactions). The same
 *  file swapped in again is a reload after an outside edit: its positions keep their line and
 *  column. Another file is a tab switch: nothing moves, and the incoming file's positions are
 *  clamped when used. */
export function noteDocSwap(path: string, oldDoc: Text, newDoc: Text): void {
  if (currentFile !== null && keyOf(currentFile) === keyOf(path)) store(path, mapHistory(load(path), byLineCol(oldDoc, newDoc)));
  currentFile = path;
}

/** An edit in the current file: its positions move with the text. At most MAX_PER_FILE
 *  mapPos calls per edit, microseconds, the only cost this feature puts on the typing path. */
export function mapJumps(changes: ChangeDesc): void {
  if (currentFile === null) return;
  const k = keyOf(currentFile);
  const h = histories.get(k);
  if (h && (h.list.length || h.landed !== null)) histories.set(k, mapHistory(h, (p) => changes.mapPos(p)));
}

/** Record a navigation of `kind` in the current file, from `from` to `to`. */
export function recordJump(view: EditorView, from: number, to: number, kind: string): void {
  if (currentFile === null) return;
  store(currentFile, record(load(currentFile), from, to, kind, linesOf(view.state.doc)));
}

/** Alt+- (`dir` -1) or Alt+Shift+- (+1): move the caret to the previous or next place in
 *  this file's history, centered. Returns a status note at either end, else null. */
export function stepJump(view: EditorView, dir: -1 | 1): string | null {
  if (currentFile === null) return null;
  const doc = view.state.doc;
  const h = load(currentFile);
  const r = dir < 0 ? back(h, view.state.selection.main.head, linesOf(doc)) : forward(h);
  store(currentFile, r.h);
  if (r.target === null) return dir < 0 ? "Start of jump history" : "End of jump history";
  const pos = Math.min(r.target, doc.length);
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
    userEvent: "select.jump",
  });
  return null;
}
