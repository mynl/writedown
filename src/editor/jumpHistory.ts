// Jump history (issue K.02): Alt+- and Alt+Shift+-, on Sublime Text's rule
// (Default/history_list.py, read on DOOB 2026-10-29) with one change, the author's: one
// history per file, kept while you work in others, and nothing here ever moves to another file.
//
// Sublime's rule. Every selection change records where the selection now is, so the newest
// record is always the current place. A change made by the same command as the one before it,
// within a second, updates that record instead of adding one: a burst of typing, a held arrow
// key or a quick run of F3 is one record, and a pause or a different command starts the next.
// Each mouse click starts a record, and a drag adds one more for where it ended. Undo, redo
// and the jumps themselves record nothing; after an undo the history points at a record
// matching the selection, if one does. A selection equal to the current record is not
// recorded again. Back moves to the nearest earlier record whose selection differs from the
// current record's, forward the reverse, and a record made after stepping back drops the ones
// ahead of it. Records move with edits, restore the whole selection, and number at most 120.
// Session only, never persisted.
//
// Background cost: runs on every transaction that changes the document or the selection, so
// it sits on the typing path. Per keystroke: one selection comparison, a record updated or
// added, and every record of the file mapped through the edit (at most 120). Writes nothing;
// the jumps it makes are not recorded, so it cannot feed itself. Measured in the 2.35.0
// execution log of dev/done/plan-batch-k.md.
//
// The record, merge, step and map logic is pure (the exported functions taking a History,
// with the time passed in); the editor wiring below it is a thin layer. No store import:
// commandRegistry, keymap, editorView and Editor.tsx call in, and the status notes go back
// through return values.
import { Annotation, EditorSelection, Transaction, type ChangeSet, type Text } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";

/** One file's history. `list`: the selections recorded, oldest first. `index`: the current
 *  record (the newest, or the one back or forward last moved to); -1 when empty. `kind` and
 *  `at`: the command of the latest recorded change and when it happened (ms), for merging a
 *  run; `kind` is "" after a jump, an undo or a redo, so the next change starts a record. */
export type History = { list: EditorSelection[]; index: number; kind: string; at: number };

export const LIMIT = 120;
/** Sublime's TIME_BETWEEN_RECORDING: a repeat of the same command within this merges. */
export const MERGE_MS = 1000;

export const emptyHistory = (): History => ({ list: [], index: -1, kind: "", at: 0 });

/** Record `sel`, made by command `kind` at time `now`. Unchanged when `sel` equals the current
 *  record; the current record updated when the same command repeats within MERGE_MS; else a
 *  new record, after dropping any ahead of the current one. Over LIMIT, the oldest third goes,
 *  so the trim is not paid on every record. */
export function push(h: History, sel: EditorSelection, kind: string, now: number): History {
  const cur = h.list[h.index];
  if (cur && cur.eq(sel)) return h;
  if (cur && kind !== "" && kind === h.kind && now - h.at <= MERGE_MS) {
    const list = h.list.slice();
    list[h.index] = sel;
    return { ...h, list, at: now };
  }
  let list = h.list.slice(0, h.index + 1);
  list.push(sel);
  if (list.length > LIMIT) list = list.slice(LIMIT / 3);
  return { list, index: list.length - 1, kind, at: now };
}

/** Step back (`dir` -1) or forward (+1) to the nearest record whose selection differs from the
 *  current record's. `target` is null at either end, with the history unchanged. */
export function step(h: History, dir: -1 | 1): { h: History; target: EditorSelection | null } {
  const cur = h.list[h.index];
  if (cur) {
    for (let i = h.index + dir; i >= 0 && i < h.list.length; i += dir) {
      if (!h.list[i].eq(cur)) return { h: { ...h, index: i, kind: "" }, target: h.list[i] };
    }
  }
  return { h, target: null };
}

