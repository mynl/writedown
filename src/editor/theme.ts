// CodeMirror theme + Markdown highlight style. A clean built-in dark/light look for
// now; importing the user's Sublime colour scheme is Phase 3 (spec §11).
import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const isDark =
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

const p = isDark
  ? {
      bg: "#1e1e1e", fg: "#e6e6e6", caret: "#e6e6e6", sel: "#3a5f8a",
      match: "rgba(255,214,0,0.20)", gutterFg: "#6b6b6b", active: "#262626",
      heading: "#4ec9b0", emphasis: "#c586c0", strong: "#dcdcaa",
      link: "#4a90d9", code: "#ce9178", comment: "#6a9955",
      kw: "#569cd6", str: "#ce9178", num: "#b5cea8", meta: "#9cdcfe",
    }
  : {
      bg: "#ffffff", fg: "#1c1c1c", caret: "#000000", sel: "#add6ff",
      match: "rgba(255,193,7,0.30)", gutterFg: "#9b9b9b", active: "#f3f3f3",
      heading: "#0b7285", emphasis: "#a626a4", strong: "#8a6d00",
      link: "#1a56c4", code: "#a03030", comment: "#41924b",
      kw: "#0000ff", str: "#a03030", num: "#116644", meta: "#005cc5",
    };

export const editorTheme = EditorView.theme(
  {
    // Same CSS variables the Sublime-derived theme uses (issues A.05, A.13), so zoom and
    // per-file-type fonts work identically with or without an imported colour scheme.
    "&": {
      color: p.fg,
      backgroundColor: p.bg,
      height: "100%",
      fontSize: "var(--wd-editor-font-size, 14px)",
    },
    ".cm-content": {
      fontFamily:
        'var(--wd-editor-font-family, "Cascadia Mono"),"Consolas",ui-monospace,monospace',
      caretColor: p.caret,
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: p.caret },
    // CodeMirror draws its own selection layer; it must override the base theme,
    // hence !important (otherwise the active selection shows no highlight).
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      background: p.sel + " !important",
    },
    ".cm-content ::selection": { background: p.sel },
    ".cm-selectionMatch": { background: p.match },
    ".cm-gutters": { backgroundColor: p.bg, color: p.gutterFg, border: "none" },
    ".cm-activeLine": { backgroundColor: p.active },
    ".cm-activeLineGutter": { backgroundColor: p.active },
    ".cm-foldPlaceholder": { backgroundColor: p.active, border: "none", color: p.gutterFg },
  },
  { dark: isDark },
);

export const editorHighlight = HighlightStyle.define([
  // Markdown headings are tagged heading1..6 (not the generic `heading`).
  { tag: t.heading1, color: p.heading, fontWeight: "bold", fontSize: "1.4em" },
  { tag: t.heading2, color: p.heading, fontWeight: "bold", fontSize: "1.3em" },
  { tag: t.heading3, color: p.heading, fontWeight: "bold", fontSize: "1.15em" },
  {
    tag: [t.heading4, t.heading5, t.heading6, t.heading],
    color: p.heading,
    fontWeight: "bold",
  },
  { tag: t.emphasis, color: p.emphasis, fontStyle: "italic" },
  { tag: t.strong, color: p.strong, fontWeight: "bold" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: p.link, textDecoration: "underline" },
  { tag: t.labelName, color: p.link },
  { tag: t.monospace, color: p.code },
  // Markdown markers (#, -, *, >, `, emphasis marks) — the punctuation of prose.
  { tag: t.processingInstruction, color: p.meta },
  { tag: t.list, color: p.meta },
  { tag: [t.quote], color: p.comment, fontStyle: "italic" },
  { tag: [t.comment], color: p.comment, fontStyle: "italic" },
  { tag: t.escape, color: p.num },
  { tag: t.contentSeparator, color: p.gutterFg },
  // Fenced-code / YAML content (nested languages emit these standard tags).
  { tag: t.keyword, color: p.kw },
  { tag: [t.string, t.regexp], color: p.str },
  { tag: [t.number, t.bool, t.atom], color: p.num },
  { tag: [t.propertyName, t.attributeName], color: p.meta },
  { tag: [t.typeName, t.className], color: p.heading },
  { tag: t.meta, color: p.meta },
]);
