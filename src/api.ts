// Thin, typed wrappers over the Rust backend commands. The frontend never touches
// the filesystem directly — everything goes through these (spec §4, §26).
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export type Entry = {
  name: string;
  path: string;
  is_dir: boolean;
  ext: string | null;
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
// list; get back only the misspelled ones, each with up to five suggestions.
export type SpellResult = { word: string; suggestions: string[] };

export const spellCheck = (words: string[]) =>
  invoke<SpellResult[]>("spell_check", { words });

/** Append a word to the personal dictionary (durable plain-text file) — makes it correct. */
export const addToDictionary = (word: string) =>
  invoke<void>("add_to_dictionary", { word });

/** Re-read the personal dictionary from disk (after its path changes or a hand edit). */
export const reloadSpelling = () => invoke<void>("spell_reload");

export const listDirectory = (path: string) =>
  invoke<Entry[]>("list_directory", { path });

/** Start watching one or more roots for external changes; emits `fs-change` events. */
export const watchWorkspace = (paths: string[]) =>
  invoke<void>("watch_workspace", { paths });

// Sublime-style projects: a named set of folder roots in a .wdproj JSON file.
export type Project = { name: string; folders: string[] };

export const loadProject = (path: string) => invoke<Project>("load_project", { path });

export const saveProject = (path: string, project: Project) =>
  invoke<void>("save_project", { path, project });

export const recentProjects = () => invoke<string[]>("recent_projects");

export const addRecentProject = (path: string) =>
  invoke<void>("add_recent_project", { path });

/** Native save dialog for a project file. Returns the chosen path, or null. */
export async function pickProjectSavePath(defaultPath?: string): Promise<string | null> {
  const result = await save({
    defaultPath,
    filters: [{ name: "Writedown Project", extensions: ["wdproj"] }],
  });
  return typeof result === "string" ? result : null;
}

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

export const writeFile = (path: string, content: string) =>
  invoke<void>("write_file", { path, content });

/** One restorable prior version of a file (backup-before-overwrite safety net). */
export type BackupEntry = { millis: number; size: number; preview: string };

export const listBackups = (path: string) =>
  invoke<BackupEntry[]>("list_backups", { path });

export const readBackup = (path: string, millis: number) =>
  invoke<string>("read_backup", { path, millis });

export const createFile = (path: string) => invoke<void>("create_file", { path });

export const createDirectory = (path: string) => invoke<void>("create_directory", { path });

/** Rename/move a file or folder (explicit user command; refuses to clobber). */
export const renamePath = (from: string, to: string) =>
  invoke<void>("rename_path", { from, to });

/** Move a file or folder to the OS Recycle Bin (recoverable). */
export const deletePath = (path: string) => invoke<void>("delete_path", { path });

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
};

// Session is keyed per workspace; session.json holds only the last workspace.
export const loadLastWorkspace = () => invoke<string | null>("load_last_workspace");

export const saveLastWorkspace = (workspace: string | null) =>
  invoke<void>("save_last_workspace", { workspace });

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
  outline_font_family: string | null;
  outline_font_size: number | null;
  outline_font_weight: string | null;
  tree_font_family: string | null;
  tree_font_size: number | null;
  tree_font_weight: string | null;
  outline_guide_color: string | null;
  outline_guide_opacity: number | null;
  tab_height: number | null;
  tab_width: number | null;
  spelling_enabled: boolean | null;
  spelling_language: string | null;
};

export const loadEditorSettings = () => invoke<EditorSettings>("load_editor_settings");

export const configPath = () => invoke<string>("config_path");

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
};

/** Render the live buffer (never reads or writes the file). `path` resolves a relative
 *  front-matter `bibliography:`; pass null for unsaved scratch buffers. */
export const renderDocument = (text: string, path: string | null) =>
  invoke<RenderResult>("render_document", { text, path });

/** Kill the python kernel now; the next render respawns it (the Windows "interrupt"). */
export const restartKernel = () => invoke<void>("restart_kernel");


