// Copy-to-clipboard verbs shared by the palette, the editor keymap (Ctrl+Shift+C, issue
// G.16) and the tree's context menu. A scratch buffer has no path: say so in the status
// bar rather than raising an error strip for a non-event.
import { isScratch, useStore } from "./store";

/** Copy `text`, confirming in the status bar; a clipboard failure goes to the error strip. */
export function copyText(text: string, what: string): void {
  void navigator.clipboard.writeText(text).then(
    () => useStore.getState().showStatusMessage(`copied ${what}: ${text}`),
    (e) => useStore.setState({ lastError: `copy ${what} — ${String(e)}` }),
  );
}

/** The active document's path on disk, or null (nothing open / a scratch buffer). */
function activeDiskPath(what: string): string | null {
  const a = useStore.getState().activePath;
  if (!a) return null;
  if (isScratch(a)) {
    useStore.getState().showStatusMessage(`copy ${what} — this buffer is unsaved and has no path`);
    return null;
  }
  return a;
}

export function copyActivePath(): void {
  const a = activeDiskPath("path");
  if (a) copyText(a, "path");
}

export function copyActiveName(): void {
  const a = activeDiskPath("name");
  if (a) copyText(a.split(/[\\/]/).pop() ?? a, "name");
}
