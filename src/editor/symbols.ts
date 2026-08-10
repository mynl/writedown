// The Unicode character picker's data and search (issue D.12).
//
// Why this exists: Win+. cannot work here. The Windows character panel is a separate OS
// window — opening it BLURS the CodeMirror contenteditable, and it then injects the
// character as a synthetic composition into an editor whose DOM observer is not actively
// reading, so CodeMirror reconciles it straight back out. (Paste survives because Ctrl+V
// never moves focus.) A picker of our own sidesteps all of it: insertion becomes an
// ordinary CodeMirror transaction.
//
// The idea that makes it better than the pickers that already exist: every character has
// three or four names, and the Unicode one is usually the WORST for a mathematician — you
// think `\odot`, Unicode says CIRCLED DOT OPERATOR. Existing tools index one naming
// system. Each entry here carries the Unicode name, the LaTeX command(s), emoji/CLDR
// keywords and hand-written aliases, and one query searches the union. So `tick` finds ✓
// even though no Unicode name contains the word.
//
// SPEED: the 86 KB table is imported DYNAMICALLY and parsed once, on first open. Nothing
// here is loaded, parsed or paid for until Ctrl+Shift+U is pressed.
import { fuzzyMatch, type Ranked } from "../fuzzy";

export type SymbolEntry = {
  /** The character itself — what gets inserted. */
  char: string;
  /** Unicode name, lowercase ("circled dot operator"). */
  name: string;
  /** LaTeX commands without the backslash ("odot"); several are possible ("le", "leq"). */
  latex: string[];
  /** Aliases and emoji keywords, space separated ("circle dot centered"). */
  alias: string;
  /** Browsing group, or "" — see SYMBOL_KITS. */
  kit: string;
  /** Code point, used to break ranking ties toward the classic (lower) blocks. */
  cp: number;
  /** Emoji_Presentation=Yes — this character is COLOR by default and must be drawn with
   *  the emoji font. ✅ is; ✓ is not, and never will be in any font. */
  emoji: boolean;
  /** Everything searchable, concatenated once at parse time. */
  haystack: string;
};

let cache: Promise<{ entries: SymbolEntry[]; kits: [string, SymbolEntry[]][] }> | null = null;

/** Parse the generated table. Memoized: the second call is free. */
export function loadSymbols() {
  if (!cache) {
    cache = import("./symbolData").then(({ SYMBOL_ROWS, SYMBOL_KITS }) => {
      const entries: SymbolEntry[] = [];
      const byChar = new Map<string, SymbolEntry>();
      for (const row of SYMBOL_ROWS.split("\n")) {
        if (!row) continue;
        const [char, name, latex, alias, kit, emoji] = row.split("\t");
        const e: SymbolEntry = {
          char,
          name,
          latex: latex ? latex.split(" ") : [],
          alias,
          kit,
          cp: char.codePointAt(0) ?? 0,
          emoji: emoji === "1",
          // Backslash-prefixed LaTeX so a `\odot` query matches literally, and the raw
          // command too so `odot` does as well.
          haystack: [name, alias, latex, latex ? "\\" + latex.split(" ").join(" \\") : ""]
            .filter(Boolean)
            .join(" "),
        };
        entries.push(e);
        byChar.set(char, e);
      }
      const kits: [string, SymbolEntry[]][] = SYMBOL_KITS.map(([title, chars]) => [
        title,
        [...chars].map((c) => byChar.get(c)).filter((e): e is SymbolEntry => !!e),
      ]);
      return { entries, kits };
    });
  }
  return cache;
}

/** A `[symbols]` config entry becomes an extra searchable name for a character, or — when
 *  the value is `""` — removes a built-in whose Unicode name matches the key exactly.
 *  Same override rules as `[snippets]` and `[keys]`. */
export function applyUserSymbols(
  entries: SymbolEntry[],
  user: Record<string, string> | null | undefined,
): SymbolEntry[] {
  if (!user || Object.keys(user).length === 0) return entries;
  const removed = new Set<string>();
  const added: SymbolEntry[] = [];
  for (const [name, char] of Object.entries(user)) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    if (char === "") {
      removed.add(key);
      continue;
    }
    const cp = char.codePointAt(0) ?? 0;
    added.push({
      char,
      name: key,
      latex: [],
      alias: "custom",
      kit: "Yours",
      cp,
      emoji: cp >= 0x1f000,
      haystack: `${key} custom`,
    });
  }
  const kept = removed.size ? entries.filter((e) => !removed.has(e.name)) : entries;
  // User entries first: an alias you wrote yourself should beat the standard name.
  return added.length ? [...added, ...kept] : kept;
}

