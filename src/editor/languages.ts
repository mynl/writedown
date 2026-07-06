// Pick the CodeMirror language by file extension so Writedown opens code/data files,
// not just Markdown (spec §6). Colours come from the imported Sublime scheme via the
// shared highlight style, so e.g. Python looks the same here as in a fenced code block.
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { LanguageDescription, StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { yaml, yamlFrontmatter } from "@codemirror/lang-yaml";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { stex } from "@codemirror/legacy-modes/mode/stex";

// Quarto / RMarkdown code cells use ```{python}, ```{r, echo=FALSE}, ```{=html} — strip
// the braces/options so the nested language still highlights (spec §16).
function codeLanguages(info: string): LanguageDescription | null {
  const name = info.replace(/^\{=?/, "").replace(/\}$/, "").trim().split(/[\s,]/)[0];
  return name ? LanguageDescription.matchLanguageName(languages, name, true) : null;
}

// Markdown with real YAML front matter parsing (spec §17), so `---` keys/values get
// proper scopes coloured by the imported scheme (keys orange, string values green).
const markdownExt = yamlFrontmatter({
  content: markdown({ base: markdownLanguage, codeLanguages }),
});

export function languageForPath(path: string): Extension | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
    case "markdown":
    case "qmd":
      return markdownExt;
    case "py":
      return python();
    case "json":
      return json();
    case "yaml":
    case "yml":
      return yaml();
    case "toml":
      return StreamLanguage.define(toml);
    case "tex":
    case "latex":
    case "sty":
      return StreamLanguage.define(stex);
    default:
      return null; // csv/tsv/txt etc. — plain text (csv also gets the rainbow layer)
  }
}

export const isCsv = (path: string): boolean => /\.(csv|tsv)$/i.test(path);

/** Markdown/Quarto docs get the inline `$…$` / `$$…$$` math layer. */
export const isMarkdownDoc = (path: string): boolean => /\.(md|markdown|qmd)$/i.test(path);
