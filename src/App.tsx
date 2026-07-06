import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { saveSession } from "./api";
import { isDirty, sessionSnapshot, useStore } from "./store";
import { FileTree } from "./tree/FileTree";
import { Tabs } from "./Tabs";
import { Editor } from "./editor/Editor";
import { Preview } from "./preview/Preview";
import { isMarkdownDoc } from "./editor/languages";
import { Resizer } from "./Resizer";
import { Palette } from "./Palette";
import "./App.css";

function App() {
  // Version is single-sourced in tauri.conf.json and read at runtime — never
  // hard-code a second copy. See CLAUDE.md "Versioning".
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("?"));
  }, []);

  const loadTheme = useStore((s) => s.loadTheme);
  useEffect(() => void loadTheme(), [loadTheme]);

  // React to external file changes (spec §14): reload/conflict + tree refresh.
  const onFsChange = useStore((s) => s.onFsChange);
  useEffect(() => {
    const p = listen<string[]>("fs-change", (e) => onFsChange(e.payload));
    return () => void p.then((un) => un());
  }, [onFsChange]);

  // Autosave (spec §12): on window blur (focus lost), and after a short idle pause once
  // anything is dirty. Tab-switch autosave lives in the store's setActive.
  useEffect(() => {
    const saveAll = () => void useStore.getState().saveAll();
    window.addEventListener("blur", saveAll);
    let idle: number | undefined;
    const unsub = useStore.subscribe((s) => {
      if (!s.tabs.some((t) => t.content !== t.savedContent)) return;
      window.clearTimeout(idle);
      idle = window.setTimeout(saveAll, 1500);
    });
    return () => {
      window.removeEventListener("blur", saveAll);
      unsub();
      window.clearTimeout(idle);
    };
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
        if (!state.root) return;
        const key = JSON.stringify(sessionSnapshot(state));
        if (key === last) return;
        last = key;
        window.clearTimeout(timer);
        const ws = state.root;
        timer = window.setTimeout(() => void saveSession(ws, sessionSnapshot(state)), 400);
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
  const refreshTree = useStore((s) => s.refreshTree);
  const openPalette = useStore((s) => s.openPalette);
  const reloadDoc = useStore((s) => s.reloadDoc);
  const viewMode = useStore((s) => s.viewMode);
  const cycleView = useStore((s) => s.cycleView);
  const setTreeWidth = useStore((s) => s.setTreeWidth);
  const setOutlineWidth = useStore((s) => s.setOutlineWidth);

  const activeDoc = tabs.find((t) => t.path === activePath) ?? null;
  const md = activeDoc ? isMarkdownDoc(activeDoc.path) : false;
  const showEditor = !md || viewMode !== "preview";
  const showPreview = md && viewMode !== "editor";

  // App-level (non-editor) keybindings: save, tab close/reopen/switch (spec §10).
  // Editor-scoped Sublime bindings live in src/editor/keymap.ts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // already handled by the editor keymap
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.shiftKey && k === "s") {
        e.preventDefault();
        void saveActive();
      } else if (mod && k === "w") {
        e.preventDefault();
        const { activePath: ap, saveDoc, closeTab } = useStore.getState();
        if (ap) void saveDoc(ap).finally(() => closeTab(ap)); // save-then-close (autosave)
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        nextTab(e.shiftKey ? -1 : 1);
      } else if (mod && e.shiftKey && k === "t") {
        e.preventDefault();
        void reopenClosed();
      } else if (e.key === "F5" || (mod && e.shiftKey && k === "r")) {
        // Refresh the file tree; prevent the default webview reload.
        e.preventDefault();
        void refreshTree();
      } else if (mod && e.shiftKey && k === "p") {
        e.preventDefault();
        openPalette("commands");
      } else if (mod && !e.shiftKey && k === "p") {
        e.preventDefault(); // also suppresses the browser print dialog
        openPalette("files");
      } else if (mod && e.shiftKey && k === "v") {
        e.preventDefault();
        cycleView();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActive, nextTab, reopenClosed, refreshTree, openPalette, cycleView]);

  // No transient "Saving…" — atomic saves are instant and it just flickered.
  const saveStatus = activeDoc
    ? activeDoc.conflict
      ? "Modified externally — click to reload"
      : activeDoc.error
        ? "Save failed"
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
          <div className="editor-topbar">
            {tabs.length > 0 ? <Tabs /> : <div className="pane-header">Editor</div>}
            <button
              className="view-toggle"
              onClick={() => cycleView()}
              title="Cycle editor / split / preview (Ctrl+Shift+V)"
            >
              {viewMode === "editor" ? "◧ Editor" : viewMode === "split" ? "◧◨ Split" : "◨ Preview"}
            </button>
          </div>
          <div className="editor-body">
            {activeDoc ? (
              <div className="split-body">
                {showEditor && (
                  <div className="split-pane">
                    <Editor path={activeDoc.path} content={activeDoc.content} />
                  </div>
                )}
                {showPreview && (
                  <div className="split-pane preview-pane">
                    <Preview content={activeDoc.content} />
                  </div>
                )}
              </div>
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
          className={
            "status-mid" +
            (activeDoc?.error || activeDoc?.conflict ? " status-error" : "") +
            (activeDoc?.conflict ? " status-action" : "")
          }
          title={activeDoc?.error ?? ""}
          onClick={() => {
            if (activeDoc?.conflict) void reloadDoc(activeDoc.path);
          }}
        >
          {saveStatus}
        </span>
        <span className="status-right">v{version}</span>
      </footer>

      <Palette />
    </div>
  );
}

export default App;
