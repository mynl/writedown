// fzf-style subsequence matcher with matched positions (spec §21). Feels like fzf:
// contiguous runs, word/camel boundaries, and earlier matches rank higher. The
// authoritative citation matcher (Phase 6, ~7,000 entries) will use the Rust
// `fuzzy-matcher` SkimMatcherV2; this handles the smaller quick-open / palette lists.

export type FuzzyResult = { score: number; positions: number[] };

const BOUNDARY = /[/\\ _\-.]/;

export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
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
