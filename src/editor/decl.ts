// The aggregate "decl" (Dec Language) colorizer — a CodeMirror StreamLanguage port of the
// author's pygments lexer. SOURCE OF TRUTH: decl_pygments.py in the aggregate package
// (T:\worktrees\aggregate_REFACTOR\src\aggregate\decl_pygments.py, synced to decl.lark by
// that repo's test_grammar_sync). This port is a snapshot — when the grammar grows a
// keyword, it must be added here by hand. Colors come from the shared Sublime scheme.
import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Word lists lifted verbatim from decl_pygments.py (grouping preserved so the scheme can
// distinguish them: frequency dists, severity dists by parameter count, declarations).
const FREQ = new Set([
  "binomial", "pascal", "poisson", "bernoulli", "geometric", "fixed", "neyman", "neymana",
  "neymanA", "logarithmic", "dfreq", "negbin",
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
]);
const SEV_TWO = new Set([
  "beta", "betaprime", "burr", "burr12", "crystalball", "exponweib", "f", "gengamma",
  "geninvgauss", "johnsonsb", "johnsonsu", "kappa4", "levy_stable", "loguniform", "mielke",
  "nct", "ncx2", "norminvgauss", "powerlognorm", "reciprocal", "studentized_range",
  "trapezoid", "trapz", "truncnorm",
]);
const HISTOGRAM = new Set(["dhistogram", "chistogram", "dsev", "dbvsev"]);
const KEYWORDS = new Set([
  "occurrence", "aggregate", "distortion", "exposure", "tweedie", "premium", "tower",
  "picks", "prem", "pnl", "xpnl", "inherit", "bivariate", "bv", "clash", "copula",
  "netceded", "grossceded", "grossnet", "approximate", "approx", "ssev", "claims", "ceded",
  "claim", "loss", "payoff", "dist", "expense", "expenses", "cede", "deposit", "rol",
  "less", "port", "rate", "net", "sev", "agg", "xps", "wts", "inf", "and", "as", "exp",
  "at", "cv", "lr", "xs", "of", "to", "po", "so", "zm", "zt",
  // reinstatements (Phase 2)
  "reinstatements", "reinstatement", "free", "no",
  // variable rating (Phase 3)
  "swing", "slide", "retro", "corridor", "basic", "lcm", "min", "max", "pc", "after",
]);
const MIXED = new Set(["gamma", "delaporte", "ig", "sig", "beta", "sichel"]);
const OP_WORDS = new Set(["in", "is", "not", "or"]); // 'and' is Generic.Heading in root

const ID_RE = /^[a-zA-Z][._:~a-zA-Z0-9-]*/;
const NUM_RE = /^-?(\d(?:_?\d)*\.(?:\d(?:_?\d)*)?|(?:\d(?:_?\d)*)?\.\d(?:_?\d)*|\d(?:_?\d)*)([eE][+-]?\d(?:_?\d)*)?%?/;
const OP_RE = /^(!=|==|<<|>>|:=|[-~+/*%=<>&^|.])/;
const PUNCT_RE = /^[\]{}():,;[]/;

type DeclState = { mode: "root" | "note" | "hints" | "mixed" };

function classifyWord(w: string): string {
  if (/^(sev|agg)\./.test(w) && w.length > 4) return "builtin"; // sev.lognorm, agg.MyAgg
  if (w === "and" || w === "splice") return "heading"; // structural connectors
  if (w === "wts") return "typeName";
  if (OP_WORDS.has(w)) return "operatorKeyword";
  if (KEYWORDS.has(w)) return "keyword";
  if (FREQ.has(w) || SEV_ZERO.has(w)) return "function";
  if (SEV_ONE.has(w)) return "className";
  if (SEV_TWO.has(w)) return "namespace";
  if (HISTOGRAM.has(w)) return "labelName";
  return "variableName";
}

const declParser: StreamParser<DeclState> = {
  name: "decl",
  startState: () => ({ mode: "root" }),
  token(stream, state) {
    // note{…} / hints{…} bodies read as comments; the closing } colors in root.
    if (state.mode === "note" || state.mode === "hints") {
      if (stream.match(/^[^}]+/)) {
        state.mode = "root";
        return "comment";
      }
      state.mode = "root"; // empty body — fall through to root for the '}'
    }
    if (state.mode === "mixed") {
      state.mode = "root";
      const m = stream.match(ID_RE) as RegExpMatchArray | null;
      if (m) return MIXED.has(m[0]) || m[0].startsWith("sichel") ? "function" : classifyWord(m[0]);
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^#.*/)) return "comment";
    if (stream.match(/^note\{/)) {
      state.mode = "note";
      return "typeName";
    }
    if (stream.match(/^hints\{/)) {
      state.mode = "hints";
      return "typeName";
    }
    if (stream.eat("}")) return "typeName";
    if (stream.eat("!")) return "heading";
    if (stream.match(/^mixed(?=\s)/)) {
      state.mode = "mixed";
      return "operator";
    }
    if (stream.match(/^-?inf\b/)) return "number";
    if (stream.match(NUM_RE)) return "number";
    if (stream.match(/^<[A-Z_0-9*]+>/)) return "heading"; // help placeholders like <DISTRIBUTION>
    const m = stream.match(ID_RE) as RegExpMatchArray | null;
    if (m) return classifyWord(m[0]);
    if (stream.match(OP_RE)) return "operator";
    if (stream.match(PUNCT_RE)) return "punctuation";
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
  },
};

export const declLanguage = StreamLanguage.define(declParser);

/** For fence resolution: makes ```decl / ```agg / ```{decl} blocks highlight in the
 *  editor and the preview (both resolve through codeLanguages in languages.ts). */
export const declDescription = LanguageDescription.of({
  name: "decl",
  alias: ["agg", "aggregate", "dec"],
  extensions: ["agg", "dec", "decl"],
  support: new LanguageSupport(declLanguage),
});
