// Build a CodeMirror theme + Markdown highlight from an imported Sublime colour
// scheme (spec §11). Exact scope-by-scope reproduction isn't required — the goal is
// close visual equivalence during ordinary Markdown/Quarto editing.
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t, type Tag } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import type { ScopeRule, SublimeTheme } from "../api";
import { editorHighlight } from "./theme";

/** First rule whose scope matches (or contains, space/comma-separated) a target scope. */
function ruleFor(rules: ScopeRule[], ...scopes: string[]): ScopeRule | undefined {
  for (const s of scopes) {
    const exact = rules.find((r) => r.scope === s);
    if (exact) return exact;
    const token = rules.find((r) => r.scope.split(/[ ,]+/).includes(s));
    if (token) return token;
  }
  return undefined;
}

export function colorFor(rules: ScopeRule[], ...scopes: string[]): string | undefined {
  return ruleFor(rules, ...scopes)?.foreground ?? undefined;
}

export function buildSublimeTheme(
  st: SublimeTheme,
  overrides?: { fontSize?: number; fontFamily?: string; fontWeight?: string },
): {
  theme: Extension;
  highlight: Extension;
  selection: string;
} {
  const fontSize = overrides?.fontSize ?? st.font_size;
  const fontFamily = overrides?.fontFamily ?? st.font_face;
  const fontWeight = overrides?.fontWeight;
  // Size and family go through CSS VARIABLES rather than being baked into the generated
  // rules (issues A.05, A.13). Every distinct value handed to EditorView.theme() builds a
  // fresh StyleModule that CodeMirror mounts and never unmounts, so per-file-type fonts
  // (and, already today, every Ctrl+wheel zoom notch) would quietly accumulate style
  // sheets for the life of the session. With variables the theme object stays identical
  // and Editor.tsx just re-points the variable — no reconfigure, nothing to accumulate.
  // The values below are the fallbacks, used until the variables are set.
  const theme = EditorView.theme(
    {
      "&": {
        color: st.foreground,
        backgroundColor: st.background,
        height: "100%",
        fontSize: `var(--wd-editor-font-size, ${fontSize}px)`,
      },
      ".cm-content": {
        fontFamily: `var(--wd-editor-font-family, "${fontFamily}"), "Cascadia Mono", "Consolas", monospace`,
        caretColor: st.caret,
        ...(fontWeight ? { fontWeight } : {}),
      },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: st.caret },
      ".cm-gutters": {
        backgroundColor: st.background,
        color: "rgba(255,255,255,0.30)",
        border: "none",
      },
      ".cm-activeLine": { backgroundColor: st.line_highlight },
      ".cm-activeLineGutter": { backgroundColor: st.line_highlight },
    },
    { dark: st.dark },
  );

  return {
    theme,
    highlight: syntaxHighlighting(highlightStyleFor(st)),
    selection: st.selection,
  };
}

// One HighlightStyle per imported scheme, memoized by `st` identity. The editor and the
// markdown preview both go through this factory, so they share the SAME instance — and a
// HighlightStyle's scoped class names are randomized per `.define()`, so sharing is what makes
// the preview's colors match the editor exactly.
const styleCache = new WeakMap<SublimeTheme, HighlightStyle>();

/** The raw HighlightStyle currently in effect: the Sublime-derived one when a scheme is
 *  loaded, else the built-in `editorHighlight`. */
export function highlightStyleFor(st: SublimeTheme | null): HighlightStyle {
  if (!st) return editorHighlight;
  let hs = styleCache.get(st);
  if (!hs) {
    hs = HighlightStyle.define(buildHighlightSpec(st));
    styleCache.set(st, hs);
  }
  return hs;
}

/** Map the imported Sublime scopes onto Lezer tags → the HighlightStyle spec (colors only;
 *  font settings live in the EditorView theme, not here). */
function buildHighlightSpec(st: SublimeTheme) {
  const r = st.rules;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spec: any[] = [];
  const add = (tag: Tag | Tag[], color?: string, extra: Record<string, string> = {}) => {
    if (color || Object.keys(extra).length) spec.push({ tag, ...(color ? { color } : {}), ...extra });
  };

  const heading = colorFor(r, "markup.heading");
  const headingBg = ruleFor(r, "markup.heading")?.background ?? undefined;
  const headingStyle = { fontWeight: "bold", ...(headingBg ? { backgroundColor: headingBg } : {}) };
  add([t.heading1, t.heading2, t.heading3], heading, headingStyle);
  add([t.heading4, t.heading5, t.heading6, t.heading], heading, headingStyle);
  add(t.strong, undefined, { fontWeight: "bold" });
  add(t.emphasis, undefined, { fontStyle: "italic" });
  add(t.list, colorFor(r, "markup.list"));
  add(t.comment, colorFor(r, "comment"), { fontStyle: "italic" });
  add([t.string], colorFor(r, "string"));
  add(t.regexp, colorFor(r, "string.regexp"));
  add([t.number, t.bool, t.atom], colorFor(r, "constant"));
  // Control-flow keywords use Loudoun's python-control colour; other keywords the plain
  // keyword colour — so code isn't a wall of one garish hue.
  add(t.controlKeyword, colorFor(r, "keyword.control.python", "keyword"));
  add(
    [t.keyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.modifier],
    colorFor(r, "keyword"),
  );
  add(t.variableName, colorFor(r, "variable"));
  add(
    [
      t.function(t.variableName),
      t.function(t.definition(t.variableName)),
      t.function(t.propertyName),
    ],
    colorFor(r, "entity.name.function.python", "entity"),
  );
  add([t.typeName, t.className], colorFor(r, "storage", "entity"));
  add(
    [t.propertyName, t.definition(t.propertyName), t.attributeName],
    colorFor(r, "entity.name.tag.yaml", "keyword"),
  );
  return spec;
}
