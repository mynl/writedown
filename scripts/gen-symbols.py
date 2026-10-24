"""Generate src/editor/symbolData.ts — the Unicode picker's search table (issue D.12).

Run with any Python 3.9+:  python scripts/gen-symbols.py
On DOOB, which has no python on PATH:  uv run --no-project python scripts/gen-symbols.py
(its unicodedata is Unicode 16.0, matching the emoji ranges copied in below).

Why a generator rather than a hand-written table: the Unicode NAMES must be right, and
`unicodedata` is the authority for them (it ships with CPython, so there is no download and
no network — the committed output is what the app actually uses). Everything the standard
cannot tell us — LaTeX command names, human aliases, browsing groups — is curated below.

The point of the picker is that every character has three or four names and the Unicode one
is usually the WORST for a mathematician: you think `\\odot`, Unicode says CIRCLED DOT
OPERATOR. So each row carries all of them and one query searches the union.

Output format is one tab-separated row per character inside a single template literal:

    char <TAB> unicode name <TAB> latex names <TAB> aliases <TAB> kit <TAB> emoji?

kept as a string (not an object array) because it parses in about a millisecond and keeps
the file a third of the size. The picker imports it dynamically, so none of it loads until
Ctrl+Shift+U is pressed for the first time.
"""

import json
import sys
import unicodedata
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "editor" / "symbolData.ts"

# --- blocks taken wholesale -----------------------------------------------------------
# Ranges are inclusive. Anything without a Unicode name (unassigned) is skipped.
BLOCKS = [
    (0x00A1, 0x00FF, "latin"),      # ¡ ± × ÷ ° © ® µ ¶ and the accented letters
    (0x0370, 0x03FF, "greek"),
    (0x2000, 0x206F, "punct"),      # dashes, quotes, spaces, †, ‰, ′
    (0x2070, 0x209F, "supsub"),
    (0x20A0, 0x20BF, "currency"),
    (0x2100, 0x214F, "letterlike"), # ℝ ℂ ℏ ℓ ℵ №
    (0x2150, 0x218F, "numforms"),   # ½ ⅓ Ⅷ
    (0x2190, 0x21FF, "arrows"),
    (0x2200, 0x22FF, "operators"),  # ∀ ∂ ∑ ∫ ≤ ⊂ ⊙
    (0x2300, 0x237F, "technical"),  # ⌈ ⌊ ⌘ ⌥ (rest of the block is control pictures)
    (0x2500, 0x257F, "box"),
    (0x2580, 0x259F, "box"),
    (0x25A0, 0x25FF, "shapes"),     # ● ○ ◦ ◆ ▲ — the circle family
    (0x2600, 0x26FF, "misc"),       # ★ ☑ ☺ ⚠ ⚡
    (0x2700, 0x27BF, "dingbats"),   # ✓ ✔ ✅ ✗ ✘ ❌ ➜
    (0x27C0, 0x27EF, "operators"),
    (0x27F0, 0x27FF, "arrows"),
    (0x2900, 0x297F, "arrows"),
    (0x2980, 0x29FF, "operators"),
    (0x2A00, 0x2AFF, "operators"),
    # The colored characters (issue J.21, author ruling 2026-10-24: all seven blocks). The
    # D.12 scope left them out; most of what the author looks for is colored. 1,692 named
    # characters under Unicode 16.0, still loaded only when the picker first opens.
    (0x2B00, 0x2BFF, "misc arrows"),  # ⬛ ⬜ ⭐ ⭕
    (0x1F300, 0x1F5FF, "pictographs"), # 🔴 🔵 🔥 📌 📎
    (0x1F600, 0x1F64F, "emoticons"),
    (0x1F680, 0x1F6FF, "transport"),   # 🚀 🚧 🛑
    (0x1F780, 0x1F7FF, "shapes ext"),  # 🟥 🟧 🟨 🟩 🟦 🟪 🟫 🟠 🟡 🟢 🟣 🟤
    (0x1F900, 0x1F9FF, "pictographs"), # 🤔 🧮 🧪
    (0x1FA70, 0x1FAFF, "pictographs"), # 🪲 🫠
]

