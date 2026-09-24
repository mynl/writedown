// Thin, typed wrappers over the Rust backend commands. The frontend never touches
// the filesystem directly — everything goes through these (spec §4, §26).
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export type Entry = {
  name: string;
  path: string;
  is_dir: boolean;
  ext: string | null;
  /** Openable in a tab (text whitelist or image viewer); the tree mutes the rest. */
  supported: boolean;
  /** Frontend-only: a project root's configured label (issue G.14), drawn as "name (label)". */
  label?: string;
};

export const logError = (message: string) =>
  invoke<void>("log_error", { message }).catch(() => {});

// Document checks: python cell syntax + duplicate Quarto labels (all in-process Rust).
export type CheckDiagnostic = {
  line: number; // 1-based document line
  col: number; // 0-based column
  message: string;
  severity: "error" | "warning";
};

export const checkDocument = (text: string) =>
  invoke<CheckDiagnostic[]>("check_document", { text });

// Prose spellcheck (English US, offline; dictionary lives in Rust). Send a deduped word
// list; get back only the misspelled ones. Suggestions are a separate per-word call, made
// when the user opens a misspelling — they cost ~11 ms each, so computing them for every
// misspelling in a document up front was the first-edit freeze (issue G.04).
export const spellCheck = (words: string[]) => invoke<string[]>("spell_check", { words });
export const spellSuggest = (word: string) => invoke<string[]>("spell_suggest", { word });

/** Append a word to the personal dictionary (durable plain-text file) — makes it correct. */
export const addToDictionary = (word: string) =>
  invoke<void>("add_to_dictionary", { word });

/** Re-read the personal dictionary from disk (after its path changes or a hand edit). */
export const reloadSpelling = () => invoke<void>("spell_reload");

/** Absolute path to the personal dictionary (created + seeded on first use). */
export const personalDictionaryPath = () => invoke<string>("personal_dictionary_path");

export const listDirectory = (path: string) =>
  invoke<Entry[]>("list_directory", { path });

/** Start watching one or more roots for external changes; emits `fs-change` events. */
export const watchWorkspace = (paths: string[]) =>
  invoke<void>("watch_workspace", { paths });

/** Watch open files that live outside every root (non-recursive, per-file); an empty
 *  list drops the watcher. Same `fs-change` events as the workspace watcher. */
export const watchExtraFiles = (paths: string[]) =>
  invoke<void>("watch_extra_files", { paths });

// Sublime-style projects: a named set of folder roots in a .wdproj JSON file.
export type Project = {
  name: string;
  folders: string[];
  /** Optional per-folder display label, keyed by the path as written in `folders`
   *  (issue G.14). Absent from the file when empty. */
  labels?: Record<string, string>;
};
/** A managed project (name + full path) for the quick-switch list. */
export type ProjectInfo = { name: string; path: string };

export const loadProject = (path: string) => invoke<Project>("load_project", { path });

export const saveProject = (path: string, project: Project) =>
  invoke<void>("save_project", { path, project });

/** Create a managed project under ~/.writedown/projects/ (location is managed — no dialog). */
export const newProject = (name: string, folders: string[], labels?: Record<string, string>) =>
  invoke<string>("new_project", { name, folders, labels });

/** Save/rename the current project in the managed dir — name only, location is managed.
 *  Renaming a managed project removes its old file; one from elsewhere is adopted in
 *  (original untouched). Rejects if a different project already has the name. */
export const saveManagedProject = (
  name: string,
  folders: string[],
  oldPath: string | null,
  labels?: Record<string, string>,
) => invoke<string>("save_managed_project", { name, folders, oldPath, labels });

/** All managed projects under ~/.writedown/projects/, name-sorted. */
export const listProjects = () => invoke<ProjectInfo[]>("list_projects");

export const recentProjects = () => invoke<string[]>("recent_projects");

export const addRecentProject = (path: string) =>
  invoke<void>("add_recent_project", { path });

/** Recycle a MANAGED project's `.wdproj` file (guarded Rust-side; never touches docs). */
export const deleteProject = (path: string) =>
  invoke<void>("delete_project", { path });

