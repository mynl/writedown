// BibTeX citation autocomplete + hover (spec §20–22). Typing `@` in prose opens a live
// popup ranked in Rust by an fzf-style matcher over key+title (supports `'exact` terms);
// matched characters are highlighted. Hovering an existing `@key` shows its title.
// Ctrl+Shift+C opens the picker directly.
import {
  autocompletion,
  completionStatus,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView, hoverTooltip, keymap } from "@codemirror/view";
import { Prec, type EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { SyntaxNode } from "@lezer/common";
import {
  checkCitationKeys,
  getCitation,
  searchBibliography,
  type BibEntry,
  type CiteMatch,
} from "../api";

// Extra fields we hang off the Completion for our custom renderer.
type CiteCompletion = Completion & { cite?: string; positions?: number[] };

function describe(e: BibEntry): string {
  const meta = [e.author, e.year, e.container].filter(Boolean).join(" · ");
  return [e.title, meta].filter(Boolean).join("\n");
}

// True only outside code / fenced blocks / front matter — where a `@` is a citation
// and not a decorator, email, or code token (spec §20).
function isProsePos(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
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

// Don't complete inside code / fenced blocks / front matter (spec §20).
function inProse(context: CompletionContext): boolean {
  return isProsePos(context.state, context.pos);
}

async function citationSource(context: CompletionContext): Promise<CompletionResult | null> {
  // Allow `'` in the query so `@'mild'pric` (exact terms) reaches the matcher.
  const match = context.matchBefore(/@[\p{L}\d_:.\-']*/u);
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
    // No side `info` panel — it overlapped the list. Full details are in the label
    // (key + title) + detail (co-authors · year), and on hover of an inserted @key.
    options: results.map((r): CiteCompletion => ({
      label: r.label,
      cite: r.label,
      positions: r.positions,
      detail: [r.coauthors, r.year].filter(Boolean).join(" · "),
      apply: "@" + r.key,
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

/** Tab re-opens the picker when the cursor sits just after a partial `@…` and no popup
 *  is open; otherwise it falls through to normal Tab (accept completion / indent). */
function retriggerTab(view: EditorView): boolean {
  if (completionStatus(view.state) === "active") return false;
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  if (/@[\p{L}\d_:.\-']*$/u.test(line.text.slice(0, head - line.from))) {
    startCompletion(view);
    return true;
  }
  return false;
}

// A `@key` in prose: `@` at a word boundary (not an email or `a/@b`), key starting and
// ending on an alphanumeric so a trailing `.`/`-`/`:` (sentence punctuation) is excluded.
const CITE_RE = /(?<![\p{L}\p{N}_@/])@([\p{L}\d](?:[\p{L}\d_:.\-]*[\p{L}\d])?)/gu;

// Quarto cross-reference families (`@sec-…`, `@fig-…`, `@tbl-…`, `@eq-…`, theorem-likes,
// …) are document crossrefs, not bibliography citations — they must never be looked up in
// the bib or flagged as missing. Steve's citation keys are `Author2024a` / `Authors`
// (no hyphen); his Quarto tags carry the `prefix-` shape, so this is an exact split.
const CROSSREF_PREFIX =
  /^(fig|tbl|eq|sec|lst|thm|lem|cor|prp|cnj|def|exm|exr|sol|rem)-/;

/** Flag every `@key` that has no match in the loaded bibliography — a red underline +
 *  gutter marker, like the Python-cell errors. Silent when no bib is loaded. */
const citationLint = linter(
  async (view): Promise<Diagnostic[]> => {
    const text = view.state.doc.toString();
    const hits: { from: number; to: number; key: string }[] = [];
    for (const m of text.matchAll(CITE_RE)) {
      if (m.index === undefined) continue;
      const from = m.index;
      const key = m[1];
      if (CROSSREF_PREFIX.test(key)) continue; // Quarto crossref, not a citation
      if (!isProsePos(view.state, from + 1)) continue;
      hits.push({ from, to: from + 1 + key.length, key });
    }
    if (hits.length === 0) return [];

    let missing: Set<string>;
    try {
      missing = new Set(await checkCitationKeys([...new Set(hits.map((h) => h.key))]));
    } catch {
      return []; // backend/bib unavailable — never block editing
    }
    if (missing.size === 0) return [];

    return hits
      .filter((h) => missing.has(h.key))
      .map((h) => ({
        from: h.from,
        to: h.to,
        severity: "error" as const,
        message: `@${h.key} — not found in the bibliography`,
      }));
  },
  { delay: 500 },
);

export const citationExtensions = [
  autocompletion({
    override: [citationSource],
    icons: false,
    addToOptions: [{ render: renderLabel, position: 20 }],
  }),
  citeHover,
  citationLint,
  Prec.high(
    keymap.of([
      { key: "Mod-Shift-c", run: openCitationPicker },
      { key: "Tab", run: retriggerTab },
    ]),
  ),
];