# --- LaTeX command names --------------------------------------------------------------
# Curated: the commands actually typed in mathematical prose. A character may have several
# (`\to` and `\rightarrow`); list them space-separated and both will match.
LATEX = {
    # Greek, lower
    0x03B1: "alpha", 0x03B2: "beta", 0x03B3: "gamma", 0x03B4: "delta",
    0x03B5: "varepsilon", 0x03F5: "epsilon", 0x03B6: "zeta", 0x03B7: "eta",
    0x03B8: "theta", 0x03D1: "vartheta", 0x03B9: "iota", 0x03BA: "kappa",
    0x03BB: "lambda", 0x03BC: "mu", 0x03BD: "nu", 0x03BE: "xi", 0x03C0: "pi",
    0x03D6: "varpi", 0x03C1: "rho", 0x03F1: "varrho", 0x03C3: "sigma",
    0x03C2: "varsigma", 0x03C4: "tau", 0x03C5: "upsilon", 0x03C6: "varphi",
    0x03D5: "phi", 0x03C7: "chi", 0x03C8: "psi", 0x03C9: "omega",
    # Greek, upper
    0x0393: "Gamma", 0x0394: "Delta", 0x0398: "Theta", 0x039B: "Lambda",
    0x039E: "Xi", 0x03A0: "Pi", 0x03A3: "Sigma", 0x03A5: "Upsilon",
    0x03A6: "Phi", 0x03A8: "Psi", 0x03A9: "Omega",
    # Big operators
    0x2211: "sum", 0x220F: "prod", 0x2210: "coprod", 0x222B: "int",
    0x222C: "iint", 0x222D: "iiint", 0x222E: "oint", 0x22C0: "bigwedge",
    0x22C1: "bigvee", 0x22C2: "bigcap", 0x22C3: "bigcup", 0x2A00: "bigodot",
    0x2A01: "bigoplus", 0x2A02: "bigotimes", 0x2A04: "biguplus", 0x2A06: "bigsqcup",
    # Binary operators — the circle/dot family he asked for by name
    0x00B1: "pm", 0x2213: "mp", 0x00D7: "times", 0x00F7: "div",
    0x22C5: "cdot", 0x00B7: "centerdot", 0x2218: "circ", 0x2219: "bullet",
    0x2022: "textbullet", 0x2299: "odot", 0x2295: "oplus", 0x2296: "ominus",
    0x2297: "otimes", 0x2298: "oslash", 0x229A: "circledcirc",
    0x229B: "circledast", 0x229D: "circleddash", 0x2214: "dotplus",
    0x2216: "setminus", 0x2217: "ast", 0x2227: "wedge land", 0x2228: "vee lor",
    0x2229: "cap", 0x222A: "cup", 0x228E: "uplus", 0x2293: "sqcap",
    0x2294: "sqcup", 0x2240: "wr", 0x2020: "dagger", 0x2021: "ddagger",
    0x22C6: "star", 0x25B3: "bigtriangleup", 0x25BD: "bigtriangledown",
    0x228F: "sqsubset", 0x2290: "sqsupset", 0x2291: "sqsubseteq", 0x2292: "sqsupseteq",
    # Relations
    0x2264: "le leq", 0x2265: "ge geq", 0x2260: "ne neq", 0x2261: "equiv",
    0x2262: "nequiv", 0x2248: "approx", 0x2243: "simeq", 0x223C: "sim",
    0x2245: "cong", 0x221D: "propto", 0x226A: "ll", 0x226B: "gg",
    0x2282: "subset", 0x2283: "supset", 0x2286: "subseteq", 0x2287: "supseteq",
    0x2288: "nsubseteq", 0x2289: "nsupseteq", 0x2208: "in", 0x2209: "notin",
    0x220B: "ni", 0x2205: "emptyset varnothing", 0x22A2: "vdash", 0x22A3: "dashv",
    0x22A8: "models", 0x22A5: "perp bot", 0x22A4: "top", 0x2225: "parallel",
    0x2226: "nparallel", 0x2223: "mid", 0x2224: "nmid", 0x227A: "prec",
    0x227B: "succ", 0x2AAF: "preceq", 0x2AB0: "succeq", 0x224D: "asymp",
    0x2250: "doteq", 0x2252: "fallingdotseq", 0x2254: "coloneq",
    # Arrows
    0x2190: "leftarrow gets", 0x2192: "rightarrow to", 0x2191: "uparrow",
    0x2193: "downarrow", 0x2194: "leftrightarrow", 0x2195: "updownarrow",
    0x21D0: "Leftarrow", 0x21D2: "Rightarrow implies", 0x21D4: "Leftrightarrow iff",
    0x21D1: "Uparrow", 0x21D3: "Downarrow", 0x21A6: "mapsto",
    0x27F5: "longleftarrow", 0x27F6: "longrightarrow", 0x27F7: "longleftrightarrow",
    0x27F8: "Longleftarrow", 0x27F9: "Longrightarrow", 0x27FA: "Longleftrightarrow",
    0x27FC: "longmapsto", 0x2197: "nearrow", 0x2198: "searrow",
    0x2199: "swarrow", 0x2196: "nwarrow", 0x21A9: "hookleftarrow",
    0x21AA: "hookrightarrow", 0x21C0: "rightharpoonup", 0x21C1: "rightharpoondown",
    0x21BC: "leftharpoonup", 0x21BD: "leftharpoondown", 0x21CC: "rightleftharpoons",
    0x21C4: "rightleftarrows", 0x219B: "nrightarrow", 0x219A: "nleftarrow",
    0x21AB: "looparrowleft", 0x21AC: "looparrowright", 0x21B0: "Lsh", 0x21B1: "Rsh",
    # Letterlike / named constants
    0x210F: "hbar", 0x2113: "ell", 0x2118: "wp", 0x211C: "Re", 0x2111: "Im",
    0x2135: "aleph", 0x2136: "beth", 0x2137: "gimel", 0x2138: "daleth",
    0x2102: "mathbb{C}", 0x211D: "mathbb{R}", 0x2115: "mathbb{N}",
    0x2124: "mathbb{Z}", 0x211A: "mathbb{Q}", 0x210D: "mathbb{H}",
    0x2119: "mathbb{P}", 0x1D53C: "mathbb{E}",
    0x2200: "forall", 0x2203: "exists", 0x2204: "nexists", 0x00AC: "neg lnot",
    0x2202: "partial", 0x2207: "nabla", 0x221A: "sqrt", 0x221E: "infty",
    0x2220: "angle", 0x2221: "measuredangle", 0x2222: "sphericalangle",
    0x2234: "therefore", 0x2235: "because", 0x2236: "ratio", 0x2032: "prime",
    0x2033: "dprime", 0x2026: "ldots dots", 0x22EF: "cdots", 0x22EE: "vdots",
    0x22F1: "ddots", 0x2044: "diagup",
    # Delimiters
    0x27E8: "langle", 0x27E9: "rangle", 0x2308: "lceil", 0x2309: "rceil",
    0x230A: "lfloor", 0x230B: "rfloor", 0x2016: "Vert", 0x230C: "ulcorner",
    # Misc symbols people actually type
    0x2713: "checkmark", 0x2020: "dag", 0x00A7: "S", 0x00B6: "P",
    0x00A9: "copyright", 0x00AE: "circledR", 0x2122: "texttrademark",
    0x00B0: "degree", 0x2103: "degreeCelsius", 0x212B: "AA",
    0x2660: "spadesuit", 0x2661: "heartsuit", 0x2662: "diamondsuit",
    0x2663: "clubsuit", 0x266D: "flat", 0x266E: "natural", 0x266F: "sharp",
    0x2605: "bigstar", 0x25CA: "lozenge", 0x2135: "aleph",
    0x2212: "minus", 0x2010: "hyphen", 0x2013: "textendash", 0x2014: "textemdash",
    0x00A0: "nobreakspace", 0x2018: "lq", 0x2019: "rq",
}

