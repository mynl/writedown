# Changelog

All notable changes to Writedown are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Newest first. The terse git commit
messages point here for detail.

## [1.8.0] - 2026-07-06

Phase 2 complete (spec §30) — the editor now has quick navigation.

### Added

- **Quick-open** (`Ctrl+P`): fuzzy-search every supported file in the workspace by path,
  matched characters highlighted; `Enter` opens, arrows move, `Esc` closes.
- **Command palette** (`Ctrl+Shift+P`): fuzzy-search and run app commands (open folder,
  save, refresh tree, close/next/previous/reopen tab).
- **fzf-style matcher** (`src/fuzzy.ts`) with matched positions and fzf-like ranking
  (contiguous runs, word/camelCase boundaries, earlier-is-better). The 7,000-entry
  citation index (Phase 6) will use the Rust `fuzzy-matcher` SkimMatcherV2, as Steve does.
- Backend `list_all_files` — recursive workspace walk (skips hidden and build/VCS dirs,
  capped for safety).

## [1.7.0] - 2026-07-06

### Added

- **Preview tabs** (Sublime-style): single-click a file to open it in a transient preview
  tab (shown italic); the next single-click reuses that slot instead of piling up tabs.
  Double-clicking the file or tab, or editing, promotes it to a permanent tab — so
  clicking around the tree no longer clutters the editor.
- **Distinct folders** in the tree — bold, with an accented disclosure chevron.
- **Tree refresh** on `F5` / `Ctrl+Shift+R` (the default webview reload is suppressed).
  External-change auto-refresh via file watching is still Phase 4.

### Fixed

- **Markdown/Quarto syntax colouring** — headings are tagged `heading1`–`heading6`, which
  the theme wasn't styling, so most colour was missing. Headings (sized by level),
  emphasis/strong/strikethrough, links, inline code, list/quote markers, and fenced-code
  languages now colour properly.

## [1.6.1] - 2026-07-06

### Fixed

- **Invisible selection** — the active selection (and each `Ctrl+D` multicursor
  selection) now shows a visible highlight; other matching occurrences use a distinct
  colour so selection vs. matches are tellable apart.
- **Ctrl+Tab / Ctrl+Shift+Tab** now switch tabs while the editor has focus (bound at the
  editor level; the window handler defers to it).

## [1.6.0] - 2026-07-06

### Added

- **Find / replace / go-to-line** in the editor (spec §23): `Ctrl+F` find, `Ctrl+H`
  replace, `Ctrl+G` go to line; `F3` / `Shift+F3` next/previous match. (Find-in-files
  across the workspace comes later, with backend search.)

## [1.5.0] - 2026-07-06

Sublime-style editing (spec §10) — the core reason this app exists.

### Added

- **Sublime keybindings + multicursor**, as one command layer:
  - `Ctrl+D` select next occurrence · `Ctrl+L` select line · `Ctrl+Shift+D` duplicate
    line · `Ctrl+Shift+Up/Down` move line · `Ctrl+/` toggle comment.
  - `Ctrl+Alt+Up/Down` add cursor above/below · `Ctrl+Shift+L` split selection into lines.
  - **Column selection** via `Alt+drag` (rectangular selection + crosshair cursor).
  - A multicursor edit is a single undo step.
- **Tab navigation**: `Ctrl+Tab` / `Ctrl+Shift+Tab` next/previous · `Ctrl+W` close
  (confirms if unsaved) · `Ctrl+Shift+T` reopen last closed.

Deferred to a later bump: `Ctrl+M` matching bracket, `Ctrl+K Ctrl+D` skip occurrence.

## [1.4.0] - 2026-07-06

Phase 2 begins (spec §30) — the editor is now CodeMirror 6.

### Changed

- **Editor is now CodeMirror 6** (replacing the textarea): Markdown syntax highlighting
  with nested fenced-code languages, line numbers, code folding, bracket matching,
  active-line highlight, and word wrap. `.qmd` is treated as Markdown. A clean dark/light
  theme (Sublime colour-scheme import is Phase 3). Dirty tracking, EOL preservation, and
  atomic `Ctrl+S` save all carry over unchanged.

## [1.3.1] - 2026-07-06

### Fixed

- Double scrollbar in the editor region — the editor container and the textarea were
  both scrolling; the textarea now owns scrolling. Scrollbars are also thinner and more
  unobtrusive throughout (tab strip, tree, editor).

## [1.3.0] - 2026-07-06

Config directory and session restore — Phase 1 complete (spec §30).

### Added

- **`~/.writedown/`** created on first launch (spec §5): `cache/`, `index/`, `logs/`,
  `themes/`, and a commented default `config.toml`. Writedown does not rewrite
  `config.toml` during ordinary use, so your edits and comments are safe.
- **Session restore** (spec §24) via `~/.writedown/session.json`: on restart Writedown
  reopens the last workspace, the open tabs, the active tab, and the pane widths.
  Missing files/folders are skipped silently so a stale session never blocks launch.
  Saved debounced on change (no writes while you type). Backend commands `load_config`,
  `load_session`, `save_session`.

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
