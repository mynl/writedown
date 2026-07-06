# Plan — Phase 1: Desktop shell and files (spec §30 Phase 1)

Goal: launch → open a folder → browse a recursive file tree → open files in tabs →
edit → save (atomic) → restore the session on restart. No CodeMirror yet (Phase 2);
editing is a plain textarea for now.

Shipped in climbing version bumps:

## 1.1.0 — workspace + file tree + open + resizable panes
- Rust commands: `list_directory(path)` (one level, lazy; dirs first then supported
  files, hidden skipped), `read_file(path)`.
- Native folder picker via `tauri-plugin-dialog` (`open({directory:true})`).
- Frontend: recursive lazy file tree (expand/collapse, click-to-open), Files/Outline
  sidebars **draggable & resizable** (drag handles between panes).
- State via a small `zustand` store.

## 1.2.0 — tabs + editing + save
- Multiple open files in tabs; active tab; dirty indicator; close tab.
- Editable content (textarea); `write_file(path, content)` **atomic** (temp in same
  dir → flush → rename). Save on Ctrl+S. (Autosave is Phase 4.)
- Footer shows active file + saved/modified status alongside the version.

## 1.3.0 — config dir + session restore
- Rust: create `~/.writedown/` + default `config.toml` on first launch; `load_config`
  / `save_config` (TOML), `load_session` / `save_session` (`session.json`).
- Restore last workspace, open tabs, active tab, pane widths on startup.

## Deferred (later phases, keep seams)
- Tree ops (new/rename/delete/reveal) — §8, later in Phase 1 or its own bump.
- CodeMirror + Sublime keymap — Phase 2. File watching/conflict — Phase 4.

## Verify
`npm run tauri dev` → open a folder, expand dirs, open a file, drag the sidebars,
edit + Ctrl+S (confirm the file changed on disk, byte-for-byte outside edits), restart
and confirm workspace/tabs/pane widths restored.
