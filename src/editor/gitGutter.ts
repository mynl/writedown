// Per-line git change marks in the editor gutter (issue I.02, default OFF — config
// [git] gutter_marks or the palette's Git: Gutter Marks On/Off). A 3 px stripe per line:
// changed / added / deleted-here, diffing the buffer against the INDEX version of the
// file (`git show :0:…`). Refreshed on open and on save — NOT per keystroke; between
// saves the marks ride along with edits via RangeSet.map, so they drift with the text
// instead of pointing at stale lines. No store import here, deliberately: store.ts calls
// refreshGitGutter after a save, and an import back into the store would be a cycle
// (the 2.17.1 languages.ts lesson).
import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import { RangeSet, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { diff } from "@codemirror/merge";
import { gitShowIndex } from "../api";

class Stripe extends GutterMarker {
  override elementClass: string;
  constructor(cls: string) {
    super();
    this.elementClass = cls;
  }
}

const CHANGED = new Stripe("cm-git-changed");
const ADDED = new Stripe("cm-git-added");
const DELETED = new Stripe("cm-git-deleted");

const setGitMarks = StateEffect.define<RangeSet<GutterMarker>>();

const gitMarksField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) if (e.is(setGitMarks)) set = e.value;
    return set;
  },
});

/** The gutter extension pair — pushed by Editor.tsx only when gutter marks are on. */
export const gitGutterExtension = [
  gitMarksField,
  gutter({
    class: "cm-git-gutter",
    markers: (view) => view.state.field(gitMarksField),
  }),
];

/** Fetch the index base for `path`, diff it against the CURRENT buffer, and repaint the
 *  stripes. Called on document open and after each save; async, never on the typing path.
 *  No git / not a repo → the marks simply clear. */
export async function refreshGitGutter(view: EditorView, path: string): Promise<void> {
  let base: string | null = null;
  try {
    base = await gitShowIndex(path);
  } catch {
    return; // backend problem — leave whatever is painted; never an error strip
  }
  if (!view.dom.isConnected || view.state.field(gitMarksField, false) === undefined) return;
  if (base === null) {
    view.dispatch({ effects: setGitMarks.of(RangeSet.empty) });
    return;
  }
  const doc = view.state.doc;
  const cur = doc.toString();
  // Line → mark class; a line touched by several chunks keeps the strongest claim
  // (changed beats added beats deleted-here, in encounter order — ties are cosmetic).
  const byLine = new Map<number, GutterMarker>();
  for (const ch of diff(base, cur)) {
    if (ch.fromB === ch.toB) {
      // Pure deletion: nothing of it remains in the buffer — mark the line at the spot.
      const n = doc.lineAt(Math.min(ch.fromB, doc.length)).number;
      if (!byLine.has(n)) byLine.set(n, DELETED);
    } else {
      const mark = ch.fromA === ch.toA ? ADDED : CHANGED;
      const first = doc.lineAt(ch.fromB).number;
      const last = doc.lineAt(Math.max(ch.fromB, ch.toB - 1)).number;
      for (let n = first; n <= last; n++) byLine.set(n, mark);
    }
  }
  const builder = new RangeSetBuilder<GutterMarker>();
  for (const [n, mark] of [...byLine].sort((a, b) => a[0] - b[0])) {
    const from = doc.line(n).from;
    builder.add(from, from, mark);
  }
  view.dispatch({ effects: setGitMarks.of(builder.finish()) });
}
