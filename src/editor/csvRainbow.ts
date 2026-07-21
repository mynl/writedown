// Rainbow-colour CSV/TSV columns, à la Sublime's RainbowCSV. Each field on a line is
// coloured by its column index (cycling through a fixed palette). Purely visual.
// Dialects follow the ST convention: .csv splits on commas with RFC-4180 quoting
// (a field starting with `"` runs to its closing quote, `""` inside is an escaped
// quote, so quoted commas stay in one column); .tsv splits on tabs, no quoting.
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

function build(view: EditorView, delim: string, quoted: boolean): DecorationSet {
  try {
    return buildInner(view, delim, quoted);
  } catch (e) {
    void logError("csv rainbow failed: " + String(e));
    return Decoration.none;
  }
}

function buildInner(view: EditorView, delim: string, quoted: boolean): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const max = Math.min(doc.lines, 5000); // cap for very large files
  for (let n = 1; n <= max; n++) {
    const line = doc.line(n);
    const text = line.text;
    let col = 0;
    let start = 0;
    for (let i = 0; i <= text.length; i++) {
      if (quoted && i === start && text[i] === '"') {
        // Quoted field: jump past the closing quote; unclosed runs to end of line.
        i++;
        while (i < text.length) {
          if (text[i] === '"' && text[i + 1] === '"') i += 2;
          else if (text[i] === '"') {
            i++;
            break;
          } else i++;
        }
      }
      if (i === text.length || text[i] === delim) {
        if (i > start) b.add(line.from + start, line.from + i, marks[col % COLS]);
        col++;
        start = i + 1;
      }
    }
  }
  return b.finish();
}

/** Rainbow extension for `path` — delimiter and quote handling picked by extension. */
export function csvRainbow(path: string) {
  const tsv = /\.tsv$/i.test(path);
  const delim = tsv ? "\t" : ",";
  const quoted = !tsv;
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, delim, quoted);
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.decorations = build(u.view, delim, quoted);
      }
    },
    { decorations: (v) => v.decorations },
  );
}
