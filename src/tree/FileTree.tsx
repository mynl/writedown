import { memo, useEffect, useState } from "react";
import { listDirectory, openShell, type Entry } from "../api";
import { isExternalDoc } from "../editor/languages";
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
    case "pdf":
    case "djvu":
      return "📄";
    default:
      return "·";
  }
}

function TreeNode({
  entry,
  depth,
  defaultExpanded = false,
  initialChildren,
}: {
  entry: Entry;
  depth: number;
  defaultExpanded?: boolean;
  initialChildren?: Entry[];
}) {
  // Seed expansion from the store (non-reactive read) so a treeVersion remount after a file
  // op restores which folders were open instead of folding everything up. Not subscribed —
  // reading the Set reactively would re-render every node on any toggle.
  const [expanded, setExpanded] = useState(
    () => useStore.getState().expandedPaths.has(entry.path) || defaultExpanded,
  );
  const [children, setChildren] = useState<Entry[] | null>(initialChildren ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The seeded root node re-syncs when its children change via a SOFT refresh (fs-change,
  // which doesn't bump treeVersion). Touches only `children`, never `expanded`, so a
  // collapsed root stays collapsed. Inert for deeper nodes (they get no initialChildren).
  useEffect(() => {
    if (initialChildren) setChildren(initialChildren);
  }, [initialChildren]);

  // Load children lazily whenever this folder is expanded but hasn't loaded — covers both a
  // click-to-expand and a store-restored expansion on remount (the root gets initialChildren,
  // so it never re-fetches here).
  useEffect(() => {
    if (!entry.is_dir || !expanded || children !== null) return;
    let cancelled = false;
    setLoading(true);
    listDirectory(entry.path)
      .then((c) => {
        if (!cancelled) setChildren(c);
      })
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
  const isActive = !entry.is_dir && entry.path === activePath;

  function onClick() {
    if (entry.is_dir) {
      const next = !expanded;
      setExpanded(next);
      useStore.getState().setPathExpanded(entry.path, next); // remembered across remounts
      // Children load via the lazy effect above.
    } else if (!isExternalDoc(entry.path)) {
      // Single-click = preview (Sublime): opens in the transient preview tab.
      // PDF/DjVu never open in a tab — double-click (or right-click) launches the
      // configured external viewer instead; a single click is deliberately inert.
      openFile(entry.path, true).catch((e) => setError(String(e)));
    }
  }

  function onDoubleClick() {
    // Double-click = open permanently (PDF/DjVu: openFile routes to the external viewer).
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

// memo: App re-renders on every keystroke (it subscribes to `tabs`); the tree takes no
// props and reads the store itself, so there is nothing per-keystroke to reconcile here.
export const FileTree = memo(function FileTree() {
  const folderRoot = useStore((s) => s.folderRoot);
  const rootEntries = useStore((s) => s.rootEntries);
  const treeVersion = useStore((s) => s.treeVersion);

  if (!folderRoot) return null;
  // The folder itself is the top node — a real explorer "from the root on down". It starts
  // expanded and seeded from rootEntries (no redundant re-list). Keyed by treeVersion so a
  // hard refresh remounts and re-fetches all levels.
  return (
    <div className="tree" key={treeVersion}>
      <TreeNode
        depth={0}
        defaultExpanded
        initialChildren={rootEntries}
        entry={{
          name: folderRoot.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? folderRoot,
          path: folderRoot,
          is_dir: true,
          ext: null,
        }}
      />
    </div>
  );
});

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
        {!entry.is_dir && isExternalDoc(entry.path) && (
          <>
            <div className="ctx-sep" />
            {item("Open Externally", () => void useStore.getState().openFile(entry.path, false))}
          </>
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
