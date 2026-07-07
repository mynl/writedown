# human-hints

Very high-level running summary of discussions and decisions in this project.
Newest first. (Kept current at the close of each working session — see CLAUDE.md.)

## 2026-07-07 — Quarto: project-root CWD, live log, error banner (1.23.7)

- Steve's `static/load-app.html` FATAL: his "standalone" test file was physically INSIDE the
  ConvexConsiderations tree, so **Quarto auto-detected its `_quarto.yml`** (`include-in-header:
  static/load-app.html`, relative to project root) and applied the whole project. Render from
  the file's subdir → static/ not found. PROVEN: rendering `index.qmd` at the project root
  SUCCEEDS. This is **Quarto's** project auto-detection (walks up for `_quarto.yml`), NOT
  Writedown — not overridable per render; a truly standalone file must live OUTSIDE any
  `_quarto.yml` tree (`C:\tmp\wdq\clean.qmd` rendered fine standalone).
- Fixes (1.23.7): (1) run quarto from `project_root()` (walk up for `_quarto.y[a]ml`) so
  project resources resolve; (2) STREAM stdout/stderr line-by-line → `quarto-log` events →
  live panel + autoscroll (quarto.rs spawn+2 threads+emit; App listener; store
  quartoLog/appendQuartoLog); (3) error banner in QuartoPanel hoisting ERROR/FATAL/unable-to-
  open lines; (4) `output_file` parsed from "Output created:" (honors output-dir like docs/).
- Still on Quarto per Steve's "do NOT carry on to 1.24 until fixed". 1.24 (ST multi-folder,
  design Q&A) still queued.

## 2026-07-07 — Quarto WORKS + tauri-build junction fix (1.23.5)

- **WinError 5 FIXED by pwsh+profile** (1.23.4): Steve's render got "Starting python3
  kernel...Done", "Cell 1/1...Done". Remaining Quarto error was a `WalkError` on
  `features/test_files/client` — a stray file in HIS test project (Quarto walks it as a
  dir), NOT Writedown. Told him to render a clean qmd / remove test_files.
- **1.23.5 tauri-build fix**: `npm run tauri build` failed ONLY when run from the `C:\S`
  junction path (works from real path). vite resolved index.html to real path but kept
  `root` as the junction → cross-path asset name rollup rejected. Fix: `vite.config.ts`
  `root = realpathSync(process.cwd())`. Verified build from C:\S now succeeds.
- Quarto integration is DONE/working. Ready for **1.24 ST multi-folder — design Q&A**.

## 2026-07-07 — 1.23.4: Quarto via pwsh + profile (not cmd)

- Steve: "why cmd? use pwsh." + bare `conda` is a PS alias (Invoke-Conda), invisible to cmd.
- Render now runs via **pwsh -NoLogo -ExecutionPolicy Bypass -File <tempscript>** (write
  cmdline to temp .ps1 → no quoting hell). Verified `pwsh -File` LOADS profile → bare
  `conda run -n working313 quarto --version` → 1.6.36. find_quarto uses pwsh too.
- Config can now be bare `conda run -n working313 quarto render "{file}"`.
- Confirmed: render = one-time `quarto render` (NOT preview).
- **OUTSTANDING**: WinError 5 (Access denied) on jupyter's nested python subprocess spawn —
  process-context/job issue under GUI launch (npm tauri dev). pwsh+profile MIGHT fix (fuller
  env). If not: production build (no npm job) OR CREATE_BREAKAWAY_FROM_JOB. Steve to test.
- Then: 1.24 ST multi-folder (design Q&A first).

## 2026-07-07 — 1.23.3: configurable Quarto command (env/Python)

- **Delete stale-view bug: CONFIRMED FIXED by Steve** (bounded math regex + StrictMode
  removal, 1.23.2).
