import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import {
  addRecentProject,
  configPath,
  loadConfig,
  createDirectory,
  createFile,
  deletePath,
  listDirectory,
  listProjects,
  loadBibliography,
  loadEditorSettings,
  loadGlobalState,
  loadProject,
  loadSession,
  loadSublimeTheme,
  newProject as newProjectApi,
  pickFolder,
  pickProjectOpenPath,
  saveManagedProject,
  saveSession,
  pickSavePath,
  openExternal,
  personalDictionaryPath,
  readFile,
  recentProjects as fetchRecentProjects,
  reloadSpelling,
  renamePath,
  renderDocument,
  saveLastWorkspace,
  saveProject,
  watchExtraFiles,
  watchWorkspace,
  writeFile,
  type EditorSettings,
  type Entry,
  type ProjectInfo,
  type Session,
  type SublimeTheme,
} from "./api";
import { forceLinting } from "@codemirror/lint";
import {
  getActiveView,
  seedDocPositions,
  snapshotDocPositions,
} from "./editor/editorView";
import { isExternalDoc, isMarkdownDoc } from "./editor/languages";
import { cssFontWeight } from "./fontWeight";

/** Untitled scratch buffers live only in memory until "Save As" gives them a real path.
 *  Their synthetic path carries this sentinel so save/autosave/session logic can skip them. */
export const SCRATCH_PREFIX = "untitled://";
export const isScratch = (path: string) => path.startsWith(SCRATCH_PREFIX);

/** Case-insensitive, separator-insensitive path equality (Windows). */
const samePath = (a: string, b: string) =>
  a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();

/** Pending auto-clear for the transient status-bar message (one at a time; a new
 *  message supersedes the old timer). */
let statusMsgTimer: number | undefined;

const normPath = (p: string) => p.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
/** Is `p` inside `root`? Case- and separator-insensitive (Windows). */
const underRoot = (p: string, root: string) => normPath(p).startsWith(normPath(root) + "/");

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
// Editor|preview split fraction (the editor's share) — kept within readable bounds.
const clampRatio = (r: number) => Math.max(0.2, Math.min(0.8, r));

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
  /** Expanded→source line map from the build (index = expanded line − 1; 0 = synthetic). */
  lineMap: number[];
  /** Editor's top visible source line at build time — the rendered view opens there. */
  srcLine: number | null;
};

