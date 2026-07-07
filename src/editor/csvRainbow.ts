// Rainbow-colour CSV/TSV columns, à la Sublime's RainbowCSV. Each field on a line is
// coloured by its column index (cycling through a fixed palette). Purely visual.
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { logError } from "../api";

const COLS = 8;
const marks = Array.from({ length: COLS }, (_, i) => Decoration.mark({ class: `wd-col-${i}` }));

function build(view: EditorView): DecorationSet {
  try {
    return buildInner(view);
  } catch (e) {
    void logError("csv rainbow failed: " + String(e));
    return Decoration.none;
  }
}

function buildInner(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const max = Math.min(doc.lines, 5000); // cap for very large files
  for (let n = 1; n <= max; n++) {
    const line = doc.line(n);
    const text = line.text;
    let col = 0;
    let start = 0;
    for (let i = 0; i <= text.length; i++) {
      if (i === text.length || text[i] === "," || text[i] === "\t") {
        if (i > start) b.add(line.from + start, line.from + i, marks[col % COLS]);
        col++;
        start = i + 1;
      }
    }
  }
  return b.finish();
}

export const csvRainbow = ViewPlugin.fromClass(
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
