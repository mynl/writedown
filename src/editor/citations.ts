// BibTeX citation autocomplete + hover (spec §20–22). Typing `@` in prose opens a live
// popup ranked in Rust by an fzf-style matcher over key+title (supports `'exact` terms);
// matched characters are highlighted. Hovering an existing `@key` shows its title.
// Ctrl+Shift+C opens the picker directly.
import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView, hoverTooltip, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { getCitation, searchBibliography, type BibEntry, type CiteMatch } from "../api";

// Extra fields we hang off the Completion for our custom renderer.
type CiteCompletion = Completion & { cite?: string; positions?: number[] };

function describe(e: BibEntry): string {
  const meta = [e.author, e.year, e.container].filter(Boolean).join(" · ");
  return [e.title, meta].filter(Boolean).join("\n");
}

// Don't complete inside code / fenced blocks / front matter (spec §20).
function inProse(context: CompletionContext): boolean {
  let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(context.pos, -1);
  while (node) {
    const name = node.type.name.toLowerCase();
    if (
      name.includes("code") ||
      name.includes("fenced") ||
      name.includes("comment") ||
      name.includes("frontmatter") ||
      name.includes("yaml")
    ) {
      return false;
    }
    node = node.parent;
  }
  return true;
}

async function citationSource(context: CompletionContext): Promise<CompletionResult | null> {
  const match = context.matchBefore(/@[\p{L}\d_:.\-]*/u);
  if (!match || (match.from === match.to && !context.explicit)) return null;
  if (!inProse(context)) return null;

  let results: CiteMatch[];
  try {
    results = await searchBibliography(match.text.slice(1));
  } catch {
    return null;
  }

  return {
    from: match.from,
    filter: false, // ranking already done in Rust
    options: results.map((r): CiteCompletion => ({
      label: r.label,
      cite: r.label,
      positions: r.positions,
      detail: [r.coauthors, r.year].filter(Boolean).join(" · "),
      apply: "@" + r.key,
      info: () => {
        const el = document.createElement("div");
        el.className = "cite-info";
        el.textContent = [r.title, [r.author, r.year, r.container].filter(Boolean).join(" · ")]
          .filter(Boolean)
          .join("\n");
        return el;
      },
    })),
  };
}

// Render the label with matched characters bolded (replaces the default label, which is
// hidden via CSS).
function renderLabel(completion: Completion): Node {
  const c = completion as CiteCompletion;
  const label = c.cite ?? completion.label;
  const hit = new Set(c.positions ?? []);
  const span = document.createElement("span");
  span.className = "cite-label";
  let run = "";
  let hl = false;
  const flush = () => {
    if (!run) return;
    const el = document.createElement(hl ? "b" : "span");
    if (hl) el.className = "cite-hl";
    el.textContent = run;
    span.appendChild(el);
    run = "";
  };
  [...label].forEach((ch, i) => {
    const h = hit.has(i);
    if (h !== hl) {
      flush();
      hl = h;
    }
    run += ch;
  });
  flush();
  return span;
}

const citeHover = hoverTooltip(async (view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const rel = pos - line.from;
  const re = /@[\p{L}\d_:.\-]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    const s = m.index;
    const e = s + m[0].length;
    if (rel < s || rel > e) continue;
    let entry: BibEntry | null;
    try {
      entry = await getCitation(m[0].slice(1));
    } catch {
      return null;
    }
    if (!entry) return null;
    const e2 = entry;
    return {
      pos: line.from + s,
      end: line.from + e,
      above: true,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "cite-tooltip";
        dom.textContent = describe(e2);
        return { dom };
      },
    };
  }
  return null;
});

/** Ctrl+Shift+C: insert `@` and open the picker. */
function openCitationPicker(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  view.dispatch({ changes: { from: pos, insert: "@" }, selection: { anchor: pos + 1 } });
  startCompletion(view);
  return true;
}

export const citationExtensions = [
  autocompletion({
    override: [citationSource],
    icons: false,
    addToOptions: [{ render: renderLabel, position: 20 }],
  }),
  citeHover,
  keymap.of([{ key: "Mod-Shift-c", run: openCitationPicker }]),
];
