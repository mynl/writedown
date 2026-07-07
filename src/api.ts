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

export const createFile = (path: string) => invoke<void>("create_file", { path });

export const createDirectory = (path: string) => invoke<void>("create_directory", { path });

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
  outline_font_family: string | null;
  outline_font_size: number | null;
  tree_font_family: string | null;
  tree_font_size: number | null;
};

export const loadEditorSettings = () => invoke<EditorSettings>("load_editor_settings");

export const configPath = () => invoke<string>("config_path");

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


