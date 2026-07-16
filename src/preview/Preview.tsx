import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getActiveView, onActiveViewChange } from "../editor/editorView";
import { logError } from "../api";
import { useStore } from "../store";
import type { HighlightStyle } from "@codemirror/language";
import { highlightStyleFor } from "../editor/sublimeTheme";
import { highlightCodeBlocks } from "./codeHighlight";
import { useDebouncedValue } from "../useDebounced";
import type { RenderedBlock, RenderResult } from "./renderCore";

// Markdown→HTML runs OFF the UI thread in a module worker (render.worker.ts →
// renderCore.ts), returning the document as per-block HTML. This file owns the main-
// thread side: sanitizing blocks, patching only changed blocks into the DOM (an edit
// costs ~one block, not a megabytes-scale innerHTML swap), and the post-render
// upgrades (code highlight, mermaid). If the worker can't run, the same renderCore is
// dynamic-imported and run inline — slower, never broken.

let renderWorker: Worker | null = null;
let workerFailed = false;

function getRenderWorker(): Worker | null {
  if (workerFailed) return null;
  if (!renderWorker) {
    try {
      renderWorker = new Worker(new URL("./render.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (e) {
      workerFailed = true;
      void logError("preview render worker failed to start — using inline rendering: " + String(e));
      return null;
    }
  }
  return renderWorker;
}

function failRenderWorker(reason: string) {
  void logError("preview render worker error — switching to inline rendering: " + reason);
  workerFailed = true;
  renderWorker?.terminate();
  renderWorker = null;
}

// Unique across Preview instances (live/rendered tabs swap component identity), so a
// stale worker reply from a previous instance can never be mistaken for the latest.
let renderSeq = 0;

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

// Upgrade ```mermaid / ```{mermaid} blocks (both arrive as `code.language-mermaid`) under
// `root` to rendered SVG. CSS hides the raw <pre>; the strict-mode SVG goes into a sibling
// slot (kept across re-runs so an OS theme change can re-theme it). The SVG is trusted
// mermaid output over the user's own local diagram source, so it is inserted past the
// DOMPurify pass deliberately.
async function upgradeMermaid(
  root: HTMLElement,
  theme: string,
  isCancelled: () => boolean,
): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("pre > code.language-mermaid"));
  if (blocks.length === 0) return;
  let mermaid: MermaidApi;
  try {
    mermaid = await loadMermaid(theme);
  } catch {
    return; // mermaid unavailable — leave blocks hidden rather than crash the preview
  }
  for (const code of blocks) {
    if (isCancelled()) return;
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
        if (isCancelled()) return;
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
    if (isCancelled()) return;
    holder.className = "mermaid-slot mermaid-diagram";
    holder.innerHTML = svg;
    holder.dataset.theme = theme;
    holder.dataset.src = src;
  }
}

// ---- block DOM patching ------------------------------------------------------------

// Sanitized-HTML cache: DOMPurify + image processing run once per (block, folder), not
// once per pass. Keys are content hashes, so cross-document hits are free wins.
const sanitizedCache = new Map<string, string>();
const SANITIZED_CACHE_MAX = 3000;

function setLineAttrs(el: HTMLElement, b: RenderedBlock) {
  el.dataset.lineFrom = String(b.lineFrom);
  el.dataset.lineTo = String(b.lineTo);
}

function makeBlockNode(block: RenderedBlock, baseDir?: string): HTMLElement {
  const ck = (baseDir ?? "") + "\n" + block.key;
  let clean = sanitizedCache.get(ck);
  if (clean === undefined) {
    clean = DOMPurify.sanitize(processImages(block.html, baseDir));
    if (sanitizedCache.size >= SANITIZED_CACHE_MAX) {
      sanitizedCache.delete(sanitizedCache.keys().next().value as string);
    }
    sanitizedCache.set(ck, clean);
  }
  const div = document.createElement("div");
  div.className = "wd-block";
  div.dataset.key = block.key;
  setLineAttrs(div, block);
  div.innerHTML = clean;
  return div;
}

