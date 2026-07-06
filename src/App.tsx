import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";

function App() {
  // Version is single-sourced in tauri.conf.json and read at runtime — never
  // hard-code a second copy. See CLAUDE.md "Versioning".
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("?"));
  }, []);

  return (
    <div className="app">
      <div className="panes">
        <aside className="pane pane-tree" aria-label="File tree">
          <div className="pane-header">Files</div>
          <div className="pane-body placeholder">Open a folder to begin.</div>
        </aside>
        <main className="pane pane-editor" aria-label="Editor">
          <div className="pane-header">Editor</div>
          <div className="pane-body placeholder">No document open.</div>
        </main>
        <aside className="pane pane-outline" aria-label="Outline">
          <div className="pane-header">Outline</div>
          <div className="pane-body placeholder">&mdash;</div>
        </aside>
      </div>
      <footer className="statusbar" aria-label="Status">
        <span className="status-left">Writedown</span>
        <span className="status-right">v{version}</span>
      </footer>
    </div>
  );
}

export default App;
