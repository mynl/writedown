# Changelog

All notable changes to Writedown are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Newest first. The terse git commit
messages point here for detail.

## [1.23.2] - 2026-07-07

### Fixed

- **Editor view could go stale after a large multi-line delete** — the deleted lines stayed
  on screen (with no line numbers) even though the document state and the file on disk were
  correct. Hardened the likely causes: **bounded the LaTeX-math regexes** (alternation-free,
  length-capped) so they can't stall the editor's update cycle, and **removed React
  StrictMode** (its dev-only double-mounting desyncs CodeMirror). Also added a **CodeMirror
  exception probe** that logs any update-time error to `~/.writedown/logs/` — so if it
  recurs, the log pinpoints the exact cause.

## [1.23.1] - 2026-07-07

### Fixed

- **BibTeX parser dropped ~⅓ of the library.** An unbalanced `(` in a field value (e.g.
  `booktitle = {… (March 2013}`) was counted as brace depth, so one stray paren made the
  parser swallow every following entry until a stray `)` turned up — **2,536 of 7,160
  entries lost**, including `Delbaen2006a`. The entry scanner now counts only the entry's
  own braces; **all 7,160 index correctly**.
- **Editor could crash to a blank window.** Added a React **error boundary** (shows the
  error + a Reload button instead of blanking) and **global error logging** to
  `~/.writedown/logs/`. The math and CSV highlighters are wrapped so a bad input can't take
  down the editor.
- **`@'` no longer auto-inserts `''`** — auto-close brackets is off (it also interfered with
  prose).

## [1.23.0] - 2026-07-07

Phase 7 (spec §16.2) + citation polish.

### Added

- **Render with Quarto** (`Ctrl+Shift+Q`, or the palette) — saves, runs `quarto render` on
  the active `.qmd`/`.md`, and shows the log in a panel with an **Open output** button when
  an HTML result is produced. Explicit command only; discovers `quarto` from PATH.

### Changed