type AppState = {
  /** Operational anchor: where new files / quick-open / save-as / watching are rooted
   *  (= the plain folder, or the project's first folder in project mode). */
  root: string | null;
  /** The Folder tab's OWN root, independent of any open project — so the Folder tab never
   *  mirrors the project's first folder. Set only when a plain folder is opened/restored. */
  folderRoot: string | null;
  rootEntries: Entry[];

  /** Project mode (ST-style): named set of folder roots. Empty = plain folder mode. */
  projFolders: string[];
  projectFile: string | null;
  projectName: string;
  recentProjects: string[];
  /** All managed projects under ~/.writedown/projects/ (for the palette quick-switch). */
  projects: ProjectInfo[];
  panelTab: "folder" | "project";

  tabs: Doc[];
  activePath: string | null;
  /** Paths of recently closed tabs, for reopen (Ctrl+Shift+T). */
  closedStack: string[];

  treeWidth: number;
  outlineWidth: number;
  /** Editor|preview split fraction in split view (0..1, the editor's share). */
  splitRatio: number;
  /** Side panel (tabs/open-files/tree) and outline visibility — session-persisted, so
   *  project-level when a project is open, else per folder (author's rider on items 4/5). */
  sidebarVisible: boolean;
  outlineVisible: boolean;

  treeVersion: number;
  /** Expanded folder paths in the tree, kept in the store so a treeVersion remount (after a
   *  file op) restores expansion instead of folding everything up. Keyed by path, not by
   *  React mount identity. */
  expandedPaths: Set<string>;
  /** Last tree-body scroll offset, restored across a remount so New File/Delete don't jump. */
  treeScrollTop: number;
  palette: "files" | "commands" | "projects" | null;
  /** Keyboard-shortcuts help overlay open (F1 / palette). */
  helpOpen: boolean;
  /** About dialog open (palette: "About Writedown"). */
  aboutOpen: boolean;
  /** Path whose Previous Versions picker is open (null = closed). */
  versionsFor: string | null;
  /** Small one-line input dialog (new file/folder names, etc.). `initial` prefills the
   *  input (selected, so typing replaces it) — used by rename-style prompts. */
  prompt: {
    title: string;
    placeholder: string;
    submit: (value: string) => void | Promise<void>;
    initial?: string;
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
  /** Session word-wrap state. [editor] word_wrap sets the launch default; toggled live via a
   *  CodeMirror Compartment (editor/wrap.ts), so it never rebuilds the editor. */
  wordWrap: boolean;
  /** Session spellcheck on/off. [spelling] enabled sets the launch default; the runtime toggle
   *  needs no config edit (old configs missing the [spelling] section still toggle). */
  spellOn: boolean;
  /** Words to ignore for this session only (lowercased). Distinct from "Add to Dictionary",
   *  which is permanent (a Rust-side personal dictionary file). */
  spellIgnore: Set<string>;
  configFile: string | null;
  /** Resolved personal-dictionary path, so saving it as a tab can reload spelling. */
  personalDictFile: string | null;
  /** Non-null when config.toml failed to parse — surfaced in the UI (fonts + bibliography
   *  silently fall back to defaults otherwise). Cleared on a successful load. */
  configError: string | null;
  /** Points added to the editor's configured font size (Ctrl+=/Ctrl+-/Ctrl+0). Global
   *  UI preference, persisted in localStorage. */
  editorZoom: number;
  /** Monotonic counter for naming new scratch buffers (Untitled-1, -2, …). */
  scratchCounter: number;
  /** Bumped on every scratch-buffer edit, so the debounced session save (hot exit)
   *  notices content changes without fingerprinting the text itself on each keystroke. */
  scratchRev: number;

  hydrate: () => Promise<void>;
  restoreSession: (key: string) => Promise<void>;
  loadTheme: () => Promise<void>;
  openFolder: () => Promise<void>;
  setRoot: (path: string) => Promise<void>;
  setFolderRoot: (path: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  /** Record a folder's expanded/collapsed state (survives tree remounts). */
  setPathExpanded: (path: string, on: boolean) => void;
  /** Record the tree-body scroll offset for restore across a remount. */
  setTreeScrollTop: (top: number) => void;
  /** Toggle prose spellcheck for the session (no config edit needed). */
  toggleSpell: () => void;
  /** Ignore a word for this session only (lowercased) — distinct from Add to Dictionary. */
  ignoreWord: (word: string) => void;
  openFile: (path: string, preview?: boolean) => Promise<void>;
  /** Open the configured `[files] quick_file` (Ctrl+Shift+Q). Missing config or file
   *  surfaces in the footer rather than failing silently. */
  openQuickFile: () => Promise<void>;
  /** Open the personal spelling dictionary (created + seeded on first use) in a tab. */
  openPersonalDictionary: () => Promise<void>;
  /** Re-read the personal dictionary from disk and re-lint the active view. */
  reloadPersonalDictionary: () => Promise<void>;
  /** Transient status-bar message (bottom-left, replaces the path); auto-clears ~20 s. */
  statusMessage: string | null;
  showStatusMessage: (msg: string) => void;
  /** Reveal the active document in the sidebar: pick the panel whose root contains it,
   *  expand its ancestor folders, remount the tree, and scroll the highlighted row
   *  into view. Not under any root → transient "name (not found in sidebar)". */
  revealActive: () => void;
  /** Re-point the out-of-root file watcher at the open tabs not under any root, so
   *  quick-opened strays (e.g. the issues file) see external edits too (issue 11). */
  syncExtraWatch: () => void;
  reloadDoc: (path: string) => Promise<void>;
  onFsChange: (paths: string[]) => void;
  setActive: (path: string) => void;
  promoteTab: (path: string) => void;
  /** Move a tab to a new position in the strip (drag-reorder). Session order follows. */
  moveTab: (path: string, toIndex: number) => void;
  closeTab: (path: string) => void;
  reopenClosed: () => Promise<void>;
  nextTab: (dir: 1 | -1) => void;
  editActive: (content: string) => void;
  /** Write edited content to the tab at `path` — the document the editor view was
   *  actually showing when the edit was made, NOT whatever is active now. This is
   *  the safe sink for editor onChange: it closes the window where an edit made
   *  against a not-yet-swapped view was attributed to the newly active tab and
   *  then autosaved over the wrong file. No-ops if the tab is gone. */
  editTab: (path: string, content: string) => void;
  /** Adjust the editor font zoom: +1 / -1 points, or "reset" to the configured size. */
  setEditorZoom: (delta: number | "reset") => void;
  /** Bake the current zoomed size into config.toml's [editor] font_size (a deliberate,
   *  surgical edit — the only time we write your config), then reset the zoom to 0. */
  setSizeAsDefault: () => Promise<void>;
  /** Write the complete effective keymap into config.toml's [keys] block (given the serialized
   *  block), then open it — so every shortcut is visible and editable in one place. */
  writeKeymapToConfig: (block: string) => Promise<void>;
  /** Replace an open tab's editor content (e.g. restore a backup) without saving —
   *  leaves it dirty so the user reviews and saves deliberately. */
  loadContent: (path: string, content: string) => void;
  openVersions: () => void;
  closeVersions: () => void;
  saveDoc: (path: string) => Promise<void>;
  saveActive: () => Promise<void>;
  saveAll: () => Promise<void>;
  openPalette: (mode: "files" | "commands" | "projects") => void;
  closePalette: () => void;
  /** Toggle the keyboard-shortcuts help overlay (F1). */
  toggleHelp: () => void;
  toggleAbout: () => void;
  openPrompt: (
    title: string,
    placeholder: string,
    submit: (value: string) => void | Promise<void>,
    initial?: string,
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
  /** Open a new in-memory scratch buffer (untitled, unsaved). Optional pre-filled
   *  content and filename extension (default "md") — e.g. extracted refs use "bib". */
  newScratch: (opts?: { content?: string; ext?: string }) => void;
  /** Save the given tab (or the active one) to a new path chosen via a dialog. Promotes a
   *  scratch buffer to a real file. */
  saveAs: (path?: string) => Promise<void>;
  setPanelTab: (tab: "folder" | "project") => void;
  addFolderToProject: () => Promise<void>;
  /** Save or rename the current project — name prompt only, the .wdproj lives in the
   *  managed dir (~/.writedown/projects/). Renaming moves the managed file. */
  saveRenameProject: () => void;
  /** Create a managed project (name prompt only) under ~/.writedown/projects/, seeding its
   *  folders from whatever is currently open. Keeps the current tabs. */
  newProject: () => void;
  /** Refresh the managed-projects list from disk. */
  loadProjects: () => Promise<void>;
  openProject: (path?: string) => Promise<void>;
  closeProject: () => void;
  removeProjectFolder: (path: string) => void;
  /** Write the current project's .wdproj (no-op for unsaved projects). */
  persistProject: () => void;
  loadRecentProjects: () => Promise<void>;
  cycleView: () => void;
  setPreviewTab: (tab: "live" | "rendered") => void;
  /** Render the active markdown/quarto document (palette: "Render Document"). */
  renderActive: () => Promise<void>;
  setCursorPos: (line: number, col: number) => void;
  setTreeWidth: (w: number) => void;
  setOutlineWidth: (w: number) => void;
  setSidebarVisible: (v: boolean) => void;
  setOutlineVisible: (v: boolean) => void;
  setSplitRatio: (r: number) => void;
};

export const useStore = create<AppState>((set, get) => ({
  root: null,
  folderRoot: null,
  rootEntries: [],
  projFolders: [],
  projectFile: null,
  projectName: "",
  recentProjects: [],
  projects: [],
  panelTab: "folder",
  tabs: [],
  activePath: null,
  closedStack: [],
  treeVersion: 0,
  expandedPaths: new Set(),
  treeScrollTop: 0,
  palette: null,
  helpOpen: false,
  aboutOpen: false,
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
  wordWrap: true,
  spellOn: true,
  spellIgnore: new Set(),
  configFile: null,
  personalDictFile: null,
  statusMessage: null,
  configError: null,
  editorZoom: (() => {
    const v = Number(localStorage.getItem("wd.editorZoom"));
    return Number.isFinite(v) ? v : 0;
  })(),
  scratchCounter: 0,
  scratchRev: 0,
  treeWidth: 240,
  outlineWidth: 220,
  splitRatio: 0.5,
  sidebarVisible: true,
  outlineVisible: true,

  // Restore the last session on startup (spec §24), keyed by workspace. Missing
  // folders/files are skipped silently — a stale session must never block launch.
  hydrate: async () => {
    void get().loadRecentProjects();
    void get().loadProjects();
    let g: { workspace: string | null; folder_root: string | null; panel_tab: string | null };
    try {
      g = await loadGlobalState();
    } catch {
      return;
    }
    const ws = g.workspace;
    if (ws?.toLowerCase().endsWith(".wdproj")) {
      // Last workspace was a project — reopen it (openProject restores its session).
      try {
        await get().openProject(ws);
      } catch {
        /* project file gone */
      }
    } else if (ws) {
      try {
        await get().setRoot(ws);
        await get().setFolderRoot(ws);
        await get().restoreSession(ws);
      } catch {
        /* workspace no longer exists — fall through to the folder-tab restore */
      }
    }
    // The Folder tab is restored independently of the workspace, so a folder opened
    // alongside a project survives a restart too. Restore panelTab LAST — it overrides
    // openProject's panelTab:"project" when the user was last on the Folder tab.
    if (g.folder_root && g.folder_root !== get().folderRoot) {
      try {
        await get().setFolderRoot(g.folder_root);
      } catch {
        /* folder gone — leave the tab empty */
      }
    }
    if (g.panel_tab === "folder" || g.panel_tab === "project") set({ panelTab: g.panel_tab });
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
    if (s.split_ratio != null) set({ splitRatio: clampRatio(s.split_ratio) });
    if (s.sidebar_visible != null) set({ sidebarVisible: s.sidebar_visible });
    if (s.outline_visible != null) set({ outlineVisible: s.outline_visible });
    // Seed cursor/scroll memory BEFORE opening tabs so the first mount restores its spot.
    seedDocPositions(s.positions ?? {});
    for (const p of s.open_tabs ?? []) {
      if (isScratch(p)) {
        // Hot exit: rebuild the scratch buffer from the session's stored text. savedContent
        // stays "" so a non-empty scratch is born dirty — still officially unsaved.
        if (!get().tabs.some((t) => t.path === p)) {
          const doc: Doc = {
            path: p, content: s.scratch_contents?.[p] ?? "", savedContent: "", eol: "\n",
            preview: false, saving: false, error: null, conflict: false,
          };
          set((st) => ({ tabs: [...st.tabs, doc] }));
        }
        continue;
      }
      try {
        await get().openFile(p);
      } catch {
        /* file no longer exists */
      }
    }
    // New scratch names must never collide with restored ones.
    const maxN = Math.max(
      0,
      ...get().tabs.map((t) => {
        const m = /^untitled:\/\/Untitled-(\d+)\./.exec(t.path);
        return m ? Number(m[1]) : 0;
      }),
    );
    if (maxN > get().scratchCounter) set({ scratchCounter: maxN });
    if (s.active_tab && get().tabs.some((t) => t.path === s.active_tab)) {
      set({ activePath: s.active_tab });
    }
  },

  openQuickFile: async () => {
    const qf = get().editorSettings?.quick_file;
    if (!qf) {
      set({ configError: "quick file — set quick_file under [files] in config.toml" });
      return;
    }
    try {
      await get().openFile(qf, false);
    } catch (e) {
      set({ configError: `quick file ${qf} — ${String(e)}` });
    }
  },

  openPersonalDictionary: async () => {
    try {
      await get().openFile(await personalDictionaryPath(), false);
    } catch (e) {
      set({ configError: `personal dictionary — ${String(e)}` });
    }
  },

  reloadPersonalDictionary: async () => {
    try {
      await reloadSpelling();
      const v = getActiveView(); // re-lint so reloaded words clear their squiggles at once
      if (v) forceLinting(v);
    } catch (e) {
      set({ configError: `reload dictionary — ${String(e)}` });
    }
  },

  showStatusMessage: (msg) => {
    if (statusMsgTimer !== undefined) clearTimeout(statusMsgTimer);
    set({ statusMessage: msg });
    statusMsgTimer = window.setTimeout(() => {
      statusMsgTimer = undefined;
      set({ statusMessage: null });
    }, 20_000);
  },

  revealActive: () => {
    const { activePath, folderRoot, projFolders, showStatusMessage } = get();
    const base = (p: string) => p.split(/[\\/]/).pop() ?? p;
    if (!activePath) return showStatusMessage("locate file — nothing open");
    if (isScratch(activePath)) {
      return showStatusMessage(`${activePath.slice(SCRATCH_PREFIX.length)} (not on disk)`);
    }
    // Which panel's root contains the file? Case- and separator-insensitive (Windows);
    // prefer the panel already showing when both contain it.
    const contains = (root: string) => underRoot(activePath, root);
    const projRoot = projFolders.find(contains) ?? null;
    const foldRoot = folderRoot && contains(folderRoot) ? folderRoot : null;
    const pick =
      get().panelTab === "project"
        ? (projRoot ? ("project" as const) : foldRoot ? ("folder" as const) : null)
        : (foldRoot ? ("folder" as const) : projRoot ? ("project" as const) : null);
    if (!pick) return showStatusMessage(`${base(activePath)} (not found in sidebar)`);
    const root = (pick === "project" ? projRoot : foldRoot) as string;
    // Expansion state is applied at tree REMOUNT (it is read non-reactively), so:
    // record every ancestor dir, then bump treeVersion. Ancestor keys are built the
    // way list_directory builds child paths — root string as stored + "\" segments —
    // so they match the tree's expandedPaths keys exactly.
    const rel = activePath.slice(root.length).replace(/^[\\/]+/, "");
    const parts = rel.split(/[\\/]/);
    parts.pop(); // drop the file name — we expand its ancestors
    get().setPathExpanded(root, true);
    let anc = root;
    for (const part of parts) {
      anc = anc + "\\" + part;
      get().setPathExpanded(anc, true);
    }
    if (!get().sidebarVisible) get().setSidebarVisible(true);
    set((s) => ({ panelTab: pick, treeVersion: s.treeVersion + 1 }));
    // Scroll the highlighted row into view once the remount and the per-level lazy
    // listings settle (each expanded level lists asynchronously); after it appears,
    // re-assert a few frames so late-loading siblings can't push it away again.
    const t0 = performance.now();
    let extra = 10;
    const tick = () => {
      const row = document.querySelector<HTMLElement>(".tree-body .tree-row.active");
      if (row) {
        row.scrollIntoView({ block: "center" });
        if (--extra > 0) requestAnimationFrame(tick);
      } else if (performance.now() - t0 < 2000) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  },

  syncExtraWatch: () => {
    const { tabs, folderRoot, projFolders } = get();
    const roots = [...projFolders, ...(folderRoot ? [folderRoot] : [])];
    const extras = tabs
      .map((t) => t.path)
      .filter((p) => !isScratch(p) && !roots.some((r) => underRoot(p, r)));
    void watchExtraFiles(extras).catch(() => {});
  },

  openFolder: async () => {
    const picked = await pickFolder();
    if (!picked) return;
    // The Folder tab is independent of the project. With a project open, only the Folder
    // tab's browser changes — project identity, title, session key, and the remembered
    // last workspace stay put (setRoot is skipped so nothing re-anchors or overwrites).
    const { projectFile, projFolders } = get();
    if (!projectFile && projFolders.length === 0) {
      await get().setRoot(picked); // anchor + last-workspace + watch, as before
    }
    set({ panelTab: "folder" });
    await get().setFolderRoot(picked);
  },

  // Operational anchor only. Set by both folder mode and project mode (= projFolders[0]).
  // Does NOT touch the Folder-tab display (that's setFolderRoot) — so opening a project never
  // overwrites what the Folder tab shows.
  setRoot: async (path: string) => {
    set({ root: path });
    const { projFolders, projectFile } = get();
    if (!projectFile && projFolders.length === 0) {
      void saveLastWorkspace(path); // remember for the next cold start
      void watchWorkspace([path]).catch(() => {}); // watch for external changes (spec §14)
      get().syncExtraWatch();
    }
  },

  // The Folder tab's display root: list its children and (re)mount the tree. Called only when
  // a plain folder is opened/restored — never by project flows.
  setFolderRoot: async (path: string) => {
    const rootEntries = await listDirectory(path);
    set((s) => ({ folderRoot: path, rootEntries, treeVersion: s.treeVersion + 1 }));
  },

  // Re-list the workspace and remount the tree (F5 / Ctrl+Shift+R). External-change
  // auto-refresh via file watching is Phase 4.
  refreshTree: async () => {
    const { folderRoot } = get();
    // Bump treeVersion even with no Folder root, so the Project tree also remounts (F5 /
    // after a new file). Re-list the Folder root's children when there is one.
    if (!folderRoot) {
      set((s) => ({ treeVersion: s.treeVersion + 1 }));
      return;
    }
    try {
      const rootEntries = await listDirectory(folderRoot);
      set((s) => ({ rootEntries, treeVersion: s.treeVersion + 1 }));
    } catch {
      set((s) => ({ treeVersion: s.treeVersion + 1 })); // folder gone — still remount
    }
  },

  setPathExpanded: (path, on) => {
    // New Set for Zustand identity. Read non-reactively in TreeNode, so this never
    // re-renders the whole tree — only records state for the next remount.
    set((s) => {
      const next = new Set(s.expandedPaths);
      if (on) next.add(path);
      else next.delete(path);
      return { expandedPaths: next };
    });
  },

  setTreeScrollTop: (top) => set({ treeScrollTop: top }),

  toggleSpell: () => set((s) => ({ spellOn: !s.spellOn })),

  ignoreWord: (word) =>
    set((s) => {
      const next = new Set(s.spellIgnore);
      next.add(word.toLowerCase());
      return { spellIgnore: next };
    }),

  openFile: async (path: string, preview = false) => {
    // PDF/DjVu never open in a tab (binary): route to the external viewer. Covers
    // quick-open and the file palette too, so no path reads binary bytes as UTF-8.
    // Failures (viewer not configured) surface on the app error bar, since several
    // call sites invoke openFile fire-and-forget.
    if (isExternalDoc(path)) {
      await openExternal(path).catch((e) => set({ configError: String(e) }));
      return;
    }
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
    get().syncExtraWatch(); // an out-of-root file gets its own watch
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

  moveTab: (path, toIndex) =>
    set((s) => {
      const from = s.tabs.findIndex((t) => t.path === path);
      const to = Math.max(0, Math.min(toIndex, s.tabs.length - 1));
      if (from < 0 || from === to) return {};
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { tabs };
    }),

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
    const folderRoot = get().folderRoot;
    if (folderRoot) {
      clearTimeout(fsRefreshTimer);
      fsRefreshTimer = setTimeout(() => {
        listDirectory(folderRoot)
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

  closeTab: (path) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path);
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activePath = s.activePath;
      if (s.activePath === path) {
        activePath = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].path : null;
      }
      return {
        tabs,
        activePath,
        // Ctrl+Shift+T can't resurrect a scratch (nothing on disk) — closing one is a
        // deliberate discard, so don't leave a dead entry eating a reopen keypress.
        closedStack: isScratch(path) ? s.closedStack : [...s.closedStack, path],
      };
    });
    get().syncExtraWatch(); // last out-of-root tab closed → its watch is dropped
  },

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

  editActive: (content) => {
    const p = get().activePath;
    if (p) get().editTab(p, content);
  },

  editTab: (path, content) =>
    set((s) => ({
      // Editing promotes a preview tab to permanent (Sublime behaviour).
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content, preview: false } : t)),
      ...(isScratch(path) ? { scratchRev: s.scratchRev + 1 } : {}),
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

  writeKeymapToConfig: async (block) => {
    const { configFile } = get();
    if (!configFile) return;
    let text: string;
    try {
      text = await loadConfig();
    } catch {
      return;
    }
    const next = replaceKeysTable(text, block);
    try {
      await writeFile(configFile, next); // atomic + auto-backed-up
    } catch (e) {
      set({ configError: String(e) });
      return;
    }
    await get().loadTheme(); // re-read (bindings unchanged; keeps state consistent)
    await get().openFile(configFile, false); // show the populated file…
    await get().reloadDoc(configFile); // …refreshed to disk if it was already open (stale buffer)
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
      // Saving the personal dictionary applies it immediately: reload the checker's
      // in-memory word set and re-lint, so words typed into the file stop being
      // flagged without a restart (issue 3 — the config.toml branch's missing twin).
      const dict = get().personalDictFile;
      if (dict && samePath(path, dict)) void get().reloadPersonalDictionary();
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
      // Seed word wrap from config only on the FIRST load, so a later config save doesn't
      // clobber a session toggle (session-only semantics; config just sets the default).
      const firstLoad = get().editorSettings === null;
      const es = await loadEditorSettings();
      set({ editorSettings: es, configError: null });
      if (firstLoad) set({ wordWrap: es.word_wrap ?? true, spellOn: es.spelling_enabled ?? true });
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
    try {
      set({ personalDictFile: await personalDictionaryPath() });
    } catch {
      /* ignore */
    }
  },

  openPalette: (mode) => set({ palette: mode }),
  closePalette: () => set({ palette: null }),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  toggleAbout: () => set((s) => ({ aboutOpen: !s.aboutOpen })),

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
      // Where the editor is NOW — the rendered view opens at this spot instead of the
      // top (issue 4). Read post-render so a long build still lands where you are.
      const v = getActiveView();
      const srcLine = v
        ? v.state.doc.lineAt(v.lineBlockAtHeight(v.scrollDOM.scrollTop).from).number
        : null;
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
            lineMap: r.line_map,
            srcLine,
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
            lineMap: [],
            srcLine: null,
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
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  setOutlineVisible: (v) => set({ outlineVisible: v }),
  setSplitRatio: (r) => set({ splitRatio: clampRatio(r) }),

  openPrompt: (title, placeholder, submit, initial) =>
    set({ prompt: { title, placeholder, submit, initial } }),
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

  newScratch: (opts) => {
    const n = get().scratchCounter + 1;
    const path = `${SCRATCH_PREFIX}Untitled-${n}.${opts?.ext ?? "md"}`;
    // Pre-filled content (e.g. extracted .bib refs) starts against an empty savedContent,
    // so the buffer is born dirty — the tab shows there's something unsaved in it.
    const doc: Doc = {
      path, content: opts?.content ?? "", savedContent: "", eol: "\n", preview: false,
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
      ? doc.path.slice(SCRATCH_PREFIX.length) || "Untitled.md" // keeps a .bib scratch's ext
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
    // Tauri replaces window.confirm with an async IPC call: the un-awaited Promise is
    // truthy, so the old `!window.confirm(...)` guard NEVER blocked — in the packaged
    // exe (where the ACL also denied the dialog) deletes ran with no confirmation at
    // all. Use the plugin API and await the actual answer.
    const ok = await confirmDialog(`Move ${kind} "${entry.name}" to the Recycle Bin?`, {
      title: "Writedown",
      kind: "warning",
    });
    if (!ok) return;
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
    // (Snapshotting the open folder into a project is done deliberately via Save/Rename
    // Project.) So the first add yields a one-folder project, the second yields two, etc.
    const { projFolders } = get();
    if (projFolders.includes(picked)) return;
    const folders = [...projFolders, picked];
    set({ projFolders: folders, panelTab: "project" });
    if (!get().root) await get().setRoot(picked);
    void watchWorkspace(folders).catch(() => {});
    get().syncExtraWatch();
    setTitle(get().projectName || "unsaved project");
    get().persistProject();
  },

  saveRenameProject: () => {
    const { projFolders, root, projectName } = get();
    const folders = projFolders.length > 0 ? projFolders : root ? [root] : [];
    if (folders.length === 0) return;
    // Name only — the location is managed (~/.writedown/projects/). Same name = save in
    // place; new name = rename (Rust moves the managed file). "Name taken" errors from
    // Rust surface inline in the prompt.
    get().openPrompt(
      "Project name (save / rename)",
      "My Project",
      async (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const path = await saveManagedProject(trimmed, folders, get().projectFile);
        set({ projFolders: folders, projectFile: path, projectName: trimmed, panelTab: "project" });
        void addRecentProject(path).then(() => get().loadRecentProjects());
        void saveLastWorkspace(path);
        setTitle(trimmed);
        void get().loadProjects();
      },
      projectName,
    );
  },

  newProject: () => {
    get().openPrompt("New project name", "My Project", async (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      // Seed from whatever is open: the current project's folders, else the Folder-tab root,
      // else the operational root. An empty seed makes an empty project (add folders after).
      const { projFolders, folderRoot, root } = get();
      const seed =
        projFolders.length > 0 ? projFolders : folderRoot ? [folderRoot] : root ? [root] : [];
      const path = await newProjectApi(trimmed, seed);
      // Like "Save Project As", this names the current workspace — keep the open tabs.
      set({ projFolders: seed, projectFile: path, projectName: trimmed, panelTab: "project" });
      if (seed.length > 0) {
        if (!get().root) await get().setRoot(seed[0]);
        void watchWorkspace(seed).catch(() => {});
        get().syncExtraWatch();
      }
      void addRecentProject(path).then(() => get().loadRecentProjects());
      void saveLastWorkspace(path);
      setTitle(trimmed);
      void get().loadProjects();
    });
  },

  loadProjects: async () => {
    try {
      set({ projects: await listProjects() });
    } catch {
      /* fine — none yet */
    }
  },

  openProject: async (path?: string) => {
    const file = path ?? (await pickProjectOpenPath());
    if (!file) return;
    const proj = await loadProject(file);
    // Switching workspace clears the tab strip — park unsaved work first: dirty real
    // files to disk, scratch buffers into the OLD workspace's session (hot exit, so
    // they come back when that workspace is reopened).
    await get().saveAll();
    const oldKey = sessionKey(get());
    if (oldKey) await saveSession(oldKey, sessionSnapshot(get())).catch(() => {});
    set({
      projFolders: proj.folders,
      projectFile: file,
      projectName: proj.name,
      panelTab: "project",
      tabs: [],
      activePath: null,
      closedStack: [],
    });
    // An empty managed project is valid (folders added later) — guard the folder-only steps.
    if (proj.folders.length > 0) {
      await get().setRoot(proj.folders[0]);
      void watchWorkspace(proj.folders).catch(() => {});
      get().syncExtraWatch();
    }
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
      get().syncExtraWatch();
      void get().setFolderRoot(root); // adopt into the Folder tab so it isn't left empty
    }
  },

  removeProjectFolder: (path) => {
    const folders = get().projFolders.filter((f) => f !== path);
    set({ projFolders: folders });
    if (folders.length > 0) void watchWorkspace(folders).catch(() => {});
    get().syncExtraWatch();
    get().persistProject();
  },

  // Project edits (add/remove folder) persist to the .wdproj immediately — a named
  // project should never silently lose changes. Unsaved (ad-hoc) projects have no file
  // yet; Save/Rename Project creates one. Write failures surface in the footer.
  persistProject: () => {
    const { projectFile, projectName, projFolders } = get();
    if (!projectFile) return;
    void saveProject(projectFile, { name: projectName, folders: projFolders }).catch((e) =>
      set({ configError: `project save failed — ${String(e)}` }),
    );
  },

  loadRecentProjects: async () => {
    try {
      set({ recentProjects: await fetchRecentProjects() });
    } catch {
      /* fine — no recents yet */
    }
  },
}));

/** Replace config.toml's active [keys] table body with `block` (preserving every other line and
 *  comment), or append it at EOF when there's no active [keys]. A commented `# [keys]` example is
 *  left untouched (it doesn't match). Returns text ending in a newline. */
function replaceKeysTable(text: string, block: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^[ \t]*\[keys\][ \t]*$/.test(l));
  let out: string;
  if (start === -1) {
    out = text.replace(/\s*$/, "") + "\n\n" + block;
  } else {
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^[ \t]*\[[^\]#]/.test(lines[i])) {
        end = i; // next active section header ends the [keys] table
        break;
      }
    }
    out = [...lines.slice(0, start), block, ...lines.slice(end)].join("\n");
  }
  return out.endsWith("\n") ? out : out + "\n";
}

/** Managed + recent projects as a deduped (by path), name-disambiguated list for the switch UI.
 *  Managed projects (the ~/.writedown/projects scan) come first, then recents from elsewhere;
 *  a display name shared by more than one entry gets its parent folder appended so both are
 *  distinguishable (e.g. "AI — projects" vs "AI — AI"). */
export function mergedProjects(s: AppState): { name: string; path: string }[] {
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  const base = (p: string) => p.replace(/\\/g, "/").split("/").pop()!.replace(/\.wdproj$/i, "");
  const parent = (p: string) => {
    const parts = p.replace(/\\/g, "/").replace(/\/+$/, "").split("/");
    return parts[parts.length - 2] ?? "";
  };
  const seen = new Set<string>();
  const out: { name: string; path: string }[] = [];
  const add = (name: string, path: string) => {
    const k = norm(path);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ name, path });
  };
  for (const p of s.projects) add(p.name, p.path);
  for (const p of s.recentProjects) add(base(p), p);
  const counts = new Map<string, number>();
  for (const o of out) counts.set(o.name.toLowerCase(), (counts.get(o.name.toLowerCase()) ?? 0) + 1);
  return out.map((o) =>
    (counts.get(o.name.toLowerCase()) ?? 0) > 1 ? { ...o, name: `${o.name} — ${parent(o.path)}` } : o,
  );
}

