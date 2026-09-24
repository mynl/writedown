# Plan 2.19.0 — Find in Files (Ctrl+Shift+F)

Status: **proposed 2026-09-01, not approved, nothing built.** Source: issue A.08 (Batch A,
dropped in favor of a `[build]` ripgrep entry) reopened 2026-09-01 because it keeps coming
back — and the ground has shifted: the palette has modes, backend commands run off the UI
thread (2.16.0), and `rg --json` gives structured hits. Effort M, one bump, Rust + TS.

This plan stands alone: the goal, what happens today, the change, the files, the
acceptance check. `writedown-spec.md` §331 already lists `Ctrl+Shift+F  find in files`.

## Goal

Sublime-style "quick look" search across the project: press **Ctrl+Shift+F**, type a
ripgrep query (with ripgrep arguments — `-c` for counts is the everyday case), Enter, see
hits in the palette, Enter or click a hit to open the file **at that line and column**.
Investigation, not editing: no replace-in-files (the author falls back to Sublime for that).

## Today

No find-in-files. The palette is single-file / commands / projects / quick-files / symbols.
`[build]` can run `rg` into a scratch tab but gives no query box and no click-to-jump.

## Design

### Query line = ripgrep argument line

The palette input is not a "search string", it is **the arguments to `rg`**, split
shell-words style (double quotes group; no shell is involved, so no `$`, `|`, `>`
semantics). This is what makes `-c` and everything else fall out for free:

| You type | Runs |
|---|---|
| `TODO` | `rg <defaults> TODO <roots>` |
| `-c TODO` | `rg <defaults> -c TODO <roots>` |
| `-i "risk measure" -g "*.qmd"` | your `-g` replaces the default file globs |
| `-l Mildenhall2022` | files-with-matches list |
| `-w -e foo -e bar` | as written |

Defaults prepended, always: `--smart-case --line-number --column --no-messages`
`--max-count 200`, plus one `-g` per configured file glob **unless the query contains
`-g`/`--glob`/`-t`/`--type`/`--type-not`** — then yours win entirely. Roots are appended
last, after the user's arguments, so a user-supplied positional path merely adds to them.

Argument hygiene: `--pre`, `--pre-glob`, `-f`/`--file`, `--files` and `--search-zip` are
refused with a one-line error (they read arbitrary files or run programs). Everything else
is passed through. There is no shell, so nothing to inject; `rg` itself never writes.

### Two result shapes, detected from the arguments

`rg --json` refuses to combine with `-c`/`--count`/`--count-matches`/`-l`/`-L`. So:

- **Hits mode** (the default): run with `--json`; each `match` event gives path, line,
  the line text, and submatch byte offsets → row `name:line  text` with the match
  highlighted, sorted by file then line. Enter/click → open file, cursor on the match.
- **Summary mode** (`-c`, `--count`, `--count-matches`, `-l`, `--files-with-matches`,
  `-L`, `--files-without-match`): run without `--json`, parse `path:count` or `path`
  lines (path split on the LAST colon, so drive letters survive) → row `count  path`,
  counts sorted descending, and a header row with the total (`3 files · 47 hits`).
  Enter/click → open file at line 1.

### Scope

