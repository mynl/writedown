// The aggregate "decl" (Dec Language) colorizer — a CodeMirror StreamLanguage port of the
// author's pygments lexer.
//
// SOURCE OF TRUTH: decl_pygments.py in the aggregate package
// (T:\worktrees\aggregate_REFACTOR\src\aggregate\decl_pygments.py), which is itself a
// hand-written mirror of decl.lark, kept honest by that repo's test_grammar_sync.
// This port is a SNAPSHOT, re-synced 2026-08-02 (issue A.20) against a substantially
// rewritten upstream. Manual sync is the accepted policy — the grammar moves rarely.
//
// Deliberate divergences from upstream, so a future sync doesn't "fix" them by mistake:
//   • `in` / `is` / `not` / `or` are coloured as operator keywords here. Upstream has no
//     rule for them, so they fall through to plain names; ours reads better.
//   • The `doc{{{…}}}` body is one comment token rather than a nested Markdown parse —
//     upstream delegates to Pygments' MarkdownLexer, which has no cheap CM equivalent.
//   • Word boundaries come from ID_RE matching greedily rather than upstream's explicit
//     `_KW` negative lookahead. Equivalent (`.`, `_`, `:`, `~`, `-` are all name chars,
//     so `loss-ratio` stays one token) and cheaper — no lookahead per keyword.
import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  foldService,
  type StreamParser,
} from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight";

// Word lists lifted from decl_pygments.py, grouping preserved so the colour scheme can
// tell the families apart (frequency dists, severity dists by shape-parameter count,
// declaration keywords).
const FREQ = new Set([
  "binomial", "pascal", "poisson", "bernoulli", "geometric", "fixed", "neyman", "neymana",
  "neymanA", "logarithmic", "negbin",
]);
const SEV_ZERO = new Set([
  "anglit", "arcsine", "cauchy", "cosine", "expon", "gilbrat", "gumbel_l", "gumbel_r",
  "halfcauchy", "halflogistic", "halfnorm", "hypsecant", "kstwobign", "laplace", "levy",
  "levy_l", "logistic", "maxwell", "moyal", "norm", "rayleigh", "semicircular", "uniform",
  "wald",
]);
const SEV_ONE = new Set([
  "alpha", "argus", "bradford", "chi", "chi2", "dgamma", "dweibull", "erlang", "exponnorm",
  "exponpow", "fatiguelife", "fisk", "foldcauchy", "foldnorm", "gamma", "genextreme",
  "genhalflogistic", "genlogistic", "gennorm", "genpareto", "gompertz", "halfgennorm",
  "invgamma", "invgauss", "invweibull", "kappa3", "ksone", "kstwo", "laplace_asymmetric",
  "loggamma", "loglaplace", "lognorm", "lomax", "nakagami", "pareto", "pearson3", "powerlaw",
  "powernorm", "rdist", "recipinvgauss", "rice", "skewcauchy", "skewnorm", "t", "triang",
  "truncexpon", "tukeylambda", "vonmises", "vonmises_line", "weibull_max", "weibull_min",
  "wrapcauchy",
  // Empirical severities: upstream classifies these with the one-parameter family (they
  // arrive through the grammar's `ids` rule, e.g. `sev dhistogram xps [0 99] [.8 .2]`).
  "dhistogram", "chistogram",
]);
const SEV_TWO = new Set([
  "beta", "betaprime", "burr", "burr12", "crystalball", "exponweib", "f", "gengamma",
  "geninvgauss", "johnsonsb", "johnsonsu", "kappa4", "levy_stable", "loguniform", "mielke",
  "nct", "ncx2", "norminvgauss", "powerlognorm", "reciprocal", "studentized_range",
  "trapezoid", "trapz", "truncnorm",
]);
// Discrete DECLARATION keywords — an outcome/probability pair, not named distributions.
// `dfreq` belongs here with its siblings, not with the FREQ distribution names.
const DISCRETE_DECL = new Set(["dfreq", "dsev", "dbvsev", "dwait"]);
const KEYWORDS = new Set([
  "occurrence", "aggregate", "distortion", "exposure", "tweedie", "premium", "tower",
  "picks", "prem", "pnl", "xpnl", "peel", "inherit", "bivariate", "bv", "clash", "copula",
  "netceded", "grossceded", "grossnet", "approximate", "approx", "ssev", "splice",
  "claims", "ceded", "claim", "loss", "payoff", "dist", "expense", "expenses", "cede",
  "deposit", "rol", "less", "port", "rate", "net", "sev", "agg", "xps", "wts",
  "and", "as", "exp", "at", "cv", "lr", "xs", "of", "to", "po", "so", "zm", "zt",
  // reinstatements (Phase 2)
  "reinstatements", "reinstatement", "free", "no",
  // variable rating (Phase 3)
  "swing", "slide", "retro", "corridor", "basic", "lcm", "min", "max", "pc", "after",
  // renewal frequency
  "wait", "years", "year",
]);
const MIXED = new Set(["gamma", "delaporte", "ig", "sig", "beta", "sichel"]);
const OP_WORDS = new Set(["in", "is", "not", "or"]); // divergence — see the header

