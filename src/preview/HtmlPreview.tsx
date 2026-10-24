// Sealed HTML preview (issue J.11): the page as a browser draws it, with nothing in it able
// to run or reach the network.
//
// Will show: hand-written pages, greater_tables output, saved pages with local CSS and
// images; refreshed about half a second after typing stops; links opened in the default
// browser. Will not: run JavaScript (MathJax stays raw TeX, a Quarto tabset shows its first
// tab, plotly figures and widgets are blank), load anything from the web, or sync scrolling
// line by line.
//
// How it is sealed:
// - `<iframe sandbox="allow-same-origin">` with no `allow-scripts`: no script in the page
//   executes. Same-origin, harmless with scripts off, lets OUR code reach the frame's
//   document for scrolling, link routing and heading lookup. The app's own webview runs
//   with the Tauri bridge, so the page must never be injected into it directly.
// - A `<base href>` at the asset-protocol URL of the file's folder, so relative CSS and
//   images load from disk, and a Content-Security-Policy meta allowing images, styles,
//   fonts and media from that origin, `data:` and inline styles only: nothing reaches the
//   network. Both go in first, ahead of anything the page itself declares.
// - Every `<meta http-equiv="refresh">` is removed, so the page cannot navigate the frame.
import { useEffect, useMemo, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { useDebouncedValue } from "../useDebounced";

/** The page source as the frame gets it: base and CSP first, refresh metas removed.
 *  `baseHref` empty (an unsaved buffer has no folder): no base, so relative URLs simply
 *  fail. Pure, so it can be checked outside the app. */
export function prepareHtml(src: string, baseHref: string, assetOrigin: string): string {
  const csp = [
    "default-src 'none'",
    `img-src ${assetOrigin} data:`,
    `style-src ${assetOrigin} 'unsafe-inline'`,
    `font-src ${assetOrigin} data:`,
    `media-src ${assetOrigin} data:`,
  ].join("; ");
  const head =
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    (baseHref ? `<base href="${baseHref.replace(/"/g, "%22")}">` : "");
  const body = src.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
  // Right after <head>, else right after <html>, else at the very top: the parser puts
  // them in the head either way, ahead of the page's own elements.
  for (const re of [/<head\b[^>]*>/i, /<html\b[^>]*>/i]) {
    const m = re.exec(body);
    if (m) return body.slice(0, m.index + m[0].length) + head + body.slice(m.index + m[0].length);
  }
  return head + body;
}

/** The asset-protocol URL prefix ("http://asset.localhost/" on Windows). */
const assetPrefix = () => convertFileSrc("");

/** The asset-protocol URL of a folder, built segment by segment. `convertFileSrc` encodes
 *  the whole path as ONE segment (`C%3A%5Cdocs`), against which a relative URL resolves at
 *  the host root; the protocol percent-decodes the path, so `C%3A/docs/` works instead. */
export function assetFolderUrl(dir: string): string {
  const segs = dir.replace(/[\\/]+$/, "").split(/[\\/]/).map(encodeURIComponent).join("/");
  return assetPrefix() + segs + "/";
}

// The frame on screen, for the outline (one preview at a time, like the editor view).
let currentFrame: HTMLIFrameElement | null = null;

/** Scroll the preview to an outline heading (issue J.11): the `seq`-th h1 to h6 element of
 *  the page, confirmed by its text; when the source scan and the page disagree (a heading
 *  split across lines is in the page but not in the outline), the first element with that
 *  text instead. */
export function scrollHtmlPreviewTo(text: string, seq: number): void {
  const d = currentFrame?.contentDocument;
  if (!d) return;
  const all = Array.from(d.querySelectorAll("h1, h2, h3, h4, h5, h6"));
  const norm = (e: Element) => (e.textContent ?? "").replace(/\s+/g, " ").trim();
  const target = all[seq] && norm(all[seq]) === text ? all[seq] : all.find((e) => norm(e) === text) ?? all[seq];
  target?.scrollIntoView({ block: "start" });
}

/** Links in the page: http, https and mailto go to the default browser; `#fragment`
 *  scrolls within the page; everything else (a local file through the asset origin,
 *  `javascript:`, `file:`) does nothing. The frame itself never navigates. */
function routeClick(e: MouseEvent, assetOrigin: string): void {
  const t = e.target as { closest?: (sel: string) => Element | null } | null;
  const a = t?.closest?.("a[href]") as HTMLAnchorElement | null | undefined;
  if (!a) return;
  e.preventDefault();
  const raw = a.getAttribute("href") ?? "";
  if (raw.startsWith("#")) {
    const id = decodeURIComponent(raw.slice(1));
    const d = a.ownerDocument;
    (d.getElementById(id) ?? d.getElementsByName(id)[0])?.scrollIntoView({ block: "start" });
    return;
  }
  let url: URL;
  try {
    url = new URL(a.href);
  } catch {
    return;
  }
  const web = (url.protocol === "http:" || url.protocol === "https:") && url.origin !== assetOrigin;
  if (web || url.protocol === "mailto:") {
    void openUrl(url.href).catch((err) => useStore.setState({ lastError: `open link — ${String(err)}` }));
  }
}

export function HtmlPreview({ content, docKey, baseDir }: { content: string; docKey: string; baseDir?: string }) {
  // Half a second after typing stops; a tab switch (docKey) shows at once.
  const src = useDebouncedValue(content, 500, docKey);
  const assetOrigin = assetPrefix().replace(/\/$/, "");
  const doc = useMemo(
    () => prepareHtml(src, baseDir ? assetFolderUrl(baseDir) : "", assetOrigin),
    [src, baseDir, assetOrigin],
  );
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The frame's scroll position, kept across the reload each edit causes.
  const scrollY = useRef(0);
  useEffect(() => {
    scrollY.current = 0; // a different document starts at the top
  }, [docKey]);
  useEffect(() => {
    currentFrame = frameRef.current;
    return () => {
      if (currentFrame === frameRef.current) currentFrame = null;
    };
  }, []);

  const onLoad = () => {
    const w = frameRef.current?.contentWindow;
    const d = frameRef.current?.contentDocument;
    if (!w || !d) return;
    w.scrollTo(0, scrollY.current);
    w.addEventListener("scroll", () => (scrollY.current = w.scrollY), { passive: true });
    d.addEventListener("click", (e) => routeClick(e, assetOrigin));
  };

  return (
    <iframe
      ref={frameRef}
      className="html-preview"
      title="HTML preview"
      sandbox="allow-same-origin"
      srcDoc={doc}
      onLoad={onLoad}
    />
  );
}