/** After an undo or redo: point at the newest record equal to `sel`, if any. */
export function reorient(h: History, sel: EditorSelection): History {
  for (let i = h.list.length - 1; i >= 0; i--) if (h.list[i].eq(sel)) return { ...h, index: i, kind: "" };
  return { ...h, kind: "" };
}

/** Every record of `h` through `map` (an edit's mapping, or a whole-document remap). */
export function mapHistory(h: History, map: (sel: EditorSelection) => EditorSelection): History {
  return { ...h, list: h.list.map(map) };
}

/** Every position of a selection through `f`. */
const mapPositions = (sel: EditorSelection, f: (pos: number) => number) =>
  EditorSelection.create(sel.ranges.map((r) => EditorSelection.range(f(r.anchor), f(r.head))), sel.mainIndex);

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

/** `sel` through an edit. A record can lie past the end of the document it is mapped against:
 *  the file shrank while it was not the active tab, and its records were not mapped then.
 *  CodeMirror throws on such a position, and the throw would end the editor's update handler
 *  on every keystroke in that file, so the record is clamped into the document first. */
export function mapThrough(sel: EditorSelection, changes: ChangeSet): EditorSelection {
  const len = changes.length;
  return sel.ranges.every((r) => r.to <= len) ? sel.map(changes) : clamped(sel, len).map(changes);
}

/** `sel` clamped into a document of length `len`. */
const clamped = (sel: EditorSelection, len: number) => mapPositions(sel, (p) => Math.min(p, len));

/** Sublime's sanity limit: a selection of more than 10,000 ranges is recorded as its main one. */
const bounded = (sel: EditorSelection) => (sel.ranges.length <= 10000 ? sel : EditorSelection.create([sel.main]));

// ---- Editor wiring -------------------------------------------------------------------------

/** Histories by normalized path, least recently activated first (a Map keeps insertion order). */
const histories = new Map<string, History>();
export const MAX_FILES = 200;
/** The file the shared editor view holds now: set at creation and on every document swap. */
let currentFile: string | null = null;
/** The Writedown command running now, by its action name; set only while it runs. Its
 *  selection changes are recorded under that name, Sublime's command identity. */
let running: string | null = null;
/** Mouse presses in the editor: each is a command of its own, and after its first selection
 *  change the rest of the press (a drag) is a second command, merged into one record. */
let presses = 0;
let pressRecorded = false;

/** Marks this module's own moves (back, forward, the palette), which are never recorded. */
const jumpMove = Annotation.define<true>();