# --- human aliases --------------------------------------------------------------------
# The words you would actually type, which Unicode does not use. "tick" is the standout:
# it appears in no Unicode name at all, yet it is what half the world calls ✓.
ALIASES = {
    0x2713: "tick check ok yes",
    0x2714: "tick check bold heavy ok yes",
    0x2705: "green check tick ok yes button emoji",
    0x2611: "tick checkbox ticked done todo",
    0x2612: "crossed checkbox x ex no",
    0x2610: "empty checkbox todo unchecked box",
    0x2717: "cross x ex wrong no fail",
    0x2718: "cross x ex wrong no fail bold heavy",
    0x274C: "red cross x ex wrong no fail emoji",
    0x2716: "cross x ex multiply heavy",
    0x26A0: "warning caution careful",
    0x2757: "warning bang important",
    0x2139: "info information note",
    0x2605: "star filled solid favourite favorite",
    0x2606: "star hollow outline empty",
    0x25CF: "circle filled solid dot big disc bullet",
    0x25CB: "circle hollow outline empty ring",
    0x25CE: "circle bullseye target ring dot",
    0x25E6: "circle hollow small bullet dot",
    0x2299: "circle dot centered centred circled",
    0x2218: "circle small ring compose composition",
    0x2219: "dot filled small",
    0x22C5: "dot centered centred multiply product",
    0x00B7: "dot middle centered centred",
    0x2022: "bullet dot list point",
    0x2027: "dot hyphenation",
    0x25A0: "square filled solid box",
    0x25A1: "square hollow outline empty box",
    0x25B2: "triangle filled solid up",
    0x25B6: "triangle right play",
    0x2192: "arrow right to",
    0x2190: "arrow left from",
    0x2191: "arrow up",
    0x2193: "arrow down",
    0x21D2: "arrow right double implies therefore",
    0x2026: "ellipsis dots three",
    0x2014: "dash em long",
    0x2013: "dash en range",
    0x2212: "minus math",
    0x00B1: "plus minus tolerance",
    0x00D7: "times multiply cross by",
    0x00F7: "divide division obelus",
    0x221E: "infinity infinite forever",
    0x2211: "sum sigma total add",
    0x220F: "product prod multiply",
    0x222B: "integral integrate",
    0x2202: "partial derivative del",
    0x2207: "nabla del gradient grad divergence curl",
    0x221A: "root radical square",
    0x2248: "approx approximately roughly about",
    0x2260: "not equal ne different",
    0x2264: "less equal le at most",
    0x2265: "greater equal ge at least",
    0x2261: "identical equivalent congruent",
    0x2205: "empty set null nothing void",
    0x2208: "element of member in belongs",
    0x2209: "not element member",
    0x2200: "for all every any universal",
    0x2203: "there exists some existential",
    0x211D: "reals real numbers blackboard bold R",
    0x2124: "integers whole numbers blackboard bold Z",
    0x2115: "naturals counting numbers blackboard bold N",
    0x2102: "complex numbers blackboard bold C",
    0x211A: "rationals blackboard bold Q",
    0x1D53C: "expectation expected value blackboard bold E",
    0x00A9: "copyright",
    0x00AE: "registered trademark",
    0x2122: "trademark tm",
    0x00B0: "degree degrees temperature angle",
    0x20AC: "euro money currency",
    0x00A3: "pound sterling money currency",
    0x00A5: "yen money currency",
    0x0024: "dollar money currency",
    0x2018: "quote single open left curly smart",
    0x2019: "quote single close right curly smart apostrophe",
    0x201C: "quote double open left curly smart",
    0x201D: "quote double close right curly smart",
    0x00AB: "quote guillemet french open",
    0x00BB: "quote guillemet french close",
    0x00A0: "space nonbreaking nbsp hard",
    0x2009: "space thin",
    0x2003: "space em quad wide",
    0x2002: "space en",
    0x2020: "dagger footnote obelisk",
    0x2021: "double dagger footnote",
    0x00B6: "pilcrow paragraph",
    0x00A7: "section silcrow",
    0x2116: "numero number no",
    0x2030: "per mille permille thousand",
    0x00BD: "half fraction one two",
    0x2153: "third fraction one three",
    0x00BC: "quarter fraction one four",
    0x00BE: "three quarters fraction",
    0x2603: "snowman winter",
    0x263A: "smiley smile happy face",
    0x2615: "coffee tea hot drink break",
    0x26A1: "lightning bolt zap power fast",
    0x2708: "plane flight travel",
    0x270E: "pencil edit write note",
    0x1F44D: "thumbs up like good yes emoji",
    0x1F44E: "thumbs down dislike bad no emoji",
    0x1F680: "rocket launch ship fast emoji",
    0x1F41B: "bug defect issue emoji",
    0x1F4A1: "idea bulb light insight emoji",
    0x1F525: "fire hot urgent emoji",
    0x1F389: "party celebrate done shipped emoji",
    0x1F440: "eyes look review watching emoji",
    0x1F914: "thinking hmm unsure emoji",
    0x1F3AF: "target goal bullseye direct hit emoji",
    # Odd Unicode names for colored characters (issue J.21), added as they turn up.
    0x2764: "heart red love",
}

