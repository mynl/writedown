// Web Worker shim around renderCore: keeps markdown-it + KaTeX renders (hundreds of ms
// on math-heavy docs) off the UI thread. Superseded results are discarded on the main
// side by seq; errors are reported back rather than left to kill the worker silently.
import { renderDoc, type RenderResult } from "./renderCore";

type RenderJob = { seq: number; docKey: string; src: string };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

self.onmessage = (e: MessageEvent<RenderJob>) => {
  const { seq, docKey, src } = e.data;
  let blocks: RenderResult["blocks"];
  try {
    blocks = renderDoc(src);
  } catch (err) {
    // Never die silently: surface the failure IN the preview (sanitized main-side like
    // any other block) so a parse blow-up is visible, not a blank pane.
    const msg = "Preview render failed: " + (err instanceof Error ? err.message : String(err));
    const html = "<pre class=\"preview-error\">" + escapeHtml(msg) + "</pre>";
    blocks = [{ key: "render-error", lineFrom: 1, lineTo: 1, html }];
  }
  (self as unknown as { postMessage(m: RenderResult): void }).postMessage({
    seq,
    docKey,
    blocks,
  });
};