const keyOf = (path: string) => path.replace(/\//g, "\\").toLowerCase();

/** Run `fn` as command `name`: the selection changes it makes count as that command. */
export function withCommand<T>(name: string, fn: () => T): T {
  const outer = running;
  running = name;
  try {
    return fn();
  } finally {
    running = outer;
  }
}

/** A keymap or palette command that records under its action name. */
export const asCommand = (name: string, run: Command): Command => (view) => withCommand(name, () => run(view));

/** Counts mouse presses in the editor; Editor.tsx installs it. Never handles the event. */
export const jumpPresses = EditorView.domEventHandlers({
  mousedown: () => {
    presses += 1;
    pressRecorded = false;
    return false;
  },
});

/** The command a transaction counts as. */
function kindOf(tr: Transaction, userEvent: string | undefined): string {
  if (running) return running;
  if (userEvent?.startsWith("select.pointer")) {
    const kind = (pressRecorded ? "drag" : "press") + presses;
    pressRecorded = true;
    return kind;
  }
  if (tr.docChanged) return "edit"; // typing and deleting, Sublime's ":text_modified"
  return userEvent ?? "other"; // CodeMirror's own keys: arrows, PageDown, Home are all "select"
}

/** The view was created holding `path` (Editor.tsx, on mount). */
export function setJumpFile(path: string): void {
  currentFile = path;
}

/** Follow one editor transaction (Editor.tsx's update listener). `swapped`: the path a
 *  document swap put into the view, when this transaction is one. The same file swapped in
 *  again is a reload after an outside edit, and its records keep their line and column;
 *  another file is a tab switch, after which its records are clamped when used. */
export function followTransaction(tr: Transaction, swapped: string | undefined): void {
  if (swapped !== undefined) {
    if (tr.docChanged && currentFile !== null && keyOf(currentFile) === keyOf(swapped)) {
      const k = keyOf(swapped);
      const h = histories.get(k);
      const f = byLineCol(tr.startState.doc, tr.newDoc);
      if (h) histories.set(k, mapHistory(h, (s) => mapPositions(s, f)));
    }
    currentFile = swapped;
    return;
  }
  if (currentFile === null || (!tr.docChanged && tr.selection === undefined)) return;
  const k = keyOf(currentFile);
  let h = histories.get(k) ?? emptyHistory();
  if (tr.docChanged && h.list.length) h = mapHistory(h, (s) => mapThrough(s, tr.changes));
  const userEvent = tr.annotation(Transaction.userEvent);
  if (tr.annotation(jumpMove)) h = { ...h, kind: "" };
  else if (userEvent === "undo" || userEvent === "redo") h = reorient(h, tr.newSelection);
  else h = push(h, bounded(tr.newSelection), kindOf(tr, userEvent), Date.now());
  histories.set(k, h);
}

/** A document is on screen with its caret restored (Editor.tsx, after every swap): record
 *  where it is, as Sublime records a view on activation, and keep the file among the
 *  MAX_FILES most recently used. */
export function noteActivated(view: EditorView): void {
  if (currentFile === null) return;
  const k = keyOf(currentFile);
  const h = histories.get(k) ?? emptyHistory();
  histories.delete(k);
  histories.set(k, push(h, bounded(view.state.selection), "activate", Date.now()));
  if (histories.size > MAX_FILES) histories.delete(histories.keys().next().value as string);
}

/** Put `sel` on screen, centered, without recording the move. */
function show(view: EditorView, sel: EditorSelection): void {
  const s = clamped(sel, view.state.doc.length);
  view.dispatch({
    selection: s,
    effects: EditorView.scrollIntoView(s.main, { y: "center" }),
    annotations: jumpMove.of(true),
  });
  view.focus();
}

/** Alt+- (`dir` -1) or Alt+Shift+- (+1). Returns Sublime's status note at either end, else
 *  null. */
export function stepJump(view: EditorView, dir: -1 | 1): string | null {
  if (currentFile === null) return null;
  const k = keyOf(currentFile);
  const r = step(histories.get(k) ?? emptyHistory(), dir);
  if (r.target === null) return dir < 0 ? "Already at the earliest position" : "Already at the newest position";
  histories.set(k, r.h);
  show(view, r.target);
  return null;
}

/** The current file's records for the palette's Jump History, newest first: the record's
 *  index, its main caret's line and the start of that line, and whether it is current. */
export function jumpRecords(view: EditorView): { index: number; line: number; text: string; current: boolean }[] {
  if (currentFile === null) return [];
  const h = histories.get(keyOf(currentFile));
  if (!h) return [];
  const doc = view.state.doc;
  const out = [];
  for (let i = h.list.length - 1; i >= 0; i--) {
    const line = doc.lineAt(Math.min(h.list[i].main.head, doc.length));
    out.push({ index: i, line: line.number, text: line.text.trim().slice(0, 80), current: i === h.index });
  }
  return out;
}

/** Move to record `index` of the current file, as stepping back or forward to it would. */
export function jumpToRecord(view: EditorView, index: number): void {
  if (currentFile === null) return;
  const k = keyOf(currentFile);
  const h = histories.get(k);
  const sel = h?.list[index];
  if (!h || !sel) return;
  histories.set(k, { ...h, index, kind: "" });
  show(view, sel);
}

/** Test hook: drop every history (node checks only). */
export function resetJumpHistories(): void {
  histories.clear();
  currentFile = null;
}