- **View toggle is now `Ctrl+Shift+L`** (Joplin-style), was Ctrl+Shift+V. (Reclaims the key
  from Sublime's split-into-lines, which is unbound for now.)
- **Citations**: `'exact` terms now work in the `@` query (e.g. `@'mild'pric`); the
  overlapping side info-panel is removed (details are in the row + on hover); **Tab
  re-opens** the picker when the cursor is just after a partial `@…`.

## [1.22.0] - 2026-07-06

### Changed

- **Citation matcher upgraded** to the csv-grid fzf grammar — space-separated ANDed terms,
  **`'exact`** contiguous substrings (e.g. `'mild'pric` = exact "mild" AND exact "pric"),
  and smart-case — matched over **key + title** (the author is already in the key).
- **Matched characters are highlighted** in the popup, the dropdown is **wider**, and
  **co-authors** + year show on the detail line.

## [1.21.0] - 2026-07-06

Phase 6 (spec §19–22) — authoritative **BibTeX** + citation autocomplete.

### Added

- **BibTeX index**: on launch (and when you save config) Writedown parses the
  `[bibliography] default_file` from `config.toml` into an in-memory index (key, author,
  year, title, journal). Tolerant parser (`@string`, `#` concatenation, nested braces,
  `date`→year). The `.bib` is **watched and re-indexed on external change**, so
  newly-added references appear right away. It is never modified.
- **`@` citation autocomplete** in Markdown/Quarto prose: a live popup ranked in Rust by
  **SkimMatcherV2** (fzf-like) across key/author/year/title/journal; Enter/Tab inserts
  `@key`. Suppressed inside code / YAML / front matter. **Ctrl+Shift+C** opens it directly.
- **Hover a `@key`** to see its full title / author / year.
- Backend `load_bibliography`, `search_bibliography`, `get_citation` (parser unit-tested).

Point it at your library: set `[bibliography] default_file` in config (Ctrl+Shift+P →
Edit Config).

## [1.20.1] - 2026-07-06

### Fixed

- **HTML comments** (`<!-- … -->`) no longer show in the preview, and commented-out
  headings no longer appear in the outline. (Preview now renders raw HTML and sanitises
  it with DOMPurify, which strips comments and any scripts.)
- **Bidirectional scroll sync** — scrolling the preview now scrolls the editor too.

### Added

- **Outline font is config-driven** — `[outline] font_family` / `font_size` in
  `config.toml` (default Arial Narrow 10pt).

## [1.20.0] - 2026-07-06

### Added

- **LaTeX math in the preview** (KaTeX) — inline `$…$` and display `$$…$$` render properly;
  KaTeX fonts are bundled so it works offline.
- **Synchronised scrolling** — the preview follows the editor's scroll (and outline jumps),
  so source and render stay aligned.
- **Line / column** in the footer (replacing the "Saved" indicator — tabs already show the
  dirty dot).
- Outline now uses **Arial Narrow** (matching the ST sidebar).

### Fixed

- **Duplicate tabs** — a race in `openFile` (the `await readFile` between the "already
  open?" check and the tab add) let a double-click open the same file in two tabs. It's now
  deduped atomically inside the state update.

## [1.19.0] - 2026-07-06

Phase 5 complete (spec §18) — the document **outline**.

### Added

- **Document outline** in the right pane: parses ATX headings (skipping front matter and
  fenced code, stripping Quarto `{#id}` markers), preserves hierarchy, **click a heading to
  jump** the editor there, and **highlights the heading at the cursor**. Updates live as
  you edit.

## [1.18.0] - 2026-07-06

Phase 5 begins (spec §15) — the Markdown/Quarto **preview pane**.

### Added

- **Live preview** rendered with markdown-it: headings, lists, **tables**, blockquotes,
  code blocks, inline code, links, images, **footnotes**, and **task lists**. YAML front
  matter is stripped from the render; raw HTML is escaped (the preview never executes code).
- **View modes** — toggle **editor / split / preview** via the button in the editor top
  bar, `Ctrl+Shift+V`, or the command palette. Non-Markdown files always show the editor.
- External links in the preview open in your **default browser**; in-app navigation is
  suppressed.

Follow-ups: KaTeX math rendering, relative-image resolution, synchronised scrolling,
preview code-block syntax highlighting.

## [1.17.1] - 2026-07-06

### Fixed

- **Footer no longer flickers** — dropped the transient "Saving…" status (atomic saves are
  instant); it just shows Modified / Saved now.
- **Tabs always close** — the close `×` and `Ctrl+W` relied on a `window.confirm()` dialog
  (unreliable in the webview) that could block closing a modified tab. Closing now saves
  the tab first (autosave) with no dialog — fixes the "tab won't close" case.

## [1.17.0] - 2026-07-06

Phase 4 reliability — external file watching (spec §14).

### Added

- **External file watching** (Rust `notify`): the workspace is watched, so the **tree
  auto-refreshes** when files are added/removed/changed externally — a soft refresh that
  keeps your expanded folders open.
- **External-change handling** for open files: a file changed on disk with **no** unsaved
  edits **reloads** automatically; one changed **with** unsaved edits shows **"Modified
  externally — click to reload"** in the footer (click reloads; `Ctrl+S` keeps your
  version). Writedown ignores the events its own saves trigger.
- Backend `watch_workspace`.

## [1.16.0] - 2026-07-06

### Added

- **Intra-math TeX colouring** — inside `$…$` / `$$…$$`, tokens are now coloured
  separately (ST-style): `$` delimiters and variables stay foreground, while `\commands`,
  numbers, operators, and braces each get their own colour (previously the whole span was
  one flat colour).

## [1.15.0] - 2026-07-06

### Fixed

- **YAML front matter** is now parsed as real YAML (keys orange, string values green,
  numbers/bools per the scheme) instead of a weak regex — fixes the "all orange" look.
- **Inline math** matches `$…$` pairs without needing a `\` inside (so `$P(x)$` colours)
  while still ignoring currency; math now also wins over list/other syntax, so it colours
  inside bullets.
- **Python** no longer paints every keyword the same hot-pink — control-flow keywords use
  Loudoun's python-control colour, other keywords the plain keyword colour (closer to ST).

## [1.14.0] - 2026-07-06

### Changed

- **Per-workspace session** — open tabs and pane widths are now saved per workspace
  (`~/.writedown/sessions/<hash>.json`); `session.json` keeps only the last-opened folder
  for cold start. **Multiple instances on different folders no longer clobber** each
  other's tabs. (Two instances on the *same* folder still share that folder's session —
  true per-window state can follow if needed.)

## [1.13.0] - 2026-07-06

### Added

- **LaTeX math highlighting** in Markdown/Quarto — inline `$…$` (only when it contains a
  math signal `\ ^ _`, so prose and currency like `$5` aren't miscoloured) and display
  `$$…$$` blocks. Full **`.tex` / `.sty` / `.latex`** files use a proper TeX (stex)
  language.

## [1.12.0] - 2026-07-06

### Added

- **Open more file types** — the editor now colourises by extension: **Python**, **JSON**,
  **YAML**, **TOML**, plus Markdown/Quarto; other text (`.txt`, `.tex`, `.sh`, `.r`) opens
  as plain text. These now appear in the file tree and quick-open.
- **CSV/TSV rainbow columns** (à la Sublime RainbowCSV) — each column coloured by index.
- **Quarto code cells** — ` ```{python} `, ` ```{r} `, ` ```{=html} ` now highlight the
  nested language (braces/options stripped for matching), so `.qmd` code blocks colour
  like `.md` ones.

## [1.11.0] - 2026-07-06

Phase 4 begins — **autosave** (spec §12).

### Added

- **Autosave** of dirty documents on **window focus loss**, on **switching tabs** (the
  tab you leave saves), and after a short **idle pause** (~1.5s) once anything is dirty.
  Uses the same atomic, EOL-preserving save as `Ctrl+S`. (Explicit save-on-close and the
  configurable idle timeout land with the rest of Phase 4.)

## [1.10.0] - 2026-07-06

### Added

- **YAML front-matter highlighting** (spec §17) — the `---` block now colours keys and
  values from the imported scheme (Loudoun → orange keys, green values). CodeMirror's
  Markdown parser doesn't scope front matter, so this is a dedicated decoration layer.
- **Config-selectable editor font** — the editor font size/family come from `[editor]`
  in `~/.writedown/config.toml`, overriding the imported Sublime font. Fresh-install
  default is now **14** (was importing Sublime's 17).
- **Edit Config command** — Ctrl+Shift+P → "Edit Config (config.toml)" opens it in a tab;
  saving re-applies the appearance live (e.g. font size).
- Heading background imported from the Sublime scheme.
- Backend `config_path`, `load_editor_settings`.

## [1.9.0] - 2026-07-06

Phase 3 (spec §30, §11) — the editor now wears your Sublime look.

### Added

- **Sublime colour-scheme import**: on launch Writedown reads your
  `Preferences.sublime-settings` and the active `.sublime-color-scheme` (your **Loudoun**
  scheme), resolves `var(...)` and `color(… alpha …)` values, and applies them to
  CodeMirror — background, foreground, caret, selection, current-line, plus headings,
  comments, strings, keywords, constants, YAML keys, and fenced-code colours. Your editor
  **font (Source Code Pro 17)** and line padding are imported too. Falls back to the
  built-in theme if Sublime isn't found. Writedown never modifies your Sublime config.
- Backend `load_sublime_theme` (`src-tauri/src/sublime.rs`), JSON5-tolerant (Sublime
  config allows comments + trailing commas).

### Fixed

- Selection colour now comes from the imported scheme, applied through a reliable global
  CSS variable.

## [1.8.1] - 2026-07-06

### Fixed

- **Selection is now visible** — overrode CodeMirror's injected selection styles with
  plain global CSS (`!important`); the theme-object approach in 1.6.1 wasn't sticking.
- **Folders** now use a clear 📁 / 📂 (closed/open) icon instead of a small chevron.
- **Active tab** is marked with an accent bar; tabs shrink to fit as more open, then the
  strip scrolls.

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
