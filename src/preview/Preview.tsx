import { useEffect, useMemo, useRef } from "react";
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

export function Preview({ content, baseDir }: { content: string; baseDir?: string }) {
  const html = useMemo(() => {
    // Process images (apply `{width=… #id}` attributes, rewrite local `src`s to asset
    // URLs) BEFORE sanitizing — DOMPurify would otherwise strip a bare `C:\…` src, and it
    // filters the attributes we set to the safe HTML ones.
    const rendered = md.render(stripFrontmatter(content));
    return DOMPurify.sanitize(processImages(rendered, baseDir));
  }, [content, baseDir]);
  const scrollRef = useRef<HTMLDivElement>(null);

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
