# Writedown

Adds to `V:\dev\CLAUDE.md` (house rules). Project detail only — see **Deltas** at the foot.

A fast, local, predictable Markdown and Quarto editor for Windows. Joplin-style navigation,
Sublime-style editing, Markdown/Quarto preview, first-class BibTeX citations. **Ordinary files on
disk are the source of truth** — no vault, no hidden database, no automatic renaming, no cloud,
no telemetry.

`writedown-spec.md` is authoritative and is the contract. This file is the standing instructions.
`CHANGELOG.md` is the record of what has been built — read it for current state rather than
expecting a status section here.

## READ THIS FIRST — never rewrite the user's files (spec §2, §8)

Writedown's whole reason to exist is that it does **not** touch files behind the user's back.
Enforce this everywhere; everything else bends before it.

- Files on disk are the source of truth; `.md` / `.qmd` stay ordinary UTF-8 text.
- **Never rename, move, reorganise, or reformat a file except on an explicit user command.**
- A YAML `title` or first heading is **never** a filename. Saving, tab switches, and preview must
  never rename anything.
- YAML front matter is preserved exactly — order, comments, scalar styles, spacing. Never
  reorder, alphabetise, or reflow it.
- Any index or cache under `~/.writedown/` is disposable and reconstructible from source. User
  documents are never copied into `~/.writedown/`.
- No network requests by default; works fully offline; no telemetry, accounts, or updater.
- The authoritative `.bib` (~7,000 entries) is **read-only** — never rewritten or reformatted.
- Save failures, conflicts, and parse failures are **surfaced**, never swallowed.

## Build paths (the concrete form of the house no-hard-coded-paths rule)

Build output lives in the checkout, gitignored: `target/`, `node_modules/`, `dist/`.

- `src-tauri/.cargo/config.toml` sets `target-dir = "../target"` — relative, resolving to
  `<repo>/target`. **Cargo reads that file from the current directory, not the manifest's, so
  always run cargo with its cwd inside `src-tauri/`, never `--manifest-path` from the repo root.**
- There is no junction, no symlink, and no `dev-setup.ps1`. `npm install` is a plain install with
  nothing to re-establish afterwards.
- **Always build and run from `V:\dev\writedown`.** The `C:\S\dev` symlink to `V:\dev` exists on
  DOOB but is not a supported launch path (decision 2026-08-31); `vite.config.ts` takes the
  project root as the plain cwd and carries no path-resolution code for it. Do not re-add any.

This is the rule the house file cites as written in blood: the old absolute `V:` target-dir
resolved *inside* the project root on this machine, Vite's watcher walked `target/`, hit a cargo
build-script `.exe` that Windows had locked, threw `EBUSY`, and killed `tauri dev` on startup.
The junction script had become a `robocopy`-onto-itself that would have deleted `node_modules`.

## Locked decisions

Each is a decision with its rejected alternative; revisit only with cause.

- **Stack = Tauri 2 + Rust backend + TypeScript + React + CodeMirror 6** (2026-07-06). React over
  Svelte for the deepest CodeMirror 6 / command-palette / autocomplete ecosystem, given how
  editor-heavy this app is. Not a pure browser app — the filesystem goes through Rust so there
  are no recurring browser permission prompts.
- **Preview renderer = markdown-it** — fast, plugin-rich, for the internal preview. Exact
  rendering via an explicit `quarto render` only, never automatic. (Evaluated unified/remark:
  heavier; revisit if plugin needs demand it.)
- **Config = TOML** at `~/.writedown/config.toml` (spec §5); session in `session.json`. App
  state, caches, index, logs, and themes all live under `~/.writedown/` — derived and disposable
  only, never user documents.
- **Versioning = SemVer.** The version is **shown in the app footer** because the author reads it
  to know which build he is running.
- **Editing is plain-text only** — no rich-text, no Obsidian-style live preview. Rendering stays
  separate from the editable representation.
- **Before building a feature, state crisply what it will and won't deliver** — scope, failure
  modes, external dependencies — so the author can make an eyes-open build/skip decision. Adopted
  after Quarto render was built and then removed for environment-coupling reasons that should
  have been visible up front.

## Layout

```
CLAUDE.md              standing instructions (this file)
writedown-spec.md      the authoritative spec
CHANGELOG.md           Keep-a-Changelog; the project's memory
README.md / HELP.md    front page; in-app help
dev/                   plan docs; dev/done/ when the author declares done
assets/                branding, icons (committed, small)
scripts/               .ps1 helpers — notices, release publishing, shell registration
src/                   TypeScript + React frontend
  editor/              CodeMirror 6 setup, Sublime keymap, multicursor commands
  tree/                file tree          outline/   document outline
  preview/             markdown-it preview
  store.ts, api.ts     app state; the Rust command surface
src-tauri/             Rust backend + Tauri config
  src/                 files, watch, config, session, project, bib, check, render, spelling, …
  .cargo/config.toml   target-dir → ../target
tests/                 config parse, atomic save, whitespace, YAML preservation, bib parse,
                       fuzzy scoring, session restore
```

Icons are generated from `assets/writedown-logo.png` (padded square) into `src-tauri/icons/`.
The author cares about icons — keep the app recognizable in window, taskbar, installer, and tray.

## Commands

```
npm install                        # plain install
npm run tauri dev                  # dev build + hot reload (opens the window)
npm run tauri build                # production writedown.exe + installer
npm run build                      # frontend only (tsc + vite → dist/)
cargo check   (cwd = src-tauri/)   # backend typecheck
cargo test    (cwd = src-tauri/)   # backend tests
npm run tauri -- icon <square.png> # regenerate app icons from a square master
```

Final visual polish runs as an **interactive look-and-feel loop**: keep `npm run tauri dev` open,
let Vite HMR hot-reload frontend and CSS edits live, make small changes, get feedback, repeat.

## Non-goals (spec §29)

No cloud sync, mobile, collaboration, accounts, plugins, graph/canvas view, rich-text, live
preview, automatic renaming or link-rewriting or folder-org, embedded browser, AI features,
automatic code execution, bibliography editing forms, publishing, or theme marketplace. Light
theme + dark theme + imported Sublime-derived theme is enough.

## Deltas from house rules

- **Overrides the stack default.** Tauri 2 + Rust + TypeScript + React + CodeMirror 6, not
  Python/Flask. Frontend is Vite-built; this project genuinely has a build step.
- **Overrides the config-format default.** Config is **TOML**, not YAML (spec §5).
- **Version single-sourcing, concretely:** `src-tauri/Cargo.toml` is the **only** place the
  version lives. Since 2026-07-18 `tauri.conf.json` omits `version` (Tauri 2 falls back to the
  Cargo version — verified: the exe/installer stamp and `getVersion()` both report it) and
  `package.json` is private with no version field. A release bump edits exactly one line;
  `Cargo.lock` follows on the next build. The footer reads it at runtime via
  `@tauri-apps/api/app` `getVersion()`. **Do not hard-code a second copy in a JS constant, and do
  not re-add version fields to the other two files.**
- **Push permission revoked (2026-08-29).** This project previously allowed Claude to push to
  GitHub. It no longer does — the house rule applies without exception: commit, never push. The
  author pushes and runs `scripts/publish-release.ps1` himself, refreshing the GitHub Release per
  batch of work rather than per version.
- **Batched releases.** A batch of approved items — typically a day's work — is grouped into ONE
  version bump: one commit, one CHANGELOG section listing the items. One-commit-per-version still
  holds; there are simply fewer, fatter versions.
- **Spelling:** our own prose and code use US spelling per house rules, but the *spec* uses UK
  spelling — match the spec when quoting it.