# Characters outside the swept blocks that are worth having anyway. The emoji that used to
# be listed here (👍 👎 🚀 🐛 💡 🔥 🎉 👀 🤔 🎯) are now inside swept blocks; their aliases
# above still apply.
EXTRA = [
    0x1D53C, 0x0024, 0x0023, 0x0026, 0x0040, 0x005E, 0x007E,
]

# --- emoji presentation ---------------------------------------------------------------
# Characters with Emoji_Presentation=Yes: the ones that are COLOR by default. This is a
# real Unicode property, and `unicodedata` does not expose it, so the ranges are listed,
# copied from Unicode 16.0's emoji-data.txt (UTS #51). Until J.21 everything from U+1F004
# up was listed as one range, which was harmless while only ten emoji came from there; the
# swept pictograph blocks also hold text-default emoji (🌡 U+1F321) and characters that are
# not emoji at all, so the exact ranges are used now.
#
# It matters for exactly one reason, and it is not cosmetic: the picker must draw each
# character with the font the DOCUMENT will use, or it lies about what you are choosing.
# ✅ is color (Segoe UI Emoji, which has a COLR table); ✓ is not, in any font — it takes
# your text color. Both fonts contain U+2705, so whichever is named first wins.
EMOJI_PRESENTATION = [
    (0x231A, 0x231B), (0x23E9, 0x23EC), (0x23F0, 0x23F0), (0x23F3, 0x23F3),
    (0x25FD, 0x25FE), (0x2614, 0x2615), (0x2648, 0x2653), (0x267F, 0x267F),
    (0x2693, 0x2693), (0x26A1, 0x26A1), (0x26AA, 0x26AB), (0x26BD, 0x26BE),
    (0x26C4, 0x26C5), (0x26CE, 0x26CE), (0x26D4, 0x26D4), (0x26EA, 0x26EA),
    (0x26F2, 0x26F3), (0x26F5, 0x26F5), (0x26FA, 0x26FA), (0x26FD, 0x26FD),
    (0x2705, 0x2705), (0x270A, 0x270B), (0x2728, 0x2728), (0x274C, 0x274C),
    (0x274E, 0x274E), (0x2753, 0x2755), (0x2757, 0x2757), (0x2795, 0x2797),
    (0x27B0, 0x27B0), (0x27BF, 0x27BF), (0x2B1B, 0x2B1C), (0x2B50, 0x2B50),
    (0x2B55, 0x2B55), (0x1F004, 0x1F004), (0x1F0CF, 0x1F0CF), (0x1F18E, 0x1F18E),
    (0x1F191, 0x1F19A), (0x1F1E6, 0x1F1FF), (0x1F201, 0x1F201), (0x1F21A, 0x1F21A),
    (0x1F22F, 0x1F22F), (0x1F232, 0x1F236), (0x1F238, 0x1F23A), (0x1F250, 0x1F251),
    (0x1F300, 0x1F320), (0x1F32D, 0x1F335), (0x1F337, 0x1F37C), (0x1F37E, 0x1F393),
    (0x1F3A0, 0x1F3CA), (0x1F3CF, 0x1F3D3), (0x1F3E0, 0x1F3F0), (0x1F3F4, 0x1F3F4),
    (0x1F3F8, 0x1F43E), (0x1F440, 0x1F440), (0x1F442, 0x1F4FC), (0x1F4FF, 0x1F53D),
    (0x1F54B, 0x1F54E), (0x1F550, 0x1F567), (0x1F57A, 0x1F57A), (0x1F595, 0x1F596),
    (0x1F5A4, 0x1F5A4), (0x1F5FB, 0x1F64F), (0x1F680, 0x1F6C5), (0x1F6CC, 0x1F6CC),
    (0x1F6D0, 0x1F6D2), (0x1F6D5, 0x1F6D7), (0x1F6DC, 0x1F6DF), (0x1F6EB, 0x1F6EC),
    (0x1F6F4, 0x1F6FC), (0x1F7E0, 0x1F7EB), (0x1F7F0, 0x1F7F0), (0x1F90C, 0x1F93A),
    (0x1F93C, 0x1F945), (0x1F947, 0x1F9FF), (0x1FA70, 0x1FA7C), (0x1FA80, 0x1FA89),
    (0x1FA8F, 0x1FAC6), (0x1FACE, 0x1FADC), (0x1FADF, 0x1FAE9), (0x1FAF0, 0x1FAF8),
]

