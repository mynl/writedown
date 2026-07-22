// In-app image viewer tab (issue We 3). The bytes never pass through the text
// pipeline: the Tauri asset protocol streams the file straight into an <img>. The
// tab's Doc keeps content "" (never dirty) and saveDoc refuses image paths, so the
// file on disk can never be written (spec §2). External-change auto-refresh is
// deliberately out of scope — close/reopen the tab to see a changed image.
import { convertFileSrc } from "@tauri-apps/api/core";

export function ImageViewer({ path }: { path: string }) {
  const name = path.split(/[\\/]/).pop() ?? path;
  return (
    <div className="image-viewer">
      <img src={convertFileSrc(path)} alt={name} title={path} />
    </div>
  );
}