// Blocks inserted per animation frame during a large fill (first open of a big doc).
// Small patches — the every-keystroke case — insert synchronously below.
const INSERT_CHUNK = 64;

/** Reconcile the container's children with `blocks`: trim the common prefix and suffix
 *  by key, then replace only the middle. A within-block edit touches exactly one node;
 *  a first fill streams in rAF chunks so the UI never blocks. `upgrade` runs once per
 *  inserted node (code highlight + mermaid). */
function patchBlocks(
  container: HTMLElement,
  blocks: RenderedBlock[],
  baseDir: string | undefined,
  isStale: () => boolean,
  upgrade: (node: HTMLElement) => void,
) {
  const kids = container.children as HTMLCollectionOf<HTMLElement>;
  let p = 0;
  while (p < kids.length && p < blocks.length && kids[p].dataset.key === blocks[p].key) p++;
  let oEnd = kids.length - 1;
  let nEnd = blocks.length - 1;
  while (oEnd >= p && nEnd >= p && kids[oEnd].dataset.key === blocks[nEnd].key) {
    oEnd--;
    nEnd--;
  }
  for (let k = oEnd; k >= p; k--) kids[k].remove();
  // Stable nodes keep their DOM identity, but an edit above them shifts their source
  // lines — refresh the anchors the outline jump relies on.
  for (let k = 0; k < p; k++) setLineAttrs(kids[k], blocks[k]);
  const suffixCount = blocks.length - 1 - nEnd;
  for (let k = 0; k < suffixCount; k++) setLineAttrs(kids[p + k], blocks[nEnd + 1 + k]);

  const anchor = kids[p] ?? null; // first suffix node; null appends
  let idx = p;
  const insertChunk = () => {
    if (isStale()) return; // a newer patch owns the container; it reconciles whatever exists
    const stop = Math.min(idx + INSERT_CHUNK, nEnd + 1);
    for (; idx < stop; idx++) {
      const node = makeBlockNode(blocks[idx], baseDir);
      container.insertBefore(node, anchor);
      upgrade(node);
    }
    if (idx <= nEnd) requestAnimationFrame(insertChunk);
  };
  insertChunk();
}

// Trailing debounce on the source feeding the renderer — one pass per typing pause, not
// per keystroke. `docKey` resets the delay on document switch so a new tab never
// flashes the previous doc.
const DEBOUNCE_MS = 200;

// Bridge so the outline can drive the preview when NO editor is mounted (preview-only
// view) — jumpToLine targets a destroyed view there and silently does nothing. Mirror of
// editorView's active-view pattern; one preview at a time.
let activePreview: {
  el: HTMLElement;
  content: HTMLElement | null;
  lines: () => number;
} | null = null;

/** Last block starting at or before `line` (blocks are DOM-ordered by source line).
 *  Binary search over dataset attributes — no layout reads. Null when empty. */
function blockAtLine(content: HTMLElement, line: number): HTMLElement | null {
  const kids = content.children as HTMLCollectionOf<HTMLElement>;
  if (kids.length === 0) return null;
  let lo = 0,
    hi = kids.length - 1,
    ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Number(kids[mid].dataset.lineFrom) <= line) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return kids[ans];
}

