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
  deleteProject as deleteProjectApi,
  listDirectory,
  listProjects,
  loadBibliography,
  loadEditorSettings,
  loadGlobalState,
  loadProject,
  loadSession,
  loadSublimeTheme,
  logError,
  newProject as newProjectApi,
  fileStamp,
  pickFolder,
  pickOpenPaths,
  pickProjectOpenPath,
  saveManagedProject,
  saveSession,
  pickSavePath,
  openExternal,
  buildFile,
  helpPath,
  personalDictionaryPath,
  readFile,
  recentProjects as fetchRecentProjects,
  reloadSpelling,
  renamePath,
  renderDocument,
  runCell,
  launchFiles,
  listDirectories,
  saveLastWorkspace,
  saveProject,
  statPaths,
  watchExtraFiles,
  watchWorkspace,
  writeFile,
  type EditorSettings,
  type Entry,
  type FileStamp,
  type ProjectInfo,
  type Session,
  type SublimeTheme,
} from "./api";
import { forceLinting } from "@codemirror/lint";
import {
  captureReloadAnchor,
  getActiveView,
  renameDocPosition,
  seedDocPositions,
  snapshotDocPositions,
} from "./editor/editorView";
import { isBinaryExt, isCsv, isExternalDoc, isImageDoc, isMarkdownDoc } from "./editor/languages";
import { scheduleScan } from "./editor/wordFreq";
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

/** Last-run [build] variant, so Ctrl+Shift+B (no name) re-runs it (session-only). */
let lastBuildName: string | undefined;

const normPath = (p: string) => p.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
/** Is `p` inside `root`? Case- and separator-insensitive (Windows). */
const underRoot = (p: string, root: string) => normPath(p).startsWith(normPath(root) + "/");

/** Marker in the error from Rust's refused check-and-set write — must match
 *  `CHANGED_ON_DISK` in files.rs. */
const CHANGED_ON_DISK = "changed-on-disk";

/** The roots the recursive watcher is ACTUALLY covering right now — the single source of
 *  truth for `syncExtraWatch` (issue B.03). It used to reason from projFolders +
 *  folderRoot, but the Folder tab's root is only ever listed and drawn, never watched
 *  (setFolderRoot does no watching, and openFolder skips setRoot while a project is
 *  open). So a file opened from inside the Folder root was excluded from per-file
 *  watching by a root that watched nothing, and ended up covered by NOBODY: no reload, no
 *  conflict flag, no message. Deriving the exclusion list from what was actually armed
 *  makes that state unrepresentable. */
let watchedRoots: string[] = [];
const applyWatch = (roots: string[]) => {
  watchedRoots = roots;
  void watchWorkspace(roots).catch(() => {});
};

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

// Layout remembered on entering a composite mode (plain / distraction-free), restored on
// exit. ONE saved state for both modes, not one per mode: two independent restore stacks
// can interleave into a layout that never comes back (issue A.16).
type ViewMode = "editor" | "split" | "preview";
let layoutRestore: { sidebar: boolean; outline: boolean; view: ViewMode } | null = null;

// Paths Writedown just saved — used to ignore the watcher event our own write triggers.
// Keyed by normPath: the watcher reports a path spelled from the WATCHED ROOT, which need
// not match the spelling we saved under (see onFsChange).
const justSaved = new Set<string>();
const markJustSaved = (path: string) => {
  const key = normPath(path);
  justSaved.add(key);
  setTimeout(() => justSaved.delete(key), 1500);
};
let fsRefreshTimer: ReturnType<typeof setTimeout> | undefined;

// ---- Trailing-whitespace trim on save ([editor] trim_trailing_whitespace) ---------
// The [ \t]+ runs at line ends that a save may delete. Default mode trims them ALL
// (the Sublime semantics); "keep-hard-breaks" mode spares, in markdown docs, a run
// of two-plus pure spaces after content — the markdown hard line break. CSV/TSV are
// never trimmed (trailing spaces can be field data). Offsets are valid for both the
// \n-normalized string and the CM document, so the same ranges drive a string
// transform or an editor dispatch.
function trailingWsRanges(
  text: string,
  path: string,
  keepHardBreaks: boolean,
): { from: number; to: number }[] {
  if (isCsv(path)) return [];
  const md = keepHardBreaks && isMarkdownDoc(path);
  const out: { from: number; to: number }[] = [];
  let pos = 0;
  for (const line of text.split("\n")) {
    const m = /[ \t]+$/.exec(line);
    if (m) {
      const hardBreak =
        md && line.length > m[0].length && m[0].length >= 2 && !m[0].includes("\t");
      if (!hardBreak) out.push({ from: pos + line.length - m[0].length, to: pos + line.length });
    }
    pos += line.length + 1;
  }
  return out;
}

function stripRanges(text: string, ranges: { from: number; to: number }[]): string {
  if (ranges.length === 0) return text;
  let out = "";
  let last = 0;
  for (const r of ranges) {
    out += text.slice(last, r.from);
    last = r.to;
  }
  return out + text.slice(last);
}

