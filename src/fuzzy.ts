// fzf-style subsequence matcher with matched positions (spec §21). Feels like fzf:
// contiguous runs, word/camel boundaries, and earlier matches rank higher. The
// authoritative citation matcher (Phase 6, ~7,000 entries) will use the Rust
// `fuzzy-matcher` SkimMatcherV2; this handles the smaller quick-open / palette lists.

export type FuzzyResult = { score: number; positions: number[] };

const BOUNDARY = /[/\\ _\-.]/;

/** One whitespace-free term: an ORDERED subsequence match, scored fzf-style. */
function matchTerm(query: string, text: string): FuzzyResult | null {
  if (!query) return { score: 0, positions: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  let qi = 0;
  let score = 0;
  let prev = -2;
  const positions: number[] = [];

  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    let bonus = 1;
    if (i === 0) bonus += 10;
    else if (BOUNDARY.test(text[i - 1])) bonus += 8;
    else if (/[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i])) bonus += 7; // camelCase
    if (prev === i - 1) bonus += 6; // contiguous run
    score += bonus;
    positions.push(i);
    prev = i;
    qi++;
  }

  if (qi < q.length) return null; // not all query chars matched, in order
  score -= text.length * 0.03; // prefer shorter, tighter matches
  return { score, positions };
}

/** fzf's extended-search rule (issue B.02): a space splits the query into terms, each of
 *  which must match as an ordered subsequence — but the terms themselves are order-free,
 *  so "edit config" and "config edit" both find "Edit Config (config.toml)". A query with
 *  no space takes the single-term path and ranks EXACTLY as it always has.
 *
 *  Terms may overlap ("con config" can hit the same run twice): harmless, since positions
 *  are unioned for the highlight and a doubled score only moves ties. The length penalty
 *  lives inside matchTerm, so a k-term match pays it k times — a uniform tilt toward
 *  shorter titles, same direction for every candidate. */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { score: 0, positions: [] };
  if (terms.length === 1) return matchTerm(terms[0], text);
  let score = 0;
  const pos = new Set<number>();
  for (const term of terms) {
    const m = matchTerm(term, text);
    if (!m) return null; // AND: every term must appear somewhere
    score += m.score;
    for (const p of m.positions) pos.add(p);
  }
  return { score, positions: [...pos].sort((a, b) => a - b) };
}

export type Ranked<T> = { item: T; positions: number[]; score: number };

export function fuzzyRank<T>(
  query: string,
  items: readonly T[],
  key: (t: T) => string,
  limit = 50,
): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const item of items) {
    const m = fuzzyMatch(query, key(item));
    if (m) out.push({ item, positions: m.positions, score: m.score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
