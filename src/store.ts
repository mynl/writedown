import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  addRecentProject,
  configPath,
  loadConfig,
  createDirectory,
  createFile,
  deletePath,
  listDirectory,
  loadBibliography,
  loadEditorSettings,
  loadLastWorkspace,
  loadProject,
  loadSession,
  loadSublimeTheme,
  pickFolder,
  pickProjectOpenPath,
  pickProjectSavePath,
  pickSavePath,
  readFile,
  recentProjects as fetchRecentProjects,
  reloadSpelling,
  renamePath,
  renderDocument,
  saveLastWorkspace,
  saveProject,
  watchWorkspace,
  writeFile,
  type EditorSettings,
  type Entry,
  type Session,
  type SublimeTheme,
} from "./api";
import { getActiveView } from "./editor/editorView";
import { isMarkdownDoc } from "./editor/languages";
import { cssFontWeight } from "./fontWeight";

/** Untitled scratch buffers live only in memory until "Save As" gives them a real path.
 *  Their synthetic path carries this sentinel so save/autosave/session logic can skip them. */
export const SCRATCH_PREFIX = "untitled://";
export const isScratch = (path: string) => path.startsWith(SCRATCH_PREFIX);

/** Focus the live editor once it has mounted for a just-opened/created document. */
function focusEditorSoon() {
  requestAnimationFrame(() => requestAnimationFrame(() => getActiveView()?.focus()));
}

// Window title mirrors ST: "name — Writedown" when a project is open.
function setTitle(project: string | null) {
  void getCurrentWindow()
    .setTitle(project ? `${project} — Writedown` : "Writedown")
    .catch(() => {});
}

// Paths Writedown just saved — used to ignore the watcher event our own write triggers.
const justSaved = new Set<string>();
let fsRefreshTimer: ReturnType<typeof setTimeout> | undefined;

const MIN_PANE = 140;
const MAX_PANE = 600;
const clamp = (w: number) => Math.max(MIN_PANE, Math.min(MAX_PANE, w));

export type Doc = {
  path: string;
  /** Working copy, always \n-normalised internally. */
  content: string;
  /** Content as of the last successful save (for the dirty check). */
  savedContent: string;
  /** The file's original newline convention, reapplied on save (spec §12). */
  eol: "\n" | "\r\n";
  /** Sublime-style preview tab: single-click opens here and is replaced by the next
   *  single-click; double-clicking or editing promotes it to a permanent tab. */
  preview: boolean;
  saving: boolean;
  error: string | null;
  /** Changed on disk externally while this tab had unsaved edits (spec §14). */
  conflict: boolean;
};

export const isDirty = (d: Doc) => d.content !== d.savedContent;

/** One completed render, kept per document path (in-memory only, never in the session).
 *  `source` is the exact text that was rendered — the Stale badge compares against it. */
export type Rendered = {
  markdown: string;
  source: string;
  at: number;
  cells: number;
  errors: number;
  elapsedMs: number;
  python: string;
};

