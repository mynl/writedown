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

export function Preview({ content }: { content: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(md.render(stripFrontmatter(content))),
    [content],
  );
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

  // External links open in the default browser; internal navigation is suppressed.
  function onClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) void openUrl(href).catch(() => {});
  }

  return (
    <div className="preview-scroll" ref={scrollRef} onClick={onClick}>
      <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
