// LaTeX math highlighting in Markdown/Quarto: `$$…$$` (display) and `$…$` (inline).
// Inside each math span the tokens are coloured separately (ST-style): `$` delimiters,
// `\commands`, numbers, operators, braces, and plain text each get their own class.
// Purely visual — never touches the document text.
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { logError } from "../api";

const cls = {
  delim: Decoration.mark({ class: "wd-math-delim" }),
  cmd: Decoration.mark({ class: "wd-math-cmd" }),
  num: Decoration.mark({ class: "wd-math-num" }),
  op: Decoration.mark({ class: "wd-math-op" }),
  brace: Decoration.mark({ class: "wd-math-brace" }),
  text: Decoration.mark({ class: "wd-math-text" }),
};

const MAX = 500_000;
// \command, \, escaped char, number, run of operators, single brace/paren/bracket.
const TOKEN = /\\[a-zA-Z]+\*?|\\.|[0-9]+(?:\.[0-9]+)?|[+\-*/=<>!&|~^_,;:.]+|[{}()[\]]/g;

type Span = [number, number, Decoration];

function classify(tok: string): Decoration {
  const c = tok[0];
  if (c === "\\") return cls.cmd;
  if (c >= "0" && c <= "9") return cls.num;
  if ("{}()[]".includes(c)) return cls.brace;
  return cls.op;
}

/** Tokenise one math region [from,to] (delimiter length = 1 for `$`, 2 for `$$`). */
function tokenize(text: string, from: number, to: number, out: Span[]) {
  const dl = text.startsWith("$$", from) ? 2 : 1;
  const cStart = from + dl;
  const cEnd = to - dl;
  if (cEnd <= cStart) {
    out.push([from, to, cls.delim]);
    return;
  }
  out.push([from, cStart, cls.delim]);
  const content = text.slice(cStart, cEnd);
  let last = cStart;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(content))) {
    const s = cStart + m.index;
    const e = s + m[0].length;
    if (s > last) out.push([last, s, cls.text]); // plain text between tokens
    out.push([s, e, classify(m[0])]);
    last = e;
  }
  if (cEnd > last) out.push([last, cEnd, cls.text]);
  out.push([cEnd, to, cls.delim]);
}

function build(view: EditorView): DecorationSet {
  try {
    return buildInner(view);
  } catch (e) {
    void logError("math highlight failed: " + String(e));
    return Decoration.none;
  }
}

function buildInner(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  if (doc.length > MAX) return Decoration.none;
  const text = doc.toString();

  const regions: Array<[number, number]> = [];
  let m: RegExpExecArray | null;

  // Bounded, alternation-free patterns — avoids catastrophic backtracking (a ReDoS hang
  // that froze the editor's update, leaving a stale view).
  const display = /\$\$[\s\S]{0,4000}?\$\$/g;
  while ((m = display.exec(text))) regions.push([m.index, m.index + m[0].length]);

  const inline = /(?<![\\$\d])\$(?![\s$])[^$\n]{1,240}?(?<!\s)\$(?!\d)/g;
  while ((m = inline.exec(text))) {
    const from = m.index;
    const to = from + m[0].length;
    if (regions.some(([a, b]) => from < b && to > a)) continue;
    regions.push([from, to]);
  }

  regions.sort((a, b) => a[0] - b[0]);
  const spans: Span[] = [];
  for (const [from, to] of regions) tokenize(text, from, to, spans);

  spans.sort((a, b) => a[0] - b[0]);
  const builder = new RangeSetBuilder<Decoration>();
  let last = -1;
  for (const [from, to, deco] of spans) {
    if (from < last || to <= from) continue;
    builder.add(from, to, deco);
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
