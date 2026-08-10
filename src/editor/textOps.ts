// Small text-manipulation commands drawn from the Sublime keymap that CodeMirror 6 doesn't ship
// as built-ins. StateCommand style (like lists.ts / tables.ts); single undo step; multi-cursor
// aware where it makes sense. Registered in commandRegistry.ts; bind them via config [keys].
import { EditorSelection, type StateCommand } from "@codemirror/state";

// Uppercase / lowercase each non-empty selection.
function transformCase(fn: (s: string) => string): StateCommand {
  return ({ state, dispatch }) => {
    const changes = [];
    for (const r of state.selection.ranges) {
      if (r.empty) continue;
      changes.push({ from: r.from, to: r.to, insert: fn(state.sliceDoc(r.from, r.to)) });
    }
    if (changes.length === 0) return false;
    dispatch(state.update({ changes, userEvent: "input.case" }));
    return true;
  };
}

export const upperCase = transformCase((s) => s.toUpperCase());
export const lowerCase = transformCase((s) => s.toLowerCase());
// Sublime-style Title Case: first letter of every word up, the rest down.
export const titleCase = transformCase((s) =>
  s.replace(/[\p{L}\p{N}][\p{L}\p{N}']*/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
);

/** Sublime's Ctrl+Shift+D: duplicate the SELECTION when there is one, else the whole line
 *  (issue A.06). CodeMirror's `copyLineDown` is line-only; this returns false when every
 *  range is empty so the caller falls back to it — the no-selection behaviour is exactly
 *  what it always was. The inserted copy is left selected, so pressing again keeps going. */
export const duplicateSelection: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.every((r) => r.empty)) return false;
  dispatch(
    state.update(
      state.changeByRange((range) => {
        if (range.empty) return { range };
        const text = state.sliceDoc(range.from, range.to);
        return {
          changes: { from: range.to, insert: text },
          range: EditorSelection.range(range.to, range.to + text.length),
        };
      }),
      { userEvent: "input.duplicate", scrollIntoView: true },
    ),
  );
  return true;
};

// Word chars for transpose: letters/digits/underscore with internal apostrophes ("don't").
const WORD_RE = /[\p{L}\p{N}_]+(?:'[\p{L}\p{N}_]+)*/gu;
// How far around the caret to look for the two words (crosses newlines, like emacs).
const TRANSPOSE_WINDOW = 500;

// Emacs M-t: swap the word at/before the caret with the word after it; the caret ends after
// the pair (so repeated presses drag a word rightward). Multi-cursor aware.
export const transposeWords: StateCommand = ({ state, dispatch }) => {
  const changes = [];
  const ends: number[] = [];
  for (const r of state.selection.ranges) {
    if (!r.empty) continue;
    const base = Math.max(0, r.head - TRANSPOSE_WINDOW);
    const text = state.sliceDoc(base, Math.min(state.doc.length, r.head + TRANSPOSE_WINDOW));
    const rel = r.head - base;
    const words: { from: number; to: number; text: string }[] = [];
    for (const m of text.matchAll(WORD_RE)) {
      words.push({ from: m.index, to: m.index + m[0].length, text: m[0] });
    }
    // A = the word containing the caret, else the last word ending at/before it; B = the next.
    let i = words.findIndex((w) => w.from < rel && rel < w.to);
    if (i < 0) {
      i = -1;
      for (let k = 0; k < words.length; k++) if (words[k].to <= rel) i = k;
    }
    const a = i >= 0 ? words[i] : undefined;
    const b = i >= 0 ? words[i + 1] : undefined;
    if (!a || !b) continue;
    changes.push({ from: base + a.from, to: base + a.to, insert: b.text });
    changes.push({ from: base + b.from, to: base + b.to, insert: a.text });
    ends.push(base + b.to); // total region length is unchanged by the swap
  }
  if (changes.length === 0) return false;
  dispatch(
    state.update({
      changes,
      selection: EditorSelection.create(ends.map((e) => EditorSelection.cursor(e))),
      scrollIntoView: true,
      userEvent: "input.transpose",
    }),
  );
  return true;
};

// Sort the lines spanned by the primary selection (or the whole document region it covers).
export const sortLines: StateCommand = ({ state, dispatch }) => {
  const sel = state.selection.main;
  const from = state.doc.lineAt(sel.from).from;
  const to = state.doc.lineAt(sel.to).to;
  if (from === to) return false;
  const lines = state.sliceDoc(from, to).split("\n");
  lines.sort((a, b) => a.localeCompare(b));
  dispatch(state.update({ changes: { from, to, insert: lines.join("\n") }, userEvent: "sort.lines" }));
  return true;
};

// Open a new (indent-matched) line below / above each cursor and move there — regardless of the
// caret's column (Sublime's Ctrl+Enter / Ctrl+Shift+Enter).
export const insertLineAfter: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    const indent = /^\s*/.exec(line.text)![0];
    const insert = "\n" + indent;
    return {
      changes: { from: line.to, insert },
      range: EditorSelection.cursor(line.to + insert.length),
    };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

/** The strftime directives the stamp formats support — the useful subset, not a full
 *  implementation. Unknown `%x` is left alone (so a literal `%` survives), and `%%` is an
 *  escaped percent. Locale-dependent names come from `toLocaleDateString`, so `%B` in a
 *  German Windows says "August" in German — which is the right answer. */
export function formatStamp(d: Date, pattern: string): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const loc = (opt: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, opt);
  const map: Record<string, string> = {
    Y: String(d.getFullYear()),
    y: p(d.getFullYear() % 100),
    m: p(d.getMonth() + 1),
    d: p(d.getDate()),
    e: String(d.getDate()),
    H: p(d.getHours()),
    I: p(d.getHours() % 12 || 12),
    M: p(d.getMinutes()),
    S: p(d.getSeconds()),
    p: d.getHours() < 12 ? "AM" : "PM",
    A: loc({ weekday: "long" }),
    a: loc({ weekday: "short" }),
    B: loc({ month: "long" }),
    b: loc({ month: "short" }),
    j: String(
      Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000),
    ).padStart(3, "0"),
    "%": "%",
  };
  return pattern.replace(/%(.)/g, (whole, k: string) => map[k] ?? whole);
}

export const DEFAULT_DATE_FORMAT = "%Y-%m-%d";
export const DEFAULT_DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S";

/** Insert a formatted timestamp at every cursor (replacing any selection). Two palette
 *  verbs share this: "Insert Date" and "Insert Date-Time" (issue D.01 — the time half was
 *  being deleted by hand every time). Formats come from `[editor] date_format` /
 *  `datetime_format`; the defaults reproduce the previous hard-coded output exactly. */
export function insertStamp(pattern: string): StateCommand {
  return ({ state, dispatch }) => {
    const stamp = formatStamp(new Date(), pattern);
    dispatch(
      state.update(state.replaceSelection(stamp), { scrollIntoView: true, userEvent: "input" }),
    );
    return true;
  };
}

export const insertDateTime: StateCommand = insertStamp(DEFAULT_DATETIME_FORMAT);

export const insertLineBefore: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    const indent = /^\s*/.exec(line.text)![0];
    const insert = indent + "\n";
    return {
      changes: { from: line.from, insert },
      range: EditorSelection.cursor(line.from + indent.length),
    };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};