Roots, in order of preference: the project's folders; else the open folder; else the
active file's folder. The scope is named in the palette placeholder (`search 3 project
folders…`, `search D:\Projects\notes…`). No project, no folder, no file → "nothing to
search".

### Palette behavior

- `Ctrl+Shift+F` (`findInFiles`, in the command registry so `[keys]` can rebind it) and
  palette verb **Find in Files…** open mode `"search"`. With a selection in the editor
  the query is prefilled with it (quoted if it contains spaces), as ST does.
- **Enter runs the search** (not live-as-you-type: a keystroke-per-search over `V:\dev` is
  the wedge A.08 warned about). While running: a spinner row; Esc cancels (kills the
  child). Results replace the list; Up/Down/PageUp/Home/End and mouse per G.11.
- **Enter or click on a row** opens the file (`openFile(path, false)`), jumps to the line,
  and places the cursor at the match column (`editorView.ts jumpToLine` gains an optional
  column). Focus lands in the editor. The palette closes.
- The last query and its results are kept in the store for the session, so `Ctrl+Shift+F`
  again shows them; typing edits the query; Enter re-runs.
- Over the cap: the last row says `500+ hits — narrow the query`. Empty: `no matches`.
  `rg` missing from PATH: one error row `ripgrep (rg) not found on PATH` — no slow
  in-process fallback, ever.

### Backend

`search.rs`: `#[tauri::command] async fn search_workspace(args: Vec<String>, roots:
Vec<String>) -> Result<SearchResult, String>` on `spawn_blocking` (the `run_build`
pattern), `CREATE_NO_WINDOW`, hard limits: **500 hits / 5 s** (`--max-count 200` per file
plus a stdout line cap; the process is killed on timeout or cap). Returns
`{ mode: "hits" | "summary", hits: [{path, line, col, text, spans}], summary: [{path,
count}], total, truncated, elapsed_ms }`. `rg` is located with `which`-style PATH search
once and cached.

Config, `[search]` in `config.toml`, documented in HELP.md:

```toml
[search]
globs = ["*.md", "*.qmd", "*.py", "*.bib", "*.toml", "*.txt", "*.yaml", "*.yml"]
max_hits = 500
timeout_ms = 5000
```

## What it will NOT deliver

- Replace-in-files. Writing to many files at once wakes every safety rule; Sublime does it.
- A persistent results pane or results tab. If the palette proves too small for real use,
  step 2 is a read-only results tab with click-to-jump (ST's shape) — decide after use.
- Context lines (`-C`) as separate rows: `-A/-B/-C` pass through but context events are
  ignored in hits mode; only matches are listed.
- Searching unsaved buffers. `rg` sees the disk; a dirty tab's edits are not searched (the
  autosave on palette-open makes this moot in practice).

## Files

- `src-tauri/src/search.rs` (new), registered in `lib.rs`; `config.rs` gains `[search]`.
- `src/api.ts` — `searchWorkspace(args, roots)`, `SearchSettings`.
- `src/store.ts` — `PaletteMode` gains `"search"`; `searchQuery`, `searchResult`,
  `runSearch`, `cancelSearch`.
- `src/Palette.tsx` — search mode: run-on-Enter, hit/summary rows, spinner, error rows.
- `src/editor/editorView.ts` — `jumpToLine(line, col?)`.
- `src/editor/commandRegistry.ts`, `src/editor/keymap.ts` — `findInFiles`, `Ctrl+Shift+F`.
- `src/commands.ts` — palette verb **Find in Files…**.
- `src/fuzzy.ts` — nothing; search rows are never fuzzy-filtered.
- `HELP.md`, `CHANGELOG.md`, `Cargo.toml` → 2.19.0.

## Accept

1. Ctrl+Shift+F, `TODO`, Enter: rows `file:line  text` with `TODO` highlighted; Enter on
   a row opens the file with the cursor on that `TODO`; click does the same.
2. `-c TODO`: rows `count  file`, descending, header with totals; Enter opens the file.
3. `-l amsmath`: file list. `-i "risk measure" -g "*.qmd"`: only `.qmd` files searched.
4. A query with 500+ hits returns within the timeout, shows the cap row, and the UI
   never stalls; Esc mid-search cancels and the palette stays responsive.
5. No project, folder open: searches the folder. Neither: "nothing to search".
6. `rg` renamed away from PATH: one clear error row, returned immediately.
7. `--pre cmd foo` is refused with a message; `-r` is ignored harmlessly (no file changes).
8. Reopening Ctrl+Shift+F shows the last query and results.
9. Nothing at rest: no background process, no index, no file touched.

## Bump

`Cargo.toml` → 2.19.0; CHANGELOG (Added: Find in Files); one commit
`2.19.0 find in files: Ctrl+Shift+F ripgrep search in the palette`.
