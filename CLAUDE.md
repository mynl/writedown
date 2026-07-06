# Writedown

A fast, local, predictable Markdown and Quarto editor for Windows. Joplin-style
navigation, Sublime-style editing, Markdown/Quarto preview, first-class BibTeX
citations. **Ordinary files on disk are the source of truth** — no vault, no
hidden database, no automatic renaming, no cloud, no telemetry.

Full requirements: `writedown-spec.md` (authoritative). This file is the standing
instructions; the spec is the contract.

Author: Stephen J. Mildenhall — PhD in math, actuary, geeky. Lead with the
mathematical framing where relevant; quantitative formulations (optimization,
probability, risk measures) are welcome and often the intended design language.

## READ THIS FIRST — critical constraints

Two non-negotiables. Everything else bends before these.

### 1. Dev churn lives on `V:`, never in this Synology-synced folder

This project tree is inside `C:\Users\steve\Documents\CloudStation\...`, which is
**continuously synced by Synology Drive**. Rust and Node generate huge, constant
build churn (`target/` is hundreds of MB and rewrites on every compile;
`node_modules/` is tens of thousands of files). None of that may touch the synced
tree. Route all dev-heavy artifacts to `V:` (the developer drive):

- **Rust build output** → `src-tauri/.cargo/config.toml` sets `target-dir =
  "V:/dev/writedown/target"`. Clean and durable — cargo always honours it. This is the
  big one (Rust `target/` is the "ton of stuff"). Never let `target/` land in-repo.
- **`node_modules/`** → a Windows directory junction to `V:\dev\writedown\node_modules`.
  **Caveat: `npm install`/`npm ci` DELETES the junction** and rebuilds a real
  `node_modules` on C: (npm refuses a reparse-point at the node_modules root). So after
  **any** install, re-run `scripts/dev-setup.ps1`, which moves it back to V: and
  re-junctions. (Durable alternative, if the author wants it: exclude `node_modules` in
  the Synology Drive client's filtered-files list — then physical location stops
  mattering. Gitignoring is NOT enough; Synology syncs the filesystem, not git.)
- **npm cache** → `V:\dev\npm-cache` (`npm config set cache`). Cargo registry cache
  (`CARGO_HOME`, default `%USERPROFILE%\.cargo`) is already off the synced tree.
- The `V:` paths are `V:\dev\writedown\{target, node_modules}` + `V:\dev\npm-cache`.

The only things that belong in this folder are **source, docs, and small committed
assets**. If you're about to write a large or fast-changing artifact here, stop.

### 2. Never rename, move, or rewrite the user's files (spec §2, §8)

Writedown's whole reason to exist is that it does **not** touch files behind the
user's back. Enforce, everywhere:

- Files on disk are the source of truth; `.md`/`.qmd` stay ordinary UTF-8 text.
- Never rename/move/reorganise/reformat a file except on an **explicit** user command.
- A YAML `title` or first heading is **never** a filename. Saving, tab switches, and
  preview must never rename anything.
- YAML front matter is preserved exactly — order, comments, scalar styles, spacing.
  Never reorder, alphabetise, or reflow it.
- Any index/cache under `~/.writedown/` is disposable and reconstructible from source.
  User documents are never copied into `~/.writedown/`.
- No network requests by default; works fully offline; no telemetry/accounts/updater.
- The authoritative `.bib` (~7,000 entries) is read-only — never rewritten or reformatted.

Save failures, conflicts, and parse failures must be **surfaced**, never swallowed.

## Working with the author

These rules apply in every project — follow them without being re-asked.

- **Diagnose / design / propose before editing source.** Don't change code until told
  to proceed ("go ahead"). "Can you see the issue?" means explain, not fix.
- Environment is **PowerShell on Windows**. No `awk`/`sed`/`head`/`tail` (even via the
  Bash tool). Use `rg` + the Read/Edit/Write tools.
- Prefer explicit, documented recipes over magic / auto-install behavior.
- **UI: no buttons that change meaning with state** (the infamous play/pause) — use
  separate, explicitly-labeled actions instead.
