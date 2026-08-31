// The citation regexes, in a LEAF module with no imports — on purpose. They used to live
// in citations.ts, which imports prose.ts, which imported them back: a real circular
// import (found by `madge --circular` while hunting the 2.17.0 blank-window crash, whose
// actual cause was a TDZ in languages.ts) that held only as long as the bundler happened
// to initialize prose first. Regexes both sides need belong below both sides.
// (citations.ts re-exports them, so callers that think of them as citation API still
// find them there.)

/** A `@key` in prose: `@` at a word boundary (not an email or `a/@b`), key starting and
 *  ending on an alphanumeric so a trailing `.`/`-`/`:` (sentence punctuation) is excluded. */
export const CITE_RE = /(?<![\p{L}\p{N}_@/])@([\p{L}\d](?:[\p{L}\d_:.\-]*[\p{L}\d])?)/gu;

/** Quarto cross-reference families (`@sec-…`, `@fig-…`, `@tbl-…`, `@eq-…`, theorem-likes,
 *  …) are document crossrefs, not bibliography citations — they must never be looked up in
 *  the bib or flagged as missing. Steve's citation keys are `Author2024a` / `Authors`
 *  (no hyphen); his Quarto tags carry the `prefix-` shape, so this is an exact split. */
export const CROSSREF_PREFIX =
  /^(fig|tbl|eq|sec|lst|thm|lem|cor|prp|cnj|def|exm|exr|sol|rem)-/;
