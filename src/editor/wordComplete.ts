// Sublime-style Tab word-completion (issue 5): type the first letters of a long word and
// press Tab to get a popup LIST of matching longer words from nearby in the buffer, sorted
// by proximity to the caret; arrows to choose, Enter or Tab to accept. It fires only when a
// word character sits immediately before the caret; at line start / after whitespace Tab
// falls through to indent (Shift+Tab dedents). Candidates are LONG words (config
// [editor] tab_complete_min_len, default 5) — short words aren't worth a Tab.
// Completions respect the case of the typed stem (issue Sa 5a): matching stays
// case-insensitive, but the INSERTED word adapts — log→lognormal, Log→Lognormal,
// LOG→LOGNORMAL — and buffer duplicates differing only in case collapse to the nearest
// occurrence. Everything here runs only on an explicit Tab: zero baseline editing cost.
import { Prec, type EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentLess, indentMore } from "@codemirror/commands";
import {
  acceptCompletion,
  autocompletion,
  completionStatus,
  startCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { useStore } from "../store";
import { freqMatches } from "./wordFreq";

const WINDOW = 40_000; // chars scanned each side of the caret (bounds cost on huge docs)
const WORD_RE = /[\p{L}\p{N}_]+/gu;

/** The word `from`/text immediately before `pos` on its line — or null if none (line
 *  start, after whitespace, or after punctuation). */
function stemBefore(state: EditorState, pos: number): { from: number; stem: string } | null {
  const line = state.doc.lineAt(pos);
  const m = /[\p{L}\p{N}_]+$/u.exec(line.text.slice(0, pos - line.from));
  return m ? { from: pos - m[0].length, stem: m[0] } : null;
}

/** True when `stem` is the tail of a `@…` citation key — leave those to the citation popup. */
function isCitationStem(state: EditorState, from: number): boolean {
  const line = state.doc.lineAt(from);
  return from > line.from && line.text[from - line.from - 1] === "@";
}

/** Re-case `candidate` to match the typed stem (Sa 5a): an ALL-CAPS stem (2+ chars)
 *  uppercases the whole word; a leading capital capitalizes the first letter; a
 *  lowercase stem lowers the first letter — interior caps are preserved either way. */
function adaptCase(candidate: string, stem: string): string {
  if (stem.length >= 2 && stem === stem.toUpperCase() && /\p{L}/u.test(stem)) {
    return candidate.toUpperCase();
  }
  const first = stem[0];
  return first === first.toLowerCase()
    ? candidate[0].toLowerCase() + candidate.slice(1)
    : candidate[0].toUpperCase() + candidate.slice(1);
}

/** Nearby words that start with `stem` (case-insensitively), are at least `minLen`
 *  long AND longer than the stem, deduped case-insensitively (nearest occurrence
 *  wins), ranked by distance from the caret, and re-cased to the stem. Excludes the
 *  word being typed. */
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
  const best = new Map<string, { form: string; dist: number }>(); // key = lowercase
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
    const prev = best.get(wl);
    if (prev === undefined || dist < prev.dist) best.set(wl, { form: w, dist });
  }
  return [...best.values()]
    .sort((a, b) => a.dist - b.dist)
    .map((c) => adaptCase(c.form, stem));
}

/** Completion source: the harvested candidate list, nearest-first (proximity encoded as a
 *  boost so the order survives the popup's own ranking). Explicit-only (Tab), so it never
 *  auto-pops while typing. Returns null in an @-citation context so the citation source wins. */
export function wordCompleteSource(context: CompletionContext): CompletionResult | null {
  if (!context.explicit) return null;
  const s = stemBefore(context.state, context.pos);
  if (!s || isCitationStem(context.state, s.from)) return null;
  const es = useStore.getState().editorSettings;
  const minLen = es?.tab_complete_min_len ?? 5;
  const cands = harvest(context.state, context.pos, s.from, s.stem, minLen);
  // Frequency dictionary (Sa 5b): your frequently-used words follow the nearby ones —
  // the "combo nearby + used frequently" algo, and the only source when the word you
  // want isn't in the current doc at all.
  if (es?.tab_complete_dict ?? true) {
    const exclude = new Set(cands.map((w) => w.toLowerCase()));
    const dictMin = Math.max(es?.tab_complete_dict_min_len ?? 5, s.stem.length + 1);
    cands.push(
      ...freqMatches(s.stem.toLowerCase(), dictMin, exclude, 8).map((w) =>
        adaptCase(w, s.stem),
      ),
    );
  }
  if (cands.length === 0) return null;
  return {
    from: s.from,
    options: cands.map((w, i) => ({ label: w, boost: -Math.min(i, 99) })),
    validFor: /^[\p{L}\p{N}_]*$/u, // keep the popup live (narrowing) as you type more
  };
}

/** Tab: open the word-completion popup when the caret is at the end of a word that has
 *  candidates; otherwise decline so Tab indents. Yields to an already-open popup and to the
 *  @-citation Tab handler. */
function tabOpenComplete(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return false;
  if (completionStatus(state) === "active") return false; // popup open → the fallback accepts
  const pos = state.selection.main.head;
  const s = stemBefore(state, pos);
  if (!s || isCitationStem(state, s.from)) return false;
  const es = useStore.getState().editorSettings;
  const minLen = es?.tab_complete_min_len ?? 5;
  if (harvest(state, pos, s.from, s.stem, minLen).length === 0) {
    // No nearby match — the frequency dictionary may still have one (Sa 5b).
    const dictMin = Math.max(es?.tab_complete_dict_min_len ?? 5, s.stem.length + 1);
    if (
      !(es?.tab_complete_dict ?? true) ||
      freqMatches(s.stem.toLowerCase(), dictMin, new Set(), 1).length === 0
    ) {
      return false; // nothing anywhere → indent
    }
  }
  startCompletion(view);
  return true;
}

/** Tab keymap for every document: open the popup, else indent. Shift+Tab dedents. When a
 *  completion popup is open, Tab accepts the highlighted option (word or citation). */
export const wordCompleteKeymap = [
  Prec.high(keymap.of([{ key: "Tab", run: tabOpenComplete }])),
  keymap.of([
    {
      key: "Tab",
      run: (v) => {
        if (completionStatus(v.state) === "active") {
          acceptCompletion(v);
          return true; // consume even if nothing was selected — never indent over a popup
        }
        return indentMore(v);
      },
      shift: indentLess,
    },
  ]),
];

/** Autocompletion carrying only the word source — for NON-markdown documents (markdown docs
 *  get the word source folded into the citation autocompletion instead). */
export const wordCompleteAutocomplete = autocompletion({ override: [wordCompleteSource] });
