// Build a CodeMirror theme + Markdown highlight from an imported Sublime colour
// scheme (spec §11). Exact scope-by-scope reproduction isn't required — the goal is
// close visual equivalence during ordinary Markdown/Quarto editing.
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t, type Tag } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import type { ScopeRule, SublimeTheme } from "../api";

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
  overrides?: { fontSize?: number; fontFamily?: string },
): {
  theme: Extension;
  highlight: Extension;
  selection: string;
} {
  const fontSize = overrides?.fontSize ?? st.font_size;
  const fontFamily = overrides?.fontFamily ?? st.font_face;
  const theme = EditorView.theme(
    {
      "&": {
        color: st.foreground,
        backgroundColor: st.background,
        height: "100%",
        fontSize: `${fontSize}px`,
      },
      ".cm-content": {
        fontFamily: `"${fontFamily}", "Cascadia Mono", "Consolas", monospace`,
        caretColor: st.caret,
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

  return {
    theme,
    highlight: syntaxHighlighting(HighlightStyle.define(spec)),
    selection: st.selection,
  };
}