/** Native "Save As" dialog for a document. Returns the chosen path, or null if cancelled. */
export async function pickSavePath(defaultPath?: string): Promise<string | null> {
  const result = await save({
    defaultPath,
    filters: [
      { name: "Markdown / Quarto", extensions: ["md", "qmd", "markdown"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return typeof result === "string" ? result : null;
}

/** Native "Open File" dialog (issue B.01). Multi-select; returns the chosen absolute
 *  paths, or null if cancelled. The filter list only orders the dropdown — All Files is
 *  there because Writedown opens far more than markdown. */
export async function pickOpenPaths(defaultPath?: string): Promise<string[] | null> {
  const result = await open({
    multiple: true,
    defaultPath,
    filters: [
      { name: "Markdown / Quarto", extensions: ["md", "qmd", "markdown"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (Array.isArray(result)) return result;
  return typeof result === "string" ? [result] : null;
}

/** Native open dialog for a project file. Returns the chosen path, or null. */
export async function pickProjectOpenPath(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: "Writedown Project", extensions: ["wdproj"] }],
  });
  return typeof result === "string" ? result : null;
}

export type FileItem = { name: string; path: string; rel: string };

export const listAllFiles = (root: string) =>
  invoke<FileItem[]>("list_all_files", { root });

export const readFile = (path: string) =>
  invoke<string>("read_file", { path });

/** What a file looked like on disk when we last read or wrote it (issue B.04). */
export type FileStamp = { mtime_ms: number; len: number };

/** Current stamp, or null when the file is missing/unreadable. Metadata only — no read. */
export const fileStamp = (path: string) => invoke<FileStamp | null>("file_stamp", { path });

/** Atomic save. `expect` makes it a check-and-set: the write is refused (error prefixed
 *  `changed-on-disk`) if the file moved on since that stamp. Pass null to write anyway.
 *  Returns the stamp of what was written. */
export const writeFile = (path: string, content: string, expect?: FileStamp | null) =>
  invoke<FileStamp>("write_file", { path, content, expect: expect ?? null });

/** One restorable prior version of a file (backup-before-overwrite safety net). */
export type BackupEntry = { millis: number; size: number; preview: string };

export const listBackups = (path: string) =>
  invoke<BackupEntry[]>("list_backups", { path });

export const readBackup = (path: string, millis: number) =>
  invoke<string>("read_backup", { path, millis });

export const createFile = (path: string) => invoke<void>("create_file", { path });

// ---- Git marks (issue I.02) — read-only `git` invocations only, off the UI thread ----
/** One changed path from `git status`, absolute; state ∈ modified | added | untracked |
 *  deleted | renamed. Untracked directories arrive as one collapsed entry (is_dir). */
export type GitEntry = { path: string; state: string; is_dir: boolean };
/** available=false means no git or not a repository — the feature is silently off. */
export type GitStatus = { entries: GitEntry[]; available: boolean };
export const gitStatus = (root: string) => invoke<GitStatus>("git_status", { root });
/** The index version of `path` for the gutter diff: null = no git/not a repo (feature
 *  off), "" = untracked (every buffer line counts as added). */
export const gitShowIndex = (path: string) => invoke<string | null>("git_show_index", { path });

export const createDirectory = (path: string) => invoke<void>("create_directory", { path });

/** Rename/move a file or folder (explicit user command; refuses to clobber). */
export const renamePath = (from: string, to: string) =>
  invoke<void>("rename_path", { from, to });

/** Move a file or folder to the OS Recycle Bin (recoverable). */
export const deletePath = (path: string) => invoke<void>("delete_path", { path });

/** Open a PDF/DjVu in the configured external viewer ([tools] pdf_viewer). */
export const openExternal = (path: string) => invoke<void>("open_external", { path });

/** Files/folders Writedown was launched with (double-clicked in Explorer, or passed on the
 *  command line). Consumed once, after session restore. */
export const launchFiles = () => invoke<string[]>("launch_files");

/** Open anything with its Windows default app — what a double-click in Explorer does.
 *  This is the general "open externally"; openExternal above is the PDF viewer specifically. */
export const openDefault = (path: string) => invoke<void>("open_default", { path });

/** List several directories in one round-trip (tree prefetch on project switch). Missing
 *  or unreadable paths are simply absent from the result. */
export const listDirectories = (paths: string[]) =>
  invoke<Record<string, Entry[]>>("list_directories", { paths });

/** What each path is, for drag-and-drop: directories open as a workspace, files as tabs. */
export type PathInfo = { path: string; exists: boolean; is_dir: boolean };
export const statPaths = (paths: string[]) => invoke<PathInfo[]>("stat_paths", { paths });

/** Save a pasted clipboard image. `dir` null = the app image folder (~/.writedown/img),
 *  for temp buffers. Never overwrites: identical bytes reuse the file, a collision takes
 *  the next `-N`. Returns the full path written or reused. */
export const savePastedImage = (
  dir: string | null,
  stem: string,
  ext: string,
  bytes: number[],
) => invoke<string>("save_pasted_image", { dir, stem, ext, bytes });

/** Open the configured shell ([tools] shell, default pwsh) in a new console at `dir`. */
export const openShell = (dir: string) => invoke<void>("open_shell", { dir });

/** Result of a [build] command: exit code (null if killed), captured output, elapsed ms. */
export type BuildResult = { code: number | null; stdout: string; stderr: string; ms: number };
/** Run a [build] command line against `file` through pwsh, from the file's folder. */
export const buildFile = (command: string, file: string) =>
  invoke<BuildResult>("run_build", { command, file });

/** Native folder picker. Returns the chosen absolute path, or null if cancelled. */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, defaultPath });
  return typeof result === "string" ? result : null;
}

export type Session = {
  open_tabs: string[];
  active_tab: string | null;
  tree_width: number | null;
  outline_width: number | null;
  split_ratio: number | null;
  sidebar_visible?: boolean | null;
  outline_visible?: boolean | null;
  /** Per-document cursor/scroll memory, keyed by tab path (open non-preview tabs). */
  positions?: Record<string, { anchor: number; head: number; scroll: number }> | null;
  /** Hot exit: untitled:// scratch text by sentinel path (order lives in open_tabs). */
  scratch_contents: Record<string, string>;
};

// Session is keyed per workspace; session.json holds the cold-start state (last
// workspace, Folder-tab root, active panel tab).
export type GlobalState = {
  workspace: string | null;
  folder_root: string | null;
  panel_tab: string | null;
};

export const loadGlobalState = () => invoke<GlobalState>("load_global_state");

export const saveLastWorkspace = (workspace: string | null) =>
  invoke<void>("save_last_workspace", { workspace });

export const saveFolderState = (folderRoot: string | null, panelTab: string | null) =>
  invoke<void>("save_folder_state", { folderRoot, panelTab });

export const loadSession = (workspace: string) =>
  invoke<Session>("load_session", { workspace });

export const saveSession = (workspace: string, session: Session) =>
  invoke<void>("save_session", { workspace, session });

export type ScopeRule = {
  scope: string;
  foreground: string | null;
  background: string | null;
  font_style: string | null;
};

export type SublimeTheme = {
  name: string;
  dark: boolean;
  background: string;
  foreground: string;
  caret: string;
  selection: string;
  line_highlight: string;
  font_face: string;
  font_size: number;
  line_padding_top: number;
  line_padding_bottom: number;
  rules: ScopeRule[];
};

export const loadSublimeTheme = () => invoke<SublimeTheme>("load_sublime_theme");

export type EditorSettings = {
  font_size: number | null;
  font_family: string | null;
  font_weight: string | null;
  word_wrap: boolean | null;
  /** `[editor] trim_trailing_whitespace`: trim line-end spaces/tabs on save. The backend
   *  normalizes to "all" (true, default) | "keep-hard-breaks" | "off"; a stale backend may
   *  still send the pre-2.0 boolean. CSV/TSV are never trimmed. */
  trim_trailing_whitespace: boolean | string | null;
  /** `[editor] tab_size`: editor indent width in spaces (default 4; spaces-only, never a tab). */
  tab_size: number | null;
  /** `[editor] fill_column`: column Reflow Paragraph (Alt+Q) hard-wraps at (default 80). */
  fill_column: number | null;
  /** `[editor] tab_complete_min_len`: shortest nearby word Tab word-completion offers (default 5). */
  tab_complete_min_len: number | null;
  /** `[editor] tab_complete_dict`: offer frequent words from the background dictionary (default true). */
  tab_complete_dict: boolean | null;
  /** `[editor] tab_complete_dict_min_len`: shortest word the frequency dictionary collects (default 5). */
  tab_complete_dict_min_len: number | null;
  /** `[editor] tab_complete_stem_min`: after a word this long, an unmatched Tab is swallowed
   *  (status-bar note) instead of indenting the line (default 2). */
  tab_complete_stem_min: number | null;
  /** `[editor] font_size_min` / `font_size_max`: px bounds for wheel/key zoom (default 6 / 24). */
  font_size_min: number | null;
  font_size_max: number | null;
  /** `[editor.font_by_ext]`: lowercase extension → font family; beats `font_family`. */
  font_by_ext: Record<string, string> | null;
  /** `[editor] font_choices`: families offered as palette "Font: …" verbs (session-only). */
  font_choices: string[] | null;
  outline_font_family: string | null;
  outline_font_size: number | null;
  outline_font_weight: string | null;
  outline_position: string | null;
  /** `[outline] python_show_private` / `python_show_dunder`: which Python class members the
   *  outline lists (defaults true / false; `__init__` is always listed). */
  outline_python_show_private: boolean | null;
  outline_python_show_dunder: boolean | null;
  tree_font_family: string | null;
  tree_font_size: number | null;
  tree_font_weight: string | null;
  outline_guide_color: string | null;
  outline_guide_opacity: number | null;
  tab_height: number | null;
  tab_width: number | null;
  spelling_enabled: boolean | null;
  spelling_language: string | null;
  /** `[spelling] min_length`: shortest word the tokenizer spell-checks (default 4). */
  spelling_min_length: number | null;
  /** `[spelling] skip_proper_nouns`: skip mid-sentence Capitalized words (default true). */
  spelling_skip_proper_nouns: boolean | null;
  /** `[files] quick_file`: file opened by Ctrl+Shift+Q / "Open Quick File". */
  quick_file: string | null;
  /** `[files] quick_files`: pick-list behind the palette's "Open Quick File…" (D.04). */
  quick_files: string[] | null;
  /** `[editor] date_format` / `datetime_format`: strftime patterns for the stamp verbs
   *  (D.01). Defaults: `%Y-%m-%d` and `%Y-%m-%d %H:%M:%S`. */
  date_format: string | null;
  datetime_format: string | null;
  /** `[symbols]`: user name → character additions for the Unicode picker (D.12);
   *  `""` removes a built-in. */
  symbols: Record<string, string> | null;
  /** User keybinding overrides: friendly-key ("Ctrl+Shift+K") → action name. */
  keys: Record<string, string> | null;
  /** Palette insert snippets from `[snippets]`: display name → body ("" removes a built-in). */
  snippets: Record<string, string> | null;
  /** Sublime-style build commands from `[build]`: name → command line (run via pwsh). */
  build: Record<string, string> | null;
  /** `[search]` (Find in Files): default `-g` globs and the two hard caps. */
  search_globs: string[] | null;
  search_max_hits: number | null;
  search_timeout_ms: number | null;
  /** `[git] tree_marks` (default true) / `gutter_marks` (default false) — issue I.02.
   *  Session overrides come from the palette's Git: … On/Off verbs. */
  git_tree_marks: boolean | null;
  git_gutter_marks: boolean | null;
};

export const loadEditorSettings = () => invoke<EditorSettings>("load_editor_settings");

// ---- Find in Files (Ctrl+Shift+F) -------------------------------------------------------
/** One match line. `spans` are [start, end) character offsets into `text`. */
export type SearchHit = { path: string; line: number; col: number; text: string; spans: [number, number][] };
/** One file in summary mode (`-c`, `-l`): `count` is null for the file-list flags. */
export type SearchSummary = { path: string; count: number | null };
export type SearchResult = {
  mode: "hits" | "summary";
  hits: SearchHit[];
  summary: SearchSummary[];
  total: number;
  files: number;
  truncated: boolean;
  timed_out: boolean;
  elapsed_ms: number;
  /** ripgrep's own message when it exited with an error (bad regex, unknown flag). */
  error: string | null;
  /** ripgrep's complaint when it errored but still produced results — an unquoted second
   *  word taken as a path (`-i risk measure`), an unreadable file. Shown, not fatal. */
  warning: string | null;
};
export const DEFAULT_SEARCH_GLOBS = ["*.md", "*.qmd", "*.py", "*.bib", "*.toml", "*.txt", "*.yaml", "*.yml"];
export const DEFAULT_SEARCH_MAX_HITS = 500;
export const DEFAULT_SEARCH_TIMEOUT_MS = 5000;
/** Run ripgrep with `line` as its argument line over `roots`; capped, off the UI thread. */
export const searchWorkspace = (
  line: string,
  roots: string[],
  globs: string[],
  maxHits: number,
  timeoutMs: number,
) => invoke<SearchResult>("search_workspace", { line, roots, globs, maxHits, timeoutMs });
/** Kill the running search, if any. */
export const cancelSearch = () => invoke<void>("cancel_search");

/** Raw JSON of the Tab-completion frequency dictionary ("" when absent) — the format
 *  is owned by src/editor/wordFreq.ts; the file is derived, disposable app state. */
export const wordFreqLoad = () => invoke<string>("word_freq_load");
export const wordFreqSave = (json: string) => invoke<void>("word_freq_save", { json });

export const configPath = () => invoke<string>("config_path");

/** Absolute path of the user guide's launch-time copy (~/.writedown/help.md). */
export const helpPath = () => invoke<string>("help_path");

/** Verbatim BibTeX blocks for `keys` from the configured .bib (read-only); missing keys
 *  come back as `% NOT FOUND:` comment lines. */
export const extractBibEntries = (keys: string[]) =>
  invoke<string>("extract_bib_entries", { keys });

/** Raw text of config.toml (verbatim — used for surgical, comment-preserving edits). */
export const loadConfig = () => invoke<string>("load_config");

export type BibEntry = {
  key: string;
  entry_type: string;
  author: string;
  coauthors: string;
  year: string;
  title: string;
  container: string;
};

/** A search hit: the "key  title" label plus matched char indices for highlighting. */
export type CiteMatch = {
  key: string;
  label: string;
  author: string;
  coauthors: string;
  year: string;
  title: string;
  container: string;
  positions: number[];
};

export const loadBibliography = () => invoke<number>("load_bibliography");

export const searchBibliography = (query: string) =>
  invoke<CiteMatch[]>("search_bibliography", { query });

export const getCitation = (key: string) =>
  invoke<BibEntry | null>("get_citation", { key });

/** A Quarto cross-reference label defined in the document (issue E.01). */
export type DocLabel = {
  /** The label without `@` — e.g. `fig-flood`. */
  name: string;
  /** 1-based line where it is defined. */
  line: number;
  /** Family prefix (`fig`, `tbl`, `sec`, …), or "" if it has none. */
  kind: string;
};

/** Every label defined in `text`, document order, de-duplicated. Same extractor the
 *  duplicate-label checker and the renderer use — one definition of the syntax. */
export const documentLabels = (text: string) =>
  invoke<DocLabel[]>("document_labels", { text });

/** Of the given `@keys`, which have no match in the loaded bibliography. */
export const checkCitationKeys = (keys: string[]) =>
  invoke<string[]>("check_citation_keys", { keys });

// Fast in-process render: expanded markdown with citations/crossrefs resolved (and,
// from 1.34, executed {python} cell output spliced in).
export type RenderResult = {
  markdown: string;
  cells: number;
  errors: number;
  elapsed_ms: number;
  /** "ok" | "not_configured" | error message. */
  python: string;
  /** Per expanded-markdown line: its 1-based source line, 0 = synthetic content. */
  line_map: number[];
};

/** Render the live buffer (never reads or writes the file). `path` resolves a relative
 *  front-matter `bibliography:`; pass null for unsaved scratch buffers. */
export const renderDocument = (text: string, path: string | null) =>
  invoke<RenderResult>("render_document", { text, path });

/** Run ONLY the {python} cell at `line` (1-based), in the kernel's current namespace, and
 *  get the whole document back re-assembled from the cached cell outputs. */
export const runCell = (text: string, path: string | null, line: number) =>
  invoke<RenderResult>("run_cell", { text, path, line });

/** Kill the python kernel now; the next render respawns it (the Windows "interrupt"). */
export const restartKernel = () => invoke<void>("restart_kernel");