/** `u+2299`, `U+2299`, `0x2299` or a bare `2299`-style hex inside the picker → the
 *  character. Returns null when the query is not a code point, or names nothing that can
 *  be drawn (unassigned, a surrogate half, a control) — in which case the caller must
 *  insert NOTHING rather than a box. */
export function codePointChar(query: string): string | null {
  const m = /^\s*(?:u\+|U\+|0x|0X)([0-9a-fA-F]{2,6})\s*$/.exec(query);
  if (!m) return null;
  return charFromHex(m[1]);
}

/** Shared by the picker query and the editor's `u+XXXX` Tab rule, so both accept and
 *  reject exactly the same code points. */
export function charFromHex(hex: string): string | null {
  const cp = parseInt(hex, 16);
  if (!Number.isFinite(cp) || cp < 0x20 || cp > 0x10ffff) return null;
  if (cp >= 0xd800 && cp <= 0xdfff) return null; // lone surrogate — not a character
  if (cp >= 0xfdd0 && cp <= 0xfdef) return null; // noncharacters
  if ((cp & 0xfffe) === 0xfffe) return null;
  if (cp >= 0x7f && cp <= 0x9f) return null; // C1 controls
  if (cp >= 0xe000 && cp <= 0xf8ff) return null; // private use: font-dependent nonsense
  try {
    return String.fromCodePoint(cp);
  } catch {
    return null;
  }
}

/** Ranked search across all four naming systems.
 *
 *  Ranking, strongest first: exact LaTeX command → exact name → each query word that hits
 *  a WHOLE word in any name/alias/command → name prefix → fuzzy score. Ties go to the
 *  lower code point, which favours the classic blocks (Mathematical Operators, Arrows,
 *  Greek) over the obscure ones — that alone is what puts → above ⇴ for "right arrow".
 *
 *  Whole-word hits dominate fuzzy score on purpose. Scoring a fuzzy match against one
 *  concatenated haystack quietly punishes the entries we most want: fzf's length penalty
 *  grows with the field, and the best-documented character (Unicode name + LaTeX + four
 *  aliases) has the longest one. "right arrow" ranked ⇴ RIGHT ARROW WITH SMALL CIRCLE
 *  above → purely because → carries more metadata. */
export function searchSymbols(
  query: string,
  entries: readonly SymbolEntry[],
  limit = 60,
): Ranked<SymbolEntry>[] {
  const raw = query.trim();
  if (!raw) return [];
  const q = raw.toLowerCase();

  // A code point query answers itself — no table lookup needed, so it works for the
  // ~150,000 characters the table deliberately does not carry.
  const direct = codePointChar(raw);
  if (direct) {
    const known = entries.find((e) => e.char === direct);
    return [
      {
        item:
          known ??
          {
            char: direct,
            name: `u+${(direct.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`,
            latex: [],
            alias: "",
            kit: "",
            cp: direct.codePointAt(0) ?? 0,
            // A code point typed by hand is off-table, so the flag is unknown; assume
            // emoji above the BMP, which is where essentially all of them live.
            emoji: (direct.codePointAt(0) ?? 0) >= 0x1f000,
            haystack: "",
          },
        positions: [],
        score: 1e9,
      },
    ];
  }

  // LaTeX is CASE-SENSITIVE and the difference matters: `\Rightarrow` (⇒) and
  // `\rightarrow` (→) are different characters. Match the raw query first, and only then
  // fall back to a case-insensitive comparison.
  const bareRaw = raw.startsWith("\\") ? raw.slice(1) : null;
  const bare = bareRaw?.toLowerCase() ?? null;
  const words = q.split(/\s+/).filter(Boolean);

  const out: Ranked<SymbolEntry>[] = [];
  for (const e of entries) {
    let boost = 0;
    if (bareRaw !== null) {
      if (!e.latex.length) continue; // a `\…` query is a request for a LaTeX name
      if (e.latex.includes(bareRaw)) boost = 8000; // exact, right case
      else if (e.latex.some((l) => l.toLowerCase() === bare)) boost = 6000;
      else if (e.latex.some((l) => l.toLowerCase().startsWith(bare!))) boost = 2500;
    } else {
      if (e.name === q) boost += 4000;
      for (const w of words) if (wholeWord(e, w)) boost += 900;
      // Deliberately NO "name starts with the query" bonus. It reads sensible and behaves
      // badly: for "arrow" it lifted ARROW POINTING RIGHTWARDS THEN CURVING UPWARDS above
      // →, and for "circle" it lifted CIRCLE WITH VERTICAL FILL above ●. A whole-word hit
      // already covers everything a prefix would, without the bias toward long names that
      // happen to begin with the word.
    }
    const m = fuzzyMatch(bare ?? q, bare !== null ? e.latex.join(" ") : e.haystack);
    if (!m && !boost) continue;
    // When there is a real signal (an exact command, an exact name, a whole word), the
    // fuzzy score is DISCARDED rather than added. Its spread — roughly ±100 depending on
    // how much metadata an entry carries — is the same order as the gap between tiers, so
    // adding it turns a decisive ranking into noise and ⇴ RIGHT ARROW WITH SMALL CIRCLE
    // outranks →. Within a tier the tie-breaks are: shorter (i.e. more canonical) name,
    // then lower code point, which is what puts → and ✓ first. Fuzzy score only decides
    // among entries that matched nothing but a subsequence.
    out.push({ item: e, positions: [], score: boost ? boost - canonPenalty(e) : (m?.score ?? 0) });
  }
  out.sort((a, b) => b.score - a.score || a.item.cp - b.item.cp);
  return out.slice(0, limit);
}

