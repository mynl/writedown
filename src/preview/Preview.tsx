import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getActiveView, onActiveViewChange } from "../editor/editorView";
import { logError, openExternal } from "../api";
import { isBinaryExt } from "../editor/languages";
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

// Resolve a link href to a local filesystem path so a click can open the file (issue
// We/2.2.0). Returns the RAW absolute path (not an asset URL — that path is handed to
// openFile/openExternal, which read/route it), or null for anything that is NOT a local
// file: real URL schemes (http/https/mailto/…), protocol-relative `//host`, posix-absolute
// `/path`, and pure `#anchor` links (handled separately in onClick). Mirrors resolveAssetSrc:
// a bare drive letter (`C:`) looks like a URL scheme, so the Windows-absolute test comes
// first. Never touches the file itself.
function resolveLocalPath(href: string, baseDir?: string): string | null {
  let s = href;
  try {
    s = decodeURIComponent(href);
  } catch {
    /* malformed %-sequence — fall back to the raw href */
  }
  if (!s || s.startsWith("#")) return null; // in-page anchor — onClick scrolls it
  const isAbsWin = /^[a-zA-Z]:[\\/]/.test(s) || s.startsWith("\\\\");
  // A real scheme / `//host` / posix-absolute is not a local file — but a drive letter
  // (`C:`) matches the scheme pattern, so exclude the Windows-absolute case first.
  if (!isAbsWin && (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//") || s.startsWith("/"))) {
    return null;
  }
  // We open the file, not a sub-location: drop a trailing `#fragment` (e.g. notes.md#sec).
  const hash = s.indexOf("#");
  if (hash > 0) s = s.slice(0, hash);
  if (isAbsWin) return s.replace(/\//g, "\\");
  if (!baseDir) return null; // relative link with no doc folder (scratch buffer)
  const out: string[] = [];
  for (const seg of `${baseDir}/${s}`.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("\\");
}

// Stash the resolved local-file target of each link in `data-wd-file` so onClick can open
// it. Runs BEFORE DOMPurify (like processImages) because a bare `C:\…` href reads as an
// unknown scheme and would be stripped by the sanitizer — but data-* attributes survive it.
// http(s)/`#`/mailto links are left untouched (onClick already handles the first two).
function processLinks(html: string, baseDir?: string): string {
  if (!html.includes("<a")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  doc.querySelectorAll("a").forEach((a) => {
    const local = resolveLocalPath(a.getAttribute("href") ?? "", baseDir);
    if (local) {
      a.setAttribute("data-wd-file", local);
      changed = true;
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
    clean = DOMPurify.sanitize(processLinks(processImages(block.html, baseDir), baseDir));
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

// Per-frame time budget for a large fill (first open of a big doc). Fixed-count chunks
// ran long on first open — each block also pays its one-time DOMPurify sanitize there —
// leaving the UI dead for the first second. Budgeted frames stay interactive; the
// every-keystroke case (a block or two) still completes in the first synchronous pass.
const FRAME_BUDGET_MS = 8;

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
  onDone: () => void,
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
    const start = performance.now();
    while (idx <= nEnd) {
      const node = makeBlockNode(blocks[idx], baseDir);
      container.insertBefore(node, anchor);
      upgrade(node);
      idx++;
      if (performance.now() - start > FRAME_BUDGET_MS) break;
    }
    if (idx <= nEnd) requestAnimationFrame(insertChunk);
    else onDone(); // fires exactly once — never on a stale abort
  };
  insertChunk();
}

// Trailing debounce on the source feeding the renderer — one pass per typing pause, not
// per keystroke. `docKey` resets the delay on document switch so a new tab never
// flashes the previous doc.
const DEBOUNCE_MS = 200;

// ---- expanded ↔ source line mapping (Rendered view) -------------------------------
// The build splices cell output, a title, and a References section into the markdown,
// so rendered blocks carry EXPANDED line numbers while the editor speaks SOURCE lines.
// `lineMap[i]` (expanded line i+1) = source line, or 0 for synthetic content, which
// inherits its nearest real neighbor above (below when at the very top).
function expToSrc(map: number[], exp: number): number | null {
  if (map.length === 0) return null;
  const start = Math.min(map.length - 1, Math.max(0, Math.floor(exp) - 1));
  for (let i = start; i >= 0; i--) if (map[i] !== 0) return map[i];
  for (let i = start + 1; i < map.length; i++) if (map[i] !== 0) return map[i];
  return null;
}
/** First expanded line whose source line reaches `src` (source values are ordered). */
function srcToExp(map: number[], src: number): number | null {
  const want = Math.max(1, Math.floor(src));
  for (let i = 0; i < map.length; i++) {
    if (map[i] !== 0 && map[i] >= want) return i + 1;
  }
  return null;
}

// Bridge so the outline can drive the preview when NO editor is mounted (preview-only
// view) — jumpToLine targets a destroyed view there and silently does nothing. Mirror of
// editorView's active-view pattern; one preview at a time.
let activePreview: {
  el: HTMLElement;
  content: HTMLElement | null;
  lines: () => number;
  /** Rendered view's expanded→source map; null for the live preview. */
  map: () => number[] | null;
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

// Long jumps land on ESTIMATED positions: `content-visibility: auto` blocks report
// estimated heights until first rendered, so after the jump the blocks near the target
// render, layout shifts, and the target slides away (the "wrong on first click, right
// on second" symptom). Settle: re-verify the target for a few frames and nudge until
// stable. A newer jump supersedes; ~8 frames bounds the cost.
let previewSettleSeq = 0;
const SETTLE_FRAMES = 8;
// The build id (`ren.at`) whose one-time "open at your Ctrl+B spot" scroll has already
// run — module-level so a Preview remount (a Preview↔Rendered switch) doesn't replay a
// stale build position (issue 6). Reset lazily as new build ids arrive.
let consumedBuildKey: number | null = null;
// Programmatic preview scrolls (scrollPreviewToLine — outline click, build/tab/mode sync)
// must NOT echo back into the editor via the preview→editor scroll handler: the editor is
// the anchor and must not move (issue 8). This timestamp marks how long `fromPreview`
// should treat incoming scroll events as our own and ignore them; refreshed on every
// programmatic scroll (including each settle frame, which outlives the stale() window).
let ignorePreviewScrollUntil = 0;

export function scrollPreviewToLine(line: number) {
  if (!activePreview) return;
  const { el, content } = activePreview;
  // Rendered view: callers pass SOURCE lines — translate to expanded coordinates.
  const m = activePreview.map();
  if (m && m.length > 0) {
    line = srcToExp(m, line) ?? m.length;
  }
  const compute = (): number | null => {
    const b = content ? blockAtLine(content, line) : null;
    if (!content || !b) return null;
    // Exact anchor. Like the editor's jumpToLine, land it near the top — "show me this
    // section". offsetTops are relative to the positioned .preview/.preview-scroll.
    return Math.max(0, content.offsetTop + b.offsetTop - el.clientHeight * 0.12);
  };
  // Suppress the preview→editor echo for the whole settle (see the flag's comment).
  const mark = () => (ignorePreviewScrollUntil = performance.now() + 200);
  const first = compute();
  if (first == null) {
    // No blocks yet (still rendering) — proportional fallback.
    const total = activePreview.lines();
    const frac = total > 1 ? (Math.min(line, total) - 1) / (total - 1) : 0;
    mark();
    el.scrollTo({ top: frac * (el.scrollHeight - el.clientHeight) });
    return;
  }
  mark();
  el.scrollTop = first;
  const id = ++previewSettleSeq;
  let tries = 0;
  const step = () => {
    if (id !== previewSettleSeq || tries++ >= SETTLE_FRAMES) return;
    const y = compute();
    if (y != null && Math.abs(el.scrollTop - y) > 1) {
      mark();
      el.scrollTop = y;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function Preview({
  content,
  baseDir,
  docKey,
  lineMap,
  initialSourceLine,
  initialKey,
}: {
  content: string;
  baseDir?: string;
  docKey?: string;
  /** Rendered view: expanded→source line map from the build (see render.rs). */
  lineMap?: number[];
  /** Rendered view: scroll here (a SOURCE line) once per `initialKey` (the build id). */
  initialSourceLine?: number | null;
  initialKey?: number;
}) {
  const src = useDebouncedValue(content, DEBOUNCE_MS, docKey);
  const srcRef = useRef(src);
  srcRef.current = src;
  // Live (undebounced) content, plus the src whose render the DOM currently shows and
  // when it landed. Block line-ranges are only trustworthy for scroll sync when the
  // rendered src IS the live content — while they diverge (typing: debounce + render
  // in flight) a sync maps against stale ranges, falls off the end, and clamps to an
  // extreme (the mid-edit jump to bottom/top). The sync effect checks these refs.
  const liveRef = useRef(content);
  liveRef.current = content;
  const renderedSrcRef = useRef<string | null>(null);
  const patchedAtRef = useRef(0);
  const lineMapRef = useRef<number[] | null>(null);
  lineMapRef.current = lineMap && lineMap.length > 0 ? lineMap : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Render off-thread; accept only the reply to the LATEST request (module-unique seq).
  // The result remembers which document it was rendered FOR, so the patch effect can
  // ignore a stale doc's blocks after a tab switch instead of painting them — and the
  // SRC that produced it, so the completion stamp below marks the DOM in sync with the
  // text these blocks actually came from (not whatever is live by then, issue Sa 8).
  const [result, setResult] = useState<{
    docKey: string;
    blocks: RenderedBlock[];
    src: string;
  } | null>(null);
  const lastReqRef = useRef(0);
  useEffect(() => {
    const seq = ++renderSeq;
    lastReqRef.current = seq;
    const dk = docKey ?? "";
    // seq === lastReqRef.current guarantees the reply belongs to THIS effect run, so
    // the closure's `src` is exactly the text that was rendered.
    const accept = (bs: RenderedBlock[]) => {
      if (lastReqRef.current === seq) setResult({ docKey: dk, blocks: bs, src });
    };
    const w = getRenderWorker();
    if (w) {
      w.onmessage = (e: MessageEvent<RenderResult>) => {
        if (e.data.seq === lastReqRef.current) {
          setResult({ docKey: e.data.docKey, blocks: e.data.blocks, src });
        }
      };
      w.onerror = (e) => {
        failRenderWorker(e.message || "unknown worker error");
        void import("./renderCore").then((m) => accept(m.renderDoc(src)));
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
      map: () => lineMapRef.current,
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
  // Set when the CURRENT doc's blocks have fully streamed in (patchBlocks completed);
  // the tick re-runs the one-shot sync effect below at that moment.
  const patchDoneKey = useRef<string | null>(null);
  const [patchedTick, setPatchedTick] = useState(0);
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
      renderedSrcRef.current = null; // nothing rendered for this doc yet
      patchDoneKey.current = null;
    }
    if (!result || result.docKey !== dk) return; // stale render — the new one is in flight
    const gen = ++patchGen.current;
    const isStale = () => gen !== patchGen.current;
    patchBlocks(
      container,
      result.blocks,
      baseDir,
      isStale,
      (node) => {
        void highlightCodeBlocks(node, styleRef.current, isStale).catch((e) => {
          void logError("preview code highlight pass: " + String(e));
        });
        void upgradeMermaid(node, darkRef.current ? "dark" : "default", isStale);
      },
      () => {
        // Completion stamps (issue Sa 8). These used to be written when streaming
        // STARTED, so stale() expired while a big doc's blocks were still landing and
        // both sync directions re-armed against a half-built DOM. Stamped here, at
        // completion, stale() covers the entire stream — and with the src that
        // PRODUCED these blocks, which is not the live src if the user typed
        // mid-stream.
        renderedSrcRef.current = result.src;
        patchedAtRef.current = performance.now();
        patchDoneKey.current = dk;
        setPatchedTick((t) => t + 1);
      },
    );
  }, [result, baseDir, docKey]);

  // Sync the preview to the editor's position when a render lands — not only on scroll
  // events (issues 6 & 8). Three triggers, one effect, all after the current doc's blocks
  // are patched in: (a) a fresh build opens at the spot you pressed Ctrl+B from (issue 4,
  // preserved via initialSourceLine, consumed once per build GLOBALLY so a later
  // Preview↔Rendered remount doesn't replay a stale build position); (b) a tab switch
  // (docKey change, issue 8) and (c) a Preview↔Rendered switch (this component remounts,
  // issue 6) both re-sync to the editor's CURRENT top line. The docKey guard fires it once
  // per doc since mount — never on the debounced re-renders while you type (which must not
  // yank the preview) and never in preview-only mode (no live editor to read).
  const syncedDocKey = useRef<string | null>(null);
  useEffect(() => {
    const dk = docKey ?? "";
    if (!result || result.docKey !== dk) return; // this doc's render hasn't landed yet
    if (patchDoneKey.current !== dk) return; // blocks still streaming — the tick re-runs us
    // (a) fresh build → honor the build-time editor position, once per build.
    if (initialKey != null && initialSourceLine != null && consumedBuildKey !== initialKey) {
      consumedBuildKey = initialKey;
      syncedDocKey.current = dk;
      scrollPreviewToLine(initialSourceLine); // source→expanded via the map
      return;
    }
    // (b)/(c) mount / mode-switch / tab-switch → sync to the editor's top line, ONE
    // go. One rAF first: the editor's own line-anchored restore (dispatched in its
    // switch effect) applies in CM's measure phase — read the top line after it lands.
    if (syncedDocKey.current === dk) return; // already synced this doc since mount
    syncedDocKey.current = dk;
    const raf = requestAnimationFrame(() => {
      const view = getActiveView();
      if (!view || !view.dom.isConnected) return; // preview-only: no live editor to read
      const lb = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      scrollPreviewToLine(view.state.doc.lineAt(lb.from).number);
    });
    return () => cancelAnimationFrame(raf);
  }, [result, docKey, initialKey, initialSourceLine, patchedTick]);

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
    // Sync is only allowed when the rendered blocks correspond to the live document.
    // While stale (typing → debounce/render in flight, or right after a DOM patch),
    // both directions stand down: the editor must not drag the preview against wrong
    // ranges, and preview DOM churn must not rewrite the editor's scrollTop.
    const stale = () =>
      renderedSrcRef.current !== liveRef.current ||
      performance.now() - patchedAtRef.current < 150;
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
    // Editor position → preview y, reading the CURRENT editor scrollTop each call (the
    // settle loop below re-evaluates it as estimated block heights become real).
    const editorToPreviewY = (): number | null => {
      const sc = scroller;
      const v = view;
      if (!sc || !v || !content || content.children.length === 0) return null;
      const st = sc.scrollTop;
      const lb = v.lineBlockAtHeight(st);
      let lineFloat =
        v.state.doc.lineAt(lb.from).number +
        (lb.height > 0 ? clamp01((st - lb.top) / lb.height) : 0);
      // Rendered view: editor lines are SOURCE lines; blocks carry EXPANDED lines.
      const m = lineMapRef.current;
      if (m) {
        const e = srcToExp(m, lineFloat);
        if (e == null) return null;
        lineFloat = e;
      }
      const b = blockAtLine(content, lineFloat);
      if (!b) return null;
      const from = Number(b.dataset.lineFrom);
      const to = Number(b.dataset.lineTo);
      const within = clamp01((lineFloat - from) / (to - from + 1));
      return content.offsetTop + b.offsetTop + within * b.offsetHeight;
    };
    // After a big jump (outline click → jumpToLine) the preview target is computed
    // from estimated block heights — settle for a few frames (same reasoning as
    // scrollPreviewToLine). Each correction re-arms the echo lock; any new editor
    // scroll event supersedes the loop by starting a fresh one.
    let settleId = 0;
    const settlePreview = () => {
      const id = ++settleId;
      let tries = 0;
      const step = () => {
        // stale(): if an edit lands mid-settle, stop — re-asserting against ranges
        // that no longer match the buffer is what pinned the preview to the bottom.
        if (id !== settleId || tries++ >= SETTLE_FRAMES || !el || stale()) return;
        const y = editorToPreviewY();
        if (y != null) {
          const t = Math.max(0, Math.min(y, el.scrollHeight - el.clientHeight));
          if (Math.abs(el.scrollTop - t) > 1) {
            lock();
            el.scrollTop = t;
          }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const fromEditor = () => {
      const sc = scroller;
      if (!el || !sc || !view || syncing || stale()) return;
      const pMax = el.scrollHeight - el.clientHeight;
      if (pMax <= 0) return;
      lock();
      const y = editorToPreviewY();
      el.scrollTop = Math.max(0, Math.min(y ?? frac(sc) * pMax, pMax));
      if (y != null) settlePreview();
    };
    // Preview→editor writeback requires a real user gesture ON the preview (issue Sa
    // 8): wheel / pointer (incl. scrollbar drag) / touch / keys within the last 1.5 s,
    // refreshed while the resulting scroll keeps flowing (momentum, drag). Programmatic
    // churn — block streaming, content-visibility anchoring, settle corrections — can
    // never OPEN the window, so it can never move the editor: the structural guarantee
    // the timing guards alone couldn't give. The editor→preview direction stays
    // ungated (outline jumps must keep dragging the preview).
    let gestureUntil = 0;
    const gesture = () => {
      gestureUntil = performance.now() + 1500;
    };
    const gestureEvents = ["wheel", "pointerdown", "touchstart", "keydown"] as const;
    for (const g of gestureEvents) el?.addEventListener(g, gesture, { passive: true });
    const fromPreview = () => {
      const sc = scroller;
      const v = view;
      if (!el || !sc || !v || syncing || stale()) return;
      // Our own programmatic scroll (sync-to-editor / outline / build): never echo it
      // back into the editor, which is the anchor and must stay put (issue 8).
      if (performance.now() < ignorePreviewScrollUntil) return;
      if (performance.now() >= gestureUntil) return; // no recent user gesture here
      gestureUntil = performance.now() + 1500; // a live user scroll keeps the gate open
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
        let lineFloat = from + within * (to - from + 1);
        // Rendered view: translate the block's EXPANDED line back to a SOURCE line.
        const m = lineMapRef.current;
        if (m) {
          const src = expToSrc(m, lineFloat);
          if (src == null) return;
          lineFloat = src;
        }
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
      for (const g of gestureEvents) el?.removeEventListener(g, gesture);
      scroller?.removeEventListener("scroll", fromEditor);
    };
  }, []);

  // External links open in the default browser; `#anchor` links (citations, crossrefs,
  // footnotes) scroll within the preview; a link to a local file opens it in Writedown;
  // all other navigation is suppressed.
  function onClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      void openUrl(href).catch(() => {});
    } else if (href.startsWith("#") && href.length > 1) {
      const target = scrollRef.current?.querySelector("#" + CSS.escape(href.slice(1)));
      if (target) {
        // Repeat for a few frames: the jump renders estimated-size blocks, layout
        // shifts, and a single scrollIntoView lands off (see scrollPreviewToLine).
        let n = 0;
        const rescroll = () => {
          target.scrollIntoView({ block: "start" });
          if (++n < SETTLE_FRAMES) requestAnimationFrame(rescroll);
        };
        rescroll();
      }
    } else if (a.dataset.wdFile) {
      // A link to a local file (resolved pre-sanitize in processLinks). openFile routes
      // md/qmd/text/csv → a tab, pdf/djvu → the external viewer, images → the image tab;
      // binaries (zip/exe/…) go straight to the external opener, mirroring the file tree.
      const p = a.dataset.wdFile;
      const act = isBinaryExt(p)
        ? openExternal(p)
        : useStore.getState().openFile(p);
      void act.catch((err) => useStore.setState({ configError: String(err) }));
    }
  }

  // Ctrl+wheel zoom for the preview (issue A.13), mirroring the editor's gesture. The
  // listener MUST be non-passive: WebView2's default Ctrl+wheel is page zoom, and only
  // preventDefault stops the whole app chrome scaling. Deltas accumulate so one physical
  // notch is one step on any device. The size is applied as a CSS variable directly on
  // the element — no React state — so the incremental DOM patcher is never disturbed.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      acc += e.deltaY;
      while (Math.abs(acc) >= 100) {
        useStore.getState().setPreviewZoom(acc < 0 ? 1 : -1);
        acc += acc < 0 ? 100 : -100;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const previewZoom = useStore((s) => s.previewZoom);
  useEffect(() => {
    contentRef.current?.style.setProperty("--wd-preview-font-size", `${15 + previewZoom}px`);
  }, [previewZoom]);

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
