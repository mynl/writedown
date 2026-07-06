import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { saveSession } from "./api";
import { isDirty, sessionSnapshot, useStore } from "./store";
import { FileTree } from "./tree/FileTree";
import { Tabs } from "./Tabs";
import { Editor } from "./editor/Editor";
import { Resizer } from "./Resizer";
import "./App.css";

function App() {
  // Version is single-sourced in tauri.conf.json and read at runtime — never
  // hard-code a second copy. See CLAUDE.md "Versioning".
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("?"));
  }, []);

  const hydrate = useStore((s) => s.hydrate);
  // Restore last session, then persist the session slice on change (debounced,
  // skipping no-op changes so typing doesn't trigger writes).
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let timer: number | undefined;
    let last = "";
    void hydrate().finally(() => {
      unsub = useStore.subscribe((state) => {
        const key = JSON.stringify(sessionSnapshot(state));
        if (key === last) return;
        last = key;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void saveSession(sessionSnapshot(state)), 400);
      });
    });
    return () => {
      unsub?.();
      window.clearTimeout(timer);
    };
  }, [hydrate]);

  const root = useStore((s) => s.root);
  const treeWidth = useStore((s) => s.treeWidth);
  const outlineWidth = useStore((s) => s.outlineWidth);
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const openFolder = useStore((s) => s.openFolder);
  const saveActive = useStore((s) => s.saveActive);
  const nextTab = useStore((s) => s.nextTab);
  const reopenClosed = useStore((s) => s.reopenClosed);
  const setTreeWidth = useStore((s) => s.setTreeWidth);
  const setOutlineWidth = useStore((s) => s.setOutlineWidth);

  const activeDoc = tabs.find((t) => t.path === activePath) ?? null;

  // App-level (non-editor) keybindings: save, tab close/reopen/switch (spec §10).
  // Editor-scoped Sublime bindings live in src/editor/keymap.ts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.shiftKey && k === "s") {
        e.preventDefault();
        void saveActive();
      } else if (mod && k === "w") {
        e.preventDefault();
        const { tabs: ts, activePath: ap, closeTab: close } = useStore.getState();
        const doc = ts.find((t) => t.path === ap);
        if (!doc) return;
        if (isDirty(doc) && !window.confirm(`${doc.path} has unsaved changes. Close anyway?`)) {
          return;
        }
        close(doc.path);
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        nextTab(e.shiftKey ? -1 : 1);
      } else if (mod && e.shiftKey && k === "t") {
        e.preventDefault();
        void reopenClosed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActive, nextTab, reopenClosed]);

  const saveStatus = activeDoc
    ? activeDoc.error
      ? "Save failed"
      : activeDoc.saving
        ? "Saving…"
        : isDirty(activeDoc)
          ? "Modified"
          : "Saved"
    : "";

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
          {tabs.length > 0 ? <Tabs /> : <div className="pane-header">Editor</div>}
          <div className="pane-body editor-body">
            {activeDoc ? (
              <Editor path={activeDoc.path} content={activeDoc.content} />
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
        <span
          className={"status-mid" + (activeDoc?.error ? " status-error" : "")}
          title={activeDoc?.error ?? ""}
        >
          {saveStatus}
        </span>
        <span className="status-right">v{version}</span>
      </footer>
    </div>
  );
}

export default App;
