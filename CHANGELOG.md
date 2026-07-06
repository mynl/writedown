# Changelog

All notable changes to Writedown are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Newest first. The terse git commit
messages point here for detail.

## [1.2.0] - 2026-07-06

Editing and saving — open files, edit, and save without mangling them.

### Added

- **Tabs** — open multiple files; click to switch, `×` to close (a confirm guards
  closing a tab with unsaved edits). A dirty dot marks unsaved tabs.
- **Editable documents** (plain textarea for now; CodeMirror is Phase 2).
- **Atomic save** on `Ctrl+S` (spec §12): temp file in the same directory → flush +
  fsync → rename over the original. The file's original **newline convention is
  preserved** — a CRLF file stays CRLF — so saving never rewrites bytes you didn't
  touch. Backend command `write_file`.
- **Save status in the footer**: `Saved` / `Modified` / `Saving…` / `Save failed`
  (failures show the error and stay visible).

## [1.1.0] - 2026-07-06

Phase 1 begins (spec §30) — you can now open a folder and browse it.

### Added

- **Open a workspace** via a native folder picker (`tauri-plugin-dialog`); the chosen
  folder becomes the workspace root, shown in the footer.
- **Recursive file tree** (left pane) that loads lazily one directory at a time, so it
  stays responsive on large trees (spec §12). Directories first, then supported files
  (`.md`, `.qmd`, `.markdown`, `.bib`, `.csl`, `.yml`, `.yaml`, `.toml`); dotfiles hidden.
  Click a folder to expand/collapse, a file to open it (read-only for now — editing lands
  in 1.2.0).
- **Draggable, resizable sidebars** — drag the dividers to resize the Files and Outline
  panes (widths will persist across sessions in 1.3.0).
- Backend commands `list_directory` and `read_file` (`src-tauri/src/files.rs`); all
  filesystem access is backend-mediated (spec §4, §26). Frontend state via `zustand`.

## [1.0.0] - 2026-07-06

Initial scaffold — a running Tauri 2 + React + TypeScript desktop app baseline. No
editor features yet; this establishes the shell, build, icons, version plumbing, and
the developer-drive churn firewall so subsequent phases (spec §30) can climb from here.

### Added

- **Project docs**: `CLAUDE.md` (standing instructions), `README.md`, this changelog,
  `human-hints.md` (decision journal), `.gitignore`.
- **Tauri 2 app** (`src-tauri/`) + **React 19 / TypeScript / Vite** frontend (`src/`),
  identifier `com.mynl.writedown`, window titled "Writedown" (1200×800).
- **Three-pane shell** (Files · Editor · Outline) with a status-bar footer.
- **Version in the footer**, read at runtime via `@tauri-apps/api/app` `getVersion()` —
  single-sourced from `tauri.conf.json`, no hard-coded copy.
- **App icons** generated from `assets/writedown-logo.png` into `src-tauri/icons/`
  (Windows `.ico`, `Square*Logo`, macOS `.icns`, plus Android/iOS sets).
- **Churn firewall**: Rust `target/` and `node_modules/` routed to the `V:` dev drive
  (`src-tauri/.cargo/config.toml` + a node_modules junction); `scripts/dev-setup.ps1`
  re-establishes it after installs; npm cache on `V:`.

Frontend build (`tsc && vite build`) and backend (`cargo check`) both pass.
