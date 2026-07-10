// Shared "what region is this position in?" helper plus a prose word tokenizer for the
// spellchecker. The Lezer markdown tree marks code / fenced blocks / inline code / comments /
// YAML front matter / raw HTML / link URLs — but NOT math, citations, or bare URLs/emails
// (those are recognized by regex elsewhere), so the tokenizer layers those skips on top of the
// tree walk. Everything here is read-only — it never touches the document text.
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { CITE_RE } from "./citations";
import { mathRegions } from "./math";

/** True only in prose — false inside code, fenced blocks, inline code, comments, YAML front
 *  matter, raw HTML, and link URLs. Walks the live syntax tree (spec §20). Used by both the
 *  `@`-citation gate and the spellchecker so the two agree on "where is prose?". */
export function isProsePos(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    const name = node.type.name.toLowerCase();
    if (
      name.includes("code") ||
      name.includes("fenced") ||
      name.includes("comment") ||
      name.includes("frontmatter") ||
      name.includes("yaml") ||
      name.includes("html") ||
      name === "url"
    ) {
      return false;
    }
    node = node.parent;
  }
  return true;
}

export type SpellToken = { word: string; from: number; to: number };

// Above this document length the tokenizer bails (returns nothing) — same guard as the math
// highlighter, so a huge paste never freezes the editor.
const MAX = 500_000;
// A word: a letter followed by letters, combining marks, or internal apostrophes. Hyphens are
// deliberately excluded, so "well-known" naturally splits into "well" and "known"; apostrophes
// are kept, so "don't" / "it's" stay whole.
const WORD_RE = /[\p{L}][\p{L}\p{M}']*/gu;
const URL_RE = /\bhttps?:\/\/\S+/g;
const EMAIL_RE = /\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;

/** Words we never spellcheck: contains a digit ("utf8", "h2o"); an ALLCAPS acronym ("PDF",
 *  "NASA"); or has an internal capital / camelCase ("CodeMirror", "iPhone", "LaTeX") — i.e. an
 *  identifier or brand. A plain leading-capital word ("The", "Mildenhall") is NOT skipped. */
function skipWord(word: string): boolean {
  if (/\d/.test(word)) return true;
  if (/^\p{Lu}+$/u.test(word)) return true;
  return /\p{Lu}/u.test(word.slice(1));
}

/** Walk the document yielding prose words with absolute offsets, skipping code, math,
 *  citations, URLs, emails, YAML, HTML, acronyms, camelCase, and words containing digits. */
export function spellTokens(state: EditorState): SpellToken[] {
  const doc = state.doc;
  if (doc.length > MAX) return [];
  const text = doc.toString();

  // Collect the regex-only skip regions (the tree already covers code/YAML/HTML). A fresh
  // RegExp from CITE_RE avoids sharing its stateful `lastIndex` with the citation linter.
  const raw: Array<[number, number]> = [...mathRegions(text)];
  const collect = (re: RegExp) => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) raw.push([m.index, m.index + m[0].length]);
  };
  collect(new RegExp(CITE_RE.source, CITE_RE.flags));
  collect(URL_RE);
  collect(EMAIL_RE);

  // Merge into non-overlapping, sorted intervals for O(log n) containment tests.
  raw.sort((a, b) => a[0] - b[0]);
  const skips: Array<[number, number]> = [];
  for (const iv of raw) {
    const last = skips[skips.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else skips.push([iv[0], iv[1]]);
  }
  const inSkip = (from: number, to: number): boolean => {
    let lo = 0;
    let hi = skips.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const [a, b] = skips[mid];
      if (b <= from) lo = mid + 1;
      else if (a >= to) hi = mid - 1;
      else return true;
    }
    return false;
  };

  const out: SpellToken[] = [];
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text))) {
    const from = m.index;
    // Trim a trailing possessive apostrophe: "dogs'" -> "dogs".
    const word = m[0].replace(/'+$/, "");
    const to = from + word.length;
    if (word.length < 2) continue;
    if (skipWord(word)) continue;
    if (inSkip(from, to)) continue;
    if (!isProsePos(state, from)) continue;
    out.push({ word, from, to });
  }
  return out;
}
