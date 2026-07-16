import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownIt from "markdown-it";
// @ts-ignore - no bundled types
import footnote from "markdown-it-footnote";
// @ts-ignore - no bundled types
import taskLists from "markdown-it-task-lists";
// @ts-ignore - no bundled types
import texmath from "markdown-it-texmath";
import katex from "katex";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getActiveView, onActiveViewChange } from "../editor/editorView";
import { logError } from "../api";
import { useStore } from "../store";
import { highlightStyleFor } from "../editor/sublimeTheme";
import { highlightCodeBlocks } from "./codeHighlight";
import { useDebouncedValue } from "../useDebounced";

// html:true renders raw HTML (tables, divs, Quarto blocks); DOMPurify then strips
// scripts/handlers AND HTML comments, so `<!-- … -->` never shows and code can't run
// (spec §15). LaTeX math is rendered with KaTeX.
const md: MarkdownIt = new MarkdownIt({ html: true, linkify: true, typographer: true })
  .use(footnote)
  .use(taskLists, { enabled: true, label: true })
  .use(texmath, {
    engine: katex,
    delimiters: "dollars",
    katexOptions: { throwOnError: false },
  });

function stripFrontmatter(src: string): string {
  return src.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

// Resolve a document-relative image src (`img/x.png`, `./fig/y.svg`) against the doc's
// folder and hand it to Tauri's asset protocol so the webview can load it off disk.
// Returns null for anything already loadable — absolute URLs, `data:`/`blob:`, an
// absolute path, or a `scheme:` — which is left untouched. Never touches the file itself.
function resolveAssetSrc(src: string, baseDir: string): string | null {
  // markdown-it percent-encodes the parts of a path it doesn't keep literal — notably `\`
  // → `%5C` (and spaces → `%20`). Decode so the tests below see the real path.
  let s = src;
  try {
    s = decodeURIComponent(src);
  } catch {
    /* malformed %-sequence — fall back to the raw src */
  }
  // A Windows absolute path (`C:\…`, `C:/…`) or UNC (`\\host\…`) is already absolute —
  // send it straight through the asset protocol. This MUST come before the scheme check:
  // a bare drive letter (`C:`) looks exactly like a URL scheme, which is why absolute
  // paths silently failed to load before.
  if (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith("\\\\")) {
    return convertFileSrc(s.replace(/\//g, "\\"));
  }
  // Anything else already loadable is left untouched: a real URL scheme (http(s)/data/
  // blob/asset/…), a protocol-relative `//host`, or a posix-absolute `/path`.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//") || s.startsWith("/")) {
    return null;
  }
  // Document-relative: join against the doc folder and collapse `.`/`..` (asset won't).
  const out: string[] = [];
  for (const seg of `${baseDir}/${s}`.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return convertFileSrc(out.join("\\"));
}

// Apply a Pandoc/Quarto attribute block written after an image — `![](p){width=50% #fig-x
// .cls}` — onto the <img>, in ANY token order, then strip it from the text. Only standard
// HTML attributes (width/height/id/class) survive the DOMPurify pass that runs next;
// anything else (e.g. `fig-align`) is set but dropped by the sanitizer — i.e. silently
// ignored, on purpose. See README "Limitations". `width=50%` renders because WebView2
// honors a percentage on the img width attribute.
function applyTrailingAttrs(img: Element): boolean {
  const next = img.nextSibling;
  if (!next || next.nodeType !== Node.TEXT_NODE) return false;
  const text = next.textContent ?? "";
  const m = /^\s*\{([^}]*)\}/.exec(text);
  if (!m) return false;
  let applied = false;
  for (const tok of m[1].trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok.startsWith("#")) {
      img.setAttribute("id", tok.slice(1));
    } else if (tok.startsWith(".")) {
      img.classList.add(tok.slice(1));
    } else {
      const eq = tok.indexOf("=");
      if (eq <= 0) continue;
      img.setAttribute(tok.slice(0, eq), tok.slice(eq + 1).replace(/^["']|["']$/g, ""));
    }
    applied = true;
  }
  if (applied) next.textContent = text.replace(/^\s*\{[^}]*\}/, "");
  return applied;
}

// Post-process the rendered images: apply any trailing `{…}` attribute block (both tabs),
// and rewrite local `src`s to Tauri asset URLs (only when we know the doc's folder). Runs
// BEFORE DOMPurify so the sanitizer sees an allowed `http://asset.localhost/…` URL rather
// than a bare `C:\…` path (a drive letter reads as an unknown scheme and would be stripped)
// and so the attributes we set are filtered by it. An inert DOMParser fires no requests.
function processImages(html: string, baseDir?: string): string {
  if (!html.includes("<img")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  doc.querySelectorAll("img").forEach((img) => {
    if (applyTrailingAttrs(img)) changed = true;
    if (baseDir) {
      const rewritten = resolveAssetSrc(img.getAttribute("src") ?? "", baseDir);
      if (rewritten) {
        img.setAttribute("src", rewritten);
        changed = true;
      }
    }
  });
  return changed ? doc.body.innerHTML : html;
}

// ---- mermaid (lazy) --------------------------------------------------------------------
// Mermaid is ~2.8 MB, so it is dynamic-import()ed — it loads only when a document actually
// contains a diagram, as its own Vite chunk, and never touches app startup. Rendered SVG is
// cached by theme+source so editing prose around an unchanged diagram doesn't re-run it.
type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, src: string) => Promise<{ svg: string }>;
};
let mermaidMod: MermaidApi | null = null;
let mermaidTheme: string | null = null;
const mermaidCache = new Map<string, string>();
let mermaidSeq = 0;

async function loadMermaid(theme: string): Promise<MermaidApi> {
  if (!mermaidMod) {
    mermaidMod = (await import("mermaid")).default as unknown as MermaidApi;
  }
  if (mermaidTheme !== theme) {
    // securityLevel "strict" runs mermaid's own sanitizer over the diagram output.
    mermaidMod.initialize({ startOnLoad: false, securityLevel: "strict", theme });
    mermaidTheme = theme;
  }
  return mermaidMod;
}

// Trailing debounce on the source feeding the render pipeline. The full pass below
// (markdown-it + KaTeX + DOMPurify + innerHTML swap → WebView2 relayout) is far too heavy
// to run per keystroke — it runs once per typing pause instead. `docKey` resets the delay
// on document switch so a new tab never flashes the previous doc.
const DEBOUNCE_MS = 200;

export function Preview({
  content,
  baseDir,
  docKey,
}: {
  content: string;
  baseDir?: string;
  docKey?: string;
}) {
  const src = useDebouncedValue(content, DEBOUNCE_MS, docKey);
  const html = useMemo(() => {
    // Process images (apply `{width=… #id}` attributes, rewrite local `src`s to asset
    // URLs) BEFORE sanitizing — DOMPurify would otherwise strip a bare `C:\…` src, and it
    // filters the attributes we set to the safe HTML ones.
    const rendered = md.render(stripFrontmatter(src));
    return DOMPurify.sanitize(processImages(rendered, baseDir));
  }, [src, baseDir]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The editor's current highlight style (Sublime-derived, or the built-in fallback). Shared
  // by identity with the editor, so preview code colors match exactly; a theme switch yields a
  // new instance → the highlight effect below re-runs and recolors.
  const st = useStore((s) => s.sublimeTheme);
  const highlightStyle = useMemo(() => highlightStyleFor(st), [st]);

  // Detected OS color scheme; mermaid diagrams re-render to match when it changes.
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Upgrade ```mermaid / ```{mermaid} blocks (both arrive as `code.language-mermaid`) to
  // rendered SVG. Runs after the sanitized HTML is in the DOM; CSS hides the raw <pre> and
  // the strict-mode SVG is inserted into a sibling slot (kept across re-runs so an OS theme
  // change can re-theme it). The SVG is trusted mermaid output over the user's own local
  // diagram source, so it is inserted past the DOMPurify pass deliberately.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>("pre > code.language-mermaid"),
    );
    if (blocks.length === 0) return;
    const theme = dark ? "dark" : "default";
    let cancelled = false;
    void (async () => {
      let mermaid: MermaidApi;
      try {
        mermaid = await loadMermaid(theme);
      } catch {
        return; // mermaid unavailable — leave blocks hidden rather than crash the preview
      }
      for (const code of blocks) {
        if (cancelled) return;
        const pre = code.parentElement;
        if (!pre) continue;
        const src = code.textContent ?? "";
        let holder = pre.nextElementSibling as HTMLElement | null;
        if (!holder || !holder.classList.contains("mermaid-slot")) {
          holder = document.createElement("div");
          holder.className = "mermaid-slot";
          pre.after(holder);
        }
        if (holder.dataset.theme === theme && holder.dataset.src === src) continue;
        const key = `${theme}\n${src}`;
        let svg = mermaidCache.get(key);
        if (svg === undefined) {
          try {
            svg = (await mermaid.render(`wd-mermaid-${++mermaidSeq}`, src)).svg;
            mermaidCache.set(key, svg);
          } catch (e) {
            if (cancelled) return;
            holder.className = "mermaid-slot mermaid-error";
            holder.textContent = `Mermaid: ${e instanceof Error ? e.message : String(e)}`;
            const srcEl = document.createElement("pre");
            srcEl.textContent = src;
            holder.appendChild(srcEl);
            holder.dataset.theme = theme;
            holder.dataset.src = src;
            continue;
          }
        }
        if (cancelled) return;
        holder.className = "mermaid-slot mermaid-diagram";
        holder.innerHTML = svg;
        holder.dataset.theme = theme;
        holder.dataset.src = src;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [html, dark]);

  // Syntax-highlight fenced code blocks to match the editor's Sublime colours. Runs after the
  // sanitized HTML is mounted (like the mermaid upgrade); reuses the editor's HighlightStyle +
  // Lezer parsers. Re-runs on every content change (cheap via cache) and on theme switch
  // (highlightStyle identity changes → recolor). Skips mermaid; never throws.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let cancelled = false;
    void highlightCodeBlocks(root, highlightStyle, () => cancelled).catch((e) => {
      void logError("preview code highlight pass: " + String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [html, highlightStyle]);

  // Bidirectional proportional scroll sync between editor and preview (spec §15). A short
  // lock ignores the echo scroll the programmatic scrollTop triggers on the other pane.
  useEffect(() => {
    const el = scrollRef.current;
    let scroller: HTMLElement | null = null;
    let syncing = false;
    const lock = () => {
      syncing = true;
      setTimeout(() => (syncing = false), 40);
    };
    const frac = (node: HTMLElement) => {
      const max = node.scrollHeight - node.clientHeight;
      return max > 0 ? node.scrollTop / max : 0;
    };
    const fromEditor = () => {
      const sc = scroller;
      if (!el || !sc || syncing) return;
      const pMax = el.scrollHeight - el.clientHeight;
      if (pMax <= 0) return;
      lock();
      el.scrollTop = frac(sc) * pMax;
    };
    const fromPreview = () => {
      const sc = scroller;
      if (!el || !sc || syncing) return;
      const eMax = sc.scrollHeight - sc.clientHeight;
      if (eMax <= 0) return;
      lock();
      sc.scrollTop = frac(el) * eMax;
    };
    el?.addEventListener("scroll", fromPreview, { passive: true });
    const attach = () => {
      const view = getActiveView();
      if (!view) return;
      scroller = view.scrollDOM;
      scroller.addEventListener("scroll", fromEditor, { passive: true });
    };
    attach();
    const off = onActiveViewChange(() => {
      scroller?.removeEventListener("scroll", fromEditor);
      scroller = null;
      attach();
    });
    return () => {
      off();
      el?.removeEventListener("scroll", fromPreview);
      scroller?.removeEventListener("scroll", fromEditor);
    };
  }, []);

  // External links open in the default browser; `#anchor` links (citations, crossrefs,
  // footnotes) scroll within the preview; all other navigation is suppressed.
  function onClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      void openUrl(href).catch(() => {});
    } else if (href.startsWith("#") && href.length > 1) {
      scrollRef.current
        ?.querySelector("#" + CSS.escape(href.slice(1)))
        ?.scrollIntoView({ block: "start" });
    }
  }

  return (
    <div className="preview-scroll" ref={scrollRef} onClick={onClick}>
      <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
