# human-hints

Very high-level running summary of discussions and decisions in this project.
Newest first. (Kept current at the close of each working session — see CLAUDE.md.)

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
