import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useStore } from "./store";
import { FileTree } from "./tree/FileTree";
import { Resizer } from "./Resizer";
import "./App.css";

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

function App() {
  // Version is single-sourced in tauri.conf.json and read at runtime — never
  // hard-code a second copy. See CLAUDE.md "Versioning".
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("?"));
  }, []);

  const root = useStore((s) => s.root);
  const treeWidth = useStore((s) => s.treeWidth);
  const outlineWidth = useStore((s) => s.outlineWidth);
  const activePath = useStore((s) => s.activePath);
  const activeContent = useStore((s) => s.activeContent);
  const openFolder = useStore((s) => s.openFolder);
  const setTreeWidth = useStore((s) => s.setTreeWidth);
  const setOutlineWidth = useStore((s) => s.setOutlineWidth);

  return (
    <div className="app">
      <div className="panes">
        <aside
          className="pane pane-tree"
          style={{ flex: `0 0 ${treeWidth}px` }}
          aria-label="File tree"
        >
          <div className="pane-header">
            <span>Files</span>
            <button className="hdr-btn" onClick={() => void openFolder()}>
              Open Folder…
            </button>
          </div>
          <div className="pane-body tree-body">
            {root ? (
              <FileTree />
            ) : (
              <div className="placeholder">Open a folder to begin.</div>
            )}
          </div>
        </aside>

        <Resizer onDrag={(x) => setTreeWidth(x)} />

        <main className="pane pane-editor" aria-label="Editor">
          <div className="pane-header">{activePath ? basename(activePath) : "Editor"}</div>
          <div className="pane-body editor-body">
            {activePath ? (
              <textarea className="viewer" readOnly value={activeContent} spellCheck={false} />
            ) : (
              <div className="placeholder">No document open.</div>
            )}
          </div>
        </main>

        <Resizer onDrag={(x) => setOutlineWidth(window.innerWidth - x)} />

        <aside
          className="pane pane-outline"
          style={{ flex: `0 0 ${outlineWidth}px` }}
          aria-label="Outline"
        >
          <div className="pane-header">Outline</div>
          <div className="pane-body">
            <div className="placeholder">&mdash;</div>
          </div>
        </aside>
      </div>

      <footer className="statusbar" aria-label="Status">
        <span className="status-left" title={root ?? ""}>
          {root ?? "Writedown"}
        </span>
        <span className="status-right">v{version}</span>
      </footer>
    </div>
  );
}

export default App;
