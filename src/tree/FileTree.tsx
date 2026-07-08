import { useEffect, useState } from "react";
import { listDirectory, type Entry } from "../api";
import { useStore } from "../store";

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
    default:
      return "·";
  }
}

function TreeNode({ entry, depth }: { entry: Entry; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFile = useStore((s) => s.openFile);
  const openTreeMenu = useStore((s) => s.openTreeMenu);
  const activePath = useStore((s) => s.activePath);
  const isActive = !entry.is_dir && entry.path === activePath;

  async function onClick() {
    if (entry.is_dir) {
      const next = !expanded;
      setExpanded(next);
      if (next && children === null) {
        setLoading(true);
        try {
          setChildren(await listDirectory(entry.path));
        } catch (e) {
          setError(String(e));
        } finally {
          setLoading(false);
        }
      }
    } else {
      // Single-click = preview (Sublime): opens in the transient preview tab.
      openFile(entry.path, true).catch((e) => setError(String(e)));
    }
  }

  function onDoubleClick() {
    // Double-click = open permanently.
    if (!entry.is_dir) openFile(entry.path, false).catch((e) => setError(String(e)));
  }

  return (
    <div className="tree-node">
      <div
        className={
          "tree-row" +
          (entry.is_dir ? " folder" : " file") +
          (isActive ? " active" : "")
        }
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          openTreeMenu(e.clientX, e.clientY, entry);
        }}
        title={entry.path}
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

export function FileTree() {
  const rootEntries = useStore((s) => s.rootEntries);
  const root = useStore((s) => s.root);
  const treeVersion = useStore((s) => s.treeVersion);

  if (!root) return null;
  // Keyed by treeVersion so a refresh remounts the tree (re-fetches all levels).
  return (
    <div className="tree" key={treeVersion}>
      {rootEntries.map((e) => (
        <TreeNode key={e.path} entry={e} depth={0} />
      ))}
    </div>
  );
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
        <TreeNode
          key={f}
          depth={0}
          entry={{
            name: f.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? f,
            path: f,
            is_dir: true,
            ext: null,
          }}
        />
      ))}
    </div>
  );
}