# Characters with Emoji=Yes and Emoji_Presentation=No, ASCII excluded (the digits, `#` and
# `*` are Emoji=Yes for keycap sequences only): TEXT by default, COLOR when followed by
# U+FE0F, VARIATION SELECTOR-16 (issue J.21). ⚠ ❤ ✔ ☑ ☀ are all here. Each one in the table
# gets a twin row, "<name> (color)", that inserts the character plus U+FE0F. Same source
# as above, Unicode 16.0's emoji-data.txt.
TEXT_DEFAULT_EMOJI = [
    (0x00A9, 0x00A9), (0x00AE, 0x00AE), (0x203C, 0x203C), (0x2049, 0x2049),
    (0x2122, 0x2122), (0x2139, 0x2139), (0x2194, 0x2199), (0x21A9, 0x21AA),
    (0x2328, 0x2328), (0x23CF, 0x23CF), (0x23ED, 0x23EF), (0x23F1, 0x23F2),
    (0x23F8, 0x23FA), (0x24C2, 0x24C2), (0x25AA, 0x25AB), (0x25B6, 0x25B6),
    (0x25C0, 0x25C0), (0x25FB, 0x25FC), (0x2600, 0x2604), (0x260E, 0x260E),
    (0x2611, 0x2611), (0x2618, 0x2618), (0x261D, 0x261D), (0x2620, 0x2620),
    (0x2622, 0x2623), (0x2626, 0x2626), (0x262A, 0x262A), (0x262E, 0x262F),
    (0x2638, 0x263A), (0x2640, 0x2640), (0x2642, 0x2642), (0x265F, 0x2660),
    (0x2663, 0x2663), (0x2665, 0x2666), (0x2668, 0x2668), (0x267B, 0x267B),
    (0x267E, 0x267E), (0x2692, 0x2692), (0x2694, 0x2697), (0x2699, 0x2699),
    (0x269B, 0x269C), (0x26A0, 0x26A0), (0x26A7, 0x26A7), (0x26B0, 0x26B1),
    (0x26C8, 0x26C8), (0x26CF, 0x26CF), (0x26D1, 0x26D1), (0x26D3, 0x26D3),
    (0x26E9, 0x26E9), (0x26F0, 0x26F1), (0x26F4, 0x26F4), (0x26F7, 0x26F9),
    (0x2702, 0x2702), (0x2708, 0x2709), (0x270C, 0x270D), (0x270F, 0x270F),
    (0x2712, 0x2712), (0x2714, 0x2714), (0x2716, 0x2716), (0x271D, 0x271D),
    (0x2721, 0x2721), (0x2733, 0x2734), (0x2744, 0x2744), (0x2747, 0x2747),
    (0x2763, 0x2764), (0x27A1, 0x27A1), (0x2934, 0x2935), (0x2B05, 0x2B07),
    (0x3030, 0x3030), (0x303D, 0x303D), (0x3297, 0x3297), (0x3299, 0x3299),
    (0x1F170, 0x1F171), (0x1F17E, 0x1F17F), (0x1F202, 0x1F202), (0x1F237, 0x1F237),
    (0x1F321, 0x1F321), (0x1F324, 0x1F32C), (0x1F336, 0x1F336), (0x1F37D, 0x1F37D),
    (0x1F396, 0x1F397), (0x1F399, 0x1F39B), (0x1F39E, 0x1F39F), (0x1F3CB, 0x1F3CE),
    (0x1F3D4, 0x1F3DF), (0x1F3F3, 0x1F3F3), (0x1F3F5, 0x1F3F5), (0x1F3F7, 0x1F3F7),
    (0x1F43F, 0x1F43F), (0x1F441, 0x1F441), (0x1F4FD, 0x1F4FD), (0x1F549, 0x1F54A),
    (0x1F56F, 0x1F570), (0x1F573, 0x1F579), (0x1F587, 0x1F587), (0x1F58A, 0x1F58D),
    (0x1F590, 0x1F590), (0x1F5A5, 0x1F5A5), (0x1F5A8, 0x1F5A8), (0x1F5B1, 0x1F5B2),
    (0x1F5BC, 0x1F5BC), (0x1F5C2, 0x1F5C4), (0x1F5D1, 0x1F5D3), (0x1F5DC, 0x1F5DE),
    (0x1F5E1, 0x1F5E1), (0x1F5E3, 0x1F5E3), (0x1F5E8, 0x1F5E8), (0x1F5EF, 0x1F5EF),
    (0x1F5F3, 0x1F5F3), (0x1F5FA, 0x1F5FA), (0x1F6CB, 0x1F6CB), (0x1F6CD, 0x1F6CF),
    (0x1F6E0, 0x1F6E5), (0x1F6E9, 0x1F6E9), (0x1F6F0, 0x1F6F0), (0x1F6F3, 0x1F6F3),
]

