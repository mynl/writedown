// LaTeX math highlighting in Markdown/Quarto: `$$…$$` (display) and `$…$` (inline).
// Inline math must contain a math signal (\\ ^ _) so plain prose and currency ($5)
// aren't miscoloured. Full TeX files use the stex language instead (see languages.ts).
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const mathMark = Decoration.mark({ class: "wd-math" });
const MAX = 500_000;

function build(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  if (doc.length > MAX) return Decoration.none;
  const text = doc.toString();
  const ranges: Array<[number, number]> = [];

  const display = /\$\$[\s\S]*?\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = display.exec(text))) ranges.push([m.index, m.index + m[0].length]);

  const inline = /(?<![\\$])\$(?![\s$])([^$\n]*?)\$/g;
  while ((m = inline.exec(text))) {
    if (!/[\\^_]/.test(m[1])) continue; // require a math signal
    const from = m.index;
    const to = from + m[0].length;
    if (ranges.some(([a, b]) => from < b && to > a)) continue; // inside a $$ block
    ranges.push([from, to]);
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const builder = new RangeSetBuilder<Decoration>();
  let last = -1;
  for (const [from, to] of ranges) {
    if (from < last) continue;
    builder.add(from, to, mathMark);
    last = to;
  }
  return builder.finish();
}

export const mathHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
