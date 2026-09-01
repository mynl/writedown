import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { saveFolderState, saveSession } from "./api";
import {
  SCRATCH_PREFIX,
  isScratch,
  sessionFingerprint,
  sessionKey,
  sessionSnapshot,
  useStore,
  mergedProjects,
} from "./store";
import { FileTree, onTreeKeyDown, ProjectTree, TreeContextMenu } from "./tree/FileTree";
import { OpenFiles } from "./OpenFiles";
import { Tabs } from "./Tabs";
import { Editor } from "./editor/Editor";
import { EditorBoundary } from "./editor/EditorBoundary";
import { Preview } from "./preview/Preview";
import { CsvPreview } from "./preview/CsvPreview";
import { ImageViewer } from "./preview/ImageViewer";
import { Outline } from "./outline/Outline";
import { isCsv, isImageDoc, isMarkdownDoc, syntaxNameForPath } from "./editor/languages";
import { getActiveView } from "./editor/editorView";
import { runScopeHandlers } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import { reformatTables } from "./editor/tables";
import { toggleWordWrap } from "./editor/wrap";
import { Resizer } from "./Resizer";
import { Palette } from "./Palette";
import { Versions } from "./Versions";
import { Prompt } from "./Prompt";
import { ErrorBar } from "./ErrorBar";
import { Help } from "./Help";
import { About } from "./About";
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

  // The window is created hidden (tauri.conf.json) so the OS never shows a default-size
  // frame that then jumps to the restored geometry + fills in. Reveal it after the first
  // couple of paints (geometry is already restored by the window-state plugin at creation);
  // a fallback timer guarantees the window can never stay hidden if a paint never lands.
  useEffect(() => {
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      void getCurrentWindow().show().catch(() => {});
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(reveal));
    const fallback = window.setTimeout(reveal, 2000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, []);

  // React to external file changes (spec §14): reload/conflict + tree refresh.
  const onFsChange = useStore((s) => s.onFsChange);
  useEffect(() => {
    const p = listen<string[]>("fs-change", (e) => onFsChange(e.payload));
    return () => void p.then((un) => un());
  }, [onFsChange]);

  // Drop files or folders onto the window to open them (issue A.04). Tauri intercepts OS
  // drags at the webview (dragDropEnabled), which SUPPRESSES the HTML5 drag events — so
  // this window-level listener is the only route, and it hands us real absolute paths.
  const [dropActive, setDropActive] = useState(false);
  useEffect(() => {
    const p = getCurrentWindow().onDragDropEvent((e) => {
      if (e.payload.type === "over" || e.payload.type === "enter") setDropActive(true);
      else setDropActive(false);
      if (e.payload.type !== "drop") return;
      void useStore.getState().openDropped(e.payload.paths);
    });
    return () => void p.then((un) => un());
  }, []);

  // Save on window blur (ST-style, spec §12). The other triggers are Ctrl+S (App keymap
  // below), tab switch (store setActive), and editor blur (Editor.tsx saveOnBlur — covers
  // same-window focus moves into the tree/panels, which never fire window blur).
  // The idle timer is gone; the backup-before-overwrite net (Rust write_file) guards saves.
  // Coming back the other way: re-stamp the active document against disk (issue B.03).
  // A watcher event can go missing — a root nobody watches, a sleep/resume, a network
  // share — and the failure is invisible by construction, so don't rely on it alone.
  useEffect(() => {
    const saveAll = () => void useStore.getState().saveAll();
    // …and re-list the folders on screen (issue C.01). The Folder tab is watched by nobody
    // while a project is open, so an Explorer delete over there is only ever noticed here.
    const recheck = () => {
      void useStore.getState().recheckActive();
      void useStore.getState().refreshVisibleDirs();
    };
    window.addEventListener("blur", saveAll);
    window.addEventListener("focus", recheck);
    return () => {
      window.removeEventListener("blur", saveAll);
      window.removeEventListener("focus", recheck);
    };
  }, []);

  // Close-time flush: no work is ever lost on quit. Saves every dirty real file and
  // writes the session (including scratch hot-exit text) BEFORE the window closes —
  // the debounced session writer alone could lose the last pending write (up to the
  // 5 s max-wait ceiling mid-typing).
  useEffect(() => {
    let closing = false;
    const win = getCurrentWindow();
    const p = win.onCloseRequested(async (e) => {
      if (closing) return; // second close request: user forcing — let it proceed
      closing = true;
      e.preventDefault();
      const flush = (async () => {
        // force: at quit, refusing to write a conflicted tab would lose your typing for
        // good, while writing keeps both versions — theirs goes to the backup store
        // (Previous Versions). Everywhere else the conflict guard stands (issue B.04).
        await useStore.getState().saveAll({ force: true });
        const st = useStore.getState();
        const ws = sessionKey(st);
        if (ws) await saveSession(ws, sessionSnapshot(st));
        await saveFolderState(st.folderRoot, st.panelTab).catch(() => {});
      })().catch((err) => console.error("close-time flush failed", err));
      // A hung disk write must never wedge the window open — bounded flush, then close.
      await Promise.race([flush, new Promise((r) => setTimeout(r, 3000))]);
      await win.destroy(); // destroy(), not close() — doesn't re-enter this handler
    });
    return () => void p.then((un) => un());
  }, []);

  const hydrate = useStore((s) => s.hydrate);
  // Restore last session, then persist the session slice on change (debounced,
  // skipping no-op changes so typing doesn't trigger writes). The Folder-tab root +
  // active panel tab persist the same way (to the global session.json) — one watch
  // point instead of a call at every mutation site, so no site can be missed.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let timer: number | undefined;
    let maxTimer: number | undefined;
    let folderTimer: number | undefined;
    let last = "";
    let lastFolder: string | undefined;
    // Write the session from the LATEST state (not the change that scheduled it) —
    // the max-wait timer can fire seconds after the change it was armed by.
    const fire = () => {
      window.clearTimeout(timer);
      window.clearTimeout(maxTimer);
      timer = maxTimer = undefined;
      const st = useStore.getState();
      const ws = sessionKey(st);
      if (ws) void saveSession(ws, sessionSnapshot(st));
    };
    void hydrate().finally(() => {
      // Files we were launched with open AFTER the session restore, so a double-clicked
      // document ends up active instead of buried under the restored tabs (issue A.03).
      void useStore.getState().openLaunchFiles();
      const hydrated = useStore.getState();
      lastFolder = hydrated.folderRoot + "|" + hydrated.panelTab; // no spurious launch write
      unsub = useStore.subscribe((state) => {
        const folderKey = state.folderRoot + "|" + state.panelTab;
        if (folderKey !== lastFolder) {
          lastFolder = folderKey;
          window.clearTimeout(folderTimer);
          folderTimer = window.setTimeout(
            () => void saveFolderState(state.folderRoot, state.panelTab).catch(() => {}),
            400,
          );
        }
        const ws = sessionKey(state);
        if (!ws) return;
        const key = ws + " " + sessionFingerprint(state);
        if (key === last) return;
        last = key;
        window.clearTimeout(timer);
        timer = window.setTimeout(fire, 400);
        // A trailing debounce alone lets sustained typing (keystroke gaps < 400 ms)
        // postpone the write indefinitely — cap the wait (vim-style: idle OR ceiling)
        // so a crash mid-flow loses at most ~5 s. Not reset by later changes.
        if (maxTimer === undefined) maxTimer = window.setTimeout(fire, 5000);
      });
    });
    return () => {
      unsub?.();
      window.clearTimeout(timer);
      window.clearTimeout(maxTimer);
      window.clearTimeout(folderTimer);
    };
  }, [hydrate]);

  const root = useStore((s) => s.root);
  const folderRoot = useStore((s) => s.folderRoot);
  const panelTab = useStore((s) => s.panelTab);
  const setPanelTab = useStore((s) => s.setPanelTab);
  const projFolders = useStore((s) => s.projFolders);
  const recentProjects = useStore((s) => s.recentProjects);
  const projectFile = useStore((s) => s.projectFile);
  const openProject = useStore((s) => s.openProject);
  const treeWidth = useStore((s) => s.treeWidth);
  const outlineWidth = useStore((s) => s.outlineWidth);
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const saveActive = useStore((s) => s.saveActive);
  const nextTab = useStore((s) => s.nextTab);
  const reopenClosed = useStore((s) => s.reopenClosed);
  const refreshTree = useStore((s) => s.refreshTree);
  const openPalette = useStore((s) => s.openPalette);
  const reloadDoc = useStore((s) => s.reloadDoc);
  const viewMode = useStore((s) => s.viewMode);
  const cycleView = useStore((s) => s.cycleView);
  const openHelp = useStore((s) => s.openHelp);
  const previewTab = useStore((s) => s.previewTab);
  const setPreviewTab = useStore((s) => s.setPreviewTab);
  const rendered = useStore((s) => s.rendered);
  const renderBusy = useStore((s) => s.renderBusy);
  const cursorLine = useStore((s) => s.cursorLine);
  const cursorCol = useStore((s) => s.cursorCol);
  const selChars = useStore((s) => s.selChars);
  const selLines = useStore((s) => s.selLines);
  const selRanges = useStore((s) => s.selRanges);
  const setTreeWidth = useStore((s) => s.setTreeWidth);
  const setOutlineWidth = useStore((s) => s.setOutlineWidth);
  const splitRatio = useStore((s) => s.splitRatio);
  const setSplitRatio = useStore((s) => s.setSplitRatio);
  const configError = useStore((s) => s.configError);
  const lastError = useStore((s) => s.lastError);
  const syntaxOverride = useStore((s) => s.syntaxOverride);
  const wordWrap = useStore((s) => s.wordWrap);
  const spellOn = useStore((s) => s.spellOn);
  const toggleSpell = useStore((s) => s.toggleSpell);
  const splitBodyRef = useRef<HTMLDivElement>(null);

  // Tree scroll preservation: record the tree-body offset and restore it across a treeVersion
  // remount (New File / Delete / Rename) so the tree never jumps to the top. Async subtree
  // listing grows the height over several frames, so re-apply until it sticks (or give up).
  const treeVersion = useStore((s) => s.treeVersion);
  const setTreeScrollTop = useStore((s) => s.setTreeScrollTop);
  const treeBodyRef = useRef<HTMLDivElement>(null);
  const restoringTreeScroll = useRef(false);
  useEffect(() => {
    const target = useStore.getState().treeScrollTop;
    if (!target) return;
    restoringTreeScroll.current = true;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      const el = treeBodyRef.current;
      if (!el) {
        restoringTreeScroll.current = false;
        return;
      }
      el.scrollTop = target;
      if (++frames < 10 && el.scrollTop !== target) {
        raf = requestAnimationFrame(tick);
      } else {
        restoringTreeScroll.current = false;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      restoringTreeScroll.current = false;
    };
  }, [treeVersion]);

  const activeDoc = tabs.find((t) => t.path === activePath) ?? null;
  const md = activeDoc ? isMarkdownDoc(activeDoc.path) : false;
  const csv = activeDoc ? isCsv(activeDoc.path) : false;
  const img = activeDoc ? isImageDoc(activeDoc.path) : false;
  const previewable = md || csv; // markdown gets the rendered preview, csv/tsv the grid
  const showEditor = !previewable || viewMode !== "preview";
  const showPreview = previewable && viewMode !== "editor";
  const splitMode = showEditor && showPreview; // both panes mounted → show the drag divider
  const ren = activeDoc ? rendered[activeDoc.path] : undefined;
  // The doc's folder, so relative `![](img/…)` links resolve in the preview. Scratch
  // buffers have no folder on disk, so their relative images can't resolve.
  const docDir =
    activeDoc && !isScratch(activeDoc.path)
      ? activeDoc.path.replace(/[\\/][^\\/]*$/, "")
      : undefined;
  // The Rendered tab is per-document; fall back to the live Preview when the active doc
  // has no render (and none is in flight, so a first render still shows "Rendering…").
  const effectiveTab = previewTab === "rendered" && !ren && !renderBusy ? "live" : previewTab;

  // App-level (non-editor) keybindings: save, tab close/reopen/switch (spec §10).
  // Editor-scoped Sublime bindings live in src/editor/keymap.ts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // already handled by the editor keymap
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      // Editor chords work from anywhere sensible (issue G.13): when focus is not in a
      // text control, the tree, or the editor itself — clicking the preview leaves it on
      // <body> — offer MODIFIED keys to the editor keymap. Ctrl+F finds, Ctrl+K Ctrl+U
      // upper-cases (CodeMirror's own chord state spans the two keystrokes). Unmodified
      // keys are never forwarded: typing must not silently edit a document you are not
      // looking at. And the editor is focused only AFTER a command actually ran — a bare
      // Ctrl+C must keep copying the preview's own selection, not the editor's.
      const tgt = e.target as HTMLElement | null;
      if (
        (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) &&
        !tgt?.closest("input, textarea, [contenteditable], .cm-editor, .tree-body")
      ) {
        const view = getActiveView();
        if (view?.dom.isConnected) {
          if (runScopeHandlers(view, e, "editor")) {
            e.preventDefault();
            view.focus();
            return;
          }
        } else if (mod && !e.shiftKey && !e.altKey && k === "f") {
          // Preview-only mode has no editor mounted to search in. The minimal honest
          // answer: flip to split and open Find there once the editor exists.
          e.preventDefault();
          useStore.setState({ viewMode: "split" });
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const v = getActiveView();
              if (v?.dom.isConnected) {
                v.focus();
                openSearchPanel(v);
              }
            }),
          );
          return;
        }
      }
      if (mod && !e.shiftKey && k === "s") {
        e.preventDefault();
        void saveActive();
      } else if (mod && e.shiftKey && k === "b") {
        // Build = Render Document (ST's Ctrl+Shift+B) — here too so it works from tree/preview
        // focus. (Ctrl+B is now Markdown bold, handled by the editor keymap.)
        e.preventDefault();
        void useStore.getState().renderActive();
      } else if (mod && k === "w") {
        e.preventDefault();
        const { activePath: ap, saveDoc, closeTab } = useStore.getState();
        if (ap) void saveDoc(ap).finally(() => closeTab(ap)); // save-then-close (autosave)
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        nextTab(e.shiftKey ? -1 : 1);
      } else if (mod && e.shiftKey && !e.altKey && k === "t") {
        e.preventDefault();
        void reopenClosed();
      } else if (mod && e.altKey && e.shiftKey && e.code === "KeyT") {
        // Reformat Markdown table(s) — Sublime's Ctrl+Alt+Shift+T. App-level fallback because
        // WebView2 treats Ctrl+Alt as AltGr, which stops the editor keymap (Mod-Alt-Shift-t)
        // from matching; run it here against the active Markdown view instead. (e.code, not
        // e.key, so an AltGr-remapped character can't defeat the match.)
        e.preventDefault();
        const view = getActiveView();
        const { activePath: ap } = useStore.getState();
        if (view && ap && isMarkdownDoc(ap)) {
          reformatTables({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
          view.focus();
        }
      } else if (e.key === "F1") {
        e.preventDefault();
        useStore.getState().toggleHelp();
      } else if (e.key === "F5" || (mod && e.shiftKey && k === "r")) {
        // Refresh the file tree; prevent the default webview reload.
        e.preventDefault();
        void refreshTree();
      } else if (e.ctrlKey && e.altKey && e.code === "KeyP") {
        // Project quick-switch (Sublime's Ctrl+Alt+P). e.code is AltGr-safe (WebView2 treats
        // Ctrl+Alt as AltGr, which can defeat e.key-based matches).
        e.preventDefault();
        openPalette("projects");
      } else if (mod && e.shiftKey && k === "p") {
        e.preventDefault();
        openPalette("commands");
      } else if (mod && !e.shiftKey && !e.altKey && k === "p") {
        e.preventDefault(); // also suppresses the browser print dialog
        openPalette("files");
      } else if (mod && e.shiftKey && k === "l") {
        e.preventDefault();
        cycleView();
      } else if (mod && !e.shiftKey && !e.altKey && k === "o") {
        // Open File… (issue B.01). App-level so it works with tree/preview focus too, and
        // preventDefault is required: WebView2's own Ctrl+O accelerator is still live
        // (no browserAcceleratorKeys:false in tauri.conf.json), exactly like Ctrl+P/print.
        e.preventDefault();
        void useStore.getState().openFilesDialog();
      } else if (mod && e.shiftKey && k === "q") {
        // Open the configured quick file ([files] quick_file) — the always-at-hand notes file.
        e.preventDefault();
        void useStore.getState().openQuickFile();
      } else if (mod && e.shiftKey && !e.altKey && k === "n") {
        e.preventDefault();
        useStore.getState().newScratch(); // focuses the editor itself
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveActive, nextTab, reopenClosed, refreshTree, openPalette, cycleView]);

  // Footer-left: the active document's full path (a scratch shows its Untitled-N name,
  // matching the tab); with no document open, fall back to the workspace root. A
  // transient statusMessage (e.g. Locate File's "name (not found)") replaces it
  // until the store auto-clears it.
  const statusMessage = useStore((s) => s.statusMessage);
  const statusLeft = activeDoc
    ? isScratch(activeDoc.path)
      ? activeDoc.path.slice(SCRATCH_PREFIX.length)
      : activeDoc.path
    : root ?? "Writedown";

  // Footer shows only exceptional states (tabs already show dirty). Line/col live at right.
  const midStatus = activeDoc?.conflict
    ? "Modified externally — click to reload"
    : activeDoc?.error
      ? "Save failed"
      : "";

  // Outline pane side (config [outline] position; default "right"). "left" places it between the
  // tree and editor; "right" keeps today's far-right column. Reactive, so it reflows on config-save.
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const outlineVisible = useStore((s) => s.outlineVisible);
  const outlinePosition = useStore((s) => s.editorSettings?.outline_position);
  const outlineLeft = (outlinePosition ?? "right") === "left";
  const outlinePaneRef = useRef<HTMLElement>(null);
  const outlineDrag = (x: number) => {
    const r = outlinePaneRef.current?.getBoundingClientRect();
    if (!r) return;
    // Resizer sits on the outline's inner edge: its right edge when left-placed, else its left.
    setOutlineWidth(outlineLeft ? x - r.left : r.right - x);
  };
  const outlineAside = !outlineVisible ? null : (
    <aside
      ref={outlinePaneRef}
      className={"pane pane-outline" + (outlineLeft ? " pane-outline-left" : "")}
      style={{ flex: `0 0 ${outlineWidth}px` }}
      aria-label="Outline"
    >
      <div className="pane-header">Outline</div>
      <div className="pane-body">
        <Outline />
      </div>
    </aside>
  );
  const outlineResizer = outlineVisible ? <Resizer onDrag={outlineDrag} /> : null;

  // Project quick-switch dropdown (issue 3): the known projects (deduped/disambiguated
  // like the palette), ordered most-recently-used first. Projects only, not folders.
  const projSwitch = (() => {
    const key = (p: string) => p.replace(/\\/g, "/").toLowerCase();
    const rank = new Map(recentProjects.map((p, i) => [key(p), i] as const));
    return [...mergedProjects(useStore.getState())].sort(
      (a, b) => (rank.get(key(a.path)) ?? 1e9) - (rank.get(key(b.path)) ?? 1e9),
    );
  })();

  return (
    <div className={"app" + (dropActive ? " drop-active" : "")}>
      {configError && (
        <ErrorBar
          kind="config"
          text={configError}
          hint="config.toml — the settings above fell back to their defaults. Click the message to open the file; saving it re-reads everything."
          onClick={() => {
            const cf = useStore.getState().configFile;
            if (cf) void useStore.getState().openFile(cf, false);
          }}
          onDismiss={() => useStore.setState({ configError: null })}
        />
      )}
      {lastError && (
        <ErrorBar
          kind="general"
          text={lastError}
          hint="Also written to the log. × dismisses; palette → Show Last Error brings it back."
          onDismiss={() => useStore.getState().dismissError()}
        />
      )}
      <div className="panes">
        {sidebarVisible && (<>
        <aside
          className="pane pane-tree"
          style={{ flex: `0 0 ${treeWidth}px` }}
          aria-label="File tree"
        >
          <div className="pane-header panel-tabs">
            <button
              className={"panel-tab" + (panelTab === "folder" ? " active" : "")}
              onClick={() => setPanelTab("folder")}
            >
              Folder
            </button>
            <button
              className={"panel-tab" + (panelTab === "project" ? " active" : "")}
              onClick={() => setPanelTab("project")}
            >
              Project
            </button>
            <span className="panel-tabs-spacer" />
          </div>
          <OpenFiles />
          <div
            className="pane-body tree-body"
            ref={treeBodyRef}
            // Focusable so the tree can own arrows / Enter / F2 / Delete (issue C.03).
            // Clicking a row focuses this container (rows are not focusable themselves), and
            // the handler lives HERE rather than on the window — that is the structural
            // guarantee that Delete while typing can never delete a file.
            tabIndex={0}
            onKeyDown={onTreeKeyDown}
            onScroll={(e) => {
              if (restoringTreeScroll.current) return;
              setTreeScrollTop(e.currentTarget.scrollTop);
            }}
          >
            {panelTab === "folder" ? (
              folderRoot ? (
                <FileTree />
              ) : (
                <div className="placeholder">Open a folder to begin.</div>
              )
            ) : projFolders.length > 0 ? (
              <ProjectTree />
            ) : (
              <div className="placeholder">
                No project.
                <br />
                Ctrl+Shift+P → “Add Folder to Project”.
              </div>
            )}
          </div>
          {panelTab === "project" && projSwitch.length > 0 && (
            <div className="pane-footer">
              <select
                className="proj-switch"
                title="Switch project (most-recently-used)"
                value={projectFile ?? ""}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  if (v) void openProject(v);
                }}
              >
                {!projectFile && <option value="">Switch project…</option>}
                {projSwitch.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}
                  </option>
                ))}
              </select>
              {/* Issue H.02: the .wdproj is edited often enough to earn a one-click
                  button — the same call as the palette's "Project: Edit Project File",
                  greyed (never hidden, never re-purposed) when a folder is open without a
                  project. */}
              <button
                className="proj-edit"
                title={
                  projectFile
                    ? "Edit project file (.wdproj)"
                    : "Edit project file — no project open"
                }
                disabled={!projectFile}
                onClick={() => {
                  if (projectFile) void useStore.getState().openFile(projectFile, false);
                }}
              >
                📂
              </button>
            </div>
          )}
        </aside>

        <Resizer onDrag={(x) => setTreeWidth(x)} />
        </>)}

        {outlineLeft && (
          <>
            {outlineAside}
            {outlineResizer}
          </>
        )}

        <main className="pane pane-editor" aria-label="Editor">
          <div className="editor-topbar">
            {tabs.length > 0 ? <Tabs /> : <div className="pane-header">Editor</div>}
            <button
              className="view-toggle"
              onClick={() => cycleView()}
              title="Cycle editor / split / preview (Ctrl+Shift+L)"
            >
              {viewMode === "editor" ? "◧ Editor" : viewMode === "split" ? "◧◨ Split" : "◨ Preview"}
            </button>
            <button className="view-toggle" onClick={() => void openHelp()} title="Open Help (help.md)">
              ?
            </button>
          </div>
          <div className="editor-body">
            {activeDoc ? (
              img ? (
                // Image tab: full-pane viewer regardless of the global viewMode —
                // there is no text to edit, so editor/split make no sense here.
                <div className="split-body">
                  <ImageViewer path={activeDoc.path} />
                </div>
              ) : (
              <div className="split-body" ref={splitBodyRef}>
                {showEditor && (
                  <div
                    className="split-pane"
                    style={splitMode ? { flex: `0 0 ${splitRatio * 100}%` } : undefined}
                  >
                    <EditorBoundary>
                      <Editor path={activeDoc.path} content={activeDoc.content} />
                    </EditorBoundary>
                  </div>
                )}
                {splitMode && (
                  <Resizer
                    onDrag={(x) => {
                      const el = splitBodyRef.current;
                      if (!el) return;
                      const r = el.getBoundingClientRect();
                      setSplitRatio((x - r.left) / r.width);
                    }}
                  />
                )}
                {showPreview && csv ? (
                  // CSV/TSV: the CsvGrid control fills the pane (fzf search, column
                  // filters, sort, expand/contract, copy/save all built in). Single
                  // static tab label — no live/rendered split for data files.
                  <div className="split-pane preview-pane">
                    <div className="pane-header panel-tabs">
                      <button className="panel-tab active" disabled>
                        CSV
                      </button>
                      <span className="panel-tabs-spacer" />
                    </div>
                    <CsvPreview
                      content={activeDoc.content}
                      name={activeDoc.path.split(/[\\/]/).pop()}
                    />
                  </div>
                ) : showPreview ? (
                  <div className="split-pane preview-pane">
                    <div className="pane-header panel-tabs">
                      <button
                        className={"panel-tab" + (effectiveTab === "live" ? " active" : "")}
                        onClick={() => setPreviewTab("live")}
                      >
                        Preview
                      </button>
                      <button
                        className={"panel-tab" + (effectiveTab === "rendered" ? " active" : "")}
                        onClick={() => setPreviewTab("rendered")}
                        disabled={!ren && !renderBusy}
                        title={!ren && !renderBusy ? "Nothing rendered yet — press Ctrl+B" : undefined}
                      >
                        Rendered
                      </button>
                      <span className="panel-tabs-spacer" />
                    </div>
                    {effectiveTab === "live" ? (
                      <Preview content={activeDoc.content} baseDir={docDir} docKey={activeDoc.path} />
                    ) : ren ? (
                      <>
                        <div className="render-status">
                          <span className="render-info">
                            {ren.errors > 0 ? "✗" : "✓"} {ren.cells}{" "}
                            {ren.cells === 1 ? "cell" : "cells"} ·{" "}
                            {(ren.elapsedMs / 1000).toFixed(1)} s · rendered{" "}
                            {new Date(ren.at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {renderBusy ? (
                            <span className="render-busy">rendering…</span>
                          ) : activeDoc.content !== ren.source ? (
                            <span className="stale-badge">Stale</span>
                          ) : null}
                        </div>
                        <Preview
                          content={ren.markdown}
                          baseDir={docDir}
                          docKey={activeDoc.path}
                          lineMap={ren.lineMap}
                          initialSourceLine={ren.srcLine}
                          initialKey={ren.at}
                        />
                      </>
                    ) : (
                      <div className="placeholder">
                        {renderBusy
                          ? "Rendering…"
                          : "No render yet — press Ctrl+B (or Ctrl+Shift+P → Render Document)."}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              )
            ) : (
              <div className="placeholder">No document open.</div>
            )}
          </div>
        </main>

        {!outlineLeft && (
          <>
            {outlineResizer}
            {outlineAside}
          </>
        )}
      </div>

      <footer className="statusbar" aria-label="Status">
        <span className="status-left" title={statusMessage ?? statusLeft}>
          {statusMessage ?? statusLeft}
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
          {midStatus}
        </span>
        <span className="status-right">
          {activeDoc && !isImageDoc(activeDoc.path) && (
            <>
              <button
                className="status-item"
                title={
                  syntaxOverride[activeDoc.path]
                    ? "Syntax coloring set for this session — Syntax: Auto restores the extension's"
                    : "Syntax coloring for this file — click to choose another (session only)"
                }
                onClick={() => openPalette("commands", "Syntax: ")}
              >
                Syntax: {syntaxOverride[activeDoc.path] ?? syntaxNameForPath(activeDoc.path)}
              </button>
              <span className="status-sep">·</span>
            </>
          )}
          <button
            className="status-item"
            title="Toggle word wrap (session) — also in the command palette"
            onClick={() => toggleWordWrap()}
          >
            Wrap: {wordWrap ? "On" : "Off"}
          </button>
          <span className="status-sep">·</span>
          <button
            className="status-item"
            title="Toggle spell check (session) — also in the command palette"
            onClick={() => toggleSpell()}
          >
            Spell: {spellOn ? "On" : "Off"}
          </button>
          <span className="status-sep">·</span>
          {activeDoc && (
            <>
              <span className="status-pos">
                Ln {cursorLine}, Col {cursorCol}
                {selChars > 0 &&
                  ` · ${selLines} ${selLines === 1 ? "line" : "lines"}, ${selChars} ${selChars === 1 ? "char" : "chars"}`}
                {selRanges > 1 && ` · ${selRanges} selections`}
              </span>
              <span className="status-sep">·</span>
            </>
          )}
          <span className="status-ver">v{version}</span>
        </span>
      </footer>

      <Palette />
      <Versions />
      <Prompt />
      <Help />
      <About />
      <TreeContextMenu />
    </div>
  );
}

export default App;