/** The key a session is stored under: the project file when one is open, else the root. */
export const sessionKey = (s: AppState): string | null =>
  s.projectFile ?? (s.projFolders.length > 0 ? s.projFolders.join("|") : s.root);

/** The persistable slice of state (spec §24). Preview tabs are transient; scratch
 *  buffers hot-exit — their text rides along in scratch_contents so no work is lost. */
export const sessionSnapshot = (s: AppState): Session => ({
  open_tabs: s.tabs.filter((t) => !t.preview).map((t) => t.path),
  active_tab: s.activePath,
  tree_width: s.treeWidth,
  outline_width: s.outlineWidth,
  split_ratio: s.splitRatio,
  sidebar_visible: s.sidebarVisible,
  outline_visible: s.outlineVisible,
  scratch_contents: Object.fromEntries(
    s.tabs.filter((t) => !t.preview && isScratch(t.path)).map((t) => [t.path, t.content]),
  ),
  // Deliberately NOT in the fingerprint (it would change on every cursor move) — positions
  // ride along whenever something else triggers a write, plus the close-time flush.
  positions: snapshotDocPositions(s.tabs.filter((t) => !t.preview).map((t) => t.path)),
});

/** O(1) change fingerprint for the debounced session save — scratch text is represented
 *  by scratchRev rather than inlined, so typing never stringifies the buffer. */
export const sessionFingerprint = (s: AppState): string =>
  JSON.stringify({
    t: s.tabs.filter((t) => !t.preview).map((t) => t.path),
    a: s.activePath,
    w: s.treeWidth,
    o: s.outlineWidth,
    r: s.splitRatio,
    sb: s.sidebarVisible,
    ob: s.outlineVisible,
    v: s.scratchRev,
  });
