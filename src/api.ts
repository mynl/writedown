// Thin, typed wrappers over the Rust backend commands. The frontend never touches
// the filesystem directly — everything goes through these (spec §4, §26).
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type Entry = {
  name: string;
  path: string;
  is_dir: boolean;
  ext: string | null;
};

export const listDirectory = (path: string) =>
  invoke<Entry[]>("list_directory", { path });

/** Start watching a workspace for external changes; emits `fs-change` events. */
export const watchWorkspace = (path: string) =>
  invoke<void>("watch_workspace", { path });

export type FileItem = { name: string; path: string; rel: string };

export const listAllFiles = (root: string) =>
  invoke<FileItem[]>("list_all_files", { root });

export const readFile = (path: string) =>
  invoke<string>("read_file", { path });

export const writeFile = (path: string, content: string) =>
  invoke<void>("write_file", { path, content });

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
};

export const loadEditorSettings = () => invoke<EditorSettings>("load_editor_settings");

export const configPath = () => invoke<string>("config_path");

export type BibEntry = {
  key: string;
  entry_type: string;
  author: string;
  year: string;
  title: string;
  container: string;
};

export const loadBibliography = () => invoke<number>("load_bibliography");

export const searchBibliography = (query: string) =>
  invoke<BibEntry[]>("search_bibliography", { query });

export const getCitation = (key: string) =>
  invoke<BibEntry | null>("get_citation", { key });

