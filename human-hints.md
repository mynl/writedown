# human-hints

Very high-level running summary of discussions and decisions in this project.
Newest first. (Kept current at the close of each working session — see CLAUDE.md.)

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