VS16 = "️"


def emoji_presentation(cp: int) -> bool:
    return any(lo <= cp <= hi for lo, hi in EMOJI_PRESENTATION)


def text_default_emoji(cp: int) -> bool:
    return any(lo <= cp <= hi for lo, hi in TEXT_DEFAULT_EMOJI)


# --- browsing kits --------------------------------------------------------------------
# Shown when the query is empty, so you can look rather than name. Order matters: these
# are listed top to bottom. An item is a code point, or a string for a two-code-point
# entry (a color twin: the character plus U+FE0F).
KITS = [
    # Issue J.21: colored squares, circles and hearts, first.
    ("Colors", [0x1F7E5, 0x1F7E7, 0x1F7E8, 0x1F7E9, 0x1F7E6, 0x1F7EA, 0x1F7EB, 0x2B1B, 0x2B1C,
                0x1F534, 0x1F7E0, 0x1F7E1, 0x1F7E2, 0x1F535, 0x1F7E3, 0x1F7E4, 0x26AB, 0x26AA,
                "❤" + VS16, 0x1F9E1, 0x1F49B, 0x1F49A, 0x1F499, 0x1F49C, 0x1F90E,
                0x1F5A4, 0x1F90D]),
    ("Checks & crosses", [0x2713, 0x2714, 0x2705, 0x2611, 0x2612, 0x2717, 0x2718, 0x274C,
                          0x2716, 0x2610, 0x26A0, 0x2757, 0x2139]),
    ("Circles & dots", [0x25CF, 0x25CB, 0x25CE, 0x25E6, 0x2299, 0x2218, 0x2219, 0x22C5,
                        0x00B7, 0x2022, 0x2295, 0x2296, 0x2297, 0x2298, 0x229A, 0x25C9,
                        0x25D0, 0x25D1, 0x25EF]),
    ("Arrows", [0x2190, 0x2192, 0x2191, 0x2193, 0x2194, 0x2195, 0x21D0, 0x21D2, 0x21D4,
                0x21A6, 0x27F6, 0x27F9, 0x2197, 0x2198, 0x2199, 0x2196, 0x21BB, 0x21BA]),
    ("Greek", [0x03B1, 0x03B2, 0x03B3, 0x03B4, 0x03B5, 0x03B8, 0x03BB, 0x03BC, 0x03C0,
               0x03C1, 0x03C3, 0x03C4, 0x03C6, 0x03C8, 0x03C9,
               0x0393, 0x0394, 0x0398, 0x039B, 0x03A0, 0x03A3, 0x03A6, 0x03A8, 0x03A9]),
    ("Operators", [0x00B1, 0x2213, 0x00D7, 0x00F7, 0x2212, 0x2211, 0x220F, 0x222B, 0x222E,
                   0x2202, 0x2207, 0x221A, 0x221E, 0x2032, 0x2033]),
    ("Relations", [0x2264, 0x2265, 0x2260, 0x2261, 0x2248, 0x223C, 0x2243, 0x2245, 0x221D,
                   0x226A, 0x226B, 0x2261, 0x2250]),
    ("Set & logic", [0x2208, 0x2209, 0x2282, 0x2283, 0x2286, 0x2287, 0x2229, 0x222A,
                     0x2205, 0x2200, 0x2203, 0x2204, 0x00AC, 0x2227, 0x2228, 0x22A5,
                     0x22A4, 0x22A2, 0x22A8, 0x211D, 0x2124, 0x2115, 0x2102, 0x211A]),
    ("Sub/superscripts", [0x00B2, 0x00B3, 0x00B9, 0x2070, 0x2074, 0x2075, 0x2076, 0x2077,
                          0x2078, 0x2079, 0x207A, 0x207B, 0x2080, 0x2081, 0x2082, 0x2083,
                          0x2084, 0x2085, 0x2086, 0x2087, 0x2088, 0x2089]),
    ("Dashes & quotes", [0x2013, 0x2014, 0x2010, 0x2212, 0x2018, 0x2019, 0x201C, 0x201D,
                         0x00AB, 0x00BB, 0x2026, 0x00A0, 0x2009, 0x2003, 0x2020, 0x2021,
                         0x00A7, 0x00B6]),
]