export function scrollPreviewToLine(line: number) {
  if (!activePreview) return;
  const { el, content } = activePreview;
  const b = content ? blockAtLine(content, line) : null;
  if (content && b) {
    // Exact anchor. Like the editor's jumpToLine, land it near the top — "show me this
    // section". offsetTops are relative to the positioned .preview/.preview-scroll.
    const top = content.offsetTop + b.offsetTop;
    el.scrollTo({ top: Math.max(0, top - el.clientHeight * 0.12) });
    return;
  }
  // No blocks yet (still rendering) — proportional fallback.
  const total = activePreview.lines();
  const frac = total > 1 ? (Math.min(line, total) - 1) / (total - 1) : 0;
  el.scrollTo({ top: frac * (el.scrollHeight - el.clientHeight) });
}

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
  const srcRef = useRef(src);
  srcRef.current = src;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Render off-thread; accept only the reply to the LATEST request (module-unique seq).
  // The result remembers which document it was rendered FOR, so the patch effect can
  // ignore a stale doc's blocks after a tab switch instead of painting them.
  const [result, setResult] = useState<{ docKey: string; blocks: RenderedBlock[] } | null>(null);
  const lastReqRef = useRef(0);
  useEffect(() => {
    const seq = ++renderSeq;
    lastReqRef.current = seq;
    const dk = docKey ?? "";
    const accept = (bs: RenderedBlock[]) => {
      if (lastReqRef.current === seq) setResult({ docKey: dk, blocks: bs });
    };
    const w = getRenderWorker();
    if (w) {
      w.onmessage = (e: MessageEvent<RenderResult>) => {
        if (e.data.seq === lastReqRef.current) {
          setResult({ docKey: e.data.docKey, blocks: e.data.blocks });
        }
      };
      w.onerror = (e) => {
        failRenderWorker(e.message || "unknown worker error");
        void import("./renderCore").then((m) => accept(m.renderDoc(srcRef.current)));
      };
      w.postMessage({ seq, docKey: dk, src });
    } else {
      void import("./renderCore").then((m) => accept(m.renderDoc(src)));
    }
  }, [src, docKey]);

  // Register with the outline→preview bridge (see scrollPreviewToLine above).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    activePreview = {
      el,
      content: contentRef.current,
      lines: () => {
        const s = srcRef.current;
        let n = 1;
        for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
        return n;
      },
    };
    return () => {
      if (activePreview?.el === el) activePreview = null;
    };
  }, []);

  // The editor's current highlight style (Sublime-derived, or the built-in fallback). Shared
  // by identity with the editor, so preview code colors match exactly; a theme switch yields a
  // new instance → the recolor effect below re-runs.
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

  // Patch the DOM whenever a render lands. Theme/dark are read through refs — a theme
  // flip must not force a re-patch (the dedicated effects below recolor in place).
  const styleRef = useRef<HighlightStyle>(highlightStyle);
  styleRef.current = highlightStyle;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const patchGen = useRef(0);
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const dk = docKey ?? "";
    // Document switch: clear IMMEDIATELY (don't wait for the new render) — the
    // "Rendering…" placeholder should stand alone, not float over the old doc. Also a
    // correctness matter: two docs can share an identical block (same content hash)
    // whose relative images resolve against DIFFERENT folders — key-based patching
    // would wrongly keep the old node.
    if (container.dataset.docKey !== dk) {
      container.dataset.docKey = dk;
      container.replaceChildren();
    }
    if (!result || result.docKey !== dk) return; // stale render — the new one is in flight
    const gen = ++patchGen.current;
    const isStale = () => gen !== patchGen.current;
    patchBlocks(container, result.blocks, baseDir, isStale, (node) => {
      void highlightCodeBlocks(node, styleRef.current, isStale).catch((e) => {
        void logError("preview code highlight pass: " + String(e));
      });
      void upgradeMermaid(node, darkRef.current ? "dark" : "default", isStale);
    });
  }, [result, baseDir, docKey]);

  // Theme switch recolors all code blocks in place (cheap via codeHighlight's cache).
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    let cancelled = false;
    void highlightCodeBlocks(container, highlightStyle, () => cancelled).catch((e) => {
      void logError("preview code highlight pass: " + String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [highlightStyle]);

  // OS theme change re-themes existing diagrams in place.
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    let cancelled = false;
    void upgradeMermaid(container, dark ? "dark" : "default", () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [dark]);

  // Bidirectional LINE-ANCHORED scroll sync between editor and preview (spec §15).
  // Proportional mapping drifts badly on heterogeneous docs (a 3-line $$…$$ renders
  // 100+ px tall; dense prose is the reverse) — by mid-document the panes showed
  // different sections. Instead, map the viewport's TOP EDGE through source lines:
  // editor top line → the preview block covering it (blocks carry data-line-from/to),
  // interpolated within the block; and the mirror image coming back. Locally exact, no
  // accumulated drift; the same convention both ways, so the panes don't fight.
  // Proportional remains only as fallback while blocks are still streaming in. A short
  // lock ignores the echo scroll the programmatic scrollTop triggers on the other pane.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    let view: EditorView | null = null;
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
    const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
    // Last block whose top is at or above y — binary search over offsetTops (cheap:
    // O(log n) reads against the positioned .preview, no rects, no forced layout).
    const blockAtY = (y: number): HTMLElement | null => {
      if (!content) return null;
      const kids = content.children as HTMLCollectionOf<HTMLElement>;
      if (kids.length === 0) return null;
      let lo = 0,
        hi = kids.length - 1,
        ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (content.offsetTop + kids[mid].offsetTop <= y) {
          ans = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return kids[ans];
    };
    const fromEditor = () => {
      const sc = scroller;
      const v = view;
      if (!el || !sc || !v || syncing) return;
      const pMax = el.scrollHeight - el.clientHeight;
      if (pMax <= 0) return;
      lock();
      let target: number | null = null;
      if (content && content.children.length > 0) {
        const st = sc.scrollTop;
        const lb = v.lineBlockAtHeight(st);
        const lineFloat =
          v.state.doc.lineAt(lb.from).number +
          (lb.height > 0 ? clamp01((st - lb.top) / lb.height) : 0);
        const b = blockAtLine(content, lineFloat);
        if (b) {
          const from = Number(b.dataset.lineFrom);
          const to = Number(b.dataset.lineTo);
          const within = clamp01((lineFloat - from) / (to - from + 1));
          target = content.offsetTop + b.offsetTop + within * b.offsetHeight;
        }
      }
      el.scrollTop = Math.max(0, Math.min(target ?? frac(sc) * pMax, pMax));
    };
    const fromPreview = () => {
      const sc = scroller;
      const v = view;
      if (!el || !sc || !v || syncing) return;
      const eMax = sc.scrollHeight - sc.clientHeight;
      if (eMax <= 0) return;
      lock();
      let target: number | null = null;
      const b = blockAtY(el.scrollTop);
      if (content && b) {
        const top = content.offsetTop + b.offsetTop;
        const within = clamp01((el.scrollTop - top) / Math.max(1, b.offsetHeight));
        const from = Number(b.dataset.lineFrom);
        const to = Number(b.dataset.lineTo);
        const lineFloat = from + within * (to - from + 1);
        const line = Math.min(v.state.doc.lines, Math.max(1, Math.floor(lineFloat)));
        const lb = v.lineBlockAt(v.state.doc.line(line).from);
        target = lb.top + clamp01(lineFloat - line) * lb.height;
      }
      sc.scrollTop = Math.max(0, Math.min(target ?? frac(el) * eMax, eMax));
    };
    el?.addEventListener("scroll", fromPreview, { passive: true });
    const attach = () => {
      view = getActiveView();
      if (!view) return;
      scroller = view.scrollDOM;
      scroller.addEventListener("scroll", fromEditor, { passive: true });
    };
    attach();
    const off = onActiveViewChange(() => {
      scroller?.removeEventListener("scroll", fromEditor);
      scroller = null;
      view = null;
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

  // First pass for a document (cold KaTeX + worker-chunk load can take a beat on big
  // docs): show a quiet reassurance instead of a silent empty pane. Steady-state
  // re-renders of the same doc keep the current content — no flicker.
  const waiting = !result || result.docKey !== (docKey ?? "");

  return (
    <div className="preview-scroll" ref={scrollRef} onClick={onClick}>
      {waiting && <div className="placeholder">Rendering…</div>}
      <div className="preview" ref={contentRef} />
    </div>
  );
}
