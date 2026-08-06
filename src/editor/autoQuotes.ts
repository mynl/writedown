// Auto-closing quotes, in CODE CONTEXTS ONLY (issue C.05): typing `"` gives `"|"`, typing
// the third of `"""` gives `"""|"""`, and the same for `'`/`'''`. Prose is untouched, which
// is the whole point — CodeMirror's stock closeBrackets is off (Editor.tsx) precisely
// because it also closed `( [ {` everywhere and doubled apostrophes in ordinary writing.
//
// None of the fiddly behaviour is re-implemented here. `closeBrackets()` already knows how to
// skip over the quote it inserted, how to handle triple quotes, how to leave `don't` alone
// (it declines when the previous character is a word character), and how to make Backspace
// delete the pair. All of that is driven by ONE input it reads at the cursor:
//
//   config(state, pos) = state.languageDataAt("closeBrackets", pos)[0] || defaults
//
// So the whole feature is a language-data provider. `Prec.highest` puts ours first in the
// facet, ahead of the nested Python language's own entry (which would otherwise bring `(`,
// `[`, `{` along with the quotes), and an EMPTY brackets list makes the handler decline
// outright — in prose the extension costs one array lookup and nothing else.
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

/** Quotes only — no `(`, `[`, `{`. The triple forms are what switch on CodeMirror's
 *  triple-quote handling (`allowTriple` is literally `brackets.indexOf(tok+tok+tok) > -1`). */
const QUOTES = {
  brackets: ['"', "'", '"""', "'''"],
  // Same list @codemirror/lang-python publishes, so `f"…"`, `r'…'` &c. still auto-close.
  stringPrefixes: [
    "f", "fr", "rf", "r", "u", "b", "br", "rb",
    "F", "FR", "RF", "R", "U", "B", "BR", "RB",
  ],
};
/** An empty bracket list = "close nothing here": insertBracket finds no token and declines. */
const NONE = { brackets: [] as string[] };

/** Markdown node names that mean "this is code, not prose". A fenced cell with a nested
 *  language (```{python}) parses into a mounted sub-tree, so the walk also stops at any
 *  node whose ancestry leaves markdown's own `Document` root. */
const CODE_NODES = /^(FencedCode|CodeBlock|CodeText|InlineCode)$/;

function inMarkdownCode(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, -1);
  for (;;) {
    if (CODE_NODES.test(node.name)) return true;
    const parent = node.parent;
    if (!parent) return node.name !== "Document"; // a mounted sub-language's root = code
    node = parent;
  }
}

/**
 * `mode: "code"` — the whole document is code (a .py/.json/.toml/… file).
 * `mode: "markdown"` — only inside fenced/inline code, i.e. Quarto `{python}` cells.
 * Plain text and CSV get neither (Editor.tsx never installs this for them).
 */
export function autoCloseQuotes(mode: "code" | "markdown") {
  // Language data is a dictionary of NAMED entries, so the config has to be wrapped under
  // its own key — `languageDataAt("closeBrackets")` filters on hasOwnProperty("closeBrackets")
  // and silently ignores anything else, which is a no-op that looks like it works.
  const data =
    mode === "code"
      ? () => [{ closeBrackets: QUOTES }]
      : (state: EditorState, pos: number) => [
          { closeBrackets: inMarkdownCode(state, pos) ? QUOTES : NONE },
        ];
  return [
    Prec.highest(EditorState.languageData.of(data)),
    closeBrackets(),
    // Backspace between a pair deletes both. Prec.high because basicSetup's default keymap
    // is installed AHEAD of these extensions, and its plain deleteCharBackward would
    // otherwise match first. It still falls through to the default when not between a pair,
    // and the configurable editing keymap (Prec.highest) is untouched.
    Prec.high(keymap.of(closeBracketsKeymap)),
  ];
}
