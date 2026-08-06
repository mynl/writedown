import { memo, useEffect, useState } from "react";
import { openDefault, openShell, type Entry } from "../api";
import { isBinaryExt, isExternalDoc } from "../editor/languages";
import { rootEntry, useStore } from "../store";

function icon(entry: Entry, expanded: boolean): string {
  // Folders get a clearly-distinct folder glyph (open/closed), not a small chevron.
  if (entry.is_dir) return expanded ? "📂" : "📁";
  switch (entry.ext) {
    case "md":
    case "markdown":
      return "≡";
    case "qmd":
      return "◈";
    case "bib":
      return "❝";
    case "py":
      return "🐍";
    case "csv":
    case "tsv":
      return "▦";
    case "json":
    case "toml":
    case "yaml":
    case "yml":
      return "⚙";
    case "tex":
      return "∑";
    case "agg":
    case "dec":
    case "decl":
      return "λ"; // aggregate Dec Language
    case "html":
    case "htm":
      return "🌐";
    case "css":
      return "🎨";
    case "js":
    case "mjs":
    case "ts":
    case "tsx":
    case "jsx":
      return "⚡";
    case "ps1":
    case "psm1":
    case "bat":
    case "cmd":
    case "sh":
      return "▶";
    case "xlsx":
    case "xls":
      return "▤";
    case "docx":
    case "doc":
    case "rtf":
      return "📝";
    case "pptx":
    case "ppt":
      return "📽";
    case "zip":
    case "7z":
    case "rar":
    case "gz":
    case "tgz":
    case "tar":
      return "🗜";
    case "exe":
    case "msi":
    case "dll":
      return "⚙";

    case "pdf":
    case "djvu":
      return "📄";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
    case "bmp":
    case "ico":
    case "avif":
      return "🖼";
    default:
      return "·";
  }
}

