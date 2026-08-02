// Ctrl+V an image → save it beside the document and insert a Markdown link (issue A.22),
// the way Joplin does it. Rules, as specified by the author:
//
//   • Real document  → <folder>/img/, CREATED if it isn't there.
//   • Temp buffer    → ~/.writedown/img/ (it has no folder of its own).
//   • Accepted in md / qmd / temp buffers only. Everywhere else Ctrl+V is untouched.
//   • Named by content hash, so pasting one screenshot twice yields ONE file, and an
//     existing file is never overwritten (Rust picks the next -N on a genuine collision).
//
// Clipboard source: WebView2 is Chromium, so a screenshot arrives as a File on
// clipboardData already PNG-encoded — no decoding here and no image crate in Rust. If a
// future WebView2 stops populating that, this declines and ordinary paste happens; the
// fallback would be reading the clipboard in Rust (arboard + png).
import { EditorView } from "@codemirror/view";
import { savePastedImage } from "../api";
import { isMarkdownDoc } from "./languages";
import { isScratch, useStore } from "../store";

/** FNV-1a over the image bytes, plus the length — the content-addressed file name. Same
 *  hash shape the preview uses for block identity; collisions only cost a `-2` suffix. */
function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + bytes.length.toString(36);
}

/** The image File on the clipboard, or null. Declines whenever real text is also present:
 *  copying from a web page puts BOTH on the clipboard and the text is what you meant. */
function clipboardImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  if (data.getData("text/plain").trim() !== "") return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

/** Percent-encode the characters that break a Markdown link target. A raw space makes the
 *  preview drop the image entirely (strict CommonMark), which is the silent failure this
 *  avoids; `#`, `?` and `%` would truncate or mis-decode the path. */
function encodeLinkPath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/%/g, "%25")
    .replace(/ /g, "%20")
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F");
}

/** Extension from the clipboard MIME type; PNG unless the source says otherwise. */
function extFor(type: string): string {
  const sub = type.split("/")[1]?.toLowerCase() ?? "png";
  if (sub === "jpeg") return "jpg";
  return /^[a-z0-9]+$/.test(sub) ? sub : "png";
}

async function handlePaste(event: ClipboardEvent, view: EditorView): Promise<void> {
  const st = useStore.getState();
  const path = st.activePath;
  if (!path) return;
  const file = clipboardImage(event.clipboardData);
  if (!file) return;

  // Only markdown-family documents. Temp buffers are `untitled://Untitled-N.md`, so they
  // pass this test already — which is exactly what we want (they're accepted).
  if (!isMarkdownDoc(path)) return;

  event.preventDefault(); // committed now: ordinary paste must not also run

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === 0) return;
    const scratch = isScratch(path);
    // Real doc → <folder>/img (Rust creates it). Temp buffer → null, meaning the app's
    // own image folder, since there is no document folder to be relative to.
    const dir = scratch ? null : path.replace(/[\\/][^\\/]*$/, "") + "/img";
    const saved = await savePastedImage(dir, hashBytes(bytes), extFor(file.type), [...bytes]);

    // Relative link for a real document (portable, and what the preview resolves against
    // its baseDir); absolute for a temp buffer, which has no baseDir at all.
    const name = saved.split(/[\\/]/).pop() ?? saved;
    const link = scratch ? encodeLinkPath(saved) : `img/${encodeLinkPath(name)}`;
    view.dispatch(
      view.state.replaceSelection(`![](${link})`),
      { scrollIntoView: true },
    );
    view.focus();
    st.showStatusMessage(`saved ${scratch ? saved : `img/${name}`}`);
  } catch (e) {
    // Surfaced, never swallowed — a paste that quietly did nothing would be maddening.
    useStore.setState({ configError: `paste image — ${String(e)}` });
  }
}

/** The paste handler extension. Declines (returns nothing, no preventDefault) for text
 *  pastes and non-markdown documents, so normal Ctrl+V is completely unaffected. */
export const pasteImage = EditorView.domEventHandlers({
  paste: (event, view) => {
    // The work is async, but the decision to intercept must be synchronous — so the
    // cheap checks run here and handlePaste calls preventDefault before its first await.
    const path = useStore.getState().activePath;
    if (!path || !isMarkdownDoc(path)) return false;
    if (!clipboardImage(event.clipboardData)) return false;
    void handlePaste(event, view);
    return true;
  },
});
