// YAML front-matter highlighting (spec §17). CodeMirror's Markdown parser doesn't
// scope the `---` front-matter block, so we decorate it ourselves: keys and values get
// classes coloured from the imported Sublime scheme (in Loudoun: orange keys, green
// values). Purely visual — never touches the document text.
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const keyMark = Decoration.mark({ class: "wd-yaml-key" });
const valMark = Decoration.mark({ class: "wd-yaml-val" });
const delimMark = Decoration.mark({ class: "wd-yaml-delim" });

const KEY = /^(\s*)([^\s:#][^:]*?)(\s*:)(\s.*|)$/;

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return b.finish();

  let end = -1;
  for (let n = 2; n <= doc.lines && n <= 400; n++) {
    if (doc.line(n).text.trim() === "---") {
      end = n;
      break;
    }
  }
  if (end === -1) return b.finish();

  b.add(doc.line(1).from, doc.line(1).to, delimMark);
  for (let n = 2; n < end; n++) {
    const line = doc.line(n);
    const m = KEY.exec(line.text);
    if (!m) continue;
    const keyStart = line.from + m[1].length;
    const keyEnd = keyStart + m[2].length;
    b.add(keyStart, keyEnd, keyMark);
    if (m[4].trim().length) {
      b.add(keyEnd + m[3].length, line.to, valMark);
    }
  }
  const last = doc.line(end);
  b.add(last.from, last.to, delimMark);
  return b.finish();
}

export const frontmatterHighlight = ViewPlugin.fromClass(
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

// ---- Front-matter block styling ---------------------------------------------------
// A purely-visual line background behind the whole `---` … `---` header block, with a
// hairline top/bottom rule, so it reads as a distinct properties block (Obsidian-style).
// Coloring of keys/values comes from the real YAML parser (languages.ts) — this only
// paints the block; it never touches the text.
const blockLine = Decoration.line({ class: "wd-fm-line" });
const blockFirst = Decoration.line({ class: "wd-fm-line wd-fm-first" });
const blockLast = Decoration.line({ class: "wd-fm-line wd-fm-last" });

function buildBlock(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return b.finish();

  let end = -1;
  for (let n = 2; n <= doc.lines && n <= 400; n++) {
    if (doc.line(n).text.trim() === "---") {
      end = n;
      break;
    }
  }
  if (end === -1) return b.finish();

  for (let n = 1; n <= end; n++) {
    const from = doc.line(n).from;
    b.add(from, from, n === 1 ? blockFirst : n === end ? blockLast : blockLine);
  }
  return b.finish();
}

export const frontmatterBlock = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildBlock(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = buildBlock(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