- **YELL if a request is involved.** The author assumes his asks are easy. If one
  implies a big increase in code size or a decrease in speed, do NOT just build it —
  say so first and let him decide. His need for speed outweighs his occasional whims.
- Keep rendered output tight — no gratuitous blank lines in blocks.
- US spelling throughout (prose, docstrings, comments, identifiers). (The *spec* uses
  UK spelling; match the spec when quoting it, US spelling in our own prose/code.)
- **Keep `human-hints.md` current** — a very high-level running summary of what we
  discuss and decide, newest first. Update it at the close of each working session.
- Periodically remind the author to stop biting his tongue.

## Steve-terminology

- **SWIM** — "see what I mean": you have enough context; fill remaining gaps sensibly
  rather than asking.
- **AQIN** — "ask questions if needed": on genuine ambiguity, ask rather than guess.
- **gummage** — is or would be perfection. From Chandler Bing, offered gum in a dark
  vestibule: "gum would be perfection." High praise: "that's gummage" = exactly right.

## Locked decisions (2026-07-06)

Each is a decision with its rejected alternative in parens; revisit only with cause.

- **Stack = Tauri 2 + Rust backend + TypeScript + React + CodeMirror 6.** React chosen
  over Svelte for the deepest CodeMirror 6 / command-palette / autocomplete ecosystem
  given how editor-heavy this app is. (Not a pure browser app — filesystem goes through
  Rust so there are no recurring browser permission prompts.)
- **Preview renderer = markdown-it** (fast, plugin-rich) for the internal preview;
  exact rendering via an explicit `quarto render` only, never automatic. (Evaluated
  unified/remark — heavier; can revisit if plugin needs demand it.)
- **Config = TOML** at `~/.writedown/config.toml` (spec §5). Session = `session.json`.
  App state, caches, index, logs, themes all under `~/.writedown/` — **derived/disposable
  only**, never user documents.
