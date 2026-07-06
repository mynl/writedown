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
  workspace: string | null;
  open_tabs: string[];
  active_tab: string | null;
  tree_width: number | null;
  outline_width: number | null;
};

export const loadSession = () => invoke<Session>("load_session");

export const saveSession = (session: Session) =>
  invoke<void>("save_session", { session });