def usable(cp: int) -> bool:
    """Keep only characters that have a name and can actually be drawn."""
    ch = chr(cp)
    if unicodedata.category(ch) in ("Cc", "Cf", "Cs", "Co", "Cn"):
        return False
    try:
        unicodedata.name(ch)
    except ValueError:
        return False
    return True


def kit_char(item) -> str:
    """A kit item as the string it inserts: a code point, or a ready-made string."""
    return item if isinstance(item, str) else chr(item)


def main() -> int:
    rows = []
    seen = set()
    kit_of = {}
    for kit, items in KITS:
        for item in items:
            kit_of.setdefault(kit_char(item), kit)

    ordered = [(cp, group) for lo, hi, group in BLOCKS for cp in range(lo, hi + 1)]
    ordered += [(cp, "extra") for cp in EXTRA]

    for cp, _group in ordered:
        if cp in seen or not usable(cp):
            continue
        seen.add(cp)
        ch = chr(cp)
        name = unicodedata.name(ch).lower()
        latex = LATEX.get(cp, "")
        alias = ALIASES.get(cp, "")
        kit = kit_of.get(ch, "")
        emoji = "1" if emoji_presentation(cp) else ""
        # A tab or newline in a field would corrupt the row format; none of these
        # characters can contain one, but assert rather than trust.
        assert not any("\t" in f or "\n" in f for f in (ch, name, latex, alias, kit))
        rows.append("\t".join((ch, name, latex, alias, kit, emoji)))
        # The color twin (issue J.21), right after its text-style original so the two sit
        # together in a search: same LaTeX names, the aliases plus "color emoji", drawn
        # and flagged as emoji.
        if text_default_emoji(cp):
            twin = ch + VS16
            twin_alias = (alias + " color emoji").strip()
            rows.append("\t".join((twin, name + " (color)", latex, twin_alias,
                                   kit_of.get(twin, ""), "1")))

    # Backtick and ${ would end the template literal / start an interpolation.
    body = "\n".join(rows).replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

    # Each kit is an array of strings, since a color twin is two code points and cannot be
    # recovered by splitting one string into characters.
    def kit_items(items) -> str:
        chars = [kit_char(i) for i in items if isinstance(i, str) or usable(i)]
        return ", ".join(json.dumps(c, ensure_ascii=False) for c in chars)

    kits_ts = ",\n".join(f'  ["{kit}", [{kit_items(items)}]]' for kit, items in KITS)

    OUT.write_text(
        f'''// GENERATED by scripts/gen-symbols.py — do not edit by hand.
// Unicode {unicodedata.unidata_version} · {len(rows)} characters.
//
// The Unicode picker's search table (issue D.12). One tab-separated row per character:
//
//     char <TAB> unicode name <TAB> latex names <TAB> aliases <TAB> kit <TAB> emoji?
//
// The last field is "1" when the character has Emoji_Presentation=Yes — i.e. it is COLOR
// by default and must be drawn with the emoji font, not the symbol font. A "(color)" row is
// a color twin: a text-default character followed by U+FE0F, two code points in `char`.
//
// A string rather than an object array: it is about a third of the size and splits in
// roughly a millisecond. `symbols.ts` imports this module DYNAMICALLY, so none of it is
// loaded, parsed or paid for until the picker is opened for the first time.
//
// LaTeX names, aliases and kits are curated in the generator — Unicode names come from
// CPython's `unicodedata`, so they are authoritative and typo-free.

export const SYMBOL_ROWS = `{body}`;

/** Browsing groups shown when the query is empty — for when you do not know the name.
 *  Each entry is one table `char`, which may be two code points (a color twin). */
export const SYMBOL_KITS: [string, string[]][] = [
{kits_ts},
];
''',
        encoding="utf-8",
    )
    print(f"wrote {OUT} — {len(rows)} characters, {OUT.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