- Quarto ran but `.qmd` python cells failed: "Python was not found" — Writedown's PATH lacks
  Steve's conda env (working313). Fix: **`[quarto] command` in config.toml** with `{file}`
  placeholder; `quarto.rs::quarto_command()` reads it (default `quarto render "{file}"`).
  Steve sets `conda run -n working313 quarto render "{file}"`. Quick alt: launch `tauri dev`
  from an activated env (inherits PATH). render_with_quarto now takes AppHandle.
- Next: **1.24 ST multi-folder project — DESIGN Q&A first.**

## 2026-07-07 — 1.23.2: stale-view-after-delete hardening + probe

- Steve's precise repro: test.qmd, select bottom→line-above-title, delete → CM **view**
  stale (lines shown, no line numbers) but STATE + DISK correct. 1.23.1's try/catch turned
  the earlier blank-crash into this stale-view → a decoration was stalling the CM update.
- Best-effort fixes (couldn't repro headless): (1) **bounded math regexes** (display
  `{0,4000}?`, inline `[^$\n]{1,240}?`, alternation-free → can't ReDoS/stall); (2) **removed
  React StrictMode** (dev double-mount desyncs @uiw/CodeMirror); (3) **EditorView.exceptionSink**
  → `logError` → `~/.writedown/logs/writedown.log`.
- NOT root-caused with certainty. If it recurs → get the log line from Steve. If it persists,
  next step is replacing @uiw/react-codemirror with a thin raw-CM wrapper (full control of the
  view lifecycle).

## 2026-07-07 — 1.23.1: BIG bib parser fix + crash resilience + telemetry

- **Bib parser bug (systemic)**: entry-body brace reader counted `(`/`)` as depth → an
  unbalanced `(` in a value (Bauer2011 `booktitle = {{… (March …}}`) swallowed **2536 of
  7160** entries (incl. Delbaen2006a). FIX: count only the entry's opening delimiter
  (braces). Diagnosed with a throwaway test on the real bib (`C:/S/TELOS/Biblio/
  uber-library.bib`) → now 7160/7160. Added a regression unit test.
- **Crash resilience / telemetry** (Steve: "do you have telemetry?"): `ErrorBoundary`
  (src/ErrorBoundary.tsx) + window error/unhandledrejection handlers (main.tsx) →
  `log_error` command → `~/.writedown/logs/writedown.log`. Wrapped math/csv decoration
  build() in try/catch (a decoration throw was the likely cause of "everything died on
  delete"). Next crash gets logged + shown, not blank.
- **closeBrackets: false** — stops `@'`→`''` + prose auto-close.
- Steve's crash (copy tab → switch → select → delete → blank) NOT root-caused; boundary/log
  will capture it. Tell him to check the log if it recurs.
- Still open: below-list citation detail panel (CM can't do it natively). Then **1.24 ST
  multi-folder (design Q&A first)**, **1.25 visual polish via tauri-dev HMR loop**.

## 2026-07-07 — 1.23.0: Quarto render + @ polish

- View toggle Ctrl+Shift+V → **Ctrl+Shift+L** (Joplin). Reclaimed from Sublime split-into-
  lines (now UNBOUND — rebind if Steve wants it). Bound in editor keymap (cycleView) + window.
- **Citation fixes**: added `'` to the @-trigger regex (was bombing out on `'`); REMOVED the
  CM side info-panel (it overlapped the list — Steve wanted it *below*; CM can't do below-list
  natively → deferred a custom below-list panel); **Tab** re-triggers completion when cursor
  is after a partial `@…` and popup closed (`completionStatus` guard keeps Tab accept/indent).
- **Quarto render** (Phase 7): `quarto.rs` — `find_quarto` (cmd/where), `render_with_quarto`
  (`cmd /C quarto render` via `raw_arg` for Windows quoting); returns {success, log,
  output_file=<stem>.html if exists}. Ctrl+Shift+Q + palette; **saves first**; `QuartoPanel`
  modal shows log + Open output (`openPath`; added `opener:allow-open-path`).
- Steve usually renders from CLI but wanted to see it in-app.
- **Next**: 1.24 = ST multi-folder project (**design Q&A first**); 1.25 = final visual polish
  (menus, tab font/height, explorer font, menu options) — Steve wants an **interactive quick
  look-and-feel loop** (use `tauri dev` HMR — frontend/CSS edits hot-reload live).

## 2026-07-06 — Citation matcher = csv-grid fzf + highlighting (v1.22.0)

- Replaced SkimMatcherV2 with a **port of csv-grid's fzf** (removed fuzzy-matcher dep):
  space-sep ANDed terms, `'exact` contiguous (and `'mild'pric` = two exact terms via
  `'`-delimiting), smart-case. Matched over **key+title** only (author redundant — in key).
  Returns matched char indices. Unit-tested (`'mild'pric` hits entry 0 not 1).
- Match target/display label = `"{key}  {title}"`; co-authors (last names 2..3) + year in
  the completion **detail**. Popup **highlights** matched chars (custom `addToOptions`
  render; default `.cm-completionLabel` hidden via CSS; wider dropdown).
- Steve's asks all covered: `'exact`, key+title key, wider dropdown, highlighting, coauthors.
  Still per-request idea: interleave coauthors between key and title on one line (deferred —
  chose key+title highlighted line + coauthors detail line for clean index alignment).
- **Quarto (Phase 7)**: Steve unsure he wants it — I'm to EXPLAIN not build. Priorities per
  Steve: polish + bibtex (done a lot) → visuals → ST-style project explorer w/ multiple
  arbitrary folders (he knows it's involved).

## 2026-07-06 — Phase 6: BibTeX + citations (v1.21.0)

- **Hand-rolled tolerant BibTeX parser** (`src-tauri/src/bib.rs`): `@string` subst, `#`
  concat, nested braces, `{…}`/`"…"`/bareword values, `date`→year, author short-form
  (Last / Last and Last / Last et al.), TeX clean (braces, `~`, `\cmd`, `\&`). Byte-scanner
  slicing only at ASCII delimiters → UTF-8 safe. **cargo test passes** (@string+nested+date).
- **Index+search**: `BibState` (Mutex<Vec<BibEntry>>), SkimMatcherV2 over a per-entry search
  blob; `search_bibliography` → top 30; `get_citation` for hover. Loaded at startup in a
  spawned thread (7k off main).
- **Watch**: notify watcher on the `.bib` (NonRecursive) re-parses + emits `bib-updated` on
  change (Steve edits often, references quickly).
- **Frontend** (`editor/citations.ts`): CM `autocompletion` override → `searchBibliography`
  (`filter:false`, Rust ranks); `inProse` guard via syntaxTree (skip code/yaml/frontmatter);
  `hoverTooltip` → `getCitation`; Ctrl+Shift+C inserts `@`+startCompletion. md/qmd only.
  Config-save reloads bib.
- **Steve must set `[bibliography] default_file`** to his `.bib` path (Edit Config).
- **Deferred**: matched-char highlighting in popup (filter:false loses CM highlight — need
  custom render/return indices); bracketed `[@key]` forms; doc-YAML bibliography override.
- Next: **Phase 7 Quarto render**.

## 2026-07-06 — Preview polish: KaTeX, sync, dup-tab fix (v1.20.0)

- **Duplicate-tab bug** (Steve: "two tabs per file"): race in `openFile` — `await readFile`
  between the dedup check and the tab-add; double-click fires openFile 2–3× → 2 tabs.
  Fixed by re-checking for the tab *inside* the atomic `set()`.
- **KaTeX math in preview** (essential — Steve does lots of math): markdown-it-texmath +
  katex, `$…$`/`$$…$$`, `throwOnError:false`. 19 KaTeX woff2 fonts bundle into dist (offline).
- **Sync scroll**: preview follows editor scroll proportionally (editorView.ts getActiveView
  + onActiveViewChange; Preview attaches to view.scrollDOM). Outline jump → editor scroll →
  preview follows.
- **Footer**: dropped "Saved" (tabs show dirty), added **Ln/Col** (store cursorLine+cursorCol
  via Editor onUpdate → setCursorPos).
- **Outline font** → Arial Narrow 10pt (Steve's ST sidebar). Tree/tab fonts still TODO
  (he wants ST project-explorer font — needs .sublime-theme discovery; deferred).
- Config nagging: STOP — Steve set font_family=Source Code Pro himself. (If he wants 14 he
  adds font_size; his current [editor] has only font_family.)
- Next: **Phase 6 BibTeX** — `@` fzf autocomplete + hover-title tooltip; use Rust
  SkimMatcherV2 (Steve endorsed; I agree it fits ~7k entries).

## 2026-07-06 — Phase 5: preview + outline (v1.18–1.19) + fixes (v1.17.1)

- **1.17.1**: removed footer flicker (dropped transient "Saving…"); tabs always close —
  `window.confirm()` was unreliable in the webview and blocked closing a dirty tab, so
  close is now save-then-close (no dialog). This also explains Steve's "config won't close".
- **1.18.0 preview**: markdown-it (footnotes, task-lists, tables); view modes
  editor/split/preview (topbar button + Ctrl+Shift+V + palette command); external links →
  browser via `openUrl` (added `opener:allow-open-url` capability); frontmatter stripped;
  `html:false` so preview can't execute code.
- **1.19.0 outline**: parse ATX headings (skip frontmatter/code, strip `{#id}`), click-to-
  jump via `editor/editorView.ts` bridge (`onCreateEditor`), active-heading highlight from
  `cursorLine` (Editor `onUpdate` → `setCursorLine`).
- Windows gotcha: `outline.ts` vs `Outline.tsx` differ only in case → TS error; renamed
  parser to `parse.ts`. (Watch same-basename-different-case files.)
- Answers given: TeX colors in ST come from scheme × LaTeX syntax scopes (Loudoun has no
  TeX rules → generic); conflict is rare *because* autosave; font still needs config edit
  to Source Code Pro.
- **Preview follow-ups**: KaTeX math, relative-image resolution (convertFileSrc), sync
  scroll, preview code-block highlighting.
- **Phase 5 DONE.** Next: **Phase 6** — BibTeX + fzf citation autocomplete (Rust
  `SkimMatcherV2` for the ~7,000-entry library). The other biggie.

## 2026-07-06 — features/ scrub + TeX tokens + file watching (v1.15–1.17)

- **1.15.0**: real YAML frontmatter (yamlFrontmatter) → keys orange/values green; inline
  math pairs `$…$` without needing `\` (avoids currency) + Prec.highest so it colours in
  bullets; Python keywords split (control=pink, other=orange) — less garish.
- **Committed features/ by accident** (git add -A swept Steve's dropped notes). Untracked +
  gitignored, then **scrubbed from history** (filter-branch + force push) per his request.
  Still on disk. LESSON: `git status` before `git add -A`.
- **1.16.0 intra-math TeX**: tokenize $…$/$$…$$ → delim/text foreground, `\cmd` blue, num
  red, op orange, brace grey (was one flat colour). Classes `.wd-math-*` in App.css.
- **1.17.0 file watching** (Rust notify): `watch_workspace` emits `fs-change`; frontend
  soft-refreshes tree (no collapse — re-lists root only), reloads unmodified open files,
  flags conflict on modified ones (footer "Modified externally — click to reload").
  `justSaved` guard ignores our own writes. Watcher (re)starts in setRoot.
- **Font**: Steve's config.toml still `font_family = "Cascadia Mono"`, `font_size = 15` →
  Edit Config to Source Code Pro / 14 to match ST (the import is overridden by his config).
- md/qmd "context" = SYNTAX not scheme (only Loudoun exists); qmd `{python}` cells fixed
  in 1.12.0 — that thread is settled.
- Remaining Phase 4: save-on-close (blur mostly covers it), configurable idle timeout,
  logging. Then Phase 5 (preview + outline).

## 2026-07-06 — Feedback round 3: autosave + languages + math + per-session (v1.11–1.14)

Steve fed back (testing ~1.9/1.10), "keep going!". Delivered:
- **1.11.0 autosave** (spec §12): window blur (focus lost), tab-switch (leaving tab saves),
  ~1.5s idle. Atomic EOL-preserving. TODO: save-on-close, configurable idle timeout.
- **1.12.0 languages**: open py/json/yaml/toml (+txt/sh/r plain) by ext; **CSV/TSV rainbow**
  columns; **Quarto `{python}`/`{r}`/`{=html}`** cells highlight nested lang (strip braces).
  Expanded backend SUPPORT_EXTS so they show in tree/quick-open.
- **1.13.0 math/TeX**: inline `$…$` (needs `\^_` signal → avoids currency) + display `$$…$$`
  in md/qmd; `.tex/.sty/.latex` → stex language.
- **1.14.0 per-workspace session**: keyed by workspace hash (`sessions/<hash>.json`);
  `session.json` = last workspace only. Different-folder instances don't clobber; same-
  folder-twice still shares (per-window later).
- **Two-schemes**: only Loudoun exists in his ST; `Markdown.sublime-settings` covers md+qmd
  with NO color_scheme → ST uses Loudoun for both; md/qmd differ by SYNTAX. Awaiting where
  his 2 schemes are (may be a misremember). Per-ext scheme infra pending that.
- Multi-instance Q answered: Tauri = multiple instances by default.

## 2026-07-06 — Feedback round 2 + theme tuning (v1.10.0)

- **Investigated the "two schemes" claim**: searched the whole ST tree. ONLY `Loudoun`
  exists (+ RainbowCSV/ANSI). `Markdown.sublime-settings` covers both `md`+`qmd` and sets
  NO `color_scheme`. So ST uses Loudoun for BOTH; md/qmd differences are syntax scopes,
  not schemes. **Asked Steve where the separate md/qmd schemes are** (couldn't find them).
- **"YAML waaay off"** root cause: CM's markdown parser doesn't scope `---` front matter,
  so nothing coloured. **1.10.0** adds a decoration layer (`editor/frontmatter.ts`):
  keys/values coloured via `--wd-yaml-key/val/delim` CSS vars from the scheme (Loudoun =
  orange keys, green values). Delimiters green.
- **Font**: Steve says 17 too big → wants 14, config-selectable. **1.10.0** editor font
  size/family now from `config.toml [editor]` (overrides Sublime import); fresh default 14.
  **His existing config.toml still says 15** (auto-created at 1.3.0) — he must Edit Config →
  14. Added **Edit Config command** (Ctrl+Shift+P) + live re-apply on save.
- Titles: added heading background from the scheme (Loudoun markup.heading grey bg).
- **Multiple instances**: Tauri does NOT single-instance by default → multiple windows/
  processes DO run. Caveat: they share `~/.writedown/session.json` (last-writer-wins) —
  fine for now; per-instance session is a later consideration if it bites.
- Per-ext scheme selection: architecture pending the two scheme files from Steve.

## 2026-07-06 — Phase 3: Sublime theme import (v1.9.0) + polish (v1.8.1)

- **1.8.1** fixed the still-invisible selection (global CSS `!important` via `--cm-sel`
  var — the theme-object approach never stuck); 📁/📂 folder icons; active-tab accent bar +
  tabs shrink-to-fit.
- Read Steve's Sublime config: active scheme = **Loudoun** (his own; dark, bg `#141414`,
  fg `#f8f8f8`, selection `white3`@0.2), font **Source Code Pro 17**, line padding 2/1.
- **1.9.0** Rust `load_sublime_theme` (`src-tauri/src/sublime.rs`, json5) parses
  Preferences + the `.sublime-color-scheme`, resolves `var()` / `color(alpha)`, returns
  globals + resolved scope rules. Frontend `editor/sublimeTheme.ts` builds a CM theme +
  markdown highlight, applied on launch; falls back to built-in if no Sublime. Never
  writes to Sublime config. `config.toml theme.sublime_user_directory` override not wired
  (uses `%APPDATA%` default).
- **Couldn't visually verify** the imported look (no GUI here) — Steve to eyeball; the
  import is best-effort with a safe fallback.
- Steve's earlier "need smaller font": his Sublime is 17, now imported. If still too big,
  config-selectable font size is the fix (backlog).
- Next: **Phase 4** reliability (autosave, file-watching+conflict, logging) — also gives
  the tree auto-refresh-on-external-change he wants. Also outstanding: math/TeX highlight.

## 2026-07-06 — Phase 2 complete: v1.8.0

- **1.8.0** quick-open (Ctrl+P, all workspace files) + command palette (Ctrl+Shift+P),
  both with a fzf-style TS matcher (`src/fuzzy.ts`) showing matched-char highlights.
  Backend `list_all_files`. **Phases 1 + 2 now complete.**
- Next: **Phase 3** — import Steve's Sublime colour scheme into a CodeMirror theme (§11).
- Citations (Phase 6) will use the Rust `fuzzy-matcher` SkimMatcherV2 for the ~7,000-entry
  index (per Steve; `src/fuzzy.ts` handles the smaller quick-open/palette lists).

## 2026-07-06 — Feedback round 1 (Steve tested 1.6.0): v1.6.1 + v1.7.0

Steve tested and confirmed all favourite editing commands work (Ctrl+D / L / arrows / `/`
/ F / H / G / W, edits, save). Playground of dummy files at **`c:\tmp`**. His issues + fixes:

- Selection had no visible highlight (other matches did) → **1.6.1** (theme `!important` on
  `.cm-selectionBackground`; distinct `.cm-selectionMatch` colour).
- Ctrl+Tab didn't switch tabs → **1.6.1** bound at the editor level (works when editor focused).
- Clicking an open file "reopened" it / tabs cluttered → **1.7.0 preview tabs** (single-click =
  transient italic tab reused for the next click; double-click or edit promotes to permanent).
- Folders not distinct from files → **1.7.0** bold + accent chevron.
- Little md/qmd colour → **1.7.0**: root cause was headings tagged `heading1..6` while the theme
  only styled generic `heading`; now styles heading1-6 (sized) + markers + more.
- Wanted F5 / Ctrl+Shift+R refresh → **1.7.0** (remounts tree; webview reload suppressed).

**Backlog (Steve requested, later):**
- **Sublime-project-style browser**: add multiple arbitrary folders to the side panel (not
  just one workspace root); ties into the open-tabs-at-top idea. Not in spec yet.
- Tree auto-refresh on external change → Phase 4 (file watching).
- **fzf matcher**: Steve uses the Rust `fuzzy-matcher` crate's `SkimMatcherV2` (see
  gh:mynl/skimmatch, FYI not to copy). Plan to expose a Rust command and use it for citation
  autocomplete (Phase 6, ~7000 entries) and possibly quick-open (1.8.0).
- Still TODO Phase 2: **1.8.0 quick-open (Ctrl+P) + command palette (Ctrl+Shift+P)**;
  Ctrl+M matching bracket, Ctrl+K Ctrl+D skip-occurrence; YAML front-matter highlight/fold.

## 2026-07-06 — Phase 2 (editor) underway: v1.4.0 → v1.6.0

- **1.3.1** fixed the double-scrollbar Steve reported (editor container + textarea both
  scrolled); scrollbars are now thin throughout.
- **1.4.0** CodeMirror 6 replaces the textarea: markdown syntax + nested fenced-code
  languages, line numbers, folding, bracket matching, wrap, dark/light theme. Dirty
  tracking / EOL preservation / atomic Ctrl+S all carry over.
- **1.5.0** Sublime keymap as one command layer (`src/editor/keymap.ts`): Ctrl+D, Ctrl+L,
  Ctrl+Shift+D, move-line, Ctrl+/, add-cursor above/below (Ctrl+Alt+Up/Down), split-into-
  lines (Ctrl+Shift+L), Alt+drag column select. Tab nav: Ctrl+Tab / Ctrl+Shift+Tab /
  Ctrl+W (confirm if dirty) / Ctrl+Shift+T reopen.
- **1.6.0** find / replace / goto-line (Ctrl+F / Ctrl+H / Ctrl+G, F3).
- **Remaining Phase 2:** 1.7.0 quick-open (Ctrl+P) + command palette (Ctrl+Shift+P) —
  plan to build a reusable fzf matcher (Phase 6 citations reuse it).
- **Known/deferred:** tree doesn't auto-refresh on external change (Steve noted; → Phase 4
  file-watching); Ctrl+M matching-bracket + Ctrl+K Ctrl+D skip-occurrence deferred.
- Editor bundle ~855 KB (CM + markdown); benign for a local desktop app — nested code
  languages already lazy-load as separate chunks.

## 2026-07-06 — Phase 1 (files) shipped: v1.1.0 → v1.3.0

- **1.1.0** open workspace (native dialog) + lazy recursive file tree + **draggable,
  resizable** sidebars. Backend `list_directory`/`read_file`; frontend state via zustand.
- **1.2.0** tabs + editable textarea + **atomic save** (Ctrl+S), preserving the file's
  original newline convention (CRLF stays CRLF). Footer save status. Backend `write_file`.
- **1.3.0** `~/.writedown/` + commented default `config.toml` on first launch; **session
  restore** (workspace, tabs, active tab, pane widths) via `session.json`. Backend
  `load_config`/`load_session`/`save_session`.
- All three compile clean (frontend build + `cargo check`) and are pushed to
  `mynl/writedown` (master). Steve confirmed the window renders.
- Editor is a plain textarea for now — **CodeMirror 6 + Sublime keymap is Phase 2** (next).
- Cosmetic: `git commit` warns "LF will be replaced by CRLF" (autocrlf); no
  `.gitattributes` added yet — binaries (.png/.ico) are auto-detected, so icons are safe.

## 2026-07-06 — Project kickoff

- Digested the two sibling projects (`fiscus_project`, `csv-viewer`) to learn the
  author's conventions and read `writedown-spec.md` (the authoritative spec).
- Wrote `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `.gitignore`, this file.
- **Decisions this session:**
  - Frontend framework = **React** (author's pick; deepest CodeMirror 6 ecosystem).
  - **Git commits are enabled** on this project (inverts the usual "Claude never
    commits" rule) — terse messages, detail in `CHANGELOG.md`, push to GitHub allowed.
  - Versioning: **SemVer from 1.0.0**, climbs visibly, shown in the app footer,
    single-sourced (footer reads it at runtime, no hand-synced copies).
  - **All build churn (Rust `target/`, `node_modules/`) must live on `V:`**, not in
    this Synology-synced folder. Exact `V:` paths TBD with author before first build.
- **Scaffolded v1.0.0**: Tauri 2 + React 19 + TS baseline. Three-pane shell (Files ·
  Editor · Outline) + footer showing the version via `getVersion()`. App icons generated
  from `writedown-logo.png`. Frontend build + `cargo check` pass.
- **Churn firewall live**: cargo `target-dir` → `V:\dev\writedown\target` (clean, durable).
  node_modules junctioned to V:, BUT `npm install` clobbers the junction (rebuilds real
  node_modules on C:) — so `scripts/dev-setup.ps1` must be run after each install.
  Durable alternative to consider: Synology filtered-files exclusion of `node_modules`.
- **Still open:** GitHub remote — asked Steve to create empty private `mynl/writedown`
  (no `gh` CLI here) OR authorize installing `gh`. Nothing committed/pushed yet.
- Next up: spec §30 Phase 1 proper (workspace open, real file tree, open/save).
