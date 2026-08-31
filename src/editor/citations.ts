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
import { Prec } from "@codemirror/state";
import { linter, type Diagnostic } from "@codemirror/lint";
import { isProsePos } from "./prose";
import { CITE_RE, CROSSREF_PREFIX } from "./citePatterns";
import { wordCompleteSource } from "./wordComplete";
import {
  checkCitationKeys,
  documentLabels,
  getCitation,
  searchBibliography,
  type BibEntry,
  type CiteMatch,
  type DocLabel,
} from "../api";
import { fuzzyRank } from "../fuzzy";

// Extra fields we hang off the Completion for our custom renderer.
type CiteCompletion = Completion & { cite?: string; positions?: number[] };

function describe(e: BibEntry): string {
  const meta = [e.author, e.year, e.container].filter(Boolean).join(" · ");
  return [e.title, meta].filter(Boolean).join("\n");
}

// Don't complete inside code / fenced blocks / front matter (spec §20). The region test
// (`isProsePos`) is shared with the spellchecker — see ./prose.
function inProse(context: CompletionContext): boolean {
  return isProsePos(context.state, context.pos);
}

/** Does this `@…` query mean "a label in this document" rather than "a bibliography key"?
 *  (Issue E.01.) Two triggers, both unambiguous:
 *
 *  - **`@-`** — a bare hyphen. Free by construction: `CITE_RE` requires a citation key to
 *    START alphanumeric, so `@-` is not, and can never be, a citation. It opens the whole
 *    label list, and because the matcher is order-free (B.02) `@-flood tbl` finds
 *    `tbl-flood` without knowing which family it was in.
 *  - **`@fig-`, `@tbl-`, `@thm-`, …** — a family name WITH its hyphen. The hyphen is what
 *    makes it safe: a bare `@tbl` could still be the start of a citation key, and hijacking
 *    it would make that key unreachable.
 *
 *  `@Author2024` is untouched and still goes to the bibliography. */
export function labelQuery(typed: string): string | null {
  if (typed.startsWith("-")) return typed.slice(1);
  return CROSSREF_PREFIX.test(typed) ? typed : null;
}

/** Completions drawn from the document's own Quarto labels.
 *
 *  Re-scanned on every keystroke while the popup is open, deliberately: MEASURED at 0.69 ms
 *  for a 204 KB / 118-label document in a release build (`labels.rs`, the `#[ignore]`d
 *  `scan_speed_on_the_large_doc` bench), plus shipping the text over IPC. A cache was here
 *  briefly and bought nothing worth a staleness window — labels are always current instead.
 *  If this ever DOES bite, the fix is not a cache either: `check_document` already scans
 *  labels every ~½ s for the duplicate check and can simply return them. */
async function labelCompletions(
  context: CompletionContext,
  from: number,
  query: string,
): Promise<CompletionResult | null> {
  let labels: DocLabel[];
  try {
    labels = await documentLabels(context.state.doc.toString());
  } catch {
    return null;
  }
  if (labels.length === 0) return null;
  // Empty query keeps document order — the reference you want is usually the one you just
  // wrote. A typed query switches to fuzzy rank, order-free, over the whole label.
  const ranked = query
    ? fuzzyRank(query, labels, (l) => l.name, 60)
    : labels.map((item) => ({ item, positions: [] as number[], score: 0 }));
  if (ranked.length === 0) return null;
  return {
    from,
    filter: false, // ranked here; CodeMirror must not re-filter against the `@-` text
    options: ranked.map(({ item, positions }): CiteCompletion => ({
      label: item.name,
      cite: item.name,
      positions,
      detail: `line ${item.line}`,
      apply: "@" + item.name,
    })),
  };
}

async function citationSource(context: CompletionContext): Promise<CompletionResult | null> {
  // Allow `'` in the query so `@'mild'pric` (exact terms) reaches the matcher, and `-` so
  // the crossref triggers below are seen.
  const match = context.matchBefore(/@[\p{L}\d_:.\-']*/u);
  if (!match || (match.from === match.to && !context.explicit)) return null;
  if (!inProse(context)) return null;

  const typed = match.text.slice(1);
  const asLabel = labelQuery(typed);
  if (asLabel !== null) return labelCompletions(context, match.from, asLabel);

  let results: CiteMatch[];
  try {
    results = await searchBibliography(typed);
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
  // Fresh CITE_RE instance (avoid the shared lastIndex, as in prose.ts). Unlike the old
  // local pattern, CITE_RE requires the key to end alphanumeric, so a trailing `.`/`:`
  // (sentence punctuation) stays out of the key and the lookup succeeds.
  const re = new RegExp(CITE_RE.source, CITE_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    const s = m.index;
    const e = s + m[0].length;
    if (rel < s || rel > e) continue;
    if (CROSSREF_PREFIX.test(m[1])) return null; // Quarto crossref — nothing to look up
    let entry: BibEntry | null;
    try {
      entry = await getCitation(m[1]);
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

/** Insert `@` and open the picker. A registry action (`insertCitation`), unbound by
 *  default since Ctrl+Shift+C became Copy File Path (issue G.16). */
export function openCitationPicker(view: EditorView): boolean {
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

// CITE_RE and CROSSREF_PREFIX moved to citePatterns.ts (a leaf module) to break the
// citations ↔ prose import cycle that blanked the app at 2.17.0 — see the note there.
// Re-exported so this file remains their public home for callers.
export { CITE_RE, CROSSREF_PREFIX } from "./citePatterns";

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
    // Word-completion (issue 5) shares this popup in markdown docs: it self-gates to an
    // explicit Tab and declines the @-citation context, so the two sources never fight.
    override: [citationSource, wordCompleteSource],
    icons: false,
    addToOptions: [{ render: renderLabel, position: 20 }],
  }),
  citeHover,
  citationLint,
  Prec.high(keymap.of([{ key: "Tab", run: retriggerTab }])),
];