type AppState = {
  root: string | null;
  rootEntries: Entry[];

  /** Project mode (ST-style): named set of folder roots. Empty = plain folder mode. */
  projFolders: string[];
  projectFile: string | null;
  projectName: string;
  recentProjects: string[];
  panelTab: "folder" | "project";

  tabs: Doc[];
  activePath: string | null;
  /** Paths of recently closed tabs, for reopen (Ctrl+Shift+T). */
  closedStack: string[];

  treeWidth: number;
  outlineWidth: number;

  treeVersion: number;
  palette: "files" | "commands" | null;
  /** Path whose Previous Versions picker is open (null = closed). */
  versionsFor: string | null;
  /** Small one-line input dialog (new file/folder names, etc.). */
  prompt: {
    title: string;
    placeholder: string;
    submit: (value: string) => void | Promise<void>;
  } | null;
  /** Right-click file-tree context menu (null = closed). */
  treeMenu: { x: number; y: number; entry: Entry } | null;
  viewMode: "editor" | "split" | "preview";
  /** Which pane the preview column shows: the live preview or the last render snapshot. */
  previewTab: "live" | "rendered";
  /** Completed renders by document path (in-memory only). */
  rendered: Record<string, Rendered>;
  renderBusy: boolean;
  cursorLine: number;
  cursorCol: number;
  sublimeTheme: SublimeTheme | null;
  editorSettings: EditorSettings | null;
  configFile: string | null;
  /** Non-null when config.toml failed to parse — surfaced in the UI (fonts + bibliography
   *  silently fall back to defaults otherwise). Cleared on a successful load. */
  configError: string | null;
  /** Points added to the editor's configured font size (Ctrl+=/Ctrl+-/Ctrl+0). Global
   *  UI preference, persisted in localStorage. */
  editorZoom: number;
  /** Monotonic counter for naming new scratch buffers (Untitled-1, -2, …). */
  scratchCounter: number;

  hydrate: () => Promise<void>;
  restoreSession: (key: string) => Promise<void>;
  loadTheme: () => Promise<void>;
  openFolder: () => Promise<void>;
  setRoot: (path: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  openFile: (path: string, preview?: boolean) => Promise<void>;
  reloadDoc: (path: string) => Promise<void>;
  onFsChange: (paths: string[]) => void;
  setActive: (path: string) => void;
  promoteTab: (path: string) => void;
  closeTab: (path: string) => void;
  reopenClosed: () => Promise<void>;
  nextTab: (dir: 1 | -1) => void;
  editActive: (content: string) => void;
  /** Adjust the editor font zoom: +1 / -1 points, or "reset" to the configured size. */
  setEditorZoom: (delta: number | "reset") => void;
  /** Bake the current zoomed size into config.toml's [editor] font_size (a deliberate,
   *  surgical edit — the only time we write your config), then reset the zoom to 0. */
  setSizeAsDefault: () => Promise<void>;
  /** Replace an open tab's editor content (e.g. restore a backup) without saving —
   *  leaves it dirty so the user reviews and saves deliberately. */
  loadContent: (path: string, content: string) => void;
  openVersions: () => void;
  closeVersions: () => void;
  saveDoc: (path: string) => Promise<void>;
  saveActive: () => Promise<void>;
  saveAll: () => Promise<void>;
  openPalette: (mode: "files" | "commands") => void;
  closePalette: () => void;
  openPrompt: (
    title: string,
    placeholder: string,
    submit: (value: string) => void | Promise<void>,
  ) => void;
  closePrompt: () => void;
  newFile: (rel: string) => Promise<void>;
  newFolder: (rel: string) => Promise<void>;
  /** File-tree context menu + operations (all explicit user commands). */
  openTreeMenu: (x: number, y: number, entry: Entry) => void;
  closeTreeMenu: () => void;
  /** Prompt for a name and create a new file/folder inside `dir`. */
  newFileIn: (dir: string) => void;
  newFolderIn: (dir: string) => void;
  /** Prompt for a new name and rename a tree entry (rebinds any open tab). */
  renameEntry: (entry: Entry) => void;
  /** Confirm, then move a tree entry to the Recycle Bin (closes any open tab). */
  deleteEntry: (entry: Entry) => Promise<void>;
  /** Open a new in-memory scratch buffer (untitled, unsaved). */
  newScratch: () => void;
  /** Save the given tab (or the active one) to a new path chosen via a dialog. Promotes a
   *  scratch buffer to a real file. */
  saveAs: (path?: string) => Promise<void>;
  setPanelTab: (tab: "folder" | "project") => void;
  addFolderToProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  openProject: (path?: string) => Promise<void>;
  closeProject: () => void;
  removeProjectFolder: (path: string) => void;
  loadRecentProjects: () => Promise<void>;
  cycleView: () => void;
  setPreviewTab: (tab: "live" | "rendered") => void;
  /** Render the active markdown/quarto document (palette: "Render Document"). */
  renderActive: () => Promise<void>;
  setCursorPos: (line: number, col: number) => void;
  setTreeWidth: (w: number) => void;
  setOutlineWidth: (w: number) => void;
};

export const useStore = create<AppState>((set, get) => ({
  root: null,
  rootEntries: [],
  projFolders: [],
  projectFile: null,
  projectName: "",
  recentProjects: [],
  panelTab: "folder",
  tabs: [],
  activePath: null,
  closedStack: [],
  treeVersion: 0,
  palette: null,
  versionsFor: null,
  prompt: null,
  treeMenu: null,
  viewMode: "split",
  previewTab: "live",
  rendered: {},
  renderBusy: false,
  cursorLine: 1,
  cursorCol: 1,
  sublimeTheme: null,
  editorSettings: null,
  configFile: null,
  configError: null,
  editorZoom: (() => {
    const v = Number(localStorage.getItem("wd.editorZoom"));
    return Number.isFinite(v) ? v : 0;
  })(),
  scratchCounter: 0,
  treeWidth: 240,
  outlineWidth: 220,

  // Restore the last session on startup (spec §24), keyed by workspace. Missing
  // folders/files are skipped silently — a stale session must never block launch.
  hydrate: async () => {
    void get().loadRecentProjects();
    let ws: string | null = null;
    try {
      ws = await loadLastWorkspace();
    } catch {
      return;
    }
    if (!ws) return;
    if (ws.toLowerCase().endsWith(".wdproj")) {
      // Last workspace was a project — reopen it (openProject restores its session).
      try {
        await get().openProject(ws);
      } catch {
        /* project file gone */
      }
      return;
    }
    try {
      await get().setRoot(ws);
    } catch {
      return; // workspace no longer exists
    }
    await get().restoreSession(ws);
  },

  // Restore tabs/pane-widths for a session key (a folder path or a project file path).
  restoreSession: async (key: string) => {
    let s: Session;
    try {
      s = await loadSession(key);
    } catch {
      return;
    }
    if (s.tree_width != null) set({ treeWidth: clamp(s.tree_width) });
    if (s.outline_width != null) set({ outlineWidth: clamp(s.outline_width) });
    for (const p of s.open_tabs ?? []) {
      try {
        await get().openFile(p);
      } catch {
        /* file no longer exists */
      }
    }
    if (s.active_tab && get().tabs.some((t) => t.path === s.active_tab)) {
      set({ activePath: s.active_tab });
    }
  },

  openFolder: async () => {
    const picked = await pickFolder();
    if (!picked) return;
    // Opening a folder leaves project mode (like ST's Open Folder in this window).
    set({ projFolders: [], projectFile: null, projectName: "", panelTab: "folder" });
    setTitle(null);
    await get().setRoot(picked);
  },

  setRoot: async (path: string) => {
    const rootEntries = await listDirectory(path);
    set((s) => ({ root: path, rootEntries, treeVersion: s.treeVersion + 1 }));
    const { projFolders, projectFile } = get();
    if (!projectFile && projFolders.length === 0) {
      void saveLastWorkspace(path); // remember for the next cold start
      void watchWorkspace([path]).catch(() => {}); // watch for external changes (spec §14)
    }
  },

  // Re-list the workspace and remount the tree (F5 / Ctrl+Shift+R). External-change
  // auto-refresh via file watching is Phase 4.
  refreshTree: async () => {
    const { root } = get();
    if (!root) return;
    try {
      const rootEntries = await listDirectory(root);
      set((s) => ({ rootEntries, treeVersion: s.treeVersion + 1 }));
    } catch {
      /* folder gone */
    }
  },

  openFile: async (path: string, preview = false) => {
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      // Already open: focus it, and promote if this was a permanent open.
      set((s) => ({
        activePath: path,
        tabs:
          !preview && existing.preview
            ? s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t))
            : s.tabs,
      }));
      return;
    }
    const raw = await readFile(path);
    const eol: Doc["eol"] = raw.includes("\r\n") ? "\r\n" : "\n";
    const content = raw.split("\r\n").join("\n");
    const doc: Doc = {
      path, content, savedContent: content, eol, preview, saving: false, error: null,
      conflict: false,
    };
    set((s) => {
      // A concurrent openFile (e.g. double-click firing click twice) may have added
      // this tab during our `await readFile` — dedupe here so we never get two tabs.
      const dup = s.tabs.find((t) => t.path === path);
      if (dup) {
        return {
          activePath: path,
          tabs:
            !preview && dup.preview
              ? s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t))
              : s.tabs,
        };
      }
      // A single preview slot: a new preview replaces the current preview tab.
      if (preview) {
        const idx = s.tabs.findIndex((t) => t.preview);
        if (idx >= 0) {
          const tabs = s.tabs.slice();
          tabs[idx] = doc;
          return { tabs, activePath: path };
        }
      }
      return { tabs: [...s.tabs, doc], activePath: path };
    });
  },

  setActive: (path) => {
    // Switching tabs counts as losing focus on the tab you leave — save it (ST-style).
    // The idle timer is gone; the remaining triggers are Ctrl+S, window blur, tab switch.
    const prev = get().activePath;
    if (prev && prev !== path) void get().saveDoc(prev);
    set({ activePath: path });
  },

  promoteTab: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t)),
    })),

  reloadDoc: async (path) => {
    if (!get().tabs.some((t) => t.path === path)) return;
    try {
      const raw = await readFile(path);
      const eol: Doc["eol"] = raw.includes("\r\n") ? "\r\n" : "\n";
      const content = raw.split("\r\n").join("\n");
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path
            ? { ...t, content, savedContent: content, eol, conflict: false, error: null }
            : t,
        ),
      }));
    } catch {
      /* file removed/unreadable — leave the tab as-is */
    }
  },

  // React to external filesystem changes (spec §14): refresh the tree (soft, so expanded
  // folders stay open), reload unmodified open files, flag conflicts on modified ones.
  // Ignores the events our own saves trigger.
  onFsChange: (paths) => {
    const root = get().root;
    if (root) {
      clearTimeout(fsRefreshTimer);
      fsRefreshTimer = setTimeout(() => {
        listDirectory(root)
          .then((rootEntries) => set({ rootEntries }))
          .catch(() => {});
      }, 400);
    }
    const open = new Map(get().tabs.map((t) => [t.path, t]));
    for (const p of paths) {
      if (justSaved.has(p)) continue;
      const doc = open.get(p);
      if (!doc) continue;
      if (isDirty(doc)) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.path === p ? { ...t, conflict: true } : t)),
        }));
      } else {
        void get().reloadDoc(p);
      }
    }
  },

  closeTab: (path) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path);
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activePath = s.activePath;
      if (s.activePath === path) {
        activePath = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].path : null;
      }
      return { tabs, activePath, closedStack: [...s.closedStack, path] };
    }),

  reopenClosed: async () => {
    const { closedStack } = get();
    if (!closedStack.length) return;
    const path = closedStack[closedStack.length - 1];
    set({ closedStack: closedStack.slice(0, -1) });
    try {
      await get().openFile(path);
    } catch {
      /* file no longer exists */
    }
  },

  nextTab: (dir) => {
    const { tabs, activePath } = get();
    if (tabs.length < 2) return;
    const i = tabs.findIndex((t) => t.path === activePath);
    const n = (i + dir + tabs.length) % tabs.length;
    set({ activePath: tabs[n].path });
  },

  editActive: (content) =>
    set((s) => ({
      // Editing promotes a preview tab to permanent (Sublime behaviour).
      tabs: s.tabs.map((t) =>
        t.path === s.activePath ? { ...t, content, preview: false } : t,
      ),
    })),

  setEditorZoom: (delta) =>
    set((s) => {
      const next = delta === "reset" ? 0 : Math.max(-10, Math.min(32, s.editorZoom + delta));
      localStorage.setItem("wd.editorZoom", String(next));
      return { editorZoom: next };
    }),

  setSizeAsDefault: async () => {
    const { editorSettings, editorZoom, configFile } = get();
    if (!configFile || editorZoom === 0) return; // nothing to bake in
    const target = (editorSettings?.font_size ?? 14) + editorZoom;
    let text: string;
    try {
      text = await loadConfig();
    } catch {
      return;
    }
    // Surgically replace [editor] font_size (or insert it) — preserve every other line,
    // comment, and scalar style. This is the one deliberate config write we allow.
    const re = /(\[editor\][^[]*?\bfont_size\s*=\s*)\d+/;
    const next = re.test(text)
      ? text.replace(re, `$1${target}`)
      : /\[editor\]\s*\n/.test(text)
        ? text.replace(/\[editor\]\s*\n/, `[editor]\nfont_size = ${target}\n`)
        : `${text}\n[editor]\nfont_size = ${target}\n`;
    try {
      await writeFile(configFile, next); // atomic + auto-backed-up
    } catch {
      return;
    }
    get().setEditorZoom("reset"); // the configured base now includes it
    await get().loadTheme(); // re-read config + re-apply
  },

  loadContent: (path, content) =>
    set((s) => ({
      // Push new content into the tab but leave savedContent alone → the tab goes dirty,
      // so a restored version is reviewed and saved (or discarded) deliberately.
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content, conflict: false } : t)),
    })),

  openVersions: () => {
    const a = get().activePath;
    if (a) set({ versionsFor: a });
  },
  closeVersions: () => set({ versionsFor: null }),

  saveDoc: async (path) => {
    if (isScratch(path)) return; // untitled buffers have no disk path — use Save As
    const doc = get().tabs.find((t) => t.path === path);
    if (!doc || !isDirty(doc) || doc.saving) return;

    const snapshot = doc.content;
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, saving: true, error: null } : t)),
    }));

    const out = doc.eol === "\r\n" ? snapshot.split("\n").join("\r\n") : snapshot;
    try {
      await writeFile(path, out);
      justSaved.add(path); // ignore the watcher event our own write will trigger
      setTimeout(() => justSaved.delete(path), 1500);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path
            ? { ...t, saving: false, savedContent: snapshot, conflict: false }
            : t,
        ),
      }));
      // Saving config.toml re-applies appearance + reindexes the bibliography live, and
      // re-reads the personal dictionary (in case [spelling] personal_dictionary changed).
      if (path === get().configFile) {
        void get().loadTheme();
        void loadBibliography().catch(() => {});
        void reloadSpelling().catch(() => {});
      }
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.path === path ? { ...t, saving: false, error: String(e) } : t)),
      }));
    }
  },

  saveActive: async () => {
    const a = get().activePath;
    if (!a) return;
    if (isScratch(a)) await get().saveAs(a); // Ctrl+S on an untitled buffer → Save As
    else await get().saveDoc(a);
  },

  // Autosave every dirty document (window blur, idle, app close — spec §12).
  saveAll: async () => {
    for (const t of get().tabs) {
      if (isDirty(t)) await get().saveDoc(t.path);
    }
  },

  // Load appearance: Sublime colour scheme (spec §11) + config editor settings. On any
  // failure the built-in theme / defaults stay. Re-run to pick up config.toml edits.
  loadTheme: async () => {
    try {
      const st = await loadSublimeTheme();
      const root = document.documentElement.style;
      // Selection + YAML front-matter colours go through CSS vars (global CSS reliably
      // overrides CodeMirror). Loudoun → orange keys, green values.
      root.setProperty("--cm-sel", st.selection);
      const pick = (...scopes: string[]) => {
        for (const s of scopes) {
          const r =
            st.rules.find((x) => x.scope === s) ??
            st.rules.find((x) => x.scope.split(/[ ,]+/).includes(s));
          if (r?.foreground) return r.foreground;
        }
        return undefined;
      };
      const key = pick("entity.name.tag.yaml", "keyword");
      const val = pick("string");
      const delim = pick("comment");
      if (key) root.setProperty("--wd-yaml-key", key);
      if (val) root.setProperty("--wd-yaml-val", val);
      if (delim) root.setProperty("--wd-yaml-delim", delim);
      set({ sublimeTheme: st });
    } catch {
      /* no Sublime install / unreadable — the built-in theme stays */
    }
    try {
      const es = await loadEditorSettings();
      set({ editorSettings: es, configError: null });
      const root = document.documentElement.style;
      if (es.outline_font_family) root.setProperty("--outline-font", es.outline_font_family);
      if (es.outline_font_size != null) {
        root.setProperty("--outline-size", `${es.outline_font_size}pt`);
      }
      if (es.tree_font_family) root.setProperty("--tree-font", es.tree_font_family);
      if (es.tree_font_size != null) {
        root.setProperty("--tree-size", `${es.tree_font_size}pt`);
      }
      const ow = cssFontWeight(es.outline_font_weight);
      const tw = cssFontWeight(es.tree_font_weight);
      if (ow) root.setProperty("--outline-weight", ow);
      if (tw) root.setProperty("--tree-weight", tw);
      // TOC guide lines: an explicit color wins; else modulate a neutral gray by opacity.
      if (es.outline_guide_color) root.setProperty("--tree-line", es.outline_guide_color);
      else if (es.outline_guide_opacity != null) {
        root.setProperty("--tree-line", `rgba(127,127,127,${es.outline_guide_opacity})`);
      }
      // Document tab strip: thinner/narrower ST-style tabs when configured.
      if (es.tab_height != null) root.setProperty("--tab-height", `${es.tab_height}px`);
      if (es.tab_width != null) root.setProperty("--tab-width", `${es.tab_width}px`);
    } catch (e) {
      // Don't swallow it — a bad line reverts ALL fonts (and the bibliography) to
      // defaults, so surface the parse error in the UI instead of only to stderr.
      set({ configError: String(e) });
    }
    try {
      set({ configFile: await configPath() });
    } catch {
      /* ignore */
    }
  },

  openPalette: (mode) => set({ palette: mode }),
  closePalette: () => set({ palette: null }),

  cycleView: () =>
    set((s) => ({
      viewMode:
        s.viewMode === "editor" ? "split" : s.viewMode === "split" ? "preview" : "editor",
    })),

  setPreviewTab: (tab) => set({ previewTab: tab }),

  // Render the live buffer through the Rust pipeline (spec: never reads/writes the file;
  // figures travel as data URIs). Result is a static snapshot shown in the Rendered tab.
  renderActive: async () => {
    const { activePath, tabs, renderBusy } = get();
    const doc = tabs.find((t) => t.path === activePath);
    if (!doc || !isMarkdownDoc(doc.path) || renderBusy) return;
    const source = doc.content;
    set({ renderBusy: true });
    try {
      const r = await renderDocument(source, isScratch(doc.path) ? null : doc.path);
      set((s) => ({
        rendered: {
          ...s.rendered,
          [doc.path]: {
            markdown: r.markdown,
            source,
            at: Date.now(),
            cells: r.cells,
            errors: r.errors,
            elapsedMs: r.elapsed_ms,
            python: r.python,
          },
        },
        previewTab: "rendered",
        // Make the result visible: editor-only view switches to split.
        viewMode: s.viewMode === "editor" ? "split" : s.viewMode,
      }));
    } catch (e) {
      // Surfaced in the Rendered pane rather than swallowed (spec §25).
      set((s) => ({
        rendered: {
          ...s.rendered,
          [doc.path]: {
            markdown: `<p class="render-summary err">✗ render failed: ${String(e)}</p>`,
            source,
            at: Date.now(),
            cells: 0,
            errors: 1,
            elapsedMs: 0,
            python: String(e),
          },
        },
        previewTab: "rendered",
        viewMode: s.viewMode === "editor" ? "split" : s.viewMode,
      }));
    } finally {
      set({ renderBusy: false });
    }
  },

  setCursorPos: (line, col) => {
    const s = get();
    if (s.cursorLine !== line || s.cursorCol !== col) set({ cursorLine: line, cursorCol: col });
  },

  setTreeWidth: (w) => set({ treeWidth: clamp(w) }),
  setOutlineWidth: (w) => set({ outlineWidth: clamp(w) }),

  openPrompt: (title, placeholder, submit) => set({ prompt: { title, placeholder, submit } }),
  closePrompt: () => set({ prompt: null }),

  // New file/folder, relative to the workspace root (or absolute if given).
  newFile: async (rel) => {
    const { root, refreshTree, openFile } = get();
    if (!root || !rel.trim()) return;
    const path = /^([a-zA-Z]:|\\\\|\/)/.test(rel) ? rel : `${root}\\${rel.replace(/\//g, "\\")}`;
    await createFile(path);
    await refreshTree();
    await openFile(path, false);
    focusEditorSoon(); // land the cursor in the editor, not the tree
  },

  newScratch: () => {
    const n = get().scratchCounter + 1;
    const path = `${SCRATCH_PREFIX}Untitled-${n}.md`;
    const doc: Doc = {
      path, content: "", savedContent: "", eol: "\n", preview: false,
      saving: false, error: null, conflict: false,
    };
    set((s) => ({ tabs: [...s.tabs, doc], activePath: path, scratchCounter: n }));
    focusEditorSoon();
  },

  saveAs: async (path) => {
    const p = path ?? get().activePath;
    const doc = get().tabs.find((t) => t.path === p);
    if (!doc) return;
    const root = get().root;
    const suggested = isScratch(doc.path)
      ? `Untitled.md`
      : doc.path.split(/[\\/]/).pop() ?? "Untitled.md";
    const defaultPath = root ? `${root}\\${suggested}` : suggested;
    const picked = await pickSavePath(defaultPath);
    if (!picked) return;
    const snapshot = doc.content;
    const out = doc.eol === "\r\n" ? snapshot.split("\n").join("\r\n") : snapshot;
    try {
      await writeFile(picked, out); // backs up any file it overwrites (Rust write_file)
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.path === doc.path ? { ...t, error: String(e) } : t)),
      }));
      return;
    }
    justSaved.add(picked);
    setTimeout(() => justSaved.delete(picked), 1500);
    // Rebind the tab from its old (scratch or real) path to the chosen path, now saved-clean.
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === doc.path
          ? { ...t, path: picked, savedContent: snapshot, conflict: false, error: null }
          : t,
      ),
      activePath: s.activePath === doc.path ? picked : s.activePath,
    }));
    await get().refreshTree();
    focusEditorSoon();
  },

  newFolder: async (rel) => {
    const { root, refreshTree } = get();
    if (!root || !rel.trim()) return;
    const path = /^([a-zA-Z]:|\\\\|\/)/.test(rel) ? rel : `${root}\\${rel.replace(/\//g, "\\")}`;
    await createDirectory(path);
    await refreshTree();
  },

  // ---- File-tree context menu + operations --------------------------------------
  openTreeMenu: (x, y, entry) => set({ treeMenu: { x, y, entry } }),
  closeTreeMenu: () => set({ treeMenu: null }),

  newFileIn: (dir) => {
    get().openPrompt("New file", "name.md", async (name) => {
      if (!name.trim()) return;
      const path = `${dir.replace(/[\\/]+$/, "")}\\${name.replace(/\//g, "\\")}`;
      try {
        await createFile(path);
        await get().refreshTree();
        await get().openFile(path, false);
        focusEditorSoon();
      } catch (e) {
        set({ configError: String(e) });
      }
    });
  },

  newFolderIn: (dir) => {
    get().openPrompt("New folder", "name", async (name) => {
      if (!name.trim()) return;
      const path = `${dir.replace(/[\\/]+$/, "")}\\${name.replace(/\//g, "\\")}`;
      try {
        await createDirectory(path);
        await get().refreshTree();
      } catch (e) {
        set({ configError: String(e) });
      }
    });
  },

  renameEntry: (entry) => {
    const oldName = entry.name;
    get().openPrompt(`Rename "${oldName}"`, oldName, async (name) => {
      if (!name.trim() || name === oldName) return;
      const parent = entry.path.slice(0, entry.path.length - oldName.length).replace(/[\\/]+$/, "");
      const to = `${parent}\\${name.replace(/\//g, "\\")}`;
      try {
        await renamePath(entry.path, to);
      } catch (e) {
        set({ configError: String(e) });
        return;
      }
      // Rebind any open tab that pointed at the old path (or lived under a renamed folder).
      const rebind = (p: string) =>
        p === entry.path
          ? to
          : p.startsWith(entry.path + "\\")
            ? to + p.slice(entry.path.length)
            : p;
      set((s) => ({
        tabs: s.tabs.map((t) => ({ ...t, path: rebind(t.path) })),
        activePath: s.activePath ? rebind(s.activePath) : s.activePath,
      }));
      await get().refreshTree();
    });
  },

  deleteEntry: async (entry) => {
    const kind = entry.is_dir ? "folder" : "file";
    if (!window.confirm(`Move ${kind} "${entry.name}" to the Recycle Bin?`)) return;
    try {
      await deletePath(entry.path);
    } catch (e) {
      set({ configError: String(e) });
      return;
    }
    // Close any tab that pointed at the deleted path (or lived under a deleted folder).
    const gone = (p: string) => p === entry.path || p.startsWith(entry.path + "\\");
    set((s) => {
      const tabs = s.tabs.filter((t) => !gone(t.path));
      const activePath = s.activePath && gone(s.activePath)
        ? (tabs.length ? tabs[tabs.length - 1].path : null)
        : s.activePath;
      return { tabs, activePath };
    });
    await get().refreshTree();
  },

  setPanelTab: (tab) => set({ panelTab: tab }),

  // ---- Projects (ST-style): a named set of folder roots -------------------------

  addFolderToProject: async () => {
    const picked = await pickFolder();
    if (!picked) return;
    // Add exactly the folder you pick — never auto-absorb the currently-open folder.
    // (Snapshotting the open folder into a project is done deliberately via Save Project
    // As.) So the first add yields a one-folder project, the second yields two, etc.
    const { projFolders } = get();
    if (projFolders.includes(picked)) return;
    const folders = [...projFolders, picked];
    set({ projFolders: folders, panelTab: "project" });
    if (!get().root) await get().setRoot(picked);
    void watchWorkspace(folders).catch(() => {});
    setTitle(get().projectName || "unsaved project");
  },

  saveProjectAs: async () => {
    const { projFolders, root, projectName } = get();
    const folders = projFolders.length > 0 ? projFolders : root ? [root] : [];
    if (folders.length === 0) return;
    const suggested = `${root ?? folders[0]}\\${projectName || "project"}.wdproj`;
    const path = await pickProjectSavePath(suggested);
    if (!path) return;
    const name = path.replace(/\\/g, "/").split("/").pop()!.replace(/\.wdproj$/i, "");
    await saveProject(path, { name, folders });
    set({ projFolders: folders, projectFile: path, projectName: name, panelTab: "project" });
    void addRecentProject(path).then(() => get().loadRecentProjects());
    void saveLastWorkspace(path);
    setTitle(name);
  },

  openProject: async (path?: string) => {
    const file = path ?? (await pickProjectOpenPath());
    if (!file) return;
    const proj = await loadProject(file);
    if (proj.folders.length === 0) throw new Error(`project has no folders: ${file}`);
    set({
      projFolders: proj.folders,
      projectFile: file,
      projectName: proj.name,
      panelTab: "project",
      tabs: [],
      activePath: null,
      closedStack: [],
    });
    await get().setRoot(proj.folders[0]);
    void watchWorkspace(proj.folders).catch(() => {});
    void addRecentProject(file).then(() => get().loadRecentProjects());
    void saveLastWorkspace(file);
    setTitle(proj.name);
    await get().restoreSession(file);
  },

  closeProject: () => {
    const { root } = get();
    set({ projFolders: [], projectFile: null, projectName: "", panelTab: "folder" });
    setTitle(null);
    if (root) {
      void saveLastWorkspace(root);
      void watchWorkspace([root]).catch(() => {});
    }
  },

  removeProjectFolder: (path) => {
    const folders = get().projFolders.filter((f) => f !== path);
    set({ projFolders: folders });
    if (folders.length > 0) void watchWorkspace(folders).catch(() => {});
  },

  loadRecentProjects: async () => {
    try {
      set({ recentProjects: await fetchRecentProjects() });
    } catch {
      /* fine — no recents yet */
    }
  },
}));

/** The key a session is stored under: the project file when one is open, else the root. */
export const sessionKey = (s: AppState): string | null =>
  s.projectFile ?? (s.projFolders.length > 0 ? s.projFolders.join("|") : s.root);

/** The persistable slice of state (spec §24). */
export const sessionSnapshot = (s: AppState): Session => ({
  // Preview tabs and unsaved scratch buffers are transient — persist only real, permanent tabs.
  open_tabs: s.tabs.filter((t) => !t.preview && !isScratch(t.path)).map((t) => t.path),
  active_tab: s.activePath,
  tree_width: s.treeWidth,
  outline_width: s.outlineWidth,
});
