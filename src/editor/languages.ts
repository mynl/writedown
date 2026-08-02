// Pick the CodeMirror language by file extension so Writedown opens code/data files,
// not just Markdown (spec §6). Colours come from the imported Sublime scheme via the
// shared highlight style, so e.g. Python looks the same here as in a fenced code block.
import { useEffect, useState } from "react";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { tolerantFrontmatter } from "./tolerantFrontmatter";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { declDescription, declSupport } from "./decl";

// Statically-imported languages, wrapped as PRE-LOADED descriptions so a fenced ```{python}
// (or json/yaml/toml/latex) cell nests SYNCHRONOUSLY. Resolving these through the async
// language-data registry left the live editor's incremental, viewport-bounded highlight pass
// with a partial nested tree — some lines tagged, some not, shifting on every edit (the
// "striped/unstable colouring" in {python} cells). declDescription is already eager.
const STATIC_CODE_LANGS: LanguageDescription[] = [
  declDescription,
  LanguageDescription.of({ name: "python", alias: ["py"], support: python() }),
  LanguageDescription.of({ name: "json", support: json() }),
  LanguageDescription.of({ name: "yaml", alias: ["yml"], support: yaml() }),
  LanguageDescription.of({ name: "toml", support: new LanguageSupport(StreamLanguage.define(toml)) }),
  LanguageDescription.of({
    name: "latex",
    alias: ["tex", "stex"],
    support: new LanguageSupport(StreamLanguage.define(stex)),
  }),
];

// Quarto / RMarkdown code cells use ```{python}, ```{r, echo=FALSE}, ```{=html} — strip
// the braces/options so the nested language still highlights (spec §16). Exported so the
// markdown preview resolves fence languages identically to the editor.
export function codeLanguages(info: string): LanguageDescription | null {
  const name = info.replace(/^\{=?/, "").replace(/\}$/, "").trim().split(/[\s,]/)[0];
  // Match statically-loaded languages first (synchronous nested parse — no unstable
  // colouring), then fall back to the lazy language-data registry for r/julia/js/etc.
  return name
    ? LanguageDescription.matchLanguageName([...STATIC_CODE_LANGS, ...languages], name, true)
    : null;
}

// Markdown with real YAML front matter parsing (spec §17), so `---` keys/values get
// proper scopes coloured by the imported scheme (keys orange, string values green).
// tolerantFrontmatter, not lang-yaml's yamlFrontmatter: trailing blanks on a `---`
// delimiter are legal, and an unclosed block no longer swallows the document (Sa 14).
const markdownExt = tolerantFrontmatter({
  content: markdown({ base: markdownLanguage, codeLanguages }),
});

// One instance per language, built once. These used to be constructed on every call —
// `python()`, `StreamLanguage.define(toml)` — which handed the editor a NEW extension
// object on every tab switch, forcing a full CodeMirror reconfigure between two files of
// the same type (issue A.29). Language supports are designed to be shared extensions;
// markdownExt above has always been a singleton for exactly this reason.
const pythonExt = python();
const jsonExt = json();
const yamlExt = yaml();
const tomlExt = StreamLanguage.define(toml);
const stexExt = StreamLanguage.define(stex);

export function languageForPath(path: string): Extension | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
    case "markdown":
    case "qmd":
      return markdownExt;
    case "py":
      return pythonExt;
    case "json":
      return jsonExt;
    case "yaml":
    case "yml":
      return yamlExt;
    case "toml":
      return tomlExt;
    case "tex":
    case "latex":
    case "sty":
      return stexExt;
    case "agg":
    case "dec":
    case "decl":
      return declSupport; // colorizer + fold service, built eagerly in decl.ts
    default:
      return null; // csv/tsv/txt etc. — plain text (csv also gets the rainbow layer)
  }
}

/** Language for the editor: the first-class types above resolve synchronously; anything
 *  else (rst, C/C++, R, PowerShell, JS/TS, …) falls back to language-data, whose support
 *  loads lazily as a Vite chunk. The description memoizes its own load, so each language
 *  pays the (ms) import once per app run; the hook re-renders when the chunk arrives. */
export function useLanguageFor(path: string): Extension | null {
  const sync = languageForPath(path);
  const filename = path.split(/[\\/]/).pop() ?? path;
  const desc = sync ? null : LanguageDescription.matchFilename(languages, filename);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!desc || desc.support) return;
    let alive = true;
    void desc.load().then(() => {
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [desc]);
  return sync ?? desc?.support ?? null;
}

export const isCsv = (path: string): boolean => /\.(csv|tsv)$/i.test(path);

/** Binary documents Writedown never opens in a tab — routed to the configured external
 *  viewer ([tools] pdf_viewer) instead. */
export const isExternalDoc = (path: string): boolean => /\.(pdf|djvu)$/i.test(path);

/** Images open in the in-app viewer tab: no text is ever read — the asset protocol
 *  streams the bytes — and saveDoc refuses image paths, so the file cannot be written
 *  (spec §2). Keep in sync with IMAGE_EXTS in src-tauri/src/files.rs. */
export const isImageDoc = (path: string): boolean =>
  /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(path);

/** Obviously-binary files: listed in the tree (muted) but inert — never opened as
 *  text; right-click offers Open Externally. Zip stays here by decision (We 3). */
export const isBinaryExt = (path: string): boolean =>
  /\.(exe|dll|msi|bin|obj|pdb|pyc|pyd|wasm|zip|7z|rar|gz|tgz|tar|iso|jar|class|lnk|woff2?|ttf|otf|eot|mp3|mp4|mov|avi|mkv)$/i.test(path);

/** Markdown/Quarto docs get the inline `$…$` / `$$…$$` math layer. */
export const isMarkdownDoc = (path: string): boolean => /\.(md|markdown|qmd)$/i.test(path);
