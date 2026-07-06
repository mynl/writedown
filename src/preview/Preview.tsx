import { useEffect, useMemo, useRef } from "react";
import MarkdownIt from "markdown-it";
// @ts-ignore - no bundled types
import footnote from "markdown-it-footnote";
// @ts-ignore - no bundled types
import taskLists from "markdown-it-task-lists";
// @ts-ignore - no bundled types
import texmath from "markdown-it-texmath";
import katex from "katex";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getActiveView, onActiveViewChange } from "../editor/editorView";

// Preview renders the source without modifying it (spec §15). html:false keeps raw HTML
// escaped so the preview can't execute code. LaTeX math is rendered with KaTeX.
const md: MarkdownIt = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(footnote)
  .use(taskLists, { enabled: true, label: true })
  .use(texmath, {
    engine: katex,
    delimiters: "dollars", // $…$ inline, $$…$$ display
    katexOptions: { throwOnError: false },
  });

function stripFrontmatter(src: string): string {
  return src.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function Preview({ content }: { content: string }) {
  const html = useMemo(() => md.render(stripFrontmatter(content)), [content]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync the preview scroll to the editor's, proportionally (spec §15).
  useEffect(() => {
    let scroller: HTMLElement | null = null;
    const onScroll = () => {
      const el = scrollRef.current;
      if (!el || !scroller) return;
      const eMax = scroller.scrollHeight - scroller.clientHeight;
      const pMax = el.scrollHeight - el.clientHeight;
      if (eMax <= 0 || pMax <= 0) return;
      el.scrollTop = (scroller.scrollTop / eMax) * pMax;
    };
    const attach = () => {
      const view = getActiveView();
      if (!view) return;
      scroller = view.scrollDOM;
      scroller.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    };
    attach();
    const off = onActiveViewChange(() => {
      scroller?.removeEventListener("scroll", onScroll);
      scroller = null;
      attach();
    });
    return () => {
      off();
      scroller?.removeEventListener("scroll", onScroll);
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
