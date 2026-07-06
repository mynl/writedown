import { useState } from "react";
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
