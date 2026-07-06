# Writedown

A fast, local, predictable **Markdown and Quarto editor for Windows**. Joplin-style
file navigation, Sublime-style editing, live Markdown/Quarto preview, an automatic
document outline, and first-class BibTeX citation autocomplete over your own
authoritative library.

Writedown edits **ordinary files on disk**. There is no vault, no hidden database, and
no proprietary format. It never renames, moves, or reformats your files unless you ask.
It makes no network requests, keeps no telemetry, needs no account, and works offline.

> Status: **early development.** Building up from `v1.0.0` per the phased plan in
> `writedown-spec.md` §30. The current version is shown in the app footer.

## What it gives you

- **Ordinary files as truth** — `.md` / `.qmd` stay plain UTF-8 text, editable by
  Sublime, Git, Python, or Explorer at any time; Writedown reloads external edits safely.
- **Sublime-style editing** — CodeMirror 6 with multiple cursors, column selection,
  find/replace, quick-open, and a command palette, wired through a real command layer.
- **Markdown & Quarto preview** — fast internal renderer; exact rendering on an explicit
  `quarto render` (never automatic).
- **Automatic outline** — heading tree on the right, click to jump, tracks the cursor.
- **BibTeX citations** — type `@` for fzf-style fuzzy autocomplete against your ~7,000-entry
  library, with matched-letter highlighting; the `.bib` file is read-only and untouched.
- **Autosave** — atomic, conservative trailing-whitespace cleanup, hard-breaks preserved,
  YAML front matter preserved exactly, clear conflict handling.

## Stack

Tauri 2 · Rust backend (filesystem, atomic saves, watching, config) · TypeScript + React
frontend · CodeMirror 6 · markdown-it preview.

## Configuration

Created on first launch under `~/.writedown/` (`C:\Users\<you>\.writedown\`):
`config.toml`, `session.json`, and disposable `cache/` · `index/` · `logs/` · `themes/`.
See `writedown-spec.md` §5 for the full config schema. Nothing here is a source of truth
for your documents — it is all derived and reconstructible.

## Development

Setup and run commands will be documented here once the project is scaffolded. Note:
all build churn (Rust `target/`, `node_modules/`) lives on the `V:` developer drive,
not in this folder — see `CLAUDE.md`.

## License

TBD.
