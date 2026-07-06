// BibTeX citation autocomplete + hover (spec §20–22). Typing `@` in prose opens a live
// fzf-ranked popup (matched in Rust with SkimMatcherV2); hovering an existing `@key`
// shows its title. Ctrl+Shift+C opens the picker directly.
import {
  autocompletion,
  startCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView, hoverTooltip, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { getCitation, searchBibliography, type BibEntry } from "../api";

const CITE = /@[\p{L}\d_:.\-]+/gu;

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

  let results: BibEntry[];
  try {
    results = await searchBibliography(match.text.slice(1));
  } catch {
    return null;
  }

  return {
    from: match.from,
    filter: false, // ranking already done by SkimMatcherV2 in Rust
    options: results.map((r) => ({
      label: "@" + r.key,
      detail: [r.author, r.year].filter(Boolean).join(" "),
      apply: "@" + r.key,
      info: () => {
        const el = document.createElement("div");
        el.className = "cite-info";
        el.textContent = describe(r);
        return el;
      },
    })),
  };
}

const citeHover = hoverTooltip(async (view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const rel = pos - line.from;
  CITE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITE.exec(line.text))) {
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
  autocompletion({ override: [citationSource], icons: false }),
  citeHover,
  keymap.of([{ key: "Mod-Shift-c", run: openCitationPicker }]),
];