/** Normalize the config value: true/"all" → "all" (the default), "keep-hard-breaks",
 *  false/"off" → "off". A stale backend may still send the pre-2.0 boolean. */
function trimMode(v: boolean | string | null | undefined): "all" | "keep-hard-breaks" | "off" {
  if (v === false || v === "off") return "off";
  if (v === "keep-hard-breaks") return "keep-hard-breaks";
  return "all";
}

// Background word-frequency scan (issue Sa 5b) — feeds Tab completion's dictionary.
// The tab's content is read at fire time, so a closed tab simply skips its scan.
function scheduleWordScan(path: string): void {
  const es = useStore.getState().editorSettings;
  if (!(es?.tab_complete_dict ?? true)) return;
  scheduleScan(path, es?.tab_complete_dict_min_len ?? 5, () =>
    useStore.getState().tabs.find((t) => t.path === path)?.content,
  );
}

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
  /** What the file looked like on disk when we last read or wrote it. Every save is a
   *  check-and-set against this, so an external change can never be overwritten silently
   *  even if the watcher missed it (issue B.04). null = unknown → no check. */
  stamp: FileStamp | null;
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
  /** Composite layout mode; transient — never session-persisted. "distraction" is
   *  Shift+F11 (full screen, no sidebars); "plain" is Ctrl+K Ctrl+P (editor only, no
   *  sidebars, no preview, windowed). One field rather than two booleans so the layout
   *  saved on entry is unambiguous (issue A.16). */
  layoutMode: "normal" | "plain" | "distraction";

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
  viewMode: ViewMode;
  /** Which pane the preview column shows: the live preview or the last render snapshot. */
  previewTab: "live" | "rendered";
  /** Completed renders by document path (in-memory only). */
  rendered: Record<string, Rendered>;
  renderBusy: boolean;
  cursorLine: number;
  cursorCol: number;
  /** Selection stats for the status bar (ST-style), all 0 with a single empty caret:
   *  characters selected, lines touched by non-empty ranges, and how many ranges
   *  (cursors) there are — `selRanges` > 1 means multi-cursor. */
  selChars: number;
  selLines: number;
  selRanges: number;
  /** Session font override from the palette's "Font: …" verbs (issue A.05). Beats both
   *  `[editor.font_by_ext]` and `[editor] font_family`; never written to config. */
  fontOverride: string | null;
  /** Preview pane zoom in px steps, like editorZoom (issue A.13). Session-only. */
  previewZoom: number;
  /** Section numbering in the preview (issue A.18). null = follow the document's
   *  `number-sections:` front matter; true/false force it. A VIEW setting — the palette
   *  toggle never rewrites your YAML. */
  numberSections: boolean | null;
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
  /** Open the user guide (`~/.writedown/help.md`, rewritten from HELP.md each launch). */
  openHelp: () => Promise<void>;
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
  setPreviewZoom: (delta: number | "reset") => void;
  setFontOverride: (family: string | null) => void;
  setNumberSections: (v: boolean | null) => void;
  /** Bake the current zoomed size into config.toml's [editor] font_size (a deliberate,
   *  surgical edit — the only time we write your config), then reset the zoom to 0. */
  setSizeAsDefault: () => Promise<void>;
  /** Replace an open tab's editor content (e.g. restore a backup) without saving —
   *  leaves it dirty so the user reviews and saves deliberately. */
  loadContent: (path: string, content: string) => void;
  openVersions: () => void;
  closeVersions: () => void;
  /** `explicit` = the user asked (Ctrl+S / palette), so a flagged conflict is attempted
   *  rather than skipped; `force` also skips the disk check, overwriting deliberately.
   *  Plain autosave passes neither (issue B.04). */
  saveDoc: (path: string, opts?: { explicit?: boolean; force?: boolean }) => Promise<void>;
  saveActive: () => Promise<void>;
  saveAll: (opts?: { explicit?: boolean; force?: boolean }) => Promise<void>;
  /** Conflict resolution, as two explicit verbs rather than one ambiguous button. */
  reloadFromDisk: (path?: string) => Promise<void>;
  overwriteWithMine: (path?: string) => Promise<void>;
  /** Re-stamp the active document and reload/flag it if disk has moved on. Insurance for
   *  a filesystem event we never got (issue B.03); runs on window focus. */
  recheckActive: () => Promise<void>;
  /** Which roots are watched, which files hold their own watch, and whether each open tab
   *  is covered — the report that would have made B.03 obvious. */
  showWatchStatus: () => void;
  /** Native Open File dialog → tabs (issue B.01). */
  openFilesDialog: () => Promise<void>;
  /** Run a `[build]` command (Sublime-style) on the active file: save it, spawn the
   *  command via pwsh from its folder, report exit/timing in the status bar, and open
   *  captured output in a scratch tab on failure. No name → the last-run or first one. */
  runBuild: (name?: string) => Promise<void>;
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
  /** Recycle a MANAGED project's .wdproj (confirmed); closes it if it's the open one. */
  deleteProject: (path: string, name: string) => Promise<void>;
  removeProjectFolder: (path: string) => void;
  /** Write the current project's .wdproj (no-op for unsaved projects). */
  persistProject: () => void;
  loadRecentProjects: () => Promise<void>;
  cycleView: () => void;
  setPreviewTab: (tab: "live" | "rendered") => void;
  /** Render the active markdown/quarto document (palette: "Render Document"). */
  renderActive: () => Promise<void>;
  /** Run just the {python} cell under the cursor, in the live kernel namespace (A.24). */
  renderCell: () => Promise<void>;
  setCursorPos: (line: number, col: number) => void;
  setSelectionStats: (chars: number, lines: number, ranges: number) => void;
  /** Open files/folders dropped onto the window (issue A.04). */
  openDropped: (paths: string[]) => Promise<void>;
  /** Open the files Writedown was launched with, after session restore (issue A.03). */
  openLaunchFiles: () => Promise<void>;
  /** Directory listings fetched ahead of a tree mount, keyed by folder path (issue A.25).
   *  TreeNode consults this before scheduling its own lazy fetch, so a restored set of
   *  expanded folders paints in one go instead of filling in one folder at a time. */
  prefetchedDirs: Record<string, Entry[]>;
  /** Batch-fetch `roots` plus every remembered-expanded folder beneath them. */
  prefetchTree: (roots: string[]) => Promise<void>;
  /** Give a scratch buffer a name (issue A.27). Renames its `untitled://` sentinel, which
   *  is the buffer's whole identity — tab label, hot-exit key and Save As default all
   *  follow. Still never written to disk. */
  renameScratch: (path: string, name: string) => void;
  setTreeWidth: (w: number) => void;
  setOutlineWidth: (w: number) => void;
  setSidebarVisible: (v: boolean) => void;
  setOutlineVisible: (v: boolean) => void;
  /** Window fullscreen (palette Enter/Exit Full Screen; F11 toggles). */
  setWindowFullscreen: (v: boolean) => void;
  toggleFullscreen: () => void;
  /** Distraction-free (Shift+F11): fullscreen + both side panels hidden; exit restores
   *  the remembered layout. Independent of plain F11 fullscreen. */
  enterLayoutMode: (mode: "plain" | "distraction") => void;
  exitLayoutMode: () => void;
  enterDistractionFree: () => void;
  exitDistractionFree: () => void;
  toggleDistractionFree: () => void;
  togglePlainView: () => void;
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
  selChars: 0,
  selLines: 0,
  selRanges: 1,
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
  previewZoom: (() => {
    const v = Number(localStorage.getItem("wd.previewZoom"));
    return Number.isFinite(v) ? v : 0;
  })(),
  fontOverride: null,
  numberSections: null,
  prefetchedDirs: {},
  scratchCounter: 0,
  scratchRev: 0,
  treeWidth: 240,
  outlineWidth: 220,
  splitRatio: 0.5,
  sidebarVisible: true,
  outlineVisible: true,
  layoutMode: "normal",

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
            preview: false, saving: false, error: null, conflict: false, stamp: null,
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

  openHelp: async () => {
    try {
      await get().openFile(await helpPath(), false);
    } catch (e) {
      set({ configError: `help — ${String(e)}` });
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

  // Give an individual watcher to every open file the recursive watcher does NOT cover.
  // Exclude only paths under `watchedRoots` — what was actually armed — never the Folder
  // tab's display root (issue B.03).
  syncExtraWatch: () => {
    const extras = get()
      .tabs.map((t) => t.path)
      .filter((p) => !isScratch(p) && !watchedRoots.some((r) => underRoot(p, r)));
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
      applyWatch([path]); // watch for external changes (spec §14)
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
      // Already open: focus it, and promote if this was a permanent open. A PREVIEW
      // click on a file that already has a real tab also CLOSES the preview slot (ST,
      // issue Fr 2): the preview exists to peek at files you have NOT got open, and
      // it is always pristine (any edit promotes it), so discarding is lossless.
      const dropPreview = preview && !existing.preview;
      set((s) => ({
        activePath: path,
        tabs:
          !preview && existing.preview
            ? s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t))
            : dropPreview
              ? s.tabs.filter((t) => !t.preview)
              : s.tabs,
      }));
      if (dropPreview) get().syncExtraWatch(); // a dropped preview may hold a watch
      return;
    }
    // Images: a normal tab, but no text is read — the viewer streams the bytes via the
    // asset protocol. content stays "" (never dirty) and saveDoc refuses image paths,
    // so the file on disk can never be written (spec §2).
    // Read the text and stamp the file in one round trip (the stamp is metadata only) —
    // every later save checks against it (issue B.04).
    const [raw, stamp] = isImageDoc(path)
      ? ["", null as FileStamp | null]
      : await Promise.all([readFile(path), fileStamp(path).catch(() => null)]);
    const eol: Doc["eol"] = raw.includes("\r\n") ? "\r\n" : "\n";
    const content = raw.split("\r\n").join("\n");
    const doc: Doc = {
      path, content, savedContent: content, eol, preview, saving: false, error: null,
      conflict: false, stamp,
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
              : preview && !dup.preview
                ? s.tabs.filter((t) => !t.preview) // ST: see the existing-tab branch
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
    if (!isImageDoc(path)) scheduleWordScan(path); // background: feed Tab completion's frequency dictionary
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
    if (isImageDoc(path)) return; // the viewer streams from disk — no text to reload
    if (!get().tabs.some((t) => t.path === path)) return;
    // Record where we are BEFORE the document is replaced, in line terms (issue A.28b).
    // A reload is a whole-document swap: character offsets shift with any edit above the
    // viewport, and the line-anchored scroll snapshot is invalidated by the length change.
    // Without this the view jumps to the top on every external change — which only became
    // visible once 2.4.0 made external changes actually reload.
    if (path === get().activePath) {
      const view = getActiveView();
      if (view && view.dom.isConnected) captureReloadAnchor(path, view);
    }
    try {
      const [raw, stamp] = await Promise.all([readFile(path), fileStamp(path).catch(() => null)]);
      const eol: Doc["eol"] = raw.includes("\r\n") ? "\r\n" : "\n";
      const content = raw.split("\r\n").join("\n");
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path
            ? { ...t, content, savedContent: content, eol, conflict: false, error: null, stamp }
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
    // Key by normPath, NOT by the raw string. The watcher reports each path spelled from
    // the root it was handed (watch.rs), which need not match the spelling the tab was
    // opened under — a quick-opened `[files] quick_file`, typed by hand into config.toml,
    // is the standout case. An exact compare silently dropped those events: no reload, no
    // conflict flag, no message, just a stale buffer claiming to be current (issue A.28).
    // The tab's OWN spelling is kept as the map value so reloadDoc still gets its path.
    const open = new Map(get().tabs.map((t) => [normPath(t.path), t]));
    for (const p of paths) {
      const key = normPath(p);
      if (justSaved.has(key)) continue;
      const doc = open.get(key);
      if (!doc) continue;
      if (isDirty(doc)) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.path === doc.path ? { ...t, conflict: true } : t)),
        }));
      } else {
        void get().reloadDoc(doc.path);
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

  // Preview zoom (issue A.13) — the editor's gesture, one pane over. Same transient
  // discipline: localStorage, never config.
  setPreviewZoom: (delta) =>
    set((s) => {
      const next = delta === "reset" ? 0 : Math.max(-8, Math.min(24, s.previewZoom + delta));
      localStorage.setItem("wd.previewZoom", String(next));
      return { previewZoom: next };
    }),

  // Session font override (issue A.05). null clears it, falling back to config.
  setFontOverride: (family) => set({ fontOverride: family }),

  // Section numbering is a VIEW setting, never a YAML rewrite (issue A.18): front matter is
  // preserved byte-for-byte (spec §2), and rewriting it for a display preference is a bad
  // trade. null = follow the document.
  setNumberSections: (v) => set({ numberSections: v }),

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

  saveDoc: async (path, opts) => {
    if (isScratch(path)) return; // untitled buffers have no disk path — use Save As
    if (isImageDoc(path)) return; // viewer tabs hold no text — never write an image (spec §2)
    const doc = get().tabs.find((t) => t.path === path);
    if (!doc || !isDirty(doc) || doc.saving) return;
    // A known conflict is never resolved by an AUTOsave. Clicking away, switching tabs or
    // closing the editor must not silently overwrite somebody else's change (issue B.04):
    // the tab stays dirty and flagged until you choose Reload or Overwrite. An explicit
    // Ctrl+S still gets as far as the check-and-set below, which reports what happened.
    // Quitting is the one exception (force): at that point NOT writing loses your typing
    // for good, whereas writing keeps both versions — theirs goes to the backup store.
    if (doc.conflict && !opts?.explicit && !opts?.force) {
      get().showStatusMessage(`not autosaved — ${path.split(/[\\/]/).pop()} changed on disk`);
      return;
    }

    // Trim trailing whitespace at save ([editor] trim_trailing_whitespace, default
    // on = trim ALL, Sublime-style). Only ever runs when a save is happening anyway —
    // a clean file is never rewritten just to trim. For the doc in the live view it
    // is applied as a real editor edit (per-line deletions: the cursor is mapped,
    // undo works, and the incremental parser sees tiny changes, not a whole-doc
    // replace); background saves transform the string directly. CSV is protected in
    // trailingWsRanges; "keep-hard-breaks" spares markdown two-space line breaks.
    const trim = trimMode(get().editorSettings?.trim_trailing_whitespace);
    if (trim !== "off") {
      const ranges = trailingWsRanges(doc.content, path, trim === "keep-hard-breaks");
      if (ranges.length > 0) {
        const view = getActiveView();
        if (
          get().activePath === path &&
          view &&
          view.state.doc.length === doc.content.length
        ) {
          view.dispatch({ changes: ranges }); // onChange → editTab syncs the store
        } else {
          const trimmed = stripRanges(doc.content, ranges);
          set((s) => ({
            tabs: s.tabs.map((t) => (t.path === path ? { ...t, content: trimmed } : t)),
          }));
        }
      }
    }
    const fresh = get().tabs.find((t) => t.path === path);
    if (!fresh) return;
    const snapshot = fresh.content;
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, saving: true, error: null } : t)),
    }));

    const out = doc.eol === "\r\n" ? snapshot.split("\n").join("\r\n") : snapshot;
    try {
      // Check-and-set: refuse the write if the file moved on since we read it. This does
      // NOT depend on the watcher having noticed (issue B.03 showed it may not), and it
      // covers a second Writedown instance on the same file too (We 4).
      let stamp: FileStamp;
      try {
        stamp = await writeFile(path, out, opts?.force ? null : fresh.stamp);
      } catch (e) {
        if (!String(e).includes(CHANGED_ON_DISK)) throw e;
        // The stamp moved — but a touched mtime is not by itself a changed file (a sync
        // client can rewrite identical bytes). Read once and decide on content, so a
        // false alarm never costs the user a save.
        const disk = await readFile(path).catch(() => null);
        const same = disk !== null && disk.split("\r\n").join("\n") === fresh.savedContent;
        if (!same) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.path === path
                ? { ...t, saving: false, conflict: true, error: "changed on disk" }
                : t,
            ),
          }));
          get().showStatusMessage(
            `${path.split(/[\\/]/).pop()} changed on disk — not saved. Palette: Reload from Disk, or Overwrite Disk with My Version`,
          );
          return;
        }
        stamp = await writeFile(path, out, null); // same bytes after all — carry on
      }
      markJustSaved(path); // ignore the watcher event our own write will trigger
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path
            ? { ...t, saving: false, savedContent: snapshot, conflict: false, stamp }
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
      scheduleWordScan(path); // refresh this file's frequency-dictionary entry
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
    else await get().saveDoc(a, { explicit: true });
  },

  runBuild: async (name) => {
    const builds = get().editorSettings?.build ?? {};
    const names = Object.keys(builds);
    if (names.length === 0) {
      get().showStatusMessage("No [build] commands — add one under [build] in config.toml");
      return;
    }
    // Explicit name → last-run → first configured.
    const pick =
      (name && names.includes(name) && name) ||
      (lastBuildName && names.includes(lastBuildName) && lastBuildName) ||
      names[0];
    const command = builds[pick];
    const a = get().activePath;
    if (!a || isScratch(a)) {
      get().showStatusMessage("Save the file before building");
      return;
    }
    lastBuildName = pick;
    await get().saveActive(); // build the bytes on disk, not the live buffer
    get().showStatusMessage(`Build: ${pick} — running…`);
    try {
      const r = await buildFile(command, a);
      const secs = (r.ms / 1000).toFixed(1);
      const ok = r.code === 0;
      get().showStatusMessage(
        ok
          ? `Build: ${pick} — done (${secs}s)`
          : `Build: ${pick} — failed, exit ${r.code ?? "?"} (${secs}s)`,
      );
      // Show captured output on failure so the error is readable; a clean build stays quiet.
      const output = [r.stdout, r.stderr].map((o) => o.trimEnd()).filter(Boolean).join("\n");
      if (!ok && output) {
        get().newScratch({ content: `Build "${pick}" — exit ${r.code ?? "?"}\n\n${output}\n`, ext: "txt" });
      }
    } catch (e) {
      get().showStatusMessage(`Build: ${pick} — could not start`);
      set({ configError: `build "${pick}": ${String(e)}` });
    }
  },

  // Autosave every dirty document (window blur, idle, app close — spec §12).
  saveAll: async (opts) => {
    for (const t of get().tabs) {
      if (isDirty(t)) await get().saveDoc(t.path, opts);
    }
  },

  // Take the disk version and discard my edits. Deliberate, named, and undoable only in
  // the sense that the previous disk version is in the backup store.
  reloadFromDisk: async (path) => {
    const p = path ?? get().activePath;
    if (!p || isScratch(p)) return;
    await get().reloadDoc(p);
    get().showStatusMessage(`reloaded ${p.split(/[\\/]/).pop()} from disk`);
  },

  // Keep my version and overwrite theirs. The file being replaced is snapshotted first by
  // Rust write_file, so their version stays recoverable via Previous Versions.
  overwriteWithMine: async (path) => {
    const p = path ?? get().activePath;
    if (!p || isScratch(p)) return;
    await get().saveDoc(p, { explicit: true, force: true });
    get().showStatusMessage(`overwrote ${p.split(/[\\/]/).pop()} with this buffer`);
  },

  // Insurance against a missed filesystem event: on window focus, compare the active
  // document's stamp with disk. Only the active tab — every OTHER tab is protected on the
  // way out by the check-and-set in saveDoc, so this is about what you are looking at.
  recheckActive: async () => {
    const p = get().activePath;
    if (!p || isScratch(p) || isImageDoc(p)) return;
    const doc = get().tabs.find((t) => t.path === p);
    if (!doc || !doc.stamp || doc.saving) return;
    const now = await fileStamp(p).catch(() => null);
    if (!now || (now.mtime_ms === doc.stamp.mtime_ms && now.len === doc.stamp.len)) return;
    if (isDirty(doc)) {
      set((s) => ({ tabs: s.tabs.map((t) => (t.path === p ? { ...t, conflict: true } : t)) }));
    } else {
      await get().reloadDoc(p);
    }
  },

  showWatchStatus: () => {
    const { tabs, projFolders, folderRoot, root } = get();
    const covered = (p: string) => watchedRoots.find((r) => underRoot(p, r));
    const lines = [
      "# File watch status",
      "",
      "Recursively watched roots (the only paths that suppress a per-file watch):",
      ...(watchedRoots.length ? watchedRoots.map((r) => `  - ${r}`) : ["  (none)"]),
      "",
      `Workspace anchor: ${root ?? "(none)"}`,
      `Project folders:  ${projFolders.length ? projFolders.join(", ") : "(none)"}`,
      `Folder-tab root:  ${folderRoot ?? "(none)"}${
        folderRoot && !watchedRoots.some((r) => normPath(r) === normPath(folderRoot))
          ? "   [displayed, NOT watched — files under it get their own watch]"
          : ""
      }`,
      "",
      "Open documents:",
      ...tabs.map((t) => {
        if (isScratch(t.path)) return `  - ${t.path}  [temporary buffer — nothing on disk]`;
        const r = covered(t.path);
        return `  - ${t.path}\n      ${r ? `covered by root ${r}` : "own individual watch"}`;
      }),
      "",
      "Every open file must show one or the other. Anything else is issue B.03 returning.",
    ];
    get().newScratch({ content: lines.join("\n") });
  },

  openFilesDialog: async () => {
    const { activePath, root } = get();
    const near =
      activePath && !isScratch(activePath)
        ? activePath.replace(/[\\/][^\\/]*$/, "")
        : root ?? undefined;
    const picked = await pickOpenPaths(near ?? undefined).catch((e) => {
      set({ configError: `open file — ${String(e)}` });
      return null;
    });
    if (!picked || picked.length === 0) return;
    // Same route as a drop: image/PDF/binary guards, the 20-file cap, the overflow message.
    await get().openDropped(picked);
  },

  // Load appearance: Sublime colour scheme (spec §11) + config editor settings. On any
  // failure the built-in theme / defaults stay. Re-run to pick up config.toml edits.
  loadTheme: async () => {
    try {
      const st = await loadSublimeTheme();
      const root = document.documentElement.style;
      // Selection colour goes through a CSS var (global CSS reliably overrides
      // CodeMirror). Front-matter key/value colours come from the real YAML parser.
      root.setProperty("--cm-sel", st.selection);
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

  // Run just the cell under the cursor, in the kernel's live namespace (issue A.24).
  // Shares renderActive's result shape, so the Rendered pane needs no special case — the
  // whole document comes back, only this cell's output having been recomputed.
  renderCell: async () => {
    const { activePath, tabs, renderBusy } = get();
    const doc = tabs.find((t) => t.path === activePath);
    if (!doc || !isMarkdownDoc(doc.path) || renderBusy) return;
    const view = getActiveView();
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    const source = doc.content;
    set({ renderBusy: true });
    try {
      const r = await runCell(source, isScratch(doc.path) ? null : doc.path, line);
      set((s) => ({
        rendered: {
          ...s.rendered,
          [doc.path]: {
            markdown: r.markdown, source, at: Date.now(), cells: r.cells, errors: r.errors,
            elapsedMs: r.elapsed_ms, python: r.python, lineMap: r.line_map, srcLine: line,
          },
        },
        previewTab: "rendered",
        viewMode: s.viewMode === "editor" ? "split" : s.viewMode,
      }));
    } catch (e) {
      set({ configError: `run cell — ${String(e)}` });
    } finally {
      set({ renderBusy: false });
    }
  },

  setCursorPos: (line, col) => {
    const s = get();
    if (s.cursorLine !== line || s.cursorCol !== col) set({ cursorLine: line, cursorCol: col });
  },

  // Skip-if-unchanged, like setCursorPos: this fires on every selection change, so it must
  // never cause a render when the numbers are the same (e.g. plain caret movement).
  setSelectionStats: (chars, lines, ranges) => {
    const s = get();
    if (s.selChars !== chars || s.selLines !== lines || s.selRanges !== ranges) {
      set({ selChars: chars, selLines: lines, selRanges: ranges });
    }
  },

  // One batched listing for the whole visible tree (issue A.25), instead of one IPC call
  // and one re-render per expanded folder. Capped: a session with hundreds of remembered
  // folders falls back to the lazy path for the rest, which is still correct, just visible.
  prefetchTree: async (roots) => {
    const PREFETCH_CAP = 60;
    const expanded = [...get().expandedPaths];
    const wanted = [
      ...roots,
      ...expanded.filter((p) => roots.some((r) => underRoot(p, r) || samePath(p, r))),
    ];
    const unique = [...new Set(wanted)].slice(0, PREFETCH_CAP);
    if (unique.length === 0) return;
    try {
      const dirs = await listDirectories(unique);
      // Merge, don't replace: a second project root's prefetch must not drop the first's.
      set((s) => ({ prefetchedDirs: { ...s.prefetchedDirs, ...dirs } }));
    } catch {
      /* fine — every node still has its own lazy fetch */
    }
  },

  // Files/folders dropped onto the window (issue A.04). A folder becomes the Folder-tab
  // root (or joins the project when the Project tab is showing); files open as tabs.
  // Capped, because dropping a directory's worth of files would bury the tab strip.
  openDropped: async (paths) => {
    const DROP_CAP = 20;
    let info;
    try {
      info = await statPaths(paths);
    } catch (e) {
      set({ configError: `drop — ${String(e)}` });
      return;
    }
    const dirs = info.filter((i) => i.exists && i.is_dir).map((i) => i.path);
    const files = info.filter((i) => i.exists && !i.is_dir).map((i) => i.path);
    // A dropped folder is a workspace gesture: take the first, ignore the rest rather
    // than silently re-rooting several times.
    if (dirs.length > 0) {
      if (get().panelTab === "project" && get().projFolders.length > 0) {
        const folders = [...get().projFolders];
        for (const d of dirs) if (!folders.some((f) => samePath(f, d))) folders.push(d);
        set({ projFolders: folders });
        applyWatch(folders);
        get().syncExtraWatch();
        get().persistProject();
      } else {
        set({ panelTab: "folder" });
        if (!get().root) await get().setRoot(dirs[0]);
        await get().setFolderRoot(dirs[0]);
      }
    }
    const open = files.slice(0, DROP_CAP);
    for (const f of open) {
      // Same guards as a tree click: images get the viewer, PDFs the external one,
      // known binaries are never read as text.
      if (isBinaryExt(f)) continue;
      await get().openFile(f, false).catch((e) => set({ configError: String(e) }));
    }
    if (files.length > open.length) {
      // Neutral wording: the Open File dialog reuses this path too (issue B.01).
      get().showStatusMessage(`opened ${open.length} of ${files.length} files`);
    }
  },

  renameScratch: (path, name) => {
    if (!isScratch(path)) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    // Carry the old extension when none is typed, so an Extract-Citations `.bib` scratch
    // stays `.bib` (and the default `.md` keeps markdown highlighting, preview, spellcheck
    // and image paste working — they all key off the extension).
    const oldExt = path.split(".").pop();
    const hasExt = /\.[A-Za-z0-9]+$/.test(trimmed);
    const base = hasExt ? trimmed : `${trimmed}.${oldExt && oldExt !== path ? oldExt : "md"}`;
    // The sentinel IS the tab's identity, so a duplicate would alias two buffers.
    let next = SCRATCH_PREFIX + base;
    if (next !== path) {
      const taken = new Set(get().tabs.map((t) => t.path));
      for (let n = 2; taken.has(next); n++) {
        next = `${SCRATCH_PREFIX}${base.replace(/(\.[^.]*)?$/, `-${n}$1`)}`;
      }
    }
    if (next === path) return;
    renameDocPosition(path, next); // keep the remembered cursor/scroll with the buffer
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, path: next } : t)),
      activePath: s.activePath === path ? next : s.activePath,
      scratchRev: s.scratchRev + 1, // hot-exit key changed — force a session write
    }));
  },

  setTreeWidth: (w) => set({ treeWidth: clamp(w) }),
  setOutlineWidth: (w) => set({ outlineWidth: clamp(w) }),
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  setOutlineVisible: (v) => set({ outlineVisible: v }),

  // F11 / Shift+F11. Fullscreen state is queried live (never cached) so the toggle is
  // right even if tauri-plugin-window-state restored a fullscreen window at startup.
  setWindowFullscreen: (v) => {
    void getCurrentWindow()
      .setFullscreen(v)
      .catch((e) => {
        void logError("set fullscreen failed: " + String(e));
        get().showStatusMessage("full screen unavailable — restart Writedown");
      });
  },
  toggleFullscreen: () => {
    const w = getCurrentWindow();
    void w
      .isFullscreen()
      .then((fs) => w.setFullscreen(!fs))
      .catch((e) => {
        void logError("toggle fullscreen failed: " + String(e));
        get().showStatusMessage("full screen unavailable — restart Writedown");
      });
  },
  // Composite layout modes. `distraction` = full screen with no sidebars (Shift+F11);
  // `plain` = editor only, no sidebars, NO preview, and NOT full screen (issue A.16 —
  // distraction-free always kept the preview, which was the gap). Both save the same
  // single snapshot, so switching between them or exiting either always restores the
  // layout you actually started from.
  enterLayoutMode: (mode) => {
    const cur = get().layoutMode;
    if (cur === mode) return;
    // Only snapshot when coming from the normal layout — going plain → distraction must
    // not record the plain layout as "what to restore".
    if (cur === "normal") {
      layoutRestore = {
        sidebar: get().sidebarVisible,
        outline: get().outlineVisible,
        view: get().viewMode,
      };
    }
    set({
      layoutMode: mode,
      sidebarVisible: false,
      outlineVisible: false,
      ...(mode === "plain" ? { viewMode: "editor" as ViewMode } : {}),
    });
    get().setWindowFullscreen(mode === "distraction");
  },
  exitLayoutMode: () => {
    if (get().layoutMode === "normal") return;
    const wasDistraction = get().layoutMode === "distraction";
    set({
      layoutMode: "normal",
      sidebarVisible: layoutRestore?.sidebar ?? true,
      outlineVisible: layoutRestore?.outline ?? true,
      viewMode: layoutRestore?.view ?? "split",
    });
    layoutRestore = null;
    if (wasDistraction) get().setWindowFullscreen(false);
  },
  enterDistractionFree: () => get().enterLayoutMode("distraction"),
  exitDistractionFree: () => {
    if (get().layoutMode === "distraction") get().exitLayoutMode();
  },
  toggleDistractionFree: () => {
    if (get().layoutMode === "distraction") get().exitLayoutMode();
    else get().enterLayoutMode("distraction");
  },
  togglePlainView: () => {
    if (get().layoutMode === "plain") get().exitLayoutMode();
    else get().enterLayoutMode("plain");
  },

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
      saving: false, error: null, conflict: false, stamp: null,
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
    let stamp: FileStamp | null = null;
    try {
      // No `expect`: Save As deliberately writes wherever you chose (the picker already
      // asked about replacing), and Rust backs up anything it overwrites.
      stamp = await writeFile(picked, out);
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.path === doc.path ? { ...t, error: String(e) } : t)),
      }));
      return;
    }
    markJustSaved(picked);
    // Rebind the tab from its old (scratch or real) path to the chosen path, now saved-clean.
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === doc.path
          ? { ...t, path: picked, savedContent: snapshot, conflict: false, error: null, stamp }
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
    applyWatch(folders);
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
        applyWatch(seed);
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
      // Fetch every root plus each remembered-expanded folder in ONE call BEFORE the tree
      // mounts, so it paints populated instead of filling in folder by folder (issue A.25).
      await get().prefetchTree(proj.folders);
      await get().setRoot(proj.folders[0]);
      applyWatch(proj.folders);
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
      applyWatch([root]);
      get().syncExtraWatch();
      void get().setFolderRoot(root); // adopt into the Folder tab so it isn't left empty
    }
  },

  deleteProject: async (path, name) => {
    const ok = await confirmDialog(
      `Delete project "${name}"?\n\nThe .wdproj file goes to the Recycle Bin. The folders it references are NOT touched.`,
      { title: "Writedown", kind: "warning" },
    );
    if (!ok) return;
    try {
      await deleteProjectApi(path);
    } catch (e) {
      set({ configError: String(e) });
      return;
    }
    // Deleting the open project tidies up: close it (adopts the folder root into the tree).
    if (samePath(get().projectFile ?? "", path)) get().closeProject();
    await get().loadProjects();
    await get().loadRecentProjects();
  },

  removeProjectFolder: (path) => {
    const folders = get().projFolders.filter((f) => f !== path);
    set({ projFolders: folders });
    // Emptying a project leaves the previous watcher live (there is nothing to re-arm),
    // so watchedRoots deliberately keeps describing what is still being watched.
    if (folders.length > 0) applyWatch(folders);
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

  // Files Writedown was launched with — a double-click in Explorer on a registered type,
  // or a command-line path (issue A.03). Called AFTER the session is restored so the
  // launched file ends up active rather than buried under the restored tabs.
  openLaunchFiles: async () => {
    let paths: string[] = [];
    try {
      paths = await launchFiles();
    } catch {
      return; // older backend / no args — nothing to do
    }
    for (const p of paths) {
      if (isBinaryExt(p)) continue;
      await get().openFile(p, false).catch((e) => set({ configError: String(e) }));
    }
  },

  loadRecentProjects: async () => {
    try {
      set({ recentProjects: await fetchRecentProjects() });
    } catch {
      /* fine — no recents yet */
    }
  },
}));

/** Managed + recent projects as a deduped (by path), name-disambiguated list for the switch UI.
 *  Managed projects (the ~/.writedown/projects scan) come first, then recents from elsewhere;
 *  a display name shared by more than one entry gets its parent folder appended so both are
 *  distinguishable (e.g. "AI — projects" vs "AI — AI"). */
export function mergedProjects(s: AppState): { name: string; path: string }[] {
  // Reuse the module normalizer so this de-dup key agrees with the Rust `recent_key`
  // and the rest of the store — it also strips a trailing slash (issue 13).
  const norm = normPath;
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
