import { useMemo } from "react";
import MarkdownIt from "markdown-it";
// @ts-ignore - no bundled types
import footnote from "markdown-it-footnote";
// @ts-ignore - no bundled types
import taskLists from "markdown-it-task-lists";
import { openUrl } from "@tauri-apps/plugin-opener";

// Preview renders the source without modifying it (spec §15). html:false keeps raw HTML
// escaped so the preview can't execute code. Math (KaTeX), image resolution, and sync
// scroll are follow-ups.
const md: MarkdownIt = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(footnote)
  .use(taskLists, { enabled: true, label: true });

function stripFrontmatter(src: string): string {
  return src.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function Preview({ content }: { content: string }) {
  const html = useMemo(() => md.render(stripFrontmatter(content)), [content]);

  // External links open in the default browser; internal navigation is suppressed so the
  // webview never leaves the app (spec §15).
  function onClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) void openUrl(href).catch(() => {});
  }

  return (
    <div className="preview-scroll" onClick={onClick}>
      <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