/** How far from canonical an entry's Unicode name is, used to order WITHIN a boost tier.
 *
 *  Word count dominates, because Unicode names qualify: RIGHTWARDS ARROW is the arrow,
 *  ARROW POINTING RIGHTWARDS THEN CURVING UPWARDS is a special case of one. Bounded well
 *  under 900 so it can never promote an entry across a tier — it only breaks ties. */
function canonPenalty(e: SymbolEntry): number {
  const words = e.name.split(" ").length;
  return Math.min(600, words * 60 + e.name.length * 0.5);
}

/** True when `word` appears as a whole word in the entry's name, aliases, or LaTeX
 *  commands. This is what makes "check" put ✓ above the twelve other things whose names
 *  merely contain c-h-e-c-k as a subsequence — and, because the LaTeX names are included,
 *  what makes a bare `odot` (no backslash) find ⊙. */
function wholeWord(e: SymbolEntry, word: string): boolean {
  for (const field of [e.name, e.alias, e.latex.join(" ").toLowerCase()]) {
    let i = field.indexOf(word);
    while (i !== -1) {
      const before = i === 0 || field[i - 1] === " " || field[i - 1] === "-";
      const after =
        i + word.length === field.length ||
        field[i + word.length] === " " ||
        field[i + word.length] === "-";
      if (before && after) return true;
      i = field.indexOf(word, i + 1);
    }
  }
  return false;
}

// ---- recents (issue D.12: "keep list of recent") --------------------------------------
// Weighted by USE COUNT, not bare recency — the characters you reach for constantly should
// stay at the top even after one excursion into box-drawing. localStorage, because this is
// derived data: it belongs nowhere near config.toml, and losing it costs nothing.
const MRU_KEY = "wd.symbolMru";
const MRU_MAX = 40;

export function symbolMru(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(MRU_KEY) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function recordSymbolUse(char: string): void {
  const m = symbolMru();
  m[char] = (m[char] ?? 0) + 1;
  const trimmed = Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MRU_MAX);
  localStorage.setItem(MRU_KEY, JSON.stringify(Object.fromEntries(trimmed)));
}

/** Most-used first, for the empty query. */
export function recentSymbols(entries: readonly SymbolEntry[]): SymbolEntry[] {
  const m = symbolMru();
  const by = new Map(entries.map((e) => [e.char, e]));
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => by.get(c))
    .filter((e): e is SymbolEntry => !!e);
}

/** `U+2299` for display. */
export const codePointLabel = (e: SymbolEntry) =>
  "U+" + e.cp.toString(16).toUpperCase().padStart(4, "0");

/** Emoji-presentation characters render in COLOR from the emoji font; text-presentation
 *  ones take the current text color. The flag comes from the generated table (a real
 *  Unicode property) rather than a hand-rolled range list — it drives the picker's font
 *  choice, so getting it wrong shows ✅ as a hollow monochrome outline. */
export const isEmojiPresentation = (e: SymbolEntry): boolean => e.emoji;
