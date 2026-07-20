// Sublime-style Tab word-completion (issue 5): type the first letters of a long word,
// press Tab, and the nearest matching longer word from nearby in the buffer is inserted;
// Tab again cycles through the other matches, then back to what you typed. It fires
// whenever a word character sits immediately before the caret; at line start / after
// whitespace Tab falls through to indent. Candidates are LONG words (config
// [editor] tab_complete_min_len, default 5) — short words aren't worth a Tab. Everything
// here runs only on an explicit Tab, so there is zero baseline editing cost.
import { Annotation, Prec, StateField, type EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentLess, indentMore } from "@codemirror/commands";
import { completionStatus } from "@codemirror/autocomplete";
import { useStore } from "../store";

const WINDOW = 40_000; // chars scanned each side of the caret (bounds cost on huge docs)
const WORD_RE = /[\p{L}\p{N}_]+/gu;

type Cycle = { from: number; stem: string; options: string[]; idx: number };
const cycleAnnotation = Annotation.define<Cycle>();

// Holds the in-progress cycle; cleared by any transaction that isn't one of our own steps
// (a real edit or a cursor move ends the cycle, so the next Tab harvests fresh).
const cycleField = StateField.define<Cycle | null>({
  create: () => null,
  update(value, tr) {
    const ann = tr.annotation(cycleAnnotation);
    if (ann) return ann;
    if (tr.docChanged || tr.selection) return null;
    return value;
  },
});

/** The word `from`/text immediately before `pos` on its line — or null if none (line
 *  start, after whitespace, or after punctuation). */
function stemBefore(state: EditorState, pos: number): { from: number; stem: string } | null {
  const line = state.doc.lineAt(pos);
  const m = /[\p{L}\p{N}_]+$/u.exec(line.text.slice(0, pos - line.from));
  return m ? { from: pos - m[0].length, stem: m[0] } : null;
}

/** Nearby words that start with `stem`, are at least `minLen` long AND longer than the
 *  stem, deduped and ranked by distance from the caret. Excludes the word being typed. */
function harvest(
  state: EditorState,
  pos: number,
  from: number,
  stem: string,
  minLen: number,
): string[] {
  const lo = Math.max(0, pos - WINDOW);
  const hi = Math.min(state.doc.length, pos + WINDOW);
  const text = state.doc.sliceString(lo, hi);
  const stemLower = stem.toLowerCase();
  const min = Math.max(minLen, stem.length + 1); // must be longer than what's typed
  const best = new Map<string, number>();
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text))) {
    const w = m[0];
    if (w.length < min) continue;
    const wl = w.toLowerCase();
    if (!wl.startsWith(stemLower) || wl === stemLower) continue;
    const at = lo + m.index;
    if (at === from) continue; // the word currently being typed
    const dist = Math.abs(at - pos);
    const prev = best.get(w);
    if (prev === undefined || dist < prev) best.set(w, dist);
  }
  return [...best.entries()].sort((a, b) => a[1] - b[1]).map(([w]) => w);
}

/** Tab word-completion / cycle. Returns false (so Tab falls through to indent) when the
 *  caret isn't after a word, a completion popup is open, or there's nothing to offer. */
export function tryWordComplete(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false; // multi-cursor: leave Tab alone
  const range = state.selection.main;
  if (!range.empty) return false;
  if (completionStatus(state) === "active") return false; // let the popup own Tab
  const pos = range.head;

  // Continue a live cycle while the caret still sits at the end of the last insertion.
  const cyc = state.field(cycleField, false);
  if (cyc) {
    const current = cyc.options[cyc.idx];
    if (pos === cyc.from + current.length) {
      const idx = (cyc.idx + 1) % cyc.options.length;
      const next = cyc.options[idx];
      view.dispatch({
        changes: { from: cyc.from, to: pos, insert: next },
        selection: { anchor: cyc.from + next.length },
        annotations: cycleAnnotation.of({ ...cyc, idx }),
        userEvent: "input.complete",
      });
      return true;
    }
  }

  const s = stemBefore(state, pos);
  if (!s) return false; // line start / after whitespace → indent
  // Yield the `@…` citation stem to the citation Tab handler.
  const line = state.doc.lineAt(pos);
  if (s.from > line.from && line.text[s.from - line.from - 1] === "@") return false;

  const minLen = useStore.getState().editorSettings?.tab_complete_min_len ?? 5;
  const cands = harvest(state, pos, s.from, s.stem, minLen);
  if (cands.length === 0) return false;

  // Cycle order: nearest candidate first, the stem last so Tab eventually returns what you
  // typed. The first Tab inserts the nearest.
  const options = [...cands, s.stem];
  view.dispatch({
    changes: { from: s.from, to: pos, insert: options[0] },
    selection: { anchor: s.from + options[0].length },
    annotations: cycleAnnotation.of({ from: s.from, stem: s.stem, options, idx: 0 }),
    userEvent: "input.complete",
  });
  return true;
}

export const wordCompleteExtensions = [
  cycleField,
  // Word-complete at Prec.high, alongside the @-citation Tab retrigger — order-independent
  // because it declines the @ context (returning false without indenting) and vice versa.
  Prec.high(keymap.of([{ key: "Tab", run: tryWordComplete }])),
  // Indent fallback at default precedence — tried only after every high Tab handler
  // (snippet fields, @-citation retrigger, word-complete) declines. Guarded so it never
  // indents while a completion popup is open.
  keymap.of([
    {
      key: "Tab",
      run: (v) => (completionStatus(v.state) === "active" ? true : indentMore(v)),
      shift: indentLess,
    },
  ]),
];
