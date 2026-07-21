// Front-matter block styling (spec §17). Key/value colouring comes from the real YAML
// parser (languages.ts tolerantFrontmatter); this module only paints the block band.
// (An older decoration-based highlighter that duplicated the colouring lived here
// until 1.93.2 — dead code since the real parser arrived, now removed.)
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

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