- **Git commits ARE allowed on this project** (this inverts the author's usual "Claude
  never commits" rule — he enabled it here explicitly). Commit messages are **terse**;
  detail lives in `CHANGELOG.md`, not the commit body. Pushing to GitHub is allowed.
- **Versioning = SemVer, starting at `1.0.0`.** The author reads the version to know
  which build he's running, so it climbs visibly as we develop and is **shown in the
  app footer**. Single-source it (see Versioning) — no hand-synced copies.
- **Editing is plain-text only** in the first draft — no rich-text, no Obsidian-style
  live preview. Rendering stays separate from the editable representation.

## Architecture / layout (proposed — confirm before building out)

```
CLAUDE.md              standing instructions (this file)
README.md              stable front page — touch only when that material changes
CHANGELOG.md           Keep-a-Changelog; one section per version bump
human-hints.md         running decision journal, newest first (update each session)
writedown-spec.md      the authoritative spec
dev/                   plan docs (plan-<version>-<desc>.md); move to dev/done/ when
                       the author declares done (not when the code lands)
assets/                branding, icons (committed, small)
src/                   TypeScript + React frontend
  editor/              CodeMirror 6 setup, Sublime keymap, multicursor commands
  tree/                file tree
  preview/             markdown-it preview + outline
  cite/                citation index client, fzf matching, popup
  state/               app/session state
src-tauri/             Rust backend + Tauri config
  src/                 commands: workspace, files, atomic save, watch, quarto, bib, config
  .cargo/config.toml   target-dir → V: (churn firewall)
tests/                 automated tests (config parse, atomic save, whitespace, YAML
                       preservation, bib parse, fuzzy scoring, session restore, …)
```

`node_modules/` and `src-tauri/target/` are **on `V:`** (junction / target-dir), not here.

## Versioning & release workflow

Standing rules — follow without being re-asked.

- **Single source of version truth.** Set the version in `src-tauri/tauri.conf.json`
  (mirrored in `Cargo.toml` / `package.json` as the toolchain requires); the footer
  reads it at runtime via `@tauri-apps/api/app` `getVersion()` — do **not** hard-code
  a second copy in a JS constant.
- **Every feature-bearing change bumps the version** (SemVer: MAJOR breaking, MINOR
  features, PATCH fixes). Pure tidying does not bump.
- **`CHANGELOG.md` is current at every bump** — a `## [x.y.z] - YYYY-MM-DD` section,
  newest first, [Keep a Changelog] groups (`Added` / `Changed` / `Fixed`), prose-rich
  bullets. The changelog carries the detail the terse commit omits.
- **Commit style:** terse subject, optionally version-prefixed (e.g. `1.2.0 outline
  click-to-jump`); no long body. One shippable change ≈ one commit ≈ one CHANGELOG entry.
- **`README.md`** is the stable front page; touch it only when that material changes.
- **Work proceeds from plan docs** in `dev/`; move a plan to `dev/done/` only when the
  author says it's done.

## Commands

All dev-heavy artifacts live on `V:` (see the firewall above).

```
npm install                       # then ALWAYS: pwsh scripts/dev-setup.ps1 (re-junctions node_modules → V:)
npm run tauri dev                 # dev build + hot reload (opens the window)
npm run tauri build               # production writedown.exe + installer
npm run build                     # frontend only (tsc + vite → dist/)
cargo check   (in src-tauri/)     # backend typecheck; target-dir is V:\dev\writedown\target
cargo test    (in src-tauri/)     # backend tests
npm run tauri -- icon <square.png> # regenerate app icons from a square master
```

Icons are generated from `assets/writedown-logo.png` (padded square) into
`src-tauri/icons/`; the author cares about icons — keep the app recognizable
(window, taskbar, installer, tray).

## Non-goals (first draft, spec §29)

No cloud sync, mobile, collaboration, accounts, plugins, graph/canvas view, rich-text,
live preview, automatic renaming/link-rewriting/folder-org, embedded browser, AI
features, automatic code execution, bibliography editing forms, publishing, or theme
marketplace. Light theme + dark theme + imported Sublime-derived theme is enough.

## Status

**Phase 1 complete** (spec §30), shipped as v1.0.0 → v1.3.0 on `mynl/writedown`:
workspace open, lazy file tree, resizable panes, tabs, editing, atomic save, config
directory, and session restore. Editor is a plain textarea for now.

**Phases 1–3 complete; Phase 4 underway** (through v1.14.0). Beyond the editor + Sublime
theme import: config-selectable font + Edit Config command; YAML front-matter, LaTeX
math, and CSV-rainbow highlighting; multi-language open (py/json/yaml/toml/tex/…) with
Quarto `{python}` code cells; **autosave** (focus-loss/idle/tab-switch); **per-workspace
session**.

**Phases 1–6 complete** (through v1.21.0). The editor + Sublime theme; multi-language open;
CSV rainbow; YAML/LaTeX-math/TeX highlighting; config-selectable fonts + Edit Config;
autosave; per-workspace session; file watching + conflict; **preview pane** (KaTeX math,
DOMPurify, sync scroll); **outline**; and **BibTeX** — parsed/indexed/**watched**, `@`
autocomplete ranked by Rust **SkimMatcherV2**, hover-for-title, Ctrl+Shift+C.

Next: §30 **Phase 7** — **Quarto render** (`quarto render`/`preview` via discovered
`quarto.exe`, explicit command only).

Backlog / refinements: matched-char highlighting in the citation popup (needs custom
render — `filter:false` drops CM's highlight); bracketed `[@key]` insertion forms;
document-YAML `bibliography:` override; relative-image resolution + preview code
highlighting; save-on-close, configurable idle timeout, logging; ST tree/tab fonts;
Sublime-project multi-folder browser; Ctrl+M / Ctrl+K Ctrl+D. (ST has only Loudoun — md/qmd
differ by syntax.) node_modules relocation can hang if installs race — `dev-setup.ps1` is
now `/R:1 /W:1`; run installs one at a time.