const ID_RE = /^[a-zA-Z][._:~a-zA-Z0-9-]*/;
const NUM_RE = /^-?(\d(?:_?\d)*\.(?:\d(?:_?\d)*)?|(?:\d(?:_?\d)*)?\.\d(?:_?\d)*|\d(?:_?\d)*)([eE][+-]?\d(?:_?\d)*)?%?/;
// `**` and `^` (power) and `@` before the single-character operators, so they win.
const OP_RE = /^(\*\*|!=|==|<<|>>|:=|\^|[-~+/*%=<>&|.@])/;
const PUNCT_RE = /^[\]{}():;[]/;
// Comma and pipe are %ignore in the grammar — whitespace to the parser, so not punctuation.
const IGNORED_RE = /^[,|]/;
// `agg.X`, `sev.X`, `port.X`, `dist.X`, `distortion.X` are builtin references.
const BUILTIN_PREFIX = /^(?:agg|sev|port|distortion|dist)\./;

type Mode = "root" | "note" | "tags" | "hints" | "mixed" | "doc";
type DeclState = { mode: Mode };

function classifyWord(w: string): string {
  if (BUILTIN_PREFIX.test(w) && w.length > 4) return "builtin"; // sev.lognorm, port.MyPort
  if (OP_WORDS.has(w)) return "operatorKeyword";
  if (DISCRETE_DECL.has(w)) return "labelName";
  if (KEYWORDS.has(w)) return "keyword";
  if (FREQ.has(w) || SEV_ZERO.has(w)) return "function";
  if (SEV_ONE.has(w)) return "className";
  if (SEV_TWO.has(w)) return "namespace";
  return "variableName";
}

const declParser: StreamParser<DeclState> = {
  name: "decl",
  startState: () => ({ mode: "root" }),
  token(stream, state) {
    // doc{{{ … }}} — a long prose body; read as a comment until the closing fence.
    if (state.mode === "doc") {
      if (stream.match(/^.*?\}\}\}/)) {
        state.mode = "root";
        return "comment";
      }
      stream.skipToEnd();
      return "comment";
    }
    // note{…} prose reads as a comment; the closing } colours in root.
    if (state.mode === "note") {
      if (stream.match(/^[^}]+/)) {
        state.mode = "root";
        return "comment";
      }
      state.mode = "root"; // empty body — fall through to root for the '}'
    }
    // tags{a, b c} — each non-separator run is one slug.
    if (state.mode === "tags") {
      if (stream.eat("}")) {
        state.mode = "root";
        return "typeName";
      }
      if (stream.match(/^[\s,]+/)) return null;
      if (stream.match(/^[^\s,}]+/)) return "tagName";
      state.mode = "root";
    }
    // hints{bs=1/64; log2=10} — key=value build settings, not prose.
    if (state.mode === "hints") {
      if (stream.eat("}")) {
        state.mode = "root";
        return "typeName";
      }
      if (stream.eatSpace()) return null;
      if (stream.match(/^(?:True|False|None)(?![a-zA-Z0-9._:~-])/)) return "atom";
      if (stream.match(NUM_RE)) return "number";
      if (stream.match(/^[=;]/)) return "punctuation";
      if (stream.match(/^[-+*/()]/)) return "operator";
      const h = stream.match(ID_RE) as RegExpMatchArray | null;
      if (h) return stream.peek() === "=" || /^\s*=/.test(stream.string.slice(stream.pos))
        ? "attributeName"
        : "variableName";
      state.mode = "root";
    }
    if (state.mode === "mixed") {
      state.mode = "root";
      if (stream.eatSpace()) {
        state.mode = "mixed"; // `mixed` and its distribution may sit on separate lines
        return null;
      }
      const m = stream.match(ID_RE) as RegExpMatchArray | null;
      if (m) return MIXED.has(m[0]) || m[0].startsWith("sichel") ? "function" : classifyWord(m[0]);
    }
    if (stream.eatSpace()) return null;
    // Both comment markers. `//` before the operators, which own `/`.
    if (stream.match(/^\/\/.*/)) return "comment";
    if (stream.match(/^#.*/)) return "comment";
    // doc fences before the comment rule would matter if a body opened with `#`, but the
    // opener itself is matched here, after comments, because `doc{{{` cannot start with #.
    if (stream.match(/^doc\{\{\{/)) {
      state.mode = "doc";
      return "typeName";
    }
    if (stream.match(/^note\{/)) {
      state.mode = "note";
      return "typeName";
    }
    if (stream.match(/^tags\{/)) {
      state.mode = "tags";
      return "typeName";
    }
    if (stream.match(/^hints\{/)) {
      state.mode = "hints";
      return "typeName";
    }
    if (stream.eat("}")) return "typeName";
    // A quoted display label (grammar STRING: no escapes, no embedded newline).
    if (stream.match(/^"[^"\n]*"/)) return "string";
    if (stream.eat("!")) return "heading"; // unconditional sev / zero-modified pin
    if (stream.match(/^mixed(?![a-zA-Z0-9._:~-])/)) {
      state.mode = "mixed";
      return "operator";
    }
    if (stream.match(/^-?inf(?![a-zA-Z0-9._:~-])/)) return "number";
    if (stream.match(NUM_RE)) return "number";
    if (stream.match(/^<[A-Z_0-9*]+>/)) return "heading"; // help placeholders <DISTRIBUTION>
    const m = stream.match(ID_RE) as RegExpMatchArray | null;
    if (m) return classifyWord(m[0]);
    if (stream.match(OP_RE)) return "operator";
    if (stream.match(PUNCT_RE)) return "punctuation";
    if (stream.match(IGNORED_RE)) return null;
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "#" },
  },
  tokenTable: {
    builtin: tags.standard(tags.variableName),
    heading: tags.heading,
    operatorKeyword: tags.operatorKeyword,
    function: tags.function(tags.variableName),
    tagName: tags.tagName,
  },
};

export const declLanguage = StreamLanguage.define(declParser);

/** Lines that open a top-level DecL statement. Single source of truth for both the outline
 *  (outline/parse.ts) and the fold ranges below, so the two can never disagree. */
export const AGG_DECL_RE =
  /^(agg|port|sev|distortion|dist|pnl|xpnl|bv|bivariate|tower|dfreq|dsev|dbvsev)\s+(\S+)/;

/** Fold a declaration down to the line before the next one (issue A.21). StreamLanguage
 *  provides no fold ranges at all, so without this Ctrl+Shift+[ and Fold All do nothing in
 *  a `.agg` file. Blank lines at the end of a block are left out of the range. */
const declFold = foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
  const doc = state.doc;
  const start = doc.lineAt(lineStart);
  if (!AGG_DECL_RE.test(start.text)) return null;
  let last = start.number;
  for (let n = start.number + 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    if (AGG_DECL_RE.test(text)) break;
    if (text.trim() !== "") last = n;
  }
  if (last <= start.number) return null;
  return { from: lineEnd, to: doc.line(last).to };
});

export const declSupport = new LanguageSupport(declLanguage, [declFold]);

/** For fence resolution: makes ```decl / ```agg / ```{decl} blocks highlight in the
 *  editor and the preview (both resolve through codeLanguages in languages.ts). */
export const declDescription = LanguageDescription.of({
  name: "decl",
  alias: ["agg", "aggregate", "dec"],
  extensions: ["agg", "dec", "decl"],
  support: declSupport,
});
