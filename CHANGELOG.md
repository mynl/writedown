# Changelog

All notable changes to Writedown are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/). Newest first. The terse git commit
messages point here for detail.

## [1.81.0] - 2026-07-18

### Fixed

- **A document's edits can no longer land in another document's file** (issue 12:
  index.qmd twice overwritten wholesale by other tabs' buffers). Root cause: one
  CodeMirror view serves all tabs, the active path flips synchronously on a tab
  click, but the react-codemirror wrapper defers the actual document swap behind a
  ~200 ms typing latch — so edits made in that beat were attributed, and then
  autosaved, to the newly active file. Three-part fix: (a) the controlled value is
  now applied to the view synchronously (layout effect) the moment it diverges, so
  the view can never show one document while another is active — this also stops the
  wrapper's deferred whole-document replace, the prime suspect for "jumps to top on
  paste" (issue 9); (b) editor changes are written to the tab the editor was
  rendered for (new `editTab` store action), never to whatever is active when the
  event fires; (c) the swap transaction is excluded from undo history (undo can no
  longer resurrect a previous tab's text) and from cursor/scroll recording, and a
  programmatic scroll-to-0 straight after a swap is no longer recorded as the
  document's remembered position (the "sticky" jump amplifier). Frontend only.

## [1.81.1] - 2026-07-18

### Fixed

- **Delete asks for confirmation again.** Tauri swaps `window.confirm` for an async
  IPC dialog call: the un-awaited Promise is always truthy, so the guard in Delete
  never blocked — and in the packaged exe the dialog permission was also denied by
  the ACL (the "plugin:dialog|confirm not allowed" log lines), so files went to the
  Recycle Bin with no prompt at all. Delete now uses the dialog plugin's `confirm`
  properly awaited, and the capability grants it. Requires a backend rebuild (the
  capability file is compiled in).

## [1.81.2] - 2026-07-18

### Fixed

- **The preview-mode Open Files row can no longer balloon** (third time's the charm).
  The 1.76.1 font-size/line-height pins treated the wrong disease: line-height is a
  floor for the line box, not a ceiling, so an italic fallback face with tall
  metrics still inflated the row. The tab strip never ballooned because it is
  clipped, not because of its pins — the Open Files rows now get the same cure: a
  pinned row height (scaled from the [tree] font size, floored at the close
  button's 18 px) plus overflow:hidden, making the row immune to whatever face the
  italic resolves to. CSS only.

## [1.81.3] - 2026-07-18

### Fixed

- **Saving personal-dictionary.txt now takes effect immediately** (issue 3). The
  palette "Add Word" always worked, but words typed into the dictionary file
  itself sat on disk while the checker kept its startup snapshot — the file lives
  in the app-config dir outside every watched root, and only config.toml saves
  reloaded spelling. The store now learns the resolved dictionary path (re-resolved
  when config changes it) and a save of that file mirrors the config branch:
  reload the word set, clear the caches, re-lint the open document. Path
  comparison is case- and separator-insensitive.

## [1.81.4] - 2026-07-18

### Fixed

- **Outline clicks land on the first try** (issue 1). The editor-side jump computed
  its target from CodeMirror's estimated heights for never-drawn lines and scrolled
  once — the scroll forced real measurement, so only a second identical click
  landed. The jump now re-derives the target for up to 8 frames after scrolling
  (superseded by any newer jump), converging as measurements arrive — the editor
  twin of the settle loop the preview jump gained in 1.73.2. Click-time only.

## [1.81.5] - 2026-07-18

### Fixed

- **Scroll sync stands down while the preview is behind the buffer** (issues 6 and,
  with 1.81.0, the rest of 9). While typing, the rendered blocks lag the editor by
  the 200 ms render debounce plus render time; syncing against those stale line
  ranges walked off the end of the block list and clamped the preview to the
  bottom — and the settle loop then held it there (worst inside big display math,
  where one block spans many source lines and a transiently unbalanced $$ swallows
  the document). Both sync directions, and the settle loop, now check that the
  rendered source IS the live buffer before moving anything; preview DOM churn in
  the 150 ms after a patch is likewise ignored, so patch-induced scroll events can
  no longer rewrite the editor's position. Sync resumes by itself once the render
  catches up. No cost outside the sync handlers.

## [1.82.0] - 2026-07-18

### Added

- **Type to wrap the selection** (issue 5, ST muscle memory). With text selected,
  typing `"` `'` `` ` `` `*` `(` `[` `{` surrounds the selection (paired for
  brackets, doubled for the symmetric characters) and keeps it selected, so wraps
  nest. Empty cursors in a multi-selection still type the character; with nothing
  selected the handler declines entirely, so ordinary typing is untouched and
  nothing auto-inserts at a bare caret (closeBrackets stays off, as decided).
  Works in every file type, multicursor-aware.

## [1.83.0] - 2026-07-18

### Added

- **The command palette remembers what you ran** (issue 10, ST behaviour). Opening
  it with an empty query lists commands most-recently-used first with the last one
  preselected — so Ctrl+Shift+P, Enter reruns the previous command. Typing any
  query switches back to pure fuzzy ranking. The MRU (last 50, in localStorage)
  survives restarts; ids that no longer exist — say a config snippet you removed —
  just rank nowhere. Palette-time only.

## [1.84.0] - 2026-07-18

### Added

- **Locate File in Sidebar** (issue 8): a palette command that reveals the active
  document — picks whichever panel's root contains it (preferring the one already
  showing), expands its ancestor folders, switches to that panel (showing the
  sidebar if hidden), and scrolls the highlighted row into view once the lazy
  per-level listings settle. Containment is case- and separator-insensitive. If
  the file is under no root — a quick-opened stray, a scratch — the status bar's
  left slot shows "name (not found in sidebar)" for ~20 s instead of the path;
  that transient-message slot is new and reusable. Command-time only.

## [1.85.0] - 2026-07-18

### Fixed

- **Files opened from outside the workspace now see external edits** (issue 11 —
  "this file is not refreshing"). The watcher only ever covered workspace roots, so
  a quick-opened stray (the issues file being Exhibit A) never received change
  events: clean tabs didn't refresh, dirty tabs never learned they were in
  conflict. A second, independent watcher now covers exactly the open tabs that
  live under no root — per-file, non-recursive, re-pointed as tabs open/close and
  when roots change, dropped when no strays remain. The existing rules are
  unchanged: clean tab → auto-reload, dirty tab → conflict flag (never a silent
  clobber), own saves suppressed. Requires a backend rebuild.

## [1.86.0] - 2026-07-18

### Fixed

- **The Rendered view now speaks your document's coordinates** (issue 4). The build
  splices cell output, a title, and a References section into the markdown, so the
  rendered blocks' line numbers referred to the expanded document — scroll sync ran
  in the wrong coordinate system (drifting further as outputs accumulated) and a
  build always opened at the top. The renderer now emits a line map alongside the
  markdown (one entry per expanded line: its source line, or 0 for synthetic
  content — built during assembly, zero extra passes), and everything hangs off
  it: editor↔rendered scroll sync translates in both directions, outline clicks
  land correctly in the rendered pane, and after a build the rendered view opens
  at the editor's current location instead of the top. Spliced cell output anchors
  to its cell's line, so scrolling through results tracks the producing cell.
  Requires a backend rebuild.

## [1.86.1] - 2026-07-20

### Fixed

- **Insert Date-Time no longer loses editor focus** (issue 1). The stamp was
  inserted correctly and the caret already sat after it (`replaceSelection`), but the
  palette command never returned focus to the editor — when the palette closed, focus
  fell to the page body, so the caret went inert and you had to click back in. The
  command now refocuses the view after inserting, matching the snippet-insert path.
  Frontend only.

## [1.86.2] - 2026-07-20

### Fixed

- **@-citations (and spellcheck) work in an indented footnote definition** (issue 7).
  The editor's markdown grammar has no footnote rule, so a footnote definition
  `[^key]: …` indented by a tab (or 4+ spaces) parsed as an indented code block — and
  the shared prose gate rejects anything inside code, so the `@` citation popup and
  spellcheck went silent on that line. Unindented footnotes were unaffected (they
  parse as a paragraph); the failure appeared only once the key was tabbed in. The
  prose gate now recognizes an indented-code line that is really a footnote definition
  and treats it as prose. Frontend only.

## [1.86.3] - 2026-07-20

### Fixed

- **Ctrl+D selections are boldly visible** (issue 4). Selecting a word shows a bright
  green match highlight, but Ctrl+D ("select next occurrence") converts the matches
  into real selection ranges — at which point CodeMirror drops the green highlight and
  paints every range with the theme's faint translucent selection colour, so the
  selection nearly vanished. All real selections now use a bold green in the match
  highlight's family (still translucent, so the text reads), so single- and
  multi-selection look consistent and stay clearly visible. The colour is an
  overridable CSS variable (`--cm-sel-strong`). Frontend only.

## [1.86.4] - 2026-07-20

### Fixed

- **No more duplicate project in quick-switch** (issue 13). The recent-projects list
  de-duplicated by exact byte match, so the same `.wdproj` added via two spellings —
  the managed path vs. the native Open dialog, a differing drive-letter case, `\` vs
  `/`, or a trailing slash — stacked up as two rows. De-dup now uses a normalized key
  (case- and separator-insensitive, trailing slash stripped) that mirrors the frontend
  normalizer, both when adding and when reading, so an existing duplicate collapses on
  next load. Genuinely distinct project files are unaffected. Requires a backend rebuild.

## [1.87.0] - 2026-07-20

### Added

- **Project quick-switch dropdown in the panel footer** (issue 3). The Project panel
  now has a select box pinned to its bottom listing your projects most-recently-used
  first (the same deduped, disambiguated set the palette quick-switch uses); picking one
  switches workspace. Projects only — the Folder panel is unchanged. Frontend only.

## [1.88.0] - 2026-07-20

### Added

- **Delete a project from the palette** (issue 12). "Project: Delete <name>…" entries
  (one per managed project under `~/.writedown/projects/`) recycle the `.wdproj` file to
  the Recycle Bin after a confirmation dialog; if it is the open project it is closed
  afterward (the folder root is adopted into the Folder tab). Guarded end to end — only
  a managed `.wdproj` can be deleted, and the folders a project references are never
  touched (spec §2). The recent-projects list self-prunes the vanished entry. Requires a
  backend rebuild.

## [1.89.0] - 2026-07-20

### Added

- **Per-document Python interpreter via `wd-python:`** (issue 9). A document's YAML front
  matter can name the interpreter for its `{python}` cells — `wd-python: C:/env/python.exe`
  — overriding the `[render] python` config for that document. Absolute paths only: a
  relative value is ignored (with a render-summary warning) rather than guessed at, and a
  bad absolute path surfaces the usual "python failed to start" warning. Requires a backend
  rebuild.

## [1.89.1] - 2026-07-20

### Fixed

- **Preview syncs to the editor's spot on a tab switch and a Preview↔Rendered switch**
  (issues 6 & 8). Editor↔preview scroll sync was driven only by live scroll events, so
  switching tabs left the preview pinned at the top until you scrolled (the tab switch's
  own scroll event fires before the new document has rendered, so it is correctly dropped
  as stale), and switching between the Preview and Rendered tabs remounted the pane at the
  top. A single one-shot now runs once the switched-to document's render is patched in,
  scrolling the preview to the editor's current top line. The "a build opens at your Ctrl+B
  spot" behavior is preserved — it now survives a Preview↔Rendered switch instead of
  replaying the stale build position. Frontend only.

## [1.90.0] - 2026-07-20

### Added

- **Ctrl+MouseWheel font-size zoom** (issue 11). Hold Ctrl and spin the wheel over the
  editor to grow/shrink the font, like Sublime. It is transient (the same session-only,
  never-config `editorZoom` that Ctrl+= / Ctrl+- / Ctrl+0 use) and bounded by a hard px
  floor and cap (6–40) so it can't shrink to nothing or blow up — unlike editors that
  leave it unbounded. Wheel deltas are accumulated so one physical notch steps once on any
  device, and WebView2's page-zoom is suppressed. Frontend only.

## [1.91.0] - 2026-07-20

### Added

- **Sublime-style Tab word-completion** (issue 5). Type the first letter(s) of a long word
  and press Tab: the nearest matching longer word from nearby in the buffer is inserted;
  Tab again cycles through the other matches, then back to what you typed. It fires whenever
  a word character sits right before the caret; at line start or after whitespace Tab now
  indents (and Shift+Tab dedents), which it didn't before. Candidates are words of at least
  `[editor] tab_complete_min_len` characters (default 5) — short words aren't worth a Tab —
  harvested from a window around the caret and ranked by distance, so it stays instant even
  on large documents. It yields to an open @-citation popup and to snippet tab-through, and
  runs only on an explicit Tab (zero baseline cost). Requires a backend rebuild (new config
  key).

## [1.91.1] - 2026-07-20

### Fixed

- **The editor no longer drifts on a tab switch** (issue 8 follow-up). The 1.89.1
  sync-on-switch scrolled the preview to the editor's line, but that programmatic scroll
  fired the preview's own scroll handler, which echoed back and nudged the editor — the
  editor is the anchor and must not move. A short guard now marks `scrollPreviewToLine`'s
  own scrolls (across the whole settle) so the preview→editor half ignores them: the
  editor stays put, other views sync to it. Also stops the build-time scroll from tugging
  the editor. Frontend only.

## [1.91.2] - 2026-07-20

### Fixed

- **Project quick-switch dropdown is readable in dark mode** (issue 3 follow-up). The
  `<select>` had a transparent background, so it fell back to the native (light) control
  background while its text used the theme foreground — light-on-light in dark mode. It
  now uses the theme's `--bg`/`--fg` for both the closed control and the option list, with
  `color-scheme` so the native popup follows the theme. Frontend only.

## [1.92.0] - 2026-07-20

### Changed

- **Font-zoom bounds are configurable** (issue 11 follow-up). The Ctrl+wheel / Ctrl+= zoom
  floor and cap moved from a hardcoded 6–40 px to `[editor] font_size_min` /
  `font_size_max` (defaults 6 / 24). Edit them in `config.toml` and save — the bounds apply
  live (a config save re-reads `[editor]` settings; a current size outside the new range
  snaps in at once, otherwise the new range takes effect on the next zoom). Requires a
  backend rebuild (new config keys).

## [1.93.0] - 2026-07-20

### Changed

- **Tab word-completion now shows a sorted popup list** (issue 5 follow-up). The 1.91.0
  version inserted the nearest match inline and cycled on repeated Tab; you wanted to see
  and pick from the candidates. Tab now opens the autocomplete popup with the matching
  longer words ranked by proximity to the caret (nearest first) — arrows to choose, Enter
  or Tab to accept, and it narrows as you type more. In markdown it shares the @-citation
  popup (the word source self-gates to an explicit Tab and declines the @ context); other
  languages get a word-only popup. Side effect: Tab now also accepts a highlighted citation.
  Config `[editor] tab_complete_min_len` (default 5) still sets the shortest word offered.
  Runs only on an explicit Tab (zero baseline cost). Frontend only.

## [1.93.1] - 2026-07-20

### Fixed

- **`{python}` (and other) code-cell highlighting is stable** (colorization side-find). A
  ```{python} cell resolved its language through the asynchronous language-data registry
  rather than the statically-imported `python()` that `.py` files use, so the live editor's
  incremental, viewport-bounded highlight pass captured only a partial nested tree — lines
  flipped between colored and white depending on parse timing, and the pattern shifted with
  every keystroke (the "striped colouring" that changed as the cell grew). Fenced blocks of
  the statically-imported languages (python, json, yaml, toml, latex) now nest synchronously
  via pre-loaded descriptions, so highlighting is deterministic; other languages still
  lazy-load. Frontend only.

## [1.93.2] - 2026-07-21

### Fixed

- **A YAML front-matter block no longer kills all highlighting below it** (issue Sa 14).
  Root cause, verified against the repro file's bytes: the closing `---` carried a
  trailing space, and lang-yaml's front-matter grammar accepts only an exact `---` — so
  the block never closed and parser error-recovery swallowed the entire rest of the
  document as YAML (the `#` heading after the block read as a YAML comment; every code
  fence below went uncolored). The preview's strip regex tolerated the space, which is
  why the preview looked right while the editor was broken. The yamlFrontmatter wrapper
  is replaced by an in-repo tolerant parser (same node names, same DashLine styling,
  same YAML/markdown nesting): trailing blanks are legal on both delimiters, and a
  block that never closes is treated as NO front matter rather than swallowing the
  document. The preview's strip is rewritten on the same shared delimiter shapes (also
  fixing an empty `---`/`---` block, a mid-line `---foo` false close, and its
  line-offset math), so the two panes can never again disagree about the same document.
  The 1.93.1 static-language change was chasing this symptom but is an independent,
  real fix for async-load striping — it stays. Removed as actually-unnecessary: the
  dead frontmatterHighlight decoration plugin (superseded by the real YAML parser back
  in Phase 4), its orphaned CSS, and the Sublime-theme CSS-variable plumbing that fed
  it. Frontend only.

## [1.93.3] - 2026-07-21

### Fixed

- **Switching tabs into a long document no longer sends the panes flying** (issue Sa 8,
  the "disaster"; third attempt, structural this time). Why the first two failed: on a
  200 KB doc CodeMirror keeps re-measuring estimated line heights for ~a second after
  the swap, and the preview streams its blocks across many frames — but every guard was
  a 40–200 ms timing window stamped at stream START. Once they lapsed, editor
  measurement drift fed the preview, preview churn wrote back into the editor's
  scrollTop (the one preview→editor writer), and the panes chased each other; each
  drift also overwrote the doc's remembered position, so the corruption stuck. Three
  origin-based changes replace the timers: (1) preview→editor sync now requires a real
  user gesture on the preview (wheel/pointer/touch/keys, refreshed while that scroll
  flows) — programmatic churn can never open the gate, so it can never move the editor;
  editor→preview stays ungated (outline jumps still drag the preview). (2) The editor's
  restore is line-anchored — a scrollSnapshot captured on switch-away replays exactly
  and CM's own scroll anchoring holds it through re-measure (raw-px + one-frame
  re-assert before); the scroll RECORDER arms only on a user gesture or outline jump,
  so drift can no longer corrupt the memory. (3) The in-sync stamps moved from stream
  start to stream completion — the staleness guard now covers the whole stream — and
  the once-per-doc sync fires after the blocks have finished landing, reading the
  editor's settled top line: one close-enough go, no settle fight. Cursor and remembered
  position survive rapid tab cycling. Frontend only; all changes are event-time.

## [1.94.0] - 2026-07-21

### Changed

- **Preview tabs now mirror Sublime Text fully** (issue Fr 2, re-specced). The pieces
  that already existed: a single preview slot (previewing another file reuses the same
  tab) and edit-promotes-to-permanent. New: the transient preview no longer appears in
  the sidebar's Open Files list at all — the italic tab is the only clue, and the file
  joins Open Files the moment an edit promotes it; and single-clicking a file that
  already has a real tab focuses that tab and CLOSES the preview slot (a preview exists
  to peek at files you have NOT got open — and it is always pristine, since any edit
  promotes it first, so discarding is lossless). Open Files drag-reorder translates its
  row indices past the hidden preview tab so reordering stays exact. This also retires
  the ballooning preview-row saga (1.76.1, 1.81.2) for good: the row that ballooned no
  longer exists, and its italic CSS is deleted. Frontend only.

## [1.95.0] - 2026-07-21

### Changed

- **Tab completions respect the case of the typed stem** (issue Sa 5a). Matching was
  already case-insensitive, but the popup inserted the candidate exactly as it appears
  in the buffer — typing "Lognorm" with "lognormal" nearby completed to lowercase
  "lognormal". Now the inserted word adapts to what YOU typed: log→lognormal,
  Log→Lognormal, LOG→LOGNORMAL (interior caps like "LaTeX" are preserved when only the
  first letter changes), the popup shows exactly what will be inserted, and buffer
  duplicates differing only in case collapse to the nearest single entry. Known limits:
  a mixed-interior-case stem ("LogN") follows the first-letter rule, and labels are
  cased at popup-open time. Runs only on an explicit Tab — zero baseline cost.
  Frontend only.

## [1.96.0] - 2026-07-21

### Added

- **Tab completion learns your vocabulary** (issue Sa 5b — the "killer" half). Every
  document you open or save is scanned in the background (~1 s after the event, off
  the keystroke path) for words of 5+ letters (config `[editor]
  tab_complete_dict_min_len`); counts are kept PER FILE in
  `~/.writedown/word-frequency.json` — re-opening a file replaces its entry, so
  nothing is ever double-counted — capped at the top 250 words per file across the 50
  most-recent files, all derived/disposable app state. Tab completion then offers
  nearby-in-buffer words first (exactly as before) followed by your most frequent
  words, both adapted to your typed case — and the popup now opens even when the word
  you want is NOT nearby, which is the point: type "hete", Tab, "heteroscedasticity".
  `[editor] tab_complete_dict = false` turns the dictionary off. A missing or corrupt
  dictionary file just starts empty (logged, never an error). Zero baseline editing
  cost: scans are debounced background work, the lookup runs only on an explicit Tab.
  Rust (two new load/store commands + two config keys) + frontend; needs a dev-app
  restart to pick up the new backend commands.

## [1.97.0] - 2026-07-21

### Changed

- **"Keybindings: Write All Shortcuts" now writes a scratch file, never config.toml.**
  The old command surgically rewrote your config's [keys] table in place — safe in
  implementation, unwise in principle (a palette command silently editing the config
  file). It now opens a new scratch buffer (TOML-highlighted) containing the complete
  effective keymap with a one-line header; paste the block into [keys] yourself if you
  want to customize. The config-rewriting store action and its table-splicing helper
  are deleted. Frontend only.

## [1.98.0] - 2026-07-21

### Added

- **Trailing whitespace is trimmed on save** — `[editor] trim_trailing_whitespace`,
  default true (the space that caused the Sa 14 front-matter bug would never have
  survived a save again). Deliberately surgical: it only runs when a save is happening
  anyway (a clean file is never rewritten just to trim); Markdown hard breaks —
  two-plus pure spaces after text — are preserved exactly, as promised; CSV/TSV are
  never trimmed (trailing spaces can be field data). For the document in the live view
  the trim is applied as a real editor edit — per-line deletions, so the cursor is
  mapped, undo works, and the incremental parser never sees a whole-document replace —
  while background saves (tab-switch/blur autosave of inactive tabs) transform the
  text directly. Set `trim_trailing_whitespace = false` to keep every byte you type.
  Config key is read by the Rust backend (dev restart to change it); the trim itself
  is frontend, on by default immediately.

## [1.98.1] - 2026-07-21

### Fixed

- **CSV rainbow respects quoted fields and the file's real delimiter** — the column
  colorizer used to split every line on every comma AND tab with no quote awareness,
  so `"Smith, John"` bled across two column colours. Now `.csv` scans RFC-4180 style —
  a field starting with `"` runs to its closing quote, `""` inside is an escaped
  quote, an unclosed quote runs to end of line — and `.tsv` splits on tabs only with
  no quoting (the Sublime RainbowCSV convention), so commas inside TSV fields and
  tabs inside CSV fields no longer break columns either. Same single pass and
  5,000-line cap as before — no perf change.

## [1.99.0] - 2026-07-21

### Added

- **Full screen and distraction-free modes**, Sublime's pair: **F11** toggles true
  window fullscreen; **Shift+F11** toggles distraction-free — fullscreen with the
  sidebar and outline hidden, previous layout restored on exit. The two are
  independent (leaving fullscreen with F11 does not restore hidden panels). The
  palette gets explicit verbs — Enter/Exit Full Screen, Enter/Exit Distraction
  Free — and both keys are rebindable in `[keys]` (actions `toggleFullscreen`,
  `toggleDistractionFree`), listed in the F1 help. Like all editor keys they fire
  when the editor has focus; the palette covers the rest. Fullscreen state is
  queried live from the window, so the toggle stays correct even when
  window-state restore starts the app fullscreen. Requires the new window
  permission, so the app (or `tauri dev`) must restart once to pick it up.

## [2.0.0] - 2026-07-21

### Changed

- **Trailing-whitespace trim now trims everything — the Sublime semantics** (and the
  contract change behind the round number: 1.98.0 promised hard breaks were safe;
  2.0.0 retires that promise by author decision). `trim_trailing_whitespace = true`
  (the default) removes ALL line-end spaces and tabs on save, markdown two-space hard
  breaks included — exactly what ST's `trim_trailing_white_space_on_save` does. Need
  a line break that survives trimming? End the line with a backslash — CommonMark's
  hard break, understood by the preview and by Pandoc/Quarto. Want the old cautious
  behavior back? `trim_trailing_whitespace = "keep-hard-breaks"` spares two-plus-space
  breaks; `false` switches trimming off. CSV/TSV files are still never trimmed
  (trailing spaces can be data). The trim-all default is frontend and live
  immediately; *reading* the new config values ("keep-hard-breaks"/"off") needs the
  restarted backend.

## [2.1.0] - 2026-07-22

### Added

- **Help system (We 2).** `HELP.md` — a user guide checked into the repo and embedded
  in the exe — is rewritten to `~/.writedown/help.md` at every launch, so the in-app
  copy always matches the running build. Three ways in: palette **"Open Help
  (help.md)"**, the new **?** button to the right of the Split toggle, and a pointer
  in the footer of the F1 shortcuts overlay. It opens as a normal markdown tab, so
  the preview renders it. The README links the same file on GitHub.
- **The file tree lists every file (We 3)**, not just the supported-extension
  whitelist — previously anything else (even LICENSE, extensionless) was silently
  omitted. Files Writedown has no syntax for appear muted and still open as plain
  text; obviously-binary files (exe/dll/msi/zip/archives/fonts/media …) are muted
  and inert, with right-click → Open Externally. Zips deliberately stay closed
  (browsing inside archives: juice not worth the squeeze — author decision).
  Quick-open (Ctrl+Shift+Q) keeps its whitelist so it stays free of noise. Listing
  is still lazy per level; muting is pure CSS — no baseline cost.
- **In-app image viewer (We 3).** png/jpg/jpeg/gif/webp/svg/bmp/ico/avif open in a
  tab (single-click previews, double-click pins, like any file) shown full-pane.
  The bytes stream through the Tauri asset protocol, never the text pipeline, and
  save paths refuse image docs outright — an image on disk can never be written by
  the app (spec §2). External-change auto-refresh of an open image is out of scope
  this pass (close/reopen refreshes); images stay out of quick-open.

### Changed

- Backend `DirEntry` gained a `supported` flag and `list_directory` no longer drops
  unsupported files. Rust changed — `tauri dev` needs a restart, not just HMR.

## [2.14.1] - 2026-08-10

### Fixed

- **The quick-files picker looked like it did not exist.** It shipped as "Open Quick File…",
  directly alongside "Open Quick File (Ctrl+Shift+Q)" — two near-identical titles, both
  scoring for a "quick file" query, with the MRU floating whichever had been used before. It
  is now **"Quick Files: Open from List…"**, and the single-file verb says so explicitly.
  Naming, not plumbing: the config parsing and the picker were working the whole time.

### Changed

- **Removed the label cache added in 2.14.0.** It was written against a *guessed* cost.
  Measured: **0.69 ms** to scan a 204 KB, 118-label document in a release build — so the
  cache bought nothing worth its 1.5 s staleness window, and labels are now always current.
  The measurement is kept as an `#[ignore]`d benchmark in `labels.rs`
  (`cargo test -- --ignored --nocapture scan_speed`) so the question can be settled with a
  number rather than an opinion next time.

  Noted for the day it does bite: the fix is not a cache either — `check_document` already
  scans labels every ~½ s for the duplicate check and can simply return them, making the
  extra call free.

## [2.14.0] - 2026-08-10

### Added

- **`@` now completes Quarto cross-reference labels from the document** (issue E.01), not
  just bibliography keys. Two triggers, both unambiguous:

  - **`@-`** opens the whole label list. It is free by construction: a citation key must
    start alphanumeric, so `@-` is not a citation and never could be. Because the matcher is
    order-free, `@-flood tbl` finds `tbl-flood` without you having to remember its family.
  - **`@fig-`, `@tbl-`, `@thm-`, …** — a family name *with* its hyphen — does the same. The
    hyphen is what makes it safe: a bare `@tbl` could still begin a citation key.

  `@Author2024` is untouched and still searches the bibliography. Both flavors of label are
  found — `#| label: fig-x` in a cell and `{#fig-x}` on a heading, figure, table or div,
  with the `#id` in any position. The popup shows the label and the line it is defined on,
  in document order until you type a query.

  This also removes an existing annoyance: typing `@fig-` used to run "fig-" through the
  bibliography and return noise.

### Changed

- **One label extractor, shared** (issue E.01). "What a Quarto label looks like" was
  implemented twice — in the document checker and in the renderer — and the completion
  picker would have been a third. All three now use `src-tauri/src/labels.rs`; a test
  asserts that Rust's family list and the frontend's `CROSSREF_PREFIX` stay in agreement, so
  the two halves cannot drift.

### Notes

- Labels are cached for the duration of a completion session (invalidated on a line-count
  change or after 1.5 s). The scan itself is trivial, but the *call* ships the document to
  Rust and a completion source re-runs on every keystroke — 209 KB of IPC per letter on a
  document the size of `dm.md`. Failure mode, stated: define a label and reference it on the
  same line within 1.5 s and it is missing for one keystroke.
- Not included, each small if wanted: captions in the popup, labels from other files in a
  book, and linting of unknown `@fig-…` references (still silently unflagged).

## [2.13.2] - 2026-08-10

Four punch-ups reported against 2.13.1.

### Fixed

- **`writedown .` (or any folder) now opens as its OWN project** instead of being added to
  whatever project the session restored. A folder on the command line means "work on this",
  not "annex this into the last thing I had open". It becomes an unsaved project — nothing
  is written to disk — and its tabs and layout are remembered against the folder path, so
  running the same command again resumes where you left off. Drag-and-drop keeps the
  opposite, additive behavior: dropping a folder onto an open project is a different
  gesture with a different intent.
- **`writedown .` actually works at all.** Launch paths are now resolved to absolute paths
  against the shell's working directory. `.` was previously handed to the frontend
  verbatim, where it would have been used as a workspace root, a session key and a watcher
  path. Windows' `\\?\` verbatim prefix is stripped, since it is correct but leaks into the
  title bar, the status bar and the session file name.
- **`%xmode` now applies to the rest of the render, not just the cell it appears in.** A
  render is one request per cell and the mode was re-read from the request every time, so
  `%xmode Verbose` in cell 1 was silently discarded before cell 4 failed — which is
  precisely the way anyone would use it. The in-cell override is now tracked separately
  from the configured mode and cleared when the next render starts. (Ctrl+Enter against a
  live kernel keeps it, like Jupyter.)
- **`verbose` says `(no locals)` instead of printing nothing** when a frame has no bindings
  worth showing. `%xmode Verbose` followed by `import missing_mod` produced output
  identical to `context` — the mode was working, it just had nothing to say, which reads
  exactly like a broken feature.

### Changed

- The word-frequency snippet is now **"Insert: Large Word Report (word frequency, from Tab
  completion)"**. It was titled "Word Frequency Report", and the palette matches on the
  title, so searching for what the author calls it — "large word report" — found nothing.

## [2.13.1] - 2026-08-10

### Fixed

- **The Unicode picker drew ✅ and ❌ in monochrome** — reported within minutes of 2.13.0.
  The glyph column's font stack named `Segoe UI Symbol` first, and that font has its own
  *monochrome* glyphs for U+2705 and U+274C, so it won and `Segoe UI Emoji` (the one with
  the COLR table) never got a look in. Verified against the actual font files rather than
  guessed.

  There is no single font order that is right for every row: symbol-first kills the color
  on ✅/❌, and emoji-first would colorize ⚠ and ✓, which are monochrome in a document. So
  the table now carries **Emoji_Presentation** per character — a real Unicode property, not
  a hand-rolled range list — and the picker picks the font per row. It now shows each
  character the way the document will.

  The editor and preview were never affected and are deliberately left alone: they declare
  neither font, so Chromium's presentation-aware fallback chooses, which is strictly
  better than any static list. (Confirmed by the font data: JetBrains Mono NL carries ✓, ⊙,
  α and → itself, and lacks ✅/❌ — so those fall through to the color emoji font.)

## [2.13.0] - 2026-08-10

Batch D (issues D.01–D.13). D.05 was dropped and D.10 needed almost nothing; D.08 turned
out to exist already and only wanted a key.

### Added

- **Unicode character picker — Ctrl+Shift+U**, or palette "Insert: Unicode Character…"
  (D.12). Windows' own Win+. panel cannot work here and never will: it is a separate OS
  window, so opening it blurs the CodeMirror contenteditable, and the character is then
  injected into an editor whose DOM observer is no longer reading — CodeMirror reconciles
  it away. This picker sidesteps that entirely, because insertion is an ordinary editor
  transaction.

  What makes it better than the pickers that already exist: **every character has three or
  four names, and the Unicode one is usually the worst.** You think `\odot`; Unicode says
  CIRCLED DOT OPERATOR. Each of the 2,322 entries carries its Unicode name, its LaTeX
  command(s), emoji/CLDR keywords and hand-written aliases, and one query searches the
  union — so `tick`, `check`, `\checkmark` and `u+2713` all find ✓, and `odot`,
  `circle dot`, `\odot` and `u+2299` all find ⊙. `tick` works even though no Unicode name
  contains the word.

  Enter inserts the character; **Shift+Enter** inserts its LaTeX command instead;
  **Alt+Enter** inserts and keeps the picker open for a run of several. An empty query
  lists your most-used characters (weighted by use count, not recency) then browsing kits.
  Selecting exactly one character and pressing Ctrl+Shift+U does a **reverse lookup** —
  name, code point, LaTeX name — which is how you find a character's hollow or filled
  sibling. `[symbols]` in config.toml adds your own names.

  The table is generated at build time from CPython's `unicodedata` (so the names are
  authoritative) by `scripts/gen-symbols.py`, and is **imported dynamically**: 86 KB that
  is not loaded, parsed or paid for until you open the picker for the first time.
- **`u+2299` + Tab inserts ⊙ inline**, no popup; a bare **`u+` + Tab** opens the picker
  (D.12). One regex, evaluated only on a Tab keypress, ahead of the word completer. A code
  point that names nothing drawable — unassigned, a lone surrogate, private use, a C1
  control — declines and leaves your text exactly as typed rather than inserting a box.
- **`[render] traceback_mode`** — how a failing `{python}` cell is reported (D.09):
  `minimal`, `plain`, `context` (new default), `verbose` (locals in every frame), `docs`
  (each frame's docstring). Overridable per document with `wd-traceback:` in the front
  matter, or from inside a cell with **`%xmode <mode>`** — the one magic Writedown
  interprets rather than blanks.

  There is no IPython involved and no CPython flag for any of this (`-X no_debug_ranges`
  is the only `-X` that touches traceback shape, and it goes the wrong way). It works
  because the runner already *is* the formatter. Nothing here runs unless a cell raises.
- **Insert Date** (D.01), beside the existing Insert Date-Time — the time half was being
  deleted by hand every time. Both formats are now configurable: `[editor] date_format`
  and `datetime_format`, strftime-style. The palette shows today's date in your format, so
  the verb says what you are about to get.
- **`[files] quick_files`** — a list, searchable from palette "Open Quick File…" by name or
  folder (D.04). `quick_file` (singular) is untouched and keeps Ctrl+Shift+Q.
- **Ctrl+K Ctrl+F toggles Plain View** — editor only: no sidebar, no outline, no preview,
  not full screen (D.08). The mode has existed since A.16 as a palette verb; it had simply
  never been given a key. Rebindable from `[keys]` as `plainView`.
- **Palette "Close All Files"** (D.13): saves and closes every real file. Scratch buffers
  are deliberately left open — their text exists nowhere but the session, so closing one
  would destroy it outright, and leaving them alone means there is no confirm dialog and
  no way to lose anything.
- **Palette "Insert: Word Frequency Report"** (D.07): drops a `{python}` cell at the cursor
  that loads `~/.writedown/word-frequency.json` into a DataFrame and shows the top words.
  The lowercase fold matches what Tab completion actually queries, so the numbers agree
  with what it offers you.
- **Command line** (D.02): `writedown <dir>` now works — a folder joins the open project,
  or becomes the Folder-tab root — and `--version` / `--help` print and exit. A GUI-
  subsystem exe has no console, so they attach the parent shell's first. `--` ends option
  parsing. Unknown switches are ignored rather than fatal, since WebView2 and Tauri inject
  their own. **Every invocation still opens a new window, by decision** — no
  single-instance forwarding, so running several at once keeps working.

### Fixed

- **Directory junctions and symlinks are followed in the file tree** (D.03). `C:\S` is a
  junction, and Rust's `FileType::is_dir()` on Windows is `!is_symlink() && is_directory()`
  with mount points counting as symlinks — so it came back `is_dir: false` and drew as a
  dim, unexpandable *file* row. Indistinguishable from missing. (Drag-and-drop always
  worked, because that path uses `fs::metadata`, which follows the link.) The extra stat is
  paid only for reparse-point entries.

  Quick-open's recursive walk follows them too, with a loop guard: a link whose target lies
  inside the root is skipped (with the root at `C:\`, everything under CloudStation is
  reachable twice, so every file would have been listed twice), as is one pointing at an
  ancestor (which would never terminate). Note that Windows' change notifications do not
  traverse junctions, so a linked-in folder refreshes on focus rather than live.
- **The python working directory is now set for every cell, not just on a namespace
  reset** (D.10). Run This Cell in document A, then in document B without a full render in
  between, and B's relative `read_csv` resolved against A's folder. A cell's own
  `os.chdir()` still survives the rest of the render — the comparison is against the
  directory Writedown last applied, not the live one.
- **Editing a project file reloads the project** (D.11) — its folders and name are re-read
  in place when you save the `.wdproj`, or when it changes on disk. Deliberately *not*
  `openProject`, which clears the tab strip and re-restores the session. Invalid JSON
  mid-edit reports and keeps the current folders: a half-typed file must never empty the
  sidebar.

### Changed

- **Open Files: the × moved to the left**, aligned in a fixed column, and the dirty ● moved
  to the right end (D.06). Closing several files in a row now needs no pointer movement,
  which is the point. The × is always visible rather than appearing on hover — a control
  whose meaning depends on pointer position is the thing this project avoids.
- **Cell tracebacks no longer include Writedown's own runner frames** by default, and now
  show the failing source line. This is `context` mode; `plain` restores the previous
  output exactly.

### Notes

- `runner.py` is embedded in the binary by `include_str!`, so **D.09 and D.10 need a
  rebuild, not a reload** — `tauri dev`'s HMR will not pick them up.
- Dropped: **D.05** (auto-detect indentation + a footer readout). The analysis is kept in
  the issues file for the compartment trap it uncovered.

## [2.12.1] - 2026-08-06

Two regressions from 2.12.0's tree work, both reported within the hour.

### Fixed

- **The nameless "…" row under every folder you expanded.** The loading indicator was a
  React state flag cleared in the fetch's `.finally`, and it got stuck on: a Zustand write
  flushes React in a *microtask* (`useSyncExternalStore` is sync lane), which lands before
  the promise chain's continuation, so the effect cleanup had already marked the fetch
  cancelled and the flag was never cleared. The old code got away with the same shape
  because a plain `setState` is default lane and flushes a macrotask later. The indicator is
  now derived — an open folder with no listing yet *is* loading — so it cannot get stuck.
- **Arrow keys moved the whole window instead of the selection.** `scrollIntoView` scrolls
  every scroll container between the element and the root, and `overflow: hidden` does not
  opt an element out — it means "no scrollbar", not "cannot be scrolled". The layout is a
  stack of hidden-overflow panes, so each keypress could shift the entire UI a few pixels
  with no scrollbar to put it back: the "feels like scroll lock" report. Tree rows are now
  revealed by adjusting the tree pane's own `scrollTop`, and only when the row is actually
  outside it (`src/tree/scrollRow.ts`). "Locate File in Sidebar" had the same latent bug and
  is fixed with it.
- **The selected row is easier to see**, and no longer built on `color-mix` — neutral greys,
  like the rest of the tree chrome, so it reads on any imported Sublime scheme.

## [2.12.0] - 2026-08-06

Batch C: the file tree finally tracks the disk, keyboard control of the tree, auto-closing
quotes in code, and rich output for objects that publish a MIME bundle.

### Fixed

- **The tree now follows the disk (issue C.01).** A watcher event used to re-list exactly one
  directory — the Folder tab's root — and even that result only reached the root row, because
  every deeper folder kept its listing in its own React state, fetched once when you expanded
  it and unreachable from anywhere afterwards. The Project panel was outside the refresh path
  altogether, despite its folders being the ones actually watched. So an external delete,
  create or rename below a root was simply invisible. Directory listings now live in the
  store (`dirCache`), which the watcher, F5 and window-focus can all refresh; an event
  re-lists the folders it actually touched, coalesced into one batched call behind the
  existing 400 ms debounce, and only for folders that are on screen. A deleted folder takes
  its cached subtree with it. A listing that comes back unchanged keeps its previous array
  identity, so the common case — the watcher event our own save just caused — re-renders
  nothing at all.
- **Refresh is no longer defeated by a stale snapshot (issue C.02).** The batched listing
  taken when a project opens (added in 1.26 for a smooth first paint) was never cleared, and
  F5 works by remounting the tree — which re-seeded every folder from that snapshot. A folder
  renamed or deleted outside Writedown therefore came back, forever, for any folder that was
  already expanded when the project opened. F5 now re-lists everything on screen in one
  batched call *before* remounting, and file operations re-list the folder they touched.
- **The Folder tab keeps up too**, without watching its root: the folders on screen are
  re-listed when the window regains focus and when you switch panel tabs (throttled to once
  a second). The Folder root is still deliberately not watched — it can be an entire synced
  tree, and a recursive watch there is a firehose (see 2.11.0, issue B.03).

### Added

- **Keyboard control of the file tree (issue C.03).** Up/Down move the selection, Right opens
  a folder (or steps into an open one), Left closes it (or jumps to its parent), Enter opens
  the selected file (or toggles a folder), **F2** renames, and **Delete** moves the selection
  to the Recycle Bin through the same confirmation the right-click menu uses. Clicking a row
  selects it, so the keys and the context menu always agree on the target. The handler is
  attached to the tree pane, not to the window: with the caret in the editor, Delete can
  never reach a file.
- **Auto-closing quotes, in code only (issue C.05).** Typing `"` or `'` inserts the pair with
  the caret between them, and the third quote of a docstring gives you the closing three as
  well. Active inside `{python}` cells and inline code spans in md/qmd, and throughout code
  files (py, json, toml, yaml, tex, agg); **never in prose**, which is why the stock
  behaviour was off — it also closed brackets everywhere and doubled apostrophes mid-word.
  Brackets are still never auto-closed. Backspace between a pair deletes both.
- **HTML (and images) from a MIME bundle (issue C.06).** The runner asked the last
  expression's value for `_repr_html_` and fell back to `repr()`. Objects that publish a
  Jupyter MIME bundle instead — `greater_tables`' `GT` is the case in point, whose `repr()`
  is deliberately the *text* table — therefore rendered as monospace text, and needed a
  manual `IPython.display.HTML` wrapper. `_repr_mimebundle_` is now asked first (tolerating
  the `(data, metadata)` form and implementations that take no keywords), taking `text/html`,
  then `_repr_html_` as before, then `image/png` / `image/svg+xml` from the bundle as a
  figure, then the bundle's `text/plain`, then `repr()`. **Requires a rebuild** — the runner
  is embedded in the binary at compile time.



Batch B: File → Open, order-free palette matching, and the two halves of "an external
change must never be missed or silently overwritten".

### Added

- **File → Open (issue B.01).** A native open dialog on **Ctrl+O** and the palette verb
  "Open File…" — until now the only ways to open a file outside the workspace were
  drag-and-drop, `[files] quick_file`, or launching the exe with a path. Multi-select;
  the picks go through the same route as a drop, so image/PDF/binary guards, the 20-file
  cap and its overflow message all apply unchanged. Defaults to the active document's
  folder. App-level binding (works with tree or preview focus, like Ctrl+P) and therefore
  listed in the F1 help rather than remappable via `[keys]`.
- **Two explicit conflict verbs (issue B.04):** "Reload from Disk (discard my edits)" and
  "Overwrite Disk with My Version". Two labelled actions rather than one button whose
  meaning depends on state, and no modal — a dialog would pop *after* you had already
  switched to another application.
- **A conflicted tab now says so in the tab strip** — a bold `!` in place of the dirty
  dot, the name in the warning colour, and the explanation in the tab's tooltip. The
  footer line stays, but it is easy to miss.
- **Palette: "Diagnostics: File Watch Status"** — opens a scratch listing the watched
  roots, which open files are covered by which, and which hold their own individual
  watch. Every open file must show one or the other; this is the report that would have
  turned B.03 from a dig into one line.

### Fixed

- **Palette matching is no longer order-sensitive (issue B.02).** The matcher required
  your letters as an in-order subsequence, so `config edit` could never match
  "Edit Config (config.toml)" — not a ranking quirk, simply no match. Now fzf's
  extended-search rule: a space splits the query into terms, each term must match, but
  the order *between* terms no longer matters. A query with no space takes the old path
  and ranks exactly as before. Trailing or doubled spaces stop killing a query, and a
  quick-open `store ts` now matches `src/store.ts` at all (a space previously had to be
  matched literally in the path). Note what this does *not* change: the greedy scan still
  takes the first occurrence of each character, so `store` scores `src/store.ts` on the
  `s` of `src/` rather than on the `store` run — a pre-existing ranking quirk, verified
  identical before and after this change.
- **A file opened from the Folder tab while a project is open is watched again
  (issue B.03).** `syncExtraWatch` skipped per-file watching for anything under the
  Folder-tab root — but that root is only ever listed and drawn, never watched
  (`setFolderRoot` does no watching, and `openFolder` skips `setRoot` while a project is
  open). So such a file was excluded by a root that watched nothing and ended up covered
  by nobody: no reload, no conflict flag, no message. The exclusion list is now derived
  from the roots actually armed (`applyWatch` records them), which makes that state
  unrepresentable. This is *not* a regression of A.28 — that fixed the path-spelling
  comparison; no event was reaching it at all.
- **An external change can no longer be silently overwritten (issue B.04).** Saving never
  looked at the conflict flag, and autosave fires on editor blur, window blur, tab switch
  and close — so a correctly-flagged conflict was overwritten the moment you clicked
  away. Now: autosave refuses a conflicted tab (and says so in the status bar), and
  **every save is a check-and-set** — Rust `write_file` takes the stamp (mtime + size)
  the file had when we read it and refuses the write if disk has moved on since. That
  guarantee does not depend on the watcher noticing, which is exactly the weakness B.03
  exposed, and it covers two Writedown instances on one file (We 4). A stamp that moved
  without the content changing (a sync client rewriting identical bytes) is resolved by
  one read and the save proceeds, so a false alarm never costs a save. Quitting still
  force-saves: at that point refusing would lose your typing for good, while writing
  keeps both versions — theirs goes to the backup store.
- **Insurance for an event that never arrives:** on window focus the active document is
  re-stamped against disk and reloaded (clean) or flagged (dirty). Covers sleep/resume,
  network shares and any watcher gap we have not thought of.

### Changed

- Rust changed (`file_stamp` added, `write_file` now takes an optional expected stamp and
  returns the new one) — a `tauri dev` restart or a rebuild is required, not just HMR.

## [2.10.1] - 2026-08-03

### Fixed

- **Tab with no completion match no longer indents the line, and Tab now accepts the
  highlighted completion** (the rest of issue A.14). The 2.4.0 fallback — swallow a failed
  completion attempt, report "no completions for …" in the status bar, accept the popup's
  selection on Tab — was correct but unreachable: `@uiw/react-codemirror` has a top-level
  `indentWithTab` prop (not a `basicSetup` option) that defaults to **true** and injects
  the library's own `Tab → indentMore / Shift+Tab → indentLess` keymap *ahead of every
  extension the app passes*, at equal precedence. CodeMirror dispatches a key through
  bindings in lexicographic (precedence, position) order, so any plain Tab the
  `Prec.high` handlers declined was consumed by the library binding before the app's
  fallback could run — the line indented (a whole wrapped paragraph under word wrap),
  no status message ever appeared, and accepting a completion required Enter. Fix:
  `indentWithTab={false}` on the `<CodeMirror>` element; the app's own fallback now
  handles the full matrix — popup open → Tab accepts; stem with no match → Tab swallowed
  + status-bar message; line start / whitespace / selection → indent; Shift+Tab → dedent.
  Frontend only. Post-mortem in `dev/done/plan-2.10.1-tab-shadowed-by-indentwithtab.md`.

## [2.10.0] - 2026-08-02

### Fixed

- **Switching tabs no longer freezes the editor** (issue A.29 — "the mouse wheel does
  nothing for a moment", worst on large files). Every tab switch was dispatching a full
  CodeMirror `reconfigure`: the extension list was memoised on the document's *path*, so
  moving between two Markdown files built a new array — and thus reinstalled the entire
  extension stack — to produce a set identical to the one already running. That teardown
  reconstructs every view plugin, two of which scan the whole document synchronously, and
  invalidates the syntax tree, forcing a full re-parse. The list is now keyed on the
  document's **shape** (is it Markdown, is it CSV, which delimiter) — the only things the
  extensions actually branch on — so two files of the same kind reconfigure nothing at all.
  Related: `languageForPath` was constructing a *fresh* language support on every call
  (`python()`, `StreamLanguage.define(toml)`, …), so two `.py` files reconfigured for the
  same reason; these are now per-language singletons, as Markdown already was.
  It surfaced as a dead scroll wheel rather than mild jank because the Ctrl+wheel zoom
  listener is necessarily non-passive, which makes the browser wait for the main thread
  before scrolling at all.
- **The section-numbering check no longer splits the whole document on every preview
  render** (a cost introduced with 2.8.0's numbered sections). It read the front-matter flag
  by splitting the entire file into lines — thousands of allocations per render, including
  per keystroke — where front matter is by definition in the first few lines. It now scans a
  bounded head.

## [2.9.0] - 2026-08-02

### Changed

- **F10 toggles the Folder/Project panel, F11 toggles the Outline** (Joplin muscle memory).
  Full screen moves to **Ctrl+F11** and distraction-free to **Ctrl+Shift+F11**. All four stay
  rebindable in `[keys]`. Note F10 is Windows' menu-bar activation key — there is no menu bar
  here so it reaches us, but rebind it if your setup ever swallows it.
- **Ctrl+K Ctrl+P is unbound again**, reserved for goto-file muscle memory. Plain view keeps
  its Enter/Exit palette verbs; F10/F11 cover the everyday panel toggling.
- Palette "Project: Open Project File" is now **"Project: Edit Project File"**.

### Fixed

- **A pasted image never appeared in a temporary buffer's preview.** The preview's image
  rewriter was gated on the document's folder, so a buffer with no folder — every temporary
  one — skipped it entirely and the raw `C:\…` path reached the DOM, which the webview
  cannot load. The absolute-path branch it needed was already written, just unreachable. The
  folder requirement now sits on the *relative* branch where it belongs, matching how the
  link resolver has always done it. (Any absolute-path image in a temp buffer was affected,
  not only pasted ones; pasting simply made it the normal case.)
- **The editor no longer loses your place when a file reloads after an external change.** A
  reload replaces the document wholesale, and nothing restored the viewport: character
  offsets shift with any edit above the cursor, and the line-anchored scroll snapshot is
  deliberately discarded when the document length changes — which a reload guarantees. The
  spot is now captured as a LINE before the swap and re-asserted after, with the same
  settle loop the outline jump uses (line heights are estimates until CodeMirror measures).
  This gap was always there; it only became visible in 2.4.0, when external changes started
  reloading at all.

## [2.8.0] - 2026-08-02

Batch A, release 5 of 5: rendering a single cell, numbered sections, and opening from
Explorer.

### Added

- **Run just the cell under the cursor — Ctrl+Enter** (issue A.24), plus palette "Run This
  Cell". It runs in the kernel's **current** namespace, Jupyter's Shift+Enter semantics, so
  imports and variables from earlier work are still there and the call costs only what the
  cell itself costs. The Rendered pane comes back complete: every other cell keeps the
  output it already had, re-assembled around the one you re-ran. **The honest trade:** a
  document can then work in an execution order a clean full render would not reproduce —
  Ctrl+Shift+Enter, which always resets the namespace and runs everything top to bottom,
  remains the source of truth. Each cached output remembers the code that produced it, so
  editing a cell discards its stale output rather than showing it as current.
- **Numbered sections in the preview** (issue A.18). A document with Quarto's
  `number-sections: true` in its front matter gets numbered headings; palette verbs force it
  on or off, or return to following the document. Implemented as CSS counters, so it costs
  nothing at render time and survives the incremental preview patcher. Numbering starts at
  `h2` (the `h1` is the title by convention) and skips `{.unnumbered}` headings, as Quarto
  does. **The palette toggle changes the view, never your YAML** — front matter is preserved
  byte-for-byte, and rewriting it for a display preference is a bad trade.
- **Writedown can be the default app for its file types** (issue A.03). The installer now
  registers `.md` / `.markdown` / `.qmd`, `.agg` / `.dec` / `.decl`, and `.bib`, and
  Writedown opens whatever file it was launched with — from a double-click in Explorer or
  from the command line — after restoring the session, so the launched document lands as
  the active tab. Two caveats: associations are registered by the **installer**, so a
  copied `.exe` gets none; and each double-click starts a new instance, consistent with the
  multi-instance design (sessions are keyed per workspace precisely so that is safe).
  `.py`, `.json` and `.toml` are deliberately **not** claimed — they belong to your other
  tools.

## [2.7.0] - 2026-08-02

Batch A, release 4 of 5: the aggregate DecL language.

### Changed

- **The DecL colorizer is re-synced with aggregate's rebuilt pygments lexer** (issue A.20),
  read from `decl_pygments.py` on 2026-08-02. Upstream had moved well past our snapshot, so
  this is a re-port rather than a keyword top-up. Newly understood: `//` comments,
  `doc{{{…}}}` blocks, `tags{…}`, **quoted `"display labels"`** (there was no string rule at
  all before), `port.` / `dist.` / `distortion.` builtin references, structured `hints{…}`
  bodies (`key=value;`, booleans, numbers — previously the whole body read as one comment),
  the `**` / `^` / `@` operators, `sichel.gamma` / `sichel.ig` after `mixed`, and the
  keywords `peel`, `dwait`, `wait`, `year`, `years`. Reclassified to match upstream: `and`
  and `splice` are ordinary keywords (not structural headings), `wts` is a keyword,
  `dfreq` joins `dsev`/`dbvsev`/`dwait` as a declaration keyword rather than a distribution
  name, and `dhistogram`/`chistogram` join the one-parameter severity family. Comma and
  pipe are now neutral, matching the grammar, which treats them as whitespace. Three
  deliberate divergences from upstream are documented in the file so a future sync doesn't
  undo them.

### Added

- **An outline for `.agg` / `.dec` / `.decl` files** (issue A.21). Every top-level
  declaration — `agg`, `port`, `sev`, `distortion`, `dist`, `pnl`, `xpnl`, `bv`,
  `bivariate`, `tower`, `dfreq`, `dsev`, `dbvsev` — becomes an entry showing its keyword
  and name. Previously these files fell through to the Markdown outline parser and produced
  nothing.
- **Code folding in DecL files.** A declaration folds down to the line before the next one,
  so `Ctrl+Shift+[`, `Ctrl+Shift+]` and Fold/Unfold All now work in `.agg` files — the
  colorizer style we use supplies no fold ranges of its own, so there were none. The fold
  ranges and the outline share one definition of "top-level declaration", so they can never
  disagree.

## [2.6.0] - 2026-08-02

Batch A, release 3 of 5: how the workspace looks and moves.

### Added

- **A font per file type** (issue A.05), via a new `[editor.font_by_ext]` table — e.g.
  `py = "Cascadia Mono"`. It beats `[editor] font_family`, which still covers everything
  else. Also `[editor] font_choices`, a list of families that become palette **"Font: …"**
  verbs for a session-only switch (plus "Font: Reset to Config"); like editor zoom, that
  choice is never written back to your config.
- **Ctrl+wheel zooms the preview pane** (issue A.13), the same gesture the editor has had
  since 1.90.0, with palette verbs and rebindable actions (`zoomPreviewIn` / `Out` /
  `Reset`). Headings, code and KaTeX are all em-sized, so everything scales together.
- **Plain view — editor only, no sidebars, no outline, no preview** (issue A.16), on
  **Ctrl+K Ctrl+P** with explicit Enter/Exit palette verbs. Distraction-free (Shift+F11)
  keeps the preview and goes full screen; this one is windowed and drops the preview too,
  which is the gap. Exiting restores the layout you had. Bonus: with the outline unmounted
  its parse stops running altogether.
- **Project folder management from the palette** (issue A.02): **"Project: Remove
  Folder …"**, one verb per root, and **"Project: Open Project File (.wdproj)"** to edit
  it by hand. Removing a folder rewrites the project file only — the folder and everything
  in it are untouched. The underlying action had existed since projects shipped but nothing
  ever called it.

### Changed

- **Switching projects no longer fills the sidebar in one folder at a time** (issue A.25).
  Every remembered-expanded folder used to be fetched in its own round-trip, each answer
  re-rendering the tree — so you watched it populate. The whole set is now fetched in a
  single batched call before the tree mounts, so it paints once, complete. Fewer round
  trips and fewer renders than before; folders you expand later still load lazily as
  always.
- **Editor font size and family now travel as CSS variables** rather than being baked into
  generated style rules. Every distinct value used to build a fresh stylesheet that
  CodeMirror mounts and never removes, so each Ctrl+wheel zoom notch quietly leaked one —
  and per-file-type fonts would have added one per tab switch. The theme object is now
  stable across both, so nothing accumulates and nothing reconfigures.
- **Distraction-free and plain view share one saved layout** instead of keeping separate
  restore state. Two independent stacks could interleave into a layout that never came
  back; now entering either from normal records the layout once, and exiting restores
  exactly that.

## [2.5.0] - 2026-08-02

Batch A, release 2 of 5: getting things *into* Writedown — clipboard, drag-drop, and
handing files back out to Windows.

### Added

- **Paste an image straight into a document** (issue A.22), Joplin-style. Ctrl+V with a
  screenshot on the clipboard writes it to an `img/` folder beside the document — created
  if it isn't there — and inserts `![](img/<name>.png)`. Temporary buffers have no folder
  of their own, so theirs go to `~/.writedown/img/` and get a full path. Files are named
  by **content hash**, so pasting the same screenshot twice reuses the one file, and an
  existing file is never overwritten (a genuine collision takes the next `-N`). The link
  is percent-encoded, so a document folder with a space in its name still renders — a raw
  space makes the preview drop the image silently. The status bar reports what was
  written; Ctrl+Z removes the link text but not the file. Accepted in Markdown, Quarto and
  temporary documents only; pasting text, and pasting anything anywhere else, is
  completely unaffected.
- **Drag and drop files or folders onto the window** (issue A.04). Files open as tabs
  (capped at 20 per drop, with a status-bar note when more were dropped); a folder becomes
  the Folder-tab root, or is added to the current project when the Project tab is showing.
  The window shows an outline while a drag is over it. Known-binary files are skipped
  rather than opened as text.
- **Ctrl+click a file in the sidebar to open it in its Windows default app** (issue A.17)
  — any file type, and folders open in Explorer. Single-click still previews and
  double-click still edits, so this adds a gesture without taking one away.
- **Distinct sidebar icons** for html, css, js/ts, PowerShell/batch/shell scripts, Office
  documents, archives and executables.

### Fixed

- **"Open Externally" sent everything to the PDF viewer.** The tree's context-menu item
  called the `[tools] pdf_viewer` command for *every* file type, so asking to open a
  `.png`, a `.zip` or an `.exe` externally either launched SumatraPDF with it or failed
  with "no viewer configured". It now uses the Windows shell association like a
  double-click in Explorer, and is labelled "Open in Default App" (or "Open in Explorer"
  for a folder). PDF/DjVu still go to `[tools] pdf_viewer`, which is what that setting is
  for. The item is also no longer restricted to binaries and images — it works on any row.

## [2.4.0] - 2026-08-02

Batch A, release 1 of 5: the two integrity bugs plus the cheapest daily-use fixes.

### Fixed

- **A tab could show stale content while claiming to be current** (issue A.28 — "this
  file did not appear to reload after external edits"). External-change events name each
  file with the spelling of the *watched root*, but the reload check compared them to the
  open tab's path as a raw string. Any tab opened under a different spelling — different
  capitals or slashes, the standout case being a `[files] quick_file` typed by hand into
  config.toml and opened with Ctrl+Shift+Q — never matched, so the event was dropped
  **silently**: no reload, no "Modified externally" flag, no message. Both sides of the
  comparison (and the just-saved suppression set) now normalize case and separators, using
  the helper the rest of the store already uses. The same mismatch also ran backwards, so
  a save under one spelling could fail to suppress its own echo and trigger a spurious
  reload; that is fixed by the same change.
- **Python outlines silently dropped every member of a large class** (issue A.11). Methods
  were parsed correctly, but a summarisation guard discarded *all* descendants of any node
  with more than 30 direct children — so a class with 31+ methods showed none of them,
  which read as "the outline doesn't list methods". The guard now allows up to 500 for
  Python, where a long member list is exactly when the outline earns its keep; Markdown
  and YAML keep the old limit.
- **Tab after a word no longer indents the paragraph when nothing matches** (issue A.14).
  A failed completion used to fall through to CodeMirror's indent command, which indents
  every line the selection touches — and with word wrap on, a visually-wrapped paragraph
  is one logical line, so the whole paragraph shifted. Tab after a word is now consumed
  and reported ("no completions for …") in the status bar. Tab at the start of a line or
  after whitespace still indents, Shift+Tab still dedents, and Tab over an open completion
  popup still accepts. Threshold configurable: `[editor] tab_complete_stem_min` (default 2
  — deliberately low, since short stems are the ones that miss).

### Added

- **`$` wraps a selection**, joining the quote/bracket/`*` family (issue A.01). Select an
  expression, press `$` for `$…$`; press it again for `$$…$$` (the text stays selected
  after each wrap).
- **Ctrl+Shift+D duplicates the selection** when there is one, instead of always copying
  whole lines (issue A.06). With no selection it duplicates the line exactly as before.
  The old line-only command is still registered as `duplicateLine`, so `[keys]` can put it
  back.
- **Selection size in the status bar**, Sublime-style (issue A.26): `Ln 42, Col 7 · 3
  lines, 128 chars`, plus `· N selections` when multiple cursors are active. Nothing extra
  is shown for a plain caret.
- **Palette "Name Temporary File…"** (issue A.27): give a scratch buffer a real name
  instead of `Untitled-3`. It remains exactly what it was — unsaved, held in the
  workspace's session, returning when you reopen that project — the name is the only
  change. A typed name without an extension keeps the buffer's current one (so an extracted
  `.bib` scratch stays `.bib`, and the `.md` default keeps highlighting, preview,
  spellcheck and citations working). The remembered cursor position follows the rename.
- **`[outline] python_show_private` / `python_show_dunder`** control which Python class
  members the outline lists (defaults: private shown, dunder hidden). `__init__` is always
  listed.

## [2.3.0] - 2026-07-22

### Added

- **Build system — run any script or command against the current file, Sublime-style.**
  Define commands in a new `[build]` config table (name → command line); each becomes a
  palette **"Build: <name>"** verb, and **Ctrl+Shift+B** runs the last-used (or first)
  one. The buffer is saved first, then the command runs **through PowerShell** (`pwsh`)
  from the file's own folder — so a `.bat`, a `.ps1`, an `.exe`, or a bare command on
  PATH all behave exactly as they would in a terminal (no per-type dispatch). The
  variables `$file`, `$file_path`, `$file_name`, `$file_base_name`, `$file_extension`
  are substituted and quoted, so paths with spaces are safe. Timing and exit code show
  in the status bar; a failed build opens its captured stdout/stderr in a scratch tab.
  This is the clean way to wire up, e.g., a pandoc-to-PDF script — Writedown is the
  button, your script owns the toolchain (engine, bibliography, CSL, …).

### Changed

- **The internal Python-cell render is now "Render", on Ctrl+Shift+Enter** (it was
  "Build" on Ctrl+Shift+B), which frees Ctrl+Shift+B for the new build system — matching
  Sublime, where "build" means running an external command. Both are rebindable in
  `[keys]` (actions `render` and `build`), and the palette keeps "Render Document (run
  code cells)".

## [2.2.0] - 2026-07-22

### Added

- **Local-file links open when clicked in the preview.** A Markdown link whose target
  is a file — `[notes](sub/notes.md)`, `[report](C:/docs/report.pdf)`,
  `[pic](img/diagram.png)` — now opens that file: Markdown/Quarto/text/CSV in a
  Writedown tab, PDF/DjVu in the configured external viewer, images in the in-app image
  viewer. `http(s)://` links still open in the browser and `#anchor` links still scroll
  the preview, unchanged. Works in both the live and Rendered previews. Relative targets
  resolve against the document's folder, so an unsaved scratch buffer (which has no
  folder) leaves its relative links inert, exactly as relative images already do. The
  target is resolved before sanitizing and stashed in a `data-` attribute, because a
  bare drive-letter href (`C:\…`) would otherwise be stripped as an unknown URL scheme;
  no new permissions are needed and there is no cost on the typing path.

## [1.80.0] - 2026-07-16

### Added

- **decl (aggregate Dec Language) syntax highlighting.** The author's pygments lexer
  (decl_pygments.py in the aggregate package) ported to a CodeMirror StreamLanguage:
  frequency/severity distribution names (grouped by parameter count, as in the
  lexer), grammar keywords, `sev.`/`agg.` builtins, `note{…}`/`hints{…}` comment
  blocks, numbers (incl. `%` and `inf`), and `#` comments. Applies to `.agg`/`.dec`/
  `.decl` files (now shown in the tree, with a λ icon) and to ```` ```decl ````/
  ```` ```agg ```` fences in both the editor and the preview. Colors come from the
  imported Sublime scheme like every other language. The word lists are a snapshot
  of the lexer — new grammar keywords must be re-synced by hand (source path noted
  in decl.ts). Requires a backend rebuild (tree filter learned the extensions).

## [1.79.0] - 2026-07-16

### Added

- **Insert snippets: a config-defined system, not one-off commands.** The palette
  gains "Insert: <name>" entries. Two built-ins ship — "Aligned Math" (`$$` +
  `\begin{aligned}` block) and "Python Code Cell" (`{python}` fence) — and a
  `[snippets]` table in config.toml adds your own or overrides/removes the built-ins
  by name (same override rules as `[keys]`; the config template documents the
  format). Bodies use CodeMirror snippet fields: `${}` marks a cursor stop (several
  = Tab-through), and `${SELECTION}` is replaced with the selected text, so
  wrap-around snippets work. Palette-time only — zero baseline cost. Requires a
  backend rebuild (config gains the `[snippets]` read).

## [1.78.1] - 2026-07-16

### Fixed

- **Personal-dictionary words now cover their inflections.** Adding "quantile" left
  "quantiles" underlined: personal words matched exactly, with none of the affix
  expansion the main dictionary gets. Unknown words are now also checked against the
  personal list after stripping common inflections (s, es, 's, s', ed, ing, and
  ies→y), so one added stem accepts its everyday forms. Cached as before — only
  unknown words pay, and only once. Requires a backend rebuild.

## [1.78.0] - 2026-07-16

### Added

- **Drag to reorder the Open Files rows** in the side panel — the vertical twin of the
  tab strip's pointer drag (same 5 px click-vs-drag threshold, live reorder as the
  pointer crosses row midpoints, × still a plain click). Rows and the tab strip share
  the same tab array, so reordering either reorders both, and the order persists in
  the session as before.

## [1.77.0] - 2026-07-16

### Fixed

- **Every document now remembers its place.** Nothing stored per-tab cursor or
  scroll: the single editor view carried the previous doc's raw cursor offset
  (clamped) into whichever tab came next — precisely "the same position overlaid on
  every file", and why the quick-file jump seemed to lose your spot. The editor now
  records selection and scroll per path as you work and restores them on every tab
  switch; open tabs persist their positions in the session (project-level with a
  project open, per-folder otherwise), so a restart drops you back where you were.
  Reopening a closed tab in the same run restores its spot too. Recording is a Map
  write on cursor moves — no per-keystroke store traffic, no baseline perf change.
  Requires a backend rebuild (session gains a positions table).

## [1.76.1] - 2026-07-16

### Fixed

- **Open Files row no longer balloons when a file is opened in preview mode.** The
  single-click (preview) row renders its name in italics; with a UI font that has no
  true italic, the browser synthesizes one or falls back to another family whose
  metrics render visibly larger and inflate the row box — the same disease the tab
  strip had. Same compensation applied: the italic name is pinned half a pixel under
  the tree font size and the row's line box is fixed. If the huge-font sighting was
  somewhere other than the Open Files row, a screenshot will pin it down.

## [1.76.0] - 2026-07-16

### Added

- **Show/hide the sidebar and the outline.** `Ctrl+K Ctrl+B` toggles the side panel
  (tabs, open files, tree), `Ctrl+K Ctrl+O` the outline — ST muscle memory; both
  rebindable via `[keys]`. The palette carries explicit Show/Hide verbs for each.
  Visibility persists in the session, so it is project-level when a project is open
  and per-folder otherwise; the dragged pane widths survive a hide/show round trip.
  A hidden outline also skips outline parsing entirely (the pane unmounts) — a small
  perf win on big documents. Requires a backend rebuild (session gains two fields).

## [1.75.1] - 2026-07-16

### Fixed

- **Enter after a bullet or numbered item now inserts one newline, not two.** The
  stock markdown Enter preserves list "looseness" — in a list whose items are
  separated by blank lines it continues with a blank line. A new `continueList`
  command (bound to Enter, rebindable via `[keys]`) always continues tight:
  single newline + the right marker (bullets keep theirs, numbers increment and
  the items below renumber, task items continue as unchecked `[ ]`). Enter on an
  empty item still ends the list. Blockquotes, code cells, non-markdown files,
  selections, and the completion popup all fall through to the old behavior.

## [1.75.0] - 2026-07-16

### Added

- **Five new editing keybindings**, all in the command registry (remap via config
  `[keys]`, listed in F1 help): `Ctrl+Shift+A` move to line start, `Ctrl+E` move to
  line end, `Ctrl+K Ctrl+T` title-case selection, `Ctrl+T` transpose characters,
  and `Alt+T` transpose words (emacs M-t — swaps the word at/before the caret with
  the next; repeated presses drag a word rightward; multi-cursor aware). Alt+T was
  chosen over "Esc T" deliberately: making Escape a chord prefix would delay its
  immediate jobs (close search, collapse multi-cursor).

## [1.74.0] - 2026-07-16

### Added

- **Copy File Path / Copy File Name palette commands.** Two explicit verbs (no
  state-dependent labels): the full resolved path or just the file name of the
  active document, straight to the clipboard. Scratch buffers surface a notice
  instead of silently copying nothing.

## [1.73.3] - 2026-07-16

### Fixed

- **Unicode in python cells no longer mojibakes (`λ` → `Î»`).** The app pipes cell
  code to the persistent kernel as raw UTF-8 JSON, but a piped Python stdin on
  Windows decodes with the locale codepage (cp1252) — so multi-byte characters
  arrived mangled and the cell *executed* the mangled literal, producing faithful
  mojibake in the output. The runner now reconfigures its stdin to UTF-8 (replies
  were already safe — JSON with non-ASCII escaped). Requires a backend rebuild;
  the embedded runner redeploys itself at the next kernel spawn.

## [1.73.2] - 2026-07-16

### Fixed

- **Long preview jumps now land exactly on the first click.** `content-visibility`
  blocks report estimated heights until first rendered, so a long jump (outline click,
  footnote/anchor link, big editor scroll) computed its target from estimates — the
  destination rendered, layout shifted, and the target slid away; a second identical
  click landed because the sizes were real by then. All jump paths now settle: the
  target is re-verified for up to 8 frames and nudged until stable, superseded by any
  newer jump. Applies to outline→preview (both view modes), editor→preview sync, and
  in-preview anchor links.
- **First open of a big document no longer deadens the UI.** The progressive fill
  inserted a fixed 64 blocks per frame, but on first open each block also pays its
  one-time DOMPurify sanitize — frames ran 50–100 ms and the first second of clicks
  felt dead. The fill is now time-budgeted (~8 ms of work per frame, however many
  blocks fit), so the window stays interactive while big docs stream in.

## [1.73.1] - 2026-07-16

### Fixed

- **Editor↔preview scroll sync is now line-anchored, not proportional.** Proportional
  mapping assumes source lines and rendered pixels grow at the same rate; on math-heavy
  docs (a 3-line `$$…$$` renders 100+ px tall, dense prose the reverse) the error
  accumulates until the panes show different sections — unusable on the benchmark doc.
  Sync now maps the viewport's top edge through source lines: editor top line → the
  preview block covering it (1.73.0's blocks carry source-line ranges), interpolated
  within the block, and the mirror image coming back. Binary search over block offsets,
  O(log n) per scroll event, no layout thrashing. Locally exact with no drift; the same
  convention in both directions so the panes don't fight. Proportional survives only as
  a fallback while a large doc's blocks are still streaming in.

### Added

- **"Rendering…" placeholder** while a document's first preview pass is in flight. The
  render already runs off-thread (never blocks typing), but a cold first pass on a big
  math doc takes a moment — the pane now says so instead of sitting silently empty.
  Steady-state re-renders keep showing current content; switching documents clears the
  pane immediately rather than showing the old doc under the notice.

## [1.73.0] - 2026-07-16

### Changed

- **Incremental preview engine.** The markdown→HTML pipeline (markdown-it + KaTeX +
  plugins) moved into a Web Worker — rendering never blocks typing — and the document
  now renders as independent top-level blocks with a per-block cache, patched into the
  preview DOM by content key: an edit re-renders and re-lays-out ~one block instead of
  swapping megabytes of HTML. Measured on the 209 KB benchmark doc: a mid-document edit
  changes exactly 1 of 515 blocks; a full off-thread pass is ~40 ms warm. Correctness
  held to the letter: per-block output concatenates byte-identically to the old
  full-document render (verified programmatically, including footnotes, reference
  links, tables, task lists, and math); reference/footnote definition edits invalidate
  the cache and propagate to all uses. Big docs open progressively (blocks stream in
  per frame) rather than freezing the window. If the worker can't start, the same
  renderer runs inline as a fallback — slower, never broken. DOMPurify still sanitizes
  every block on the main thread before insertion, exactly as before.
- **Outline clicks in preview land exactly** on the target section now (blocks carry
  source-line ranges), replacing 1.72.5's proportional approximation.

## [1.72.5] - 2026-07-16

### Fixed

- **Big math documents: first relief round** (benchmark: a 209 KB / ~2,200-formula doc
  where split view was unusable). Three changes: (1) **KaTeX render cache** — formulas
  are cached by source+display-mode, cutting a warm preview render from ~250 ms to
  ~25 ms (measured); KaTeX was the entire gap between plain markdown-it (38 ms) and the
  observed cost. (2) **CSS containment on the preview** (`contain: layout style paint`
  on the scroll pane, `content-visibility: auto` on top-level blocks) — the rendered
  DOM (~300 K nodes on the benchmark doc) no longer participates in editor-keystroke
  layout passes, and off-screen blocks skip layout/paint entirely; this addresses split
  view lagging even with a static Rendered tab. Accepted trade: slight scrollbar drift
  on first scroll-through as block-size estimates refine. (3) The full-document
  re-render per typing pause still exists — eliminated next in 1.73.0's incremental
  block renderer.
- **Outline clicks now work in preview-only view.** They targeted the editor view,
  which is unmounted in that mode, so nothing happened. Clicks now scroll the preview
  directly (proportional mapping; exact block anchors arrive with 1.73.0).

## [1.72.4] - 2026-07-16

### Fixed

- **Math highlighting no longer rescans the whole document per keystroke.** The
  highlighter stringified the entire document and re-ran the region regexes on every
  edit. Existing marks are now shifted through each edit (O(edit), positions stay
  exact), and the full rescan runs once, 200 ms after the last keystroke. Viewport-only
  scanning was considered and rejected — a `$$` block can open above the viewport, so
  this keeps highlighting exact at a bounded cost. Final part of the perf batch
  (1.72.2–1.72.4). The same pattern fits the CSV rainbow if large CSVs ever feel slow;
  left as-is for now since it only affects CSV/TSV tabs.

## [1.72.3] - 2026-07-16

### Fixed

- **Live preview and outline no longer re-render on every keystroke.** The preview ran
  the full pipeline — markdown-it parse, KaTeX over all math, DOMPurify, then a wholesale
  `innerHTML` swap forcing WebView2 to relayout the entire rendered document — per
  keypress, with no debounce (the CSV pane and linters were already debounced; the md
  preview never was). The outline likewise re-scanned every line per keypress, in every
  layout, even with the preview hidden. Both now run once per typing pause (preview
  200 ms, outline 300 ms) via a shared `useDebouncedValue` hook whose document-key reset
  keeps tab switches instant — no flash of the previous document. The file tree is also
  memoized so App's per-keystroke re-render stops reconciling it. Part two of the
  three-part perf batch begun in 1.72.2.

## [1.72.2] - 2026-07-16

### Fixed

- **Typing no longer rebuilds the entire editor on every keystroke.** The
  react-codemirror wrapper reconfigures CodeMirror whenever its `onChange`/`onUpdate`
  callbacks or `basicSetup` object change identity — and Editor.tsx passed all three as
  inline literals, so every keypress dispatched a full `StateEffect.reconfigure`,
  tearing down and reinstalling the whole extension stack (Markdown parser, the three
  linters, spellcheck, citations, theme, gutters, math highlighter — whose constructor
  then re-scanned the whole document). This was the main WebView2 CPU burn behind the
  draggy-typing report, and it hit even in editor-only view. Fix: hoist `basicSetup` to
  a module constant and stabilize the callbacks with `useCallback`; reconfigure now
  fires only on real changes (theme, config, file type). First of a three-part perf
  batch — 1.72.3 debounces the preview/outline, 1.72.4 the math highlighter.

### Changed

- **About now lists CsvGrid** (the CSV preview control) among the core components, with
  its version. CsvGrid comes from the sibling csv-viewer repo via a Vite alias rather
  than package.json, so its version is baked in at build time from that repo's
  package.json — still nothing hand-synced. New versions are picked up when the dev
  server (re)starts.

## [1.72.0] - 2026-07-15

### Added

- **Open Shell Here.** Tree right-click → "Open Shell Here" opens the configured shell
  (`[tools] shell` in config.toml; default `pwsh`) in its own console window at that
  folder (a file's entry uses its parent). Palette → "Open Shell (document folder)" does
  the same at the active document's folder, falling back to the workspace root for a
  scratch buffer or empty editor. Known limit: `shell = "wt"` won't honor the directory —
  Windows Terminal uses its own startingDirectory profile setting, not the spawn cwd;
  the pwsh default lands in the right place.

## [1.71.0] - 2026-07-15

### Added

- **PDF and DjVu files open in an external viewer.** They now show in the tree (📄) and
  quick-open; double-click, palette selection, or the tree right-click "Open Externally"
  launches the exe configured as `[tools] pdf_viewer` in config.toml (point it at
  SumatraPDF and one key covers both formats). Writedown never opens these binaries in a
  tab, so nothing tries to read PDF bytes as UTF-8; a single tree click is deliberately
  inert (no viewer spam). No viewer configured → the error bar says exactly which config
  key to set, and clicking it opens config.toml.

## [1.70.0] - 2026-07-15

### Added

- **About dialog** (palette → "About Writedown"): app version, Tauri and WebView2
  versions, the core pipeline components highlighted (CodeMirror, markdown-it, KaTeX,
  mermaid, DOMPurify, React), the full frontend dependency list, and the Rust backend
  crates. Nothing is hand-synced — the app version is read from tauri.conf.json at
  runtime and dependency versions from package.json at build time, so the dialog can
  never drift from what's actually shipped. Esc or a backdrop click closes it.

## [1.69.0] - 2026-07-15

### Added

- **Drag tabs to reorder them.** Pointer-based (HTML5 drag-and-drop is unreliable in
  webviews): a ~5 px horizontal threshold separates a drag from a click, then the strip
  reorders live as the pointer crosses neighboring tabs' midpoints; dragging also selects
  the tab, ST-style. The new order persists in the per-workspace session (which already
  stored tabs in array order), and the Open Files panel section follows automatically —
  both read the same array. Plain click, double-click promote, and the close × behave
  exactly as before.

## [1.68.0] - 2026-07-15

### Added

- **Open Files section in the side panel** (ST-style), shown above both the Folder and
  Project trees whenever tabs are open: one row per tab with the dirty dot, the filename,
  and a hover × that saves then closes — the same semantics as the tab strip. Preview
  tabs show in italic and promote on double-click; the active document is highlighted.
  The section caps at ~30% of the panel and scrolls beyond that.

## [1.67.0] - 2026-07-15

### Added

- **Many more file types open colorized** — reStructuredText, C/C++, JavaScript/TypeScript,
  CSS, HTML, SQL, and PowerShell join the tree and the editor, and the already-listed R and
  shell files now actually highlight. Resolution falls back to `@codemirror/language-data`
  (already in the pipeline for fenced code blocks), whose grammars load lazily as separate
  chunks — a one-time, millisecond import per language, zero cost until a file of that type
  is opened. The first-class types (md/qmd, py, json, yaml, toml, tex, csv) resolve exactly
  as before.

## [1.66.2] - 2026-07-15

### Fixed

- **Window was unclosable since 1.66.0 — titlebar X and system-menu Close were silently
  ignored.** Two Tauri facts combined: (1) registering any JS close-request listener makes
  Tauri core veto the native close, so the 1.66.0 close-time-flush handler's own
  `destroy()` call became the *only* way the window could ever close; (2) that `destroy()`
  was rejected by the capability ACL — `capabilities/default.json` (untouched since 1.27.0)
  granted only read-only window permissions plus `allow-set-title`. Every close attempt was
  intercepted, flushed, then denied; the "second click forces close" escape hatch died on
  the same denial. Added `core:window:allow-destroy` (the fix) and
  `core:window:allow-show` (the first-paint reveal was failing silently the same way,
  rescued only by the window-state plugin's Rust-side restore).
- **Close-time flush hardened: a rejecting session write can no longer skip the close.**
  The 3 s bound only covered a *hung* flush; a flush promise that *rejected* (e.g.
  `saveSession` erroring) rejected the race and skipped `destroy()`, wedging the window
  open with the force-close guard latched. Flush errors are now caught and logged, so the
  close always proceeds.

## [1.66.1] - 2026-07-15

### Fixed

- **Hot-exit checkpoint now has a ceiling during sustained typing.** The session writer is
  a trailing debounce (write 400 ms after the last change), so pauseless typing with
  keystroke gaps under 400 ms could postpone the checkpoint indefinitely — a crash
  mid-flow could lose the whole run, not the advertised ~400 ms. A vim-style max-wait
  (idle **or** ceiling, like vim's 4 s / 200 chars) now forces a write at least every 5 s
  while changes are pending. Normal typing is unchanged — same single write 400 ms after
  you pause; the ceiling only adds writes during long pauseless runs, which previously
  produced none at all. Clean quits were already fully covered by the 1.66.0 close-time
  flush. (For context: every editor checkpoints rather than journaling keystrokes —
  Sublime's periodic `Auto Save Session.sublime_session`, vim's swap file, Emacs
  auto-save; ours was missing only the ceiling half of the pattern.)

## [1.66.0] - 2026-07-15

### Added

- **Scratch hot exit — unsaved scratch buffers survive an app restart.** Close the app with
  an untitled scratch open and it comes back on the next launch: same name, same text, same
  tab position, still officially unsaved (dirty). Scratch text is stored in the
  per-workspace session (`~/.writedown/sessions/<hash>.json`, derived state — user files
  untouched) and refreshed by the same debounced writer as the rest of the session, at zero
  extra per-keystroke cost (a revision counter stands in for the text in the change check).
  Restored names never collide: the Untitled-N counter resumes past the highest restored
  number. Switching to another project parks the scratches under the old workspace's
  session, so they return when that workspace is reopened. Explicitly closing a scratch tab
  is still a deliberate discard (and no longer leaves a dead Ctrl+Shift+T entry).
- **Close-time flush — quitting can no longer lose the last few seconds of work.** A window
  close-request handler saves every dirty file and writes the session (including scratch
  text and folder-panel state) before the window closes, eliminating the ~400 ms debounce
  hole. The flush is bounded (3 s) so a hung write can never wedge the window open, and a
  second close request forces an immediate close. Crash-safety bound for scratches (e.g. a
  Task-Manager kill) is the last debounced write, ≤ ~400 ms of typing.

## [1.65.0] - 2026-07-15

### Added

- **The Folder panel now survives a restart.** The Folder tab's root and the active
  side-panel tab (Folder vs Project) are persisted in `~/.writedown/session.json` and
  restored on launch, independent of the workspace. Previously the folder root had no
  persistence at all: with a project open (or as the last workspace), an opened folder
  was never remembered, so it "disappeared" on the next launch — and the panel always
  reset to the Folder tab.

### Changed

- `session.json` grew `folder_root` and `panel_tab` alongside `workspace` (all optional —
  old files load fine, old builds ignore the new keys). Writing the last workspace is now
  read-modify-write so it can't clobber the folder fields. Folder/panel changes persist via
  the same debounced watcher as the per-workspace session — one watch point rather than a
  save call at every mutation site.

## [1.64.0] - 2026-07-15

### Added

- **Ctrl+Shift+N opens a new scratch file** (the existing "New Scratch File (unsaved)"
  palette command, now one chord away). Works from any focus — editor, tree, or preview —
  and lands the cursor in the new buffer. Listed in the F1 shortcut help and in the palette
  entry's title.

## [1.63.0] - 2026-07-15

### Changed

- **Status bar lower-left now shows the active document's full path** (previously it showed
  the workspace root, which never changed as you switched tabs). A scratch buffer shows its
  `Untitled-N.md` name, matching its tab; with no document open it falls back to the
  workspace root, and with no workspace to "Writedown". Long paths ellipsize; hover for the
  full string.

## [1.62.1] - 2026-07-15

### Fixed

- **Preview tabs no longer look bigger than normal tabs.** A single-click (preview) tab's
  italic name rendered optically larger than the roman names beside it — there was never an
  actual `font-size` difference; the italic face just has larger apparent glyph metrics. The
  preview-tab name now gets a small optical compensation (11px vs the strip's 11.5px) so both
  read as the same size.

## [1.62.0] - 2026-07-14

### Added

- **`[editor] tab_size` now works** — sets the editor indent width in spaces (default 4).
  Indentation is always spaces, never a literal tab. Wired config → `EditorSettings` →
  CodeMirror `indentUnit`/`tabSize`, reconfiguring live on a config save. The key sat in the
  template before but was never read (indent had been hardcoded to 2).

### Changed

- **Default `config.toml` template pruned to only keys Writedown actually reads.** An audit
  found many template keys were decorative — never parsed by any code, so setting them did
  nothing: `[general] restore_session`; `[editor] strip_trailing_whitespace /
  preserve_markdown_hard_breaks / autosave_on_focus_loss / autosave_idle_ms`; the whole
  `[preview]` and `[theme]` sections; most of `[bibliography]` (only `default_file` is read —
  the .bib is always watched and read-only); `[files] extensions`; `[outline]`/`[tree]`
  `enabled`/`position`; and `[spelling] language` (only en_US is bundled). All removed from
  the shipped template, with a header note that every listed key is one the app reads. A new
  test asserts the template parses and stays honest. (`[editor] tab_size` was the one
  reprieve — kept and wired; see Added.) Behavior otherwise unchanged — every removed key was
  already inert.

## [1.61.0] - 2026-07-14

### Added

- **Spell check: far fewer false alarms, plus a seeded, reachable personal dictionary.**
  The engine was never the problem (it's a full Hunspell affix dictionary); the noise came
  from the tokenizer flagging things that aren't prose. Four levers, all in
  `src/editor/prose.ts` unless noted:
  - **Configurable minimum word length** — `[spelling] min_length` (default **4**), so short
    tokens like `px`, `md`, `js` are no longer checked. Threads config → `EditorSettings` →
    the tokenizer (previously hardcoded to 2).
  - **File paths are skipped** — any whitespace-delimited run containing `/` or `\` (Windows,
    UNC, POSIX, relative paths, non-`http` URLs, and slash tokens like `TCP/IP`). This fixes
    the long-standing case where `C:/dir/Photos/roman` had its segments underlined.
  - **Mid-sentence proper nouns are skipped** — a Capitalized word that isn't at a sentence
    start (`Tauri`, `Zustand`) is treated as a proper noun. Sentence-initial words stay
    checked, so a real typo like "Teh cat" is still caught. Gated by
    `[spelling] skip_proper_nouns` (default true) — set false to check them.
  - **Personal dictionary is seeded on first creation** with common file extensions and
    tooling/domain terms, and is now reachable via two palette commands, **Open Personal
    Dictionary** and **Reload Personal Dictionary** (also keybindable: `openSpellDictionary`
    / `reloadSpellDictionary`). It still lives in the durable app-config dir (not the
    disposable `~/.writedown/` tree) and is repointable via `[spelling] personal_dictionary`;
    an existing dictionary is never reseeded or clobbered.

### Changed

- The `[spelling]` config block documents the two new keys (`min_length`, `skip_proper_nouns`).
  Existing configs without them fall back to the defaults (4 / true).

## [1.60.1] - 2026-07-14

### Fixed

- **Dev server 403 "outside of Vite serving allow list" on startup** (1.60.0 regression).
  Setting `server.fs.allow` for the sibling csv-grid dist *replaces* Vite's default allow
  list, and only the junction-resolved project root had been listed — so when dev is
  launched from the `C:\S` junction, the request for `index.html` arrives under the
  junction path and was refused. The allow list now carries the project root in both
  forms (raw cwd and resolved) plus the csv-grid dist.

## [1.60.0] - 2026-07-14

### Added

- **CSV/TSV preview via CsvGrid.** Opening a `.csv`/`.tsv` now fills the Preview pane with
  the CsvGrid control (from the sibling csv-viewer repo, v3.9): fzf-style global search,
  per-column filter row, sortable headers, Expand/Contract width buttons, Copy/Save export
  split-buttons (current view or all rows, CSV or markdown, formatted or raw values), and
  a rows×cols status bar. Type inference and number/date formatting follow the
  greater_tables conventions; TSV/`;`/`|` delimiters and markdown pipe tables are
  auto-detected. The pane shows a single "CSV" tab (no live/rendered split for data
  files); split/preview modes, Ctrl+Shift+L, and the drag divider all work as for
  markdown. Grid refreshes ~300 ms after you stop typing in the editor pane; a
  ResizeObserver re-solves column widths on pane resizes. Dark mode follows the OS, like
  the rest of the preview.
- **Consumed as a build-level link, not a copy**: a Vite alias resolves `csv-grid` to
  `../csv-viewer/dist/csv-grid.es.js` (committed in that repo, self-contained, zero
  dependencies) — rebuilding csv-grid there flows into Writedown on the next reload, with
  no vendored files and no npm coupling. The parse worker is disabled (`worker: false`;
  it only engages at ≥1 MB anyway), so no worker asset needs hosting.

## [1.59.0] - 2026-07-14

### Added

- **"Extract Citations to .bib (scratch)"** (command palette) — collects every `@key` the
  active document cites (same detection as the missing-citation linter: prose only, Quarto
  crossrefs like `@sec-…` skipped, deduped) and pulls those entries **verbatim** out of the
  configured bibliography into a new `Untitled-N.bib` scratch buffer, byte-for-byte as they
  sit in the source `.bib`, in file order. Keys not found in the bibliography appear as
  `% NOT FOUND: <key>` comment lines at the top. The authoritative `.bib` is only read,
  never touched. (The bib index stores parsed fields only, so this reads the file directly
  with the same entry-boundary scan as the parser — covered by a new unit test.)
  Supporting touches: scratch buffers can now be born with content and a chosen extension,
  and Save As on a scratch suggests its actual name (so the `.bib` extension survives).

## [1.58.0] - 2026-07-14

### Added

- **Ctrl+Shift+Q opens your quick file** — the one always-at-hand notes/issues file.
  Configure it as `quick_file = 'C:\path\to\notes.md'` under `[files]` in config.toml
  (single quotes keep backslashes literal); also on the palette as "Open Quick File" and
  listed in F1 help. Unset, or a bad path, surfaces a footer message pointing at the
  config key — never a silent no-op. (The author's config now points at his
  `writedown-issues.md` bug reporter.)

## [1.57.0] - 2026-07-14

### Added

- **Insert Date-Time** (command palette) — inserts the local timestamp as
  `YYYY-MM-DD HH:MM:SS` at every cursor (multicursor-aware, replaces a selection). Works
  in any file type, not just markdown. Registered as editor action `insertDateTime`, so a
  key can be bound to it via config `[keys]` (none by default).

## [1.56.0] - 2026-07-14

### Changed

- **"Project: Save Project As…" is now "Project: Save / Rename Project…"** — it asks for a
  *name only*, never a location. Project files are fully managed: every save/rename writes
  `~/.writedown/projects/<name>.wdproj` (same rule as New Project). Enter with the same
  name saves in place; a new name renames (the old managed file is removed — a `.wdproj`
  living *outside* the managed folder is adopted in and the original left untouched).
  Trying to take another project's name is refused with an inline error, never a silent
  overwrite. The prompt opens prefilled with the current name, selected, so typing
  replaces it. The native save-file dialog for projects is gone.

### Fixed

- **Project edits persist immediately.** "Add Folder to Project" and removing a folder now
  rewrite the project's `.wdproj` on the spot; previously they only changed in-memory
  state, so a named project silently lost its added folders unless you remembered to Save
  As. (An unsaved ad-hoc project still has no file until you Save / Rename it.)

## [1.55.0] - 2026-07-14

### Added

- **Dot files and dot directories are now shown** in the file tree and quick-open
  (`.writedown`, `.github`, dotfile configs, …), and the long-inert `[files] show_hidden`
  config option finally does something: set it to `false` to hide them again. Default is
  `true`. The option is read per listing (like the bibliography config), so a config edit
  applies on the next tree expand / F5 — no restart. The openable-extension whitelist is
  unchanged (the tree still shows only files Writedown can open), and quick-open still
  skips heavy build/VCS directories (`node_modules`, `target`, `.git`, `__pycache__`,
  `.venv`). Note `.git` folders now appear in the *tree*; their contents are mostly
  extension-filtered anyway. Existing configs carrying the old default `show_hidden =
  false` need that one value flipped (done for the author's config with this release).

## [1.54.3] - 2026-07-14

### Fixed

- **Citation hover works with trailing punctuation** — hovering `@Key2024.` or `@Key2024:`
  now shows the title. The hover used its own greedy pattern that swallowed a trailing
  `.`/`:` into the key (comma/semicolon happened to work), so the lookup missed; it now
  shares `CITE_RE` with the linter, which requires keys to end on an alphanumeric. Hovering
  a Quarto crossref (`@sec-…`, `@fig-…`) also no longer performs a pointless bib lookup.

## [1.54.2] - 2026-07-14

### Fixed

- **Open Folder… no longer resets the current project.** It previously wiped the project
  (folders, name, title bar) and — worse — overwrote the remembered last workspace, so the
  next launch restored the folder instead of the project. Folder and Project are now truly
  independent: with a project open, Open Folder… only changes what the Folder tab browses
  and switches to that tab; the project, its session, and cold-start restore are untouched.
  With no project open, behavior is unchanged (the folder becomes the workspace). One
  nuance: while a project is open the Folder tab isn't file-watched (the watcher follows
  the project's roots) — F5 / Refresh File Tree picks up external changes there.

## [1.54.1] - 2026-07-14

### Fixed

- **Autosave now fires when the editor loses focus inside the window** — clicking into the
  folder tree, project panel, outline, or preview saves the active document. Previously the
  only "focus loss" trigger was the OS *window* blur (Alt-Tab, clicking another app), so
  same-window focus moves silently skipped the save. Implemented as a CodeMirror `blur`
  handler routed through the normal `saveDoc` path, so it respects the dirty/saving guards
  and never touches untitled scratch buffers (no surprise Save As dialog).

## [1.54.0] - 2026-07-13

### Added

- **"Keybindings: Write All Shortcuts to Config"** (command palette) — dumps the complete current
  keymap into `config.toml`'s `[keys]` block and opens it, so every shortcut is listed in one file
  you can edit in place (grouped by category, each line `"Ctrl+…" = "actionName"`). Previously
  `[keys]` only held the bindings you overrode; the defaults lived in code and were visible only via
  F1. Edit any line and save to apply live; delete a line to fall back to the built-in default. The
  write is surgical (replaces just the `[keys]` table, preserving the rest of the config, atomic +
  auto-backed-up) and idempotent — re-running rewrites the table in place rather than duplicating it.

## [1.53.0] - 2026-07-13

### Added

- **The outline pane's side is configurable** via `[outline] position` — `"left"` puts it between
  the file tree and the editor (hugging the text), `"right"` keeps the far-right column past the
  preview (the default). Applies live on config-save; its resizer drags correctly from either side.
  (The config key existed but was previously ignored.)

## [1.52.0] - 2026-07-13

### Added

- **`Ctrl+Alt+P` project quick-switcher** — a dedicated palette (like Ctrl+P for files) that lists
  your projects and opens the one you pick on Enter. Also reachable via the command palette
  ("Project: Quick Switch…").

### Fixed

- **The project switch list no longer shows duplicates**, and two projects that share a name are now
  distinguished by their folder (e.g. `AI — projects` vs `AI — AI`). The list is deduped by path and
  disambiguated by name, shared by both the command palette and the new quick-switcher. (Projects
  are saved as `.wdproj` files; "New Project" puts them in the managed `~/.writedown/projects/`,
  while "Save Project As" can put them anywhere — the switch list merges the managed scan with the
  recent-projects list.)

## [1.51.0] - 2026-07-13

### Changed

- **Spellcheck no longer flags file-extension / dotted-identifier fragments** like `csv` in
  `abc.csv` (or `foo` in `foo.csv`, or interior segments of `a.b.c`). A word glued to a `.` with an
  alphanumeric on the far side is skipped, while a normal word after a sentence period is not.
- **The spellcheck gutter marker is now a small hollow grey ring instead of a loud orange warning
  triangle.** Misspellings are downgraded to the lowest lint severity (which nothing else uses), so
  the quiet ring is spelling-exclusive and never masks a real error/warning on the same line. The
  dotted underline and the suggestion / "add to dictionary" / "ignore" tooltip are unchanged.

## [1.50.0] - 2026-07-13

### Changed

- **Kill-to-end-of-line moved from `Ctrl+K` to `Ctrl+K Ctrl+K`** (Sublime's actual binding), which
  frees the `Ctrl+K` prefix for a chord family. Added defaults: `Ctrl+K Ctrl+Backspace`
  delete-to-line-start, `Ctrl+K Ctrl+U` / `Ctrl+K Ctrl+L` uppercase / lowercase selection,
  `Ctrl+K Ctrl+W` toggle word wrap, `Ctrl+K Ctrl+0` / `Ctrl+K Ctrl+1` unfold-all / fold-all. All are
  remappable (and unbindable) via config `[keys]`, and appear in the F1 help. Plain `Ctrl+K` on its
  own now waits for the second stroke.

## [1.49.0] - 2026-07-13

### Changed

- **The F1 keyboard-shortcuts help is now generated from the live keymap**, so it always reflects
  your actual bindings — including anything you remap or add in config `[keys]` — instead of a
  hand-maintained list that could drift. Each row's tooltip shows the **action name** to type in
  `[keys]`, and a new "More actions (unbound)" section lists every bindable command that has no key
  yet (uppercase, sort lines, fold all, …), so they're discoverable. App-level keys (Save, close
  tab, refresh, F1) remain listed statically since they aren't part of the editor keymap.

## [1.48.0] - 2026-07-13

### Added

- **Editor keybindings are now user-configurable — no rebuild required.** A new `[keys]` table in
  `config.toml` remaps or adds editor bindings; edit it, save, and they apply **live** (the keymap
  lives in a CodeMirror Compartment reconfigured on config-save — selection/undo/scroll preserved).
  Format is `"Ctrl+Shift+K" = "actionName"`, matching how the F1 help displays keys; `""` unbinds a
  default; chords use a space (`"Ctrl+K Ctrl+U" = "upperCase"`). A commented example block ships in
  the default config. Internally this introduces the app's first action-name→command **registry**
  (`commandRegistry.ts`), a friendly-key→CodeMirror translator (`keyFormat.ts`), and a data-driven
  default keymap (`DEFAULT_KEYS`). Unknown actions / bad keys are skipped and surfaced (the rest of
  the keymap still loads). App-level shortcuts (Save, Ctrl+W, palette, F5) remain fixed.
- **Broader Sublime coverage** out of the box: `Ctrl+Shift+K` delete line, `Alt+Left`/`Alt+Right`
  subword motion, `Ctrl+Shift+[` / `Ctrl+Shift+]` fold/unfold. Several more commands ship *bindable*
  (uppercase, lowercase, sort lines, insert-line above/below, fold/unfold all, renumber list) — set
  a key for them in `[keys]`. Chords are supported (Sublime's `Ctrl+K …` prefix would collide with
  the existing plain `Ctrl+K` kill-line, so it's left for you to opt into).

## [1.47.0] - 2026-07-12

### Added

- **Managed projects.** New palette command **"Project: New Project…"** prompts only for a name
  and writes a `.wdproj` under `~/.writedown/projects/` — you're never asked where to save it.
  It seeds the project's folders from whatever's currently open (the open project's folders, else
  the Folder-tab root) and keeps your open tabs, so it names your current workspace rather than
  switching away from it. Name collisions get a numeric suffix (`name-2.wdproj`).
- **Quick-switch lists every managed project.** The command palette now offers a
  "Project: Switch to …" entry for every project in `~/.writedown/projects/` (name-sorted),
  scanned from disk — not just the recent-projects MRU. Legacy `.wdproj` files saved elsewhere
  still appear via the recents list.

### Changed

- Opening a project with no folders no longer errors — an empty managed project is valid; add
  folders afterward via "Project: Add Folder to Project". The `projects` subdirectory is created
  under `~/.writedown/` on launch alongside the other app-state folders.

## [1.46.0] - 2026-07-12

### Added

- **Keyboard-shortcuts help overlay.** Press **F1** (or run "Help: Keyboard Shortcuts" from the
  palette) for a compact, two-column cheat sheet of every binding, grouped by category (Files &
  tabs, Selection & cursors, Editing, Markdown, View, Search, Palette & help). Esc or a backdrop
  click closes it. The list is a single hand-maintained catalog (`src/shortcuts.ts`).

## [1.45.0] - 2026-07-12

### Added

- **Spell check can be toggled without editing config.** New palette entry **"Toggle Spell
  Check"** and a clickable **`Spell: On/Off`** footer indicator (next to Wrap). The launch
  default still comes from `[spelling] enabled`, but the runtime toggle needs no config section —
  so configs predating the spellchecker (which have no `[spelling]` block to flip) can now turn
  it on/off, which is why toggling previously appeared to do nothing.
- **"Ignore Word (this session)"** — a new palette command and lint-tooltip action that
  suppresses a word's squiggle for the current session only, distinct from the permanent
  **"Add to Dictionary"**.

### Fixed

- **Spell-check failures are no longer swallowed silently.** "Add to Dictionary" and the
  dictionary lookup previously caught and discarded all errors, so a failed personal-dictionary
  write looked like a no-op. Failures are now logged and surfaced in the UI, making the reported
  "add word doesn't work" observable and diagnosable.

## [1.44.0] - 2026-07-12

### Added

- **Markdown emphasis shortcuts.** `Ctrl+B` wraps the selection in `**bold**`, `Ctrl+I` in
  `*italic*` — press again to remove the markers (a true toggle). Both are multi-cursor aware,
  land as a single undo step, and with no selection drop the caret between the markers ready to
  type. Also available from the command palette ("Bold" / "Italic").
- **`Ctrl+K` kills to end of line** (emacs / Sublime-style delete-to-line-end).

### Changed

- **Build (Render Document) moved from `Ctrl+B` to `Ctrl+Shift+B`** to free `Ctrl+B` for bold —
  matching Sublime Text, where the build key is `Ctrl+Shift+B`. The palette "Render Document"
  entry is unchanged.

## [1.43.0] - 2026-07-12

### Added

- **Word wrap can be toggled on/off.** New command-palette entry **"Toggle Word Wrap"** and a
  clickable **`Wrap: On/Off`** indicator in the footer status bar (bottom-right). The toggle is
  session-only; the launch default comes from the `[editor] word_wrap` config key — which was
  present in the default config but previously ignored, and is now actually honored. Wrapping is
  reconfigured live through a CodeMirror **Compartment** (the app's first), so toggling never
  rebuilds the editor — selection, undo history, and scroll position are all preserved.

### Changed

- Footer status items on the right are now `·`-separated, and the wrap indicator is the first of
  a small family of clickable session-state toggles.

## [1.42.2] - 2026-07-12

### Fixed

- **The `Ctrl+Alt+Shift+T` shortcut for "Reformat Markdown Table(s)" now fires.** The command
  always worked from the palette but its keybinding silently did nothing: on Windows, WebView2
  treats `Ctrl+Alt` as `AltGr`, which prevents CodeMirror's editor keymap from matching
  `Ctrl+Alt+Shift+<letter>` chords. Added an app-level fallback that catches the combo by
  physical key code (immune to AltGr character remapping) and runs the reformatter against the
  active Markdown view. The palette entry is unchanged, and there's no double-format (the
  editor keymap still marks the event handled when it does fire).

## [1.42.1] - 2026-07-12

### Fixed

- **The file tree no longer folds up (and no longer jumps to the top) after New File, New
  Folder, Rename, or Delete.** Those operations remount the tree, which previously discarded
  every folder's expanded/collapsed state — deeply-nested work would collapse to the root on
  each edit. Expanded folders are now tracked in the store (keyed by path, not by React mount
  identity), so a remount restores exactly which folders were open; a store-restored folder
  lazily re-lists its children on mount. The tree-body scroll offset is likewise recorded and
  restored across the remount (re-applied over a few animation frames while nested subtrees
  finish listing). Applies to both the Folder and Project panels.

## [1.42.0] - 2026-07-11

### Added

- **The editor|preview splitter is now draggable.** In split view, a divider between the editor
  and preview panes lets you set their relative width (previously fixed at 50/50). It reuses the
  same resize handle as the tree/outline panes, clamps to a readable 20–80%, and the ratio is
  **remembered per workspace** (a new nullable `split_ratio` session field — old sessions default
  to 50/50). The divider only appears in split view (not editor-only or preview-only). CodeMirror
  reflows on its own and preview scroll-sync is unaffected.

## [1.41.0] - 2026-07-11

### Changed

- **The Folder panel is now a proper file explorer rooted at one folder, cleanly separate from
  Projects.** Two changes: (1) the folder itself is shown as the top, collapsible node — you
  browse "from the root on down" (previously it listed the root's contents flat, with no root
  header). (2) The Folder tab is **decoupled from projects**: opening a project no longer makes
  the Folder tab mirror the project's first folder. Internally, `root` stays the operational
  anchor (where new files, quick-open, save-as, and watching are rooted) while a new `folderRoot`
  drives only the Folder tab's display — so the two tabs are independent. Add-folder remains a
  Project-only action, as before; no palette commands were removed. (The soft external-change
  refresh still updates the tree in place without collapsing your expanded folders.)

## [1.40.0] - 2026-07-11

### Added

- **Syntax highlighting for fenced code blocks in the preview** (both the live Preview pane and
  the Rendered tab), colored to **match the editor's Sublime scheme exactly**. Previously code
  blocks rendered as plain monospace — markdown-it had no highlighter wired in. Now the preview
  reuses the *same* CodeMirror `HighlightStyle` instance and the *same* Lezer parsers the editor
  uses, so a `python`/`json`/`rust`/… block looks identical in the preview and the editor, and
  switching color schemes recolors both in lockstep. **No new dependency and no startup cost** —
  it's built entirely from what already ships; grammars load on demand (their own lazy chunks,
  exactly like the editor). Quarto cells (` ```{python} `, ` ```{r, echo=FALSE} `) resolve like
  the editor does; ` ```mermaid ` blocks still render as diagrams (never token-highlighted);
  unknown languages, oversized blocks, or a parser that fails to load simply stay plain text —
  the preview never breaks. Highlighting runs after the sanitizer, so nothing about the security
  model changes.

## [1.39.1] - 2026-07-10

### Fixed

- **Production build (`tauri build`) no longer fails on the inline `<style>` in `index.html`.**
  The custom build `root` in `vite.config.ts` used `realpathSync`, which preserves the cwd's
  drive/segment casing (e.g. `c:\users\…` when launched from the `C:\S` junction / a
  lowercase-drive shell). Vite resolves `index.html` to its OS-canonical casing (`C:\Users\…`),
  so the two disagreed and Vite's `html-inline-proxy` plugin couldn't find the inline-CSS module
  for the launch `<style>` block — `No matching HTML proxy module found`. Switched to
  `realpathSync.native`, which returns the true on-disk casing (still fully junction-resolved),
  so `root` and the module ids match. Latent since the inline `<style>` was added in 1.38.1;
  surfaced on the first production build since. Dev is unaffected (`root` is build-only).

## [1.39.0] - 2026-07-10

### Added

- **Prose spellchecker** (English US, fully offline). Misspelled *prose* words get a quiet
  dotted underline (deliberately less shouty than the red citation-error line) with one-click
  suggestions and an **Add to dictionary** action; a palette command **Add Word to Dictionary**
  does the same from the keyboard. It is **structure-aware** — code, fenced/inline code,
  `{python}` cells, LaTeX math (`$…$`, `$$…$$`), YAML front matter, citation keys (`@key`,
  `[@key]`, `@fig-…`), URLs, emails, and raw HTML are all skipped, so the only things flagged
  are real words in real prose. Acronyms (`PDF`), camelCase/identifiers (`CodeMirror`), and
  words with digits (`utf8`) are ignored too. It reuses the existing lint pipeline (same gutter
  and ½s-idle debounce as the Python/label and citation checks), so there is no new machinery
  on screen. The dictionary is the pure-Rust `spellbook` engine over the SCOWL-derived en_US
  Hunspell word list, **embedded in the binary** — no external Python, no network, nothing to
  install or resolve. Words you add live in an ordinary plain-text file you own
  (`%APPDATA%\com.mynl.writedown\personal-dictionary.txt` by default; point
  `[spelling] personal_dictionary` at a synced folder to carry them across machines) — never in
  the disposable `~/.writedown/` tree, so they can't be lost. Toggle the whole feature with
  `[spelling] enabled` in `config.toml` (default on) — it re-applies live on save, no restart.

## [1.38.1] - 2026-07-10

### Fixed

- **No white flash on launch.** The window used to appear white for a beat before the dark
  theme painted. `index.html` now sets `color-scheme` and a themed background inline (so
  WebView2's first paint follows the OS theme before the CSS bundle loads), and the Tauri
  window sets `backgroundColor` (so the native surface is dark during the compositing gap
  when the window is revealed). Cold start now comes up already themed.

## [1.38.0] - 2026-07-10

### Added

- **Mermaid diagrams** in the preview. ` ```mermaid ` and Quarto ` ```{mermaid} ` blocks
  render to SVG in both the live Preview and the Rendered tab, following the OS light/dark
  theme, offline. A diagram with a syntax error shows the error and its source rather than
  blanking or crashing the preview. Mermaid is **lazy-loaded** (dynamic `import()`): the
  ~2.8 MB library loads only when a document actually contains a diagram — as its own
  chunk — so app startup and the base bundle are unaffected; you pay it once per session
  on the first diagram. Rendered SVG is cached by theme+source so editing around an
  unchanged diagram doesn't re-run it.

## [1.37.0] - 2026-07-10

### Added

- **Basic image attributes** `{width=… #id .class}`. `![cap](img.png){width=50% #fig-1}`
  now sizes and labels the image in both the live Preview and the Rendered tab, in **any**
  token order (`{#fig-1 width=50%}` works too). `width`/`height` accept pixels (`300`) or a
  percentage (`50%`); `#id` becomes the crossref anchor (so `@fig-1` links resolve and
  number); `.class` is applied. Deliberately narrow: only standard HTML attributes survive
  (Quarto's semantic ones like `fig-align`, columns, and layouts are ignored, not honored —
  see README "Limitations"). Implemented without a new dependency — a small post-render
  pass in the preview applies the attributes, and the Rust renderer's label detection is
  now order-independent.

## [1.36.2] - 2026-07-09

### Fixed

- **Absolute Windows image paths now display** (`![](C:/tmp/pic.png)`, `![](c:\tmp\pic.png)`,
  UNC). The 1.36.1 attempt was insufficient: the failure happened *before* the path
  rewrite ran. DOMPurify's `IS_ALLOWED_URI` rejects a bare drive letter (`c:` reads as an
  unknown URL scheme) and stripped the `src` during sanitize — which ran ahead of the
  rewrite — so neither slash direction ever reached it. The rewrite now runs **before**
  sanitize (DOMPurify then sees an allowed `http://asset.localhost/…` URL), and the src is
  percent-decoded first so markdown-it's `\`→`%5C` encoding is recognized (this also fixes
  relative paths containing spaces). Relative `img/…` paths and `data:` figure URIs are
  unaffected.

## [1.36.1] - 2026-07-09

### Fixed

- **Tab strip no longer jumps when a file opens.** Single-clicking a file (a preview tab)
  could render that one tab taller than its siblings and drag the whole strip up until the
  next edit reflowed it. The strip is now pinned to a fixed height (the configured
  `[tabs] height`) rather than a min-height, individual tabs clip overflow, and the tab
  name has a fixed line-height — so no tab, however it transiently renders at mount, can
  grow or jog the row. (The earlier 1.36.0 "very tall editor" fix addressed a different
  element — the editor pane — and is retained.)
- **Absolute Windows image paths now display in the preview.** `![](C:/tmp/pic.png)` and
  other drive-letter / UNC paths were skipped because a bare drive letter (`C:`) looks
  exactly like a URL scheme and was treated as an external link. Absolute paths are now
  detected before the scheme check and routed through the asset protocol like relative
  ones. (Relative `img/…` paths were already working.)

## [1.36.0] - 2026-07-09

### Added

- **Relative images render in the preview.** `![](img/diagram.png)` and other
  document-relative image paths now resolve and display in both the live *Preview* and the
  *Rendered* tab. The path is resolved against the open document's folder and loaded
  straight off disk through Tauri's asset protocol — no temp files, no copies; the image
  file is only ever read, never touched. The asset protocol is enabled with a broad
  (`**`) scope: this is a local, single-user editor and images can live anywhere relative
  to a document, so guessing a tighter scope would just break legitimate references.
  Absolute URLs, `data:`/`blob:` URIs, and absolute paths are left untouched; `.`/`..`
  segments in a relative path are resolved before loading.

### Fixed

- **"Add Folder to Project" no longer drags in the currently-open folder.** It now adds
  exactly the folder you pick — first add gives a one-folder project, a second gives two,
  and so on. (Turning your open folder into a project is still available deliberately via
  *Save Project As*.)
- **Single-click (preview) opens no longer render the editor at full height.** A freshly
  opened preview tab could mount CodeMirror before its container height had resolved, so
  it rendered at full content height and only snapped to the right size on the first
  edit. The editor now fills its pane via absolute positioning, giving it a definite box
  on the first layout pass.
- **Quarto cross-references are no longer flagged as missing citations.** `@sec-…`,
  `@fig-…`, `@tbl-…`, `@eq-…`, and the theorem-family prefixes (`lst/thm/lem/cor/prp/cnj/
  def/exm/exr/sol/rem-`) are document crossrefs, not bibliography keys, so they're
  excluded from the "not found in the bibliography" underline.
- **The Rendered tab falls back to Preview when there's nothing rendered.** Switching to a
  document you haven't rendered no longer shows the empty "No render yet" panel — it shows
  the live Preview, and the Rendered tab is disabled until a render exists (a render in
  flight still shows "Rendering…").

## [1.35.0] - 2026-07-08

### Added

- **Ctrl+B renders the document** — Sublime's Build key, and Render Document is this
  app's build. Bound in the editor keymap and at the app level, so it works with editor,
  tree, or preview focus; the Rendered pane's empty state points at it. The palette
  entry stays. (Deliberately not `Ctrl+K Ctrl+B` — that chord is ST's toggle-side-bar,
  which would fight muscle memory and is worth keeping for its ST meaning if a sidebar
  toggle ever lands. `Ctrl+B` was free everywhere: CodeMirror only binds it on macOS.)

## [1.34.0] - 2026-07-08

### Added

- **Python cell execution** (stage 2 of the fast qmd render plan). Render Document now
  runs `{python}` cells through a **persistent python sidecar** and splices the output —
  stdout, last-expression value (`_repr_html_` for pandas tables, else `repr`), stderr,
  matplotlib figures, tracebacks — into the rendered document. No jupyter, no temp
  `.qmd`; the only external dependency is the interpreter named in config:

  ```toml
  [render]
  python = "C:/Users/you/miniconda3/envs/work/python.exe"
  ```

  (`timeout_seconds = 30`, `figure_format = "png"|"svg"`, `figure_dpi = 150` also
  available; new installs get the section with `python = ""`. Existing configs are never
  rewritten — add the lines by hand.)
  - **Persistent process, fresh namespace.** The kernel survives across renders so
    imports are paid once (first render ~1–2 s with heavy imports, then fast); each
    render resets the namespace and runs cells top-to-bottom, so results are always a
    deterministic clean run. The runner is a ~150-line JSON-lines script (embedded,
    written to the disposable `~/.writedown/cache/`), not the Jupyter protocol. It runs
    with `MPLBACKEND=Agg`, no console window, and chdir to the document's folder so
    relative `pd.read_csv("data.csv")` works like Quarto.
  - **Figures never touch disk** — collected per cell as base64 data URIs, with anchor,
    "Figure N" numbering, and caption from `#| label` / `#| fig-cap`.
  - **Cell options honored**: `eval: false` (show, don't run), `echo: false` (run, hide
    source), `output: false`, `include: false`; `%magic`/`!shell`/`?help` lines are
    blanked, not errors.
  - **Errors surfaced, never swallowed**: an exception renders a red traceback block
    with the **document** line number (cell-relative frames mapped back through the
    splitter); later cells still run. A cell exceeding the timeout kills the kernel —
    the cell reports "timed out — kernel restarted", remaining cells show "not run",
    and the next render starts clean. **Restart Python Kernel** (palette) is the manual
    version, doubling as the Windows interrupt. The kernel dies with the app (run-event
    hook + stdin-EOF backstop in the runner — no orphan pythons).
  - With no python configured everything else still works: cells render as source with
    a one-line notice, citations/crossrefs/references unaffected.
  - Kernel protocol covered by integration tests (run `cargo test -- --ignored` with a
    real interpreter): stdout, last-expr repr, namespace reset vs. surviving imports,
    error-line mapping, figure round-trip, timeout→kill.

## [1.33.0] - 2026-07-08

### Added

- **Rendered tab + fast markdown render pipeline** (stage 1 of the fast qmd render plan;
  python execution follows in 1.34.0). The preview column now has explicit
  **Preview | Rendered** tabs (same quiet chrome as Folder | Project). The palette command
  **Render Document** runs the live buffer through a new in-process Rust pipeline — no
  pandoc, no quarto, no temp files, nothing written to disk — and shows the expanded
  markdown through the existing preview (KaTeX, DOMPurify, scroll sync come along free):
  - **Citations resolved against the bibliography index.** In-text `@key` →
    `Mildenhall and Major (2022)` linked to its References entry; bracketed groups
    `[see @a, p. 7; @b]` → `(see Mildenhall 2022, p. 7; Smith 2020)` with prefix/suffix
    text kept; `-@key` suppresses the author. Unknown keys get a red dotted
    `cite-missing` underline. Matching mirrors the editor's citation regex (same corpus
    tested on both sides); `@` inside inline code or fenced blocks is ignored.
  - **Generated References section** — APA-like approximation from the parsed `.bib`
    (not citeproc), sorted by author, each entry anchored so citation links jump to it.
    Clicking a `#anchor` link now scrolls within the preview (external links still open
    in the browser; all other navigation stays suppressed). A document front-matter
    `bibliography:` overrides the default file for that render (parsed on demand, cached
    by path+mtime); front matter itself is only read, never touched.
  - **Quarto crossrefs numbered** in document order per family: `@fig-x` → `Figure 1`,
    `@tbl-x` → `Table 1`, `@eq-x` → `Equation 1`, `@sec-x` → `§ Heading Text`, each a
    link. Heading attrs `## Title {#sec-x}` become real anchors instead of rendering as
    literal `{#sec-x}` text; prose attrs (e.g. on images) become anchors too.
  - **Code cells shown as source** in this stage: `{python}` cells render as plain
    fences with `#|` option lines stripped (Quarto behavior); `{r}`/`{julia}`/… likewise
    and are never run. Cell options (`eval`/`echo`/`include`/`output`/`label`/`fig-cap`)
    are parsed now, honored by execution splicing in 1.34.
  - **Rendered view is a static snapshot** with a status strip: ✓/✗, cell count, elapsed
    time, render time, and a **Stale** badge once the buffer diverges from the rendered
    source. A summary line (plus warnings, e.g. "bibliography not loaded") heads the
    output. Render runs async off the UI thread; invoking it from editor-only view
    switches to split so the result is visible. No dedicated key binding — palette only.

### Changed

- `BibEntry` now keeps the cleaned verbatim author/editor field (`authors_full`) for
  References formatting; the short form still drives autocomplete and hover.

## [1.32.0] - 2026-07-08

### Added

- **No-flash startup.** The window is now created hidden and revealed only once it has
  been restored to its last position/size and painted, so launch no longer shows a
  default-size frame that visibly jumps and fills in. (Chosen over a splash screen — a
  splash is a second window that hides the jump rather than removing it.)
- **Join Lines** — `Ctrl+Shift+J` (Sublime-style). Joins the current line with the next,
  or collapses a multi-line selection into one; the seam becomes a single space and the
  lower line's indentation is dropped.
- **Renumber Ordered List** — command palette (`Ctrl+Shift+P` → “Renumber Ordered List”).
  Renumbers the ordered list around the cursor (or the ordered items in a selection).
  Each indent level is numbered independently and restarts under a deeper level; the first
  item keeps its written start number (a list beginning at 3 stays 3, 4, 5…); `.` vs `)`
  is preserved. Bullets and continuation lines are untouched. Markdown/Quarto only.
- **Reformat Markdown Table(s)** — `Ctrl+Alt+Shift+T` (or palette). Aligns GFM pipe tables:
  pads columns to an even width and rebuilds the delimiter row, **preserving alignment
  markers** (`:--`, `:-:`, `--:`). With no selection it formats every table in the
  document; with a selection, just the tables it touches. Honors `\|` escapes and inline
  `` `code` `` spans, and skips tables inside fenced code blocks. (v1: no CJK
  double-width accounting.)
- **Front-matter block styling.** The YAML `---` … `---` header now sits in a subtle
  tinted band with a hairline rule top and bottom, so it reads as a distinct properties
  block. Purely visual — the front matter text is never touched (spec §2, §8).

## [1.31.1] - 2026-07-08

### Fixed

- **Numbered-list editing crash.** Editing a Markdown numbered list could throw
  `No tile at position N` from CodeMirror's view layer, leaving the editor in a stale/broken
  state. Root cause was a tile-tree corruption bug in `@codemirror/view` 6.43.5 triggered by
  zero-length content updates (exactly the tiny transactions list editing produces —
  Enter-continuation, marker renumbering, idle linter re-dispatch). Fixed upstream in
  **6.43.6** (2026-07-06); bumped our pin to `~6.43.6`. In-range patch bump, not a downgrade —
  the tile architecture is being actively crash-patched (6.43.3 / 6.43.4 / 6.43.6 are all
  tile-tree fixes), so staying current on the 6.43.x line is the right posture.

## [1.31.0] - 2026-07-08

### Added

- **Unmatched citation check.** A `@key` written in prose that has no entry in the loaded
  BibTeX file now gets a red underline + gutter marker (same lint channel as the Python-cell
  errors), auto after ~½s idle. Prose-only — `@` inside code, fenced blocks, or YAML front
  matter is ignored, as are email-like `foo@bar`. Stays silent when no bibliography is loaded
  so a missing `.bib` never makes every citation look broken.
- **File-tree context menu** (right-click, Folder and Project columns): **New File…**,
  **New Folder…** (created inside the clicked folder, or beside the clicked file),
  **Rename…**, **Delete**, plus **Save** / **Save As…** for the active document. Delete moves
  the file/folder to the **Recycle Bin** (recoverable — never a hard delete), after a confirm.
  Rename rebinds any open tab (and tabs under a renamed folder). Both are explicit user
  commands — Writedown still never touches your files on its own (spec §2, §8).
- **Thin, ST-style tabs** — new `[tabs]` config section with `height` and `width` (px) to
  size the document tab strip. (`[editor] tab_size` is unchanged — that's the editor indent,
  a separate thing.)

### Changed

- Editor `EditorSettings` now also carries the `[tabs]` sizing; the tab strip reads it via
  CSS variables (`--tab-height` / `--tab-width`).

## [1.30.0] - 2026-07-08

### Added

- **Config parse errors are surfaced.** A malformed `config.toml` used to silently revert
  every font (and the bibliography) to defaults with only a stderr line. Now a full-width
  amber bar appears above the panes with the parse error and click-to-edit.
- **Editor font zoom** — Ctrl+= / Ctrl+- / Ctrl+0 (reset). A live overlay on the configured
  size, persisted in `localStorage` (global, survives restarts). It deliberately does **not**
  rewrite your config. **"Set Current Editor Size as Default"** (command palette) bakes the
  current zoomed size into `[editor] font_size` with a surgical, comment-preserving edit —
  the one time we write your config, and only on that explicit command.
- **Per-panel `font_weight`** for `[editor]`, `[outline]`, `[tree]` — a CSS weight
  (`"light"`/`"normal"`/`"bold"` or 100–900).
- **Configurable TOC guide lines** — `[outline] guide_color` (any CSS color) or
  `guide_opacity` (0–1 on a neutral gray); default strengthened.
- **New Scratch File (unsaved)** — an in-memory `Untitled-N.md`, never autosaved or session-
  persisted; Ctrl+S / "Save As…" promotes it to a real file via a native dialog.
- **Save As…** for any document.

### Changed

- **Outline** now draws faint per-level tree guide lines.
- **Focus lands in the editor** after New File / New Scratch / Save As (was staying on the tree).

## [1.29.0] - 2026-07-08

### Added

- **Backup-before-overwrite safety net (job 1: never lose content).** Every save now
  copies the version it's about to replace into `~/.writedown/backups/<path-key>/`
  (last 20 per file, auto-pruned) before writing. It's derived/disposable, lives off the
  synced tree, and never moves or renames a user file — only copies one out as a net.
- **Previous Versions… command** (Ctrl+Shift+P). Lists a file's retained versions
  (timestamp, size, one-line preview), newest first. Restoring loads the chosen version
  into the editor as an *unsaved* change — you review it and save (or discard)
  deliberately, and the state you restored over is itself backed up on the next save.
  Never a silent disk clobber.

### Changed

- **Autosave is now ST-style: Ctrl+S, window blur, and tab switch** (leaving a tab counts
  as losing focus on it). Removed the idle timer — no more silent mid-edit writes. The new
  backup net covers the safety the timer used to provide.
- **Removed the `Open…` button** from the file-panel header. Open a folder via
  Ctrl+Shift+P → "Open Folder…".

## [1.28.1] - 2026-07-08

### Fixed

- **Editor no longer crashes to the fatal dialog on a transient view-layer error.**
  CodeMirror's new tile-based renderer (`@codemirror/view` 6.43.x) can throw a
  self-healing `No tile at position N` during a measure/scroll after certain edits —
  e.g. editing a list shorter, then clicking, leaves a stale measure targeting a
  position past the shrunk document. That throw reached React's commit phase and tripped
  the app-level "Writedown hit an error" screen. A new `EditorBoundary` now catches it
  and **remounts the editor** — a fresh view rebuilds from the in-memory content and
  re-measures cleanly, losing nothing but a transient scroll position. Repeated crashes
  in quick succession still surface the real dialog rather than looping invisibly. Pinned
  `@codemirror/view` to `~6.43.5` so we don't float further onto the still-stabilizing
  tile layer without a deliberate upgrade.

## [1.28.0] - 2026-07-07

### Added

- **`[tree]` font config** — the left file/project panel now has its own
  `font_family`/`font_size` in `config.toml`, alongside `[editor]` and `[outline]`.

### Changed

- **Quieter, ST-style chrome** (first pass; fine-tuning continues interactively): thin
  tabs (26px, 11.5px font), small-caps muted pane headers, denser tree rows with an 11.5px
  default sidebar font, 22px status bar in the UI font. Anything that is not document text
  is smaller and in the background. Deliberate not-ST tells kept: colored folder/file
  glyphs in the tree, the accent bar on the active tab, and the version in the footer.

## [1.27.0] - 2026-07-07

### Added

- **Sublime-style projects.** A project is a named set of folder roots in a small,
  human-readable `.wdproj` JSON file you save wherever you like. Palette commands:
  **Add Folder to Project…** (starts a project from the current folder if none),
  **Save Project As…**, **Open Project…**, **Close Project**, and **Switch to "name"** —
  one entry per recent project (MRU of 10, kept in `~/.writedown/recent-projects.json`).
  Quick-open (Ctrl+P) spans every project folder (paths prefixed by folder name); all
  folders are watched for external changes; tabs/session are remembered per project; the
  window title shows the project name, ST-style.
- **Folder / Project tabs** at the top of the left panel — Folder is the classic
  single-root view, Project lists every project folder as a collapsible root.

## [1.26.0] - 2026-07-07

### Added

- **Outlines for Python, TOML, and YAML** — the right-hand pane now shows `class`/`def`
  structure for `.py` (top level + one nesting: methods), `[section]`/`[a.b]` tables for
  `.toml`, and mapping keys (two levels) for `.yaml`/`.yml`. Any node with more than 30
  direct children has its descendants dropped — an outline is a summary, not a mirror.
- **New File… / New Folder…** in the command palette — type a path relative to the
  workspace (missing parent folders are created), the tree refreshes, and a new file opens
  ready to edit. Never overwrites an existing file.
- **Window geometry is remembered** — position, size, and maximized state restore on
  launch (`tauri-plugin-window-state`). Pane widths were already saved per workspace.

### Changed

- **Outline click scrolls the section near the top** when the target is below the viewport
  midpoint (or off-screen above) — clicking a heading means "show me this section", not
  "reveal one line at the bottom".

## [1.25.0] - 2026-07-07

### Added

- **Fast document checks** for `.md`/`.qmd`, running automatically ~½s after you stop
  typing, shown as squiggles + gutter markers (hover for the message):
  - **Python syntax check** of every ` ```{python} ` cell — unbalanced brackets, bad
    indentation, missing colons, unterminated strings — with errors mapped to document
    lines. Parsing is `rustpython-parser` compiled into the app: no external Python, no
    environment, works offline. Syntax only (no undefined-name/import checking); IPython
    magics (`%`, `!`, `?`) are skipped; first error per cell (as Python itself reports).
  - **Duplicate Quarto label detection** — `#| label:` cell options and `{#sec-x}`-style
    attributes; a label used twice is flagged at *every* occurrence with the other line
    numbers (duplicates silently corrupt cross-references).

## [1.24.0] - 2026-07-07

### Removed

- **The Quarto render feature** (Ctrl+Shift+Q, result panel, `[quarto]` config, opener
  capability) — removed at the author's decision: environment/config coupling made it more
  trouble than it was worth. `.qmd` editing, `{python}` cell highlighting, math, preview,
  and all BibTeX features are unaffected. A stray `[quarto]` section left in an existing
  `config.toml` is harmless (nothing reads it).

## [1.23.9] - 2026-07-07

### Fixed

- **"Open output" after a Quarto render did nothing.** The opener plugin's path scope
  silently denied every path (`Not allowed to open path …` — caught by the new error log).
  Opening now goes through a small Rust command (`cmd start`), which cannot be scope-blocked;
  the button is relabeled **Open in browser** to say what it does.

## [1.23.8] - 2026-07-07

### Added

- **Render log names the governing config.** The first line of every Quarto render now
  states which `_quarto.yml` Quarto will apply (or "standalone render" when none exists
  above the file). A `_quarto.yml` sitting anywhere in or above the file's folder silently
  reshapes the whole render — title-prefix, css, includes, `output-dir` — and this was the
  root cause of the mystery "unable to open file static/load-app.html" failure: a copy of a
  blog's `_quarto.yml` sat next to the test file. Now the panel says so up front.

## [1.23.7] - 2026-07-07

### Added

- **Live Quarto render progress** — the panel streams each output line as it happens (was:
  the whole log only at the end) and auto-scrolls to the newest line.
- **Prominent render errors** — on failure the panel hoists the key lines (ERROR / FATAL /
  "unable to open file" / traceback) into a red banner above the full log, so a buried
  failure is obvious at a glance.

### Changed

- **Quarto renders from the project root** — Writedown walks up to the enclosing
  `_quarto.yml`/`_quarto.yaml` and runs quarto there, so project-relative resources
  (`static/…`, `styles.css`, `include-in-header`) resolve. Standalone files with no
  enclosing project still render from their own folder. The output path is read from
  Quarto's "Output created:" line (honors `output-dir`, e.g. `docs/`).

## [1.23.6] - 2026-07-07

### Fixed

- **`npm run tauri dev` crashed** in vite's dependency optimizer ("Cannot read properties of
  undefined") after the 1.23.5 root change. The resolved-real-path `root` is now applied only
  for `build` (where the `C:\S` junction needs it); `serve` uses the default root, which the
  dev optimizer requires. Dev and build both work from the junction.

## [1.23.5] - 2026-07-07

### Fixed

- **`npm run tauri build` failed** when the project was accessed via the `C:\S` junction —
  vite resolved `index.html` to its real path but kept `root` as the junction, emitting a
  cross-path asset name rollup rejected. Vite's `root` is now the resolved real path, so
  production builds work from the junction too.

## [1.23.4] - 2026-07-07

### Changed

- **Quarto render now runs in PowerShell (pwsh) with your profile loaded** (was `cmd`), so
  your conda/env setup — including the `conda` function — is available; a bare
  `conda run -n <env> quarto render "{file}"` in `[quarto] command` now works. The command
  is written to a temp script and run with `pwsh -File`, sidestepping shell-quoting. Render
  is one-time (`quarto render`), never a preview server.

## [1.23.3] - 2026-07-07

### Added

- **Configurable Quarto command** — `[quarto] command` in `config.toml` (with a `{file}`
  placeholder), so you can render inside the environment that actually has Python/Quarto,
  e.g. `command = "conda run -n working313 quarto render \"{file}\""`. Fixes Quarto's
  "Python was not found" when the app's PATH lacks your conda/venv.

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