function TreeNode({ entry, depth }: { entry: Entry; depth: number }) {
  // Expansion and children BOTH live in the store now (issues C.01/C.02/C.03): the watcher
  // has to be able to refresh a folder's listing, and the keyboard has to be able to expand
  // and collapse a folder, and neither can reach into a component's private state. Each node
  // subscribes to its own key only — a boolean and one array identity — so a toggle or a
  // changed listing re-renders that node, not the tree.
  const expanded = useStore((s) => s.expandedPaths.has(entry.path));
  const children = useStore((s) => s.dirCache[entry.path] ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy load: this folder is open but its listing isn't in the cache yet — a click to
  // expand, or a restored expansion the project-open prefetch didn't cover.
  useEffect(() => {
    if (!entry.is_dir || !expanded || children !== null) return;
    let cancelled = false;
    setLoading(true);
    useStore
      .getState()
      .ensureDir(entry.path)
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, children, entry.is_dir, entry.path]);

  const openFile = useStore((s) => s.openFile);
  const openTreeMenu = useStore((s) => s.openTreeMenu);
  const activePath = useStore((s) => s.activePath);
  const selectedPath = useStore((s) => s.treeSelected?.path ?? null);
  const isActive = !entry.is_dir && entry.path === activePath;
  const isSelected = entry.path === selectedPath;

  function onClick(e: React.MouseEvent) {
    // Ctrl+click = hand the path to Windows, for EVERY file type (issue A.17). Single
    // click still previews and double click still edits, so this adds a gesture without
    // taking one away. A folder opens in Explorer by the same call.
    if (e.ctrlKey) {
      e.preventDefault();
      openDefault(entry.path).catch((err) => setError(String(err)));
      return;
    }
    // Clicking a row is also what aims the keyboard at it (issue C.03).
    useStore.getState().setTreeSelected(entry);
    if (entry.is_dir) {
      useStore.getState().setPathExpanded(entry.path, !expanded);
      // Children load via the lazy effect above.
    } else if (!isExternalDoc(entry.path) && !isBinaryExt(entry.path)) {
      // Single-click = preview (Sublime): opens in the transient preview tab.
      // PDF/DjVu never open in a tab — double-click (or right-click) launches the
      // configured external viewer instead; a single click is deliberately inert.
      // Known-binary files (exe/dll/zip/…) are fully inert: right-click → Open Externally.
      openFile(entry.path, true).catch((e) => setError(String(e)));
    }
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (e.ctrlKey) return; // the Ctrl+click above already launched it
    // Double-click = open permanently (PDF/DjVu: openFile routes to the external viewer;
    // known-binary files stay inert here too).
    if (!entry.is_dir && !isBinaryExt(entry.path))
      openFile(entry.path, false).catch((err) => setError(String(err)));
  }

  return (
    <div className="tree-node">
      <div
        className={
          "tree-row" +
          (entry.is_dir ? " folder" : " file") +
          (isActive ? " active" : "") +
          (isSelected ? " selected" : "") +
          (!entry.is_dir && !entry.supported ? " unsupported" : "")
        }
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        title={entry.path + "\nCtrl+click: open in the default Windows app"}
        onContextMenu={(e) => {
          e.preventDefault();
          // The menu and the Delete/F2 keys must always agree on the target.
          useStore.getState().setTreeSelected(entry);
          openTreeMenu(e.clientX, e.clientY, entry);
        }}
      >
        <span className="tree-icon">{icon(entry, expanded)}</span>
        <span className="tree-name">{entry.name}</span>
      </div>
      {error && <div className="tree-error" style={{ paddingLeft: 6 + depth * 14 }}>{error}</div>}
      {expanded && loading && (
        <div className="tree-loading" style={{ paddingLeft: 20 + depth * 14 }}>…</div>
      )}
      {expanded && children && (
        <div className="tree-children">
          {children.length === 0 && (
            <div className="tree-empty" style={{ paddingLeft: 20 + depth * 14 }}>empty</div>
          )}
          {children.map((c) => (
            <TreeNode key={c.path} entry={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// memo: App re-renders on every keystroke (it subscribes to `tabs`); the tree takes no
// props and reads the store itself, so there is nothing per-keystroke to reconcile here.
export const FileTree = memo(function FileTree() {
  const folderRoot = useStore((s) => s.folderRoot);
  const treeVersion = useStore((s) => s.treeVersion);

  if (!folderRoot) return null;
  // The folder itself is the top node — a real explorer "from the root on down". Its listing
  // comes from dirCache like every other level (setFolderRoot fills it and marks the root
  // expanded). Still keyed by treeVersion so a hard refresh remounts.
  return (
    <div className="tree" key={treeVersion}>
      <TreeNode depth={0} entry={rootEntry(folderRoot)} />
    </div>
  );
});

/** Keyboard on the tree panel (issue C.03): arrows to move and open/close folders, Enter to
 *  open, F2 to rename, Delete to Recycle-Bin. Attached to the tree PANE, not to the window —
 *  so a Delete with the editor focused can never reach a file. Reads the store directly (no
 *  reactivity needed): the row list is derived from what is expanded and cached, i.e. exactly
 *  what is on screen. */
export function onTreeKeyDown(e: React.KeyboardEvent) {
  const k = e.key;
  if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Enter", "F2", "Delete"].includes(k))
    return;
  // Never steal keys from an input inside the panel (the project switcher, a rename prompt).
  if ((e.target as HTMLElement).closest("input, select, textarea")) return;

  const s = useStore.getState();
  const rows = s.visibleRows();
  if (rows.length === 0) return;
  const cur = s.treeSelected ? rows.findIndex((r) => r.path === s.treeSelected?.path) : -1;

  const select = (i: number) => {
    const row = rows[Math.max(0, Math.min(i, rows.length - 1))];
    if (!row) return;
    s.setTreeSelected(row);
    // The row may be mounting this frame (a folder that just expanded).
    requestAnimationFrame(() =>
      document.querySelector(".tree-body .tree-row.selected")?.scrollIntoView({ block: "nearest" }),
    );
  };

  e.preventDefault();
  const sel = cur >= 0 ? rows[cur] : null;
  switch (k) {
    case "ArrowDown":
      select(cur + 1);
      break;
    case "ArrowUp":
      select(cur <= 0 ? 0 : cur - 1);
      break;
    case "ArrowRight":
      // Open a closed folder; step into an open one.
      if (sel?.is_dir && !s.expandedPaths.has(sel.path)) s.setPathExpanded(sel.path, true);
      else if (sel?.is_dir) select(cur + 1);
      break;
    case "ArrowLeft":
      // Close an open folder; otherwise jump to the parent row.
      if (sel?.is_dir && s.expandedPaths.has(sel.path)) s.setPathExpanded(sel.path, false);
      else if (sel) {
        const parent = sel.path.replace(/[\\/][^\\/]*$/, "");
        const i = rows.findIndex((r) => r.path === parent);
        if (i >= 0) select(i);
      }
      break;
    case "Enter":
      if (!sel) break;
      if (sel.is_dir) s.setPathExpanded(sel.path, !s.expandedPaths.has(sel.path));
      else if (!isBinaryExt(sel.path)) void s.openFile(sel.path, false); // permanent, like a double-click
      break;
    case "F2":
      if (sel) s.renameEntry(sel);
      break;
    case "Delete":
      if (sel) void s.deleteEntry(sel); // confirms, then Recycle Bin
      break;
  }
}

/** Right-click menu for a file/folder in the tree: New, Rename, Delete (Recycle Bin),
 *  plus Save / Save As on the active document. Mounted once at app root. */
export function TreeContextMenu() {
  const menu = useStore((s) => s.treeMenu);
  const close = useStore((s) => s.closeTreeMenu);
  const newFileIn = useStore((s) => s.newFileIn);
  const newFolderIn = useStore((s) => s.newFolderIn);
  const renameEntry = useStore((s) => s.renameEntry);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const saveActive = useStore((s) => s.saveActive);
  const saveAs = useStore((s) => s.saveAs);
  const hasActive = useStore((s) => s.activePath != null);

  // Any click or Escape dismisses the menu.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, close]);

  if (!menu) return null;
  const { entry } = menu;
  // New file/folder land inside a folder, or beside a file (its parent directory).
  const dir = entry.is_dir
    ? entry.path
    : entry.path.slice(0, entry.path.length - entry.name.length).replace(/[\\/]+$/, "");

  const item = (label: string, run: () => void, disabled = false) => (
    <div
      className={"ctx-item" + (disabled ? " disabled" : "")}
      onClick={() => {
        if (disabled) return;
        close();
        run();
      }}
    >
      {label}
    </div>
  );

  return (
    <>
      <div className="ctx-backdrop" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div
        className="context-menu"
        style={{
          left: Math.min(menu.x, window.innerWidth - 176),
          top: Math.min(menu.y, window.innerHeight - 210),
        }}
      >
        {item("New File…", () => newFileIn(dir))}
        {item("New Folder…", () => newFolderIn(dir))}
        {item("Open Shell Here", () =>
          openShell(dir).catch((e) => useStore.setState({ configError: String(e) })),
        )}
        <div className="ctx-sep" />
        {item(
          entry.is_dir ? "Open in Explorer" : "Open in Default App",
          () =>
            // PDF/DjVu keep going through openFile, which routes to [tools] pdf_viewer —
            // that setting exists precisely so those land in Sumatra. EVERYTHING else now
            // goes to Windows. Previously this item called openExternal for every type,
            // i.e. it handed images, zips and executables to the PDF viewer (issue A.17).
            isExternalDoc(entry.path)
              ? void useStore.getState().openFile(entry.path, false)
              : void openDefault(entry.path).catch((e) =>
                  useStore.setState({ configError: String(e) }),
                ),
        )}
        <div className="ctx-sep" />
        {item("Rename…", () => renameEntry(entry))}
        {item("Delete", () => void deleteEntry(entry))}
        <div className="ctx-sep" />
        {item("Save", () => void saveActive(), !hasActive)}
        {item("Save As…", () => void saveAs(), !hasActive)}
      </div>
    </>
  );
}

/** Project view: every project folder as a collapsible root (ST's FOLDERS list). */
export function ProjectTree() {
  const projFolders = useStore((s) => s.projFolders);
  const treeVersion = useStore((s) => s.treeVersion);

  return (
    <div className="tree" key={treeVersion}>
      {projFolders.map((f) => (
        <TreeNode key={f} depth={0} entry={rootEntry(f)} />
      ))}
    </div>
  );
}
