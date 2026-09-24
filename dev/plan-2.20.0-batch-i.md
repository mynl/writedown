# Plan: Batch I — 2.20.0 through 2.24.0

Written 2026-09-24, from the triage and author decisions recorded in `writedown-issues.md`
(Batch I table, `>>CC` rows, `==>` author comments, and the **Resolved 2026-09-24** notes).
This plan stands alone: no conversation context is needed to review or implement it.

Batch I is eight items, I.01–I.08, grouped into five version bumps. One commit per bump, one
CHANGELOG section per bump, newest first, per house rules. Nothing here is built yet.

| Version | Items | Area | Label |
|---|---|---|---|
| 2.20.0 | I.03, I.04, I.05, I.08 | frontend only | [quick-wins] |
| 2.21.0 | I.06 | frontend only | [reflow] |
| 2.22.0 | I.01 | frontend + new npm dep | [diff-pane] |
| 2.23.0 | I.02 | Rust + frontend | [git-marks] |
| 2.24.0 | I.07 | Rust, Windows-only | [window-routing] |

Rationale for the grouping: 2.20.0 is four small low-risk edits; 2.21.0 rewrites prose, so it
reverts alone; 2.22.0 introduces `@codemirror/merge`, which 2.23.0 then reuses; 2.23.0 is the
project's first external-program dependency; 2.24.0 is Win32 plumbing with the biggest blast
radius, built last on an otherwise-quiet tree.

---

## 2.20.0 [quick-wins] — sort family, outline labels, centered search, transpose involution

### [sort] I.03 — the Sublime sort-lines family

**Current behavior.** `sortLines` (`src/editor/textOps.ts:93-103`) sorts the lines spanned by
the primary selection with plain `localeCompare`, ascending only. Palette verb exists (from the
G.05 registry pass); no key bound.

**Change.** Refactor into one parameterized builder and four registry entries:

```ts
function makeSortLines(opts: { reverse?: boolean; caseSensitive?: boolean; fromColumn?: boolean }): StateCommand
```

- Comparator: `a.localeCompare(b, undefined, { numeric: true, sensitivity: opts.caseSensitive ? "variant" : "base" })`.
  Numeric collation means `item2` sorts before `item10` — a deliberate improvement over today.
- `fromColumn`: the sort key is `line.slice(col)` where `col` is the column of the selection
  START (`main.from` minus its line start). Lines shorter than `col` yield the empty key and
  sort first. Pairs naturally with Alt+drag column selection.
- All variants keep today's contract: whole lines spanned by the primary selection, single
  undo step, `userEvent: "sort.lines"`.

Registry (`src/editor/commandRegistry.ts`), category "Editing":

| action | label | key |
|---|---|---|
| `sortLines` | Sort lines | **F9** |
| `sortLinesReverse` | Sort lines (reverse) | **Shift+F9** |
| `sortLinesFromColumn` | Sort lines (from caret column) | — |
| `sortLinesCaseSensitive` | Sort lines (case sensitive) | — |

Keys go in `DEFAULT_KEYS` (`src/editor/keymap.ts`); F9 and Shift+F9 are currently unbound —
verified, no conflict. Author decision 2026-09-24: F9/Shift+F9 exactly; the case-sensitive
variant stays palette-only.

**Files.** `src/editor/textOps.ts`, `src/editor/commandRegistry.ts`, `src/editor/keymap.ts`,
`HELP.md` (key list).

**Acceptance.** Select five lines containing `item10 / item2 / Apple / apple / zebra`: F9 orders
numerically and case-insensitively; Shift+F9 reverses; caret at column 4 + from-column verb
sorts by the tail of each line; one Ctrl+Z restores the original in each case. F1 lists all
four with live keys.

### [outline-labels] I.04 — `#| label:` cells in the outline

**Current behavior.** `parseMarkdown` (`src/outline/parse.ts:64-120`) tracks fences precisely
and skips everything inside them, so Quarto code cells never appear in the outline.

**Change.** Inside a fence, match `/^#\|\s*label:\s*(\S+)/`; emit the label as a `Heading` at
`last heading level + 1` (level 1 if no heading yet), with a new optional field
`kind?: "label"` on the `Heading` type. `Outline.tsx` renders `kind === "label"` rows italic
and dimmed (final look decided by eye in the HMR loop). Clicking jumps to the `#| label:` line
like any heading. Language-agnostic by construction — `#|` is Quarto cell-option syntax in
python, r, and julia cells alike. The `MAX_CHILDREN` cap applies unchanged.

**Files.** `src/outline/parse.ts`, `src/outline/Outline.tsx`.

**Acceptance.** A `.qmd` with two headings and three labeled cells shows the labels indented
under their headings, styled distinctly; clicking one moves the editor to that line; a `.md`
with no cells is unchanged; a labeled cell above the first heading appears at level 1.

### [search-center] I.05 — center search matches

**Current behavior.** F3 / Shift+F3 / Enter in the find panel scroll the match to the nearest
edge — for forward search, the bottom line of the viewport. Verified in the installed
`@codemirror/search`: the default config is `scrollToMatch: range => EditorView.scrollIntoView(range)`.

**Change.** One line in `src/editor/Editor.tsx:169`:

```ts
search({ top: true, scrollToMatch: (range) => EditorView.scrollIntoView(range, { y: "center" }) })
```

Covers F3, Shift+F3, Enter/Shift+Enter in the panel, and select-all-matches. `y: "center"`
only scrolls when the match is meaningfully off-center, so short documents don't twitch.

**Acceptance.** In a long document, F3 through repeated matches: each lands mid-viewport, not
at the bottom edge. A match already on-screen near center does not scroll.

### [transpose] I.08 — Alt+T is an involution

**Current behavior.** `transposeWords` (`src/editor/textOps.ts:56-91`) leaves the caret after
the swapped pair (Emacs `M-t` semantics), so repeated Alt+T drags a word rightward. Author
decision 2026-09-24: "I want and expect it to be an involution."

**Change.** `ends.push(base + a.from + b.text.length)` instead of `base + b.to` — the caret
lands at the end of the new first word, i.e. between the pair. A second Alt+T finds the same
pair and swaps it back: Alt+T ∘ Alt+T = identity. Rewrite the function comment to say
involution explicitly, so nobody later restores Emacs drag semantics as a "fix".

**Files.** `src/editor/textOps.ts`.

**Acceptance.** `alpha beta` with caret in `alpha`: Alt+T gives `beta alpha` with the caret
between them; Alt+T again restores `alpha beta`. Multi-cursor: both carets behave the same.

---

## 2.21.0 [reflow] — fill paragraph (I.06)

**Goal.** Emacs `M-q` / Sublime `Alt+Q`: hard-wrap the paragraph at the caret (or each
paragraph a selection touches) to a fill column. Explicit command only — never automatic,
never on save. Core promise intact: this touches the buffer, one undo step, like any edit.

**Current behavior.** Nothing exists; word wrap is soft (`toggleWordWrap`). Ctrl+Shift+J joins
lines — reflow is its complement.

**Change.**

- New `src/editor/reflow.ts` exporting `reflowParagraph: StateCommand`.
- Fill column from config `[editor] fill_column`, default **80**. Plumbing follows the
  `[search]` precedent: key parsed in `src-tauri/src/config.rs` (`load_editor_settings`),
  added to `EditorSettings` in `src/api.ts`, read at run time via `useStore.getState()`.
- Paragraph = blank-line-delimited block containing the caret; with a selection, each
  paragraph it touches, processed independently.
- Wrapping: join the paragraph's lines, collapse runs of spaces at join points, break at
  spaces only so no word is ever split; a single word longer than the fill column stays on
  its own line unbroken.
- Markdown awareness — the real work:
  - **List items:** first-line prefix (`- `, `* `, `1. `, checkboxes) kept; continuation
    lines get hanging indent matching the prefix width; a reflow never merges adjacent items
    (each item is its own paragraph).
  - **Blockquotes:** strip the `> ` prefix, wrap, re-apply per line; nested `> >` preserved.
  - **Refuse with a status-bar note, change nothing:** caret inside a fence, table row,
    heading, YAML front matter, or display math. Detection reuses the fence/front-matter
    logic pattern from `src/outline/parse.ts` and the math regions from `src/editor/math.ts`.
- Registry entry `reflowParagraph`, label "Reflow paragraph (hard-wrap at fill column)",
  category "Editing", key **Alt+Q** in `DEFAULT_KEYS` (verified free).

**Files.** New `src/editor/reflow.ts`; `src/editor/commandRegistry.ts`, `src/editor/keymap.ts`,
`src/api.ts`, `src-tauri/src/config.rs` (template comment + parse), `src/store.ts`
(settings type), `HELP.md`.

**Acceptance.** A 300-character paragraph wraps to ≤80-column lines and one Ctrl+Z restores
it byte-for-byte. A two-line list item reflows with hanging indent and does not merge with
its neighbor. A `> ` quote keeps its prefix on every line. Alt+Q inside a table or fence
changes nothing and shows the status note. `fill_column = 100` in config takes effect after
a config save without restart (settings already reload live).

---

## 2.22.0 [diff-pane] — read-only diff view (I.01)

**Goal.** See what changed: the active tab against (a) the file as saved on disk, (b) a
previous version from the backup store, or (c) another open tab. Read-only, view-only;
palette-only entry (author decision 2026-09-24 — no buttons, no menus).

**What exists.** Every save copies the outgoing disk bytes into `~/.writedown/backups/`
(last 20 per file, `src-tauri/src/backup.rs`), surfaced by `list_backups` / `read_backup`
and the "Previous Versions…" picker (`src/Versions.tsx`) — which restores but cannot compare.
The pended G.07 analysis (issues file, Batch G notes) already designed a read-only pane in
the preview slot; this reuses its Design A reasoning.

**Change.**

- New npm dep **`@codemirror/merge`** (same org as the editor, MIT, small). Its unified merge
  view renders old-vs-new inline in a single read-only editor — right for a half-width pane.
- Store gains `diffAgainst: { kind: "disk" | "backup" | "tab"; path?: string; millis?: number } | null`,
  **never** in the session snapshot.
- New `src/preview/DiffPane.tsx`: a read-only CodeMirror with language highlighting, line
  numbers, and the unified merge extension. It renders in the preview slot ahead of the
  `showPreview` branch, inheriting `.split-pane`, the `Resizer`, and `splitRatio`. It never
  calls `setActiveView`, so the ~25 singleton call sites keep meaning "the editable pane"
  (the G.07 invariant). Own `EditorBoundary`.
- Content: the pane shows the current buffer against the chosen base. The buffer side follows
  edits debounced (~300 ms); the base is a static snapshot fetched at open (disk read,
  `readBackup`, or the other tab's buffer).
- Palette verbs (category "File"): **Diff: Against Saved File on Disk**, **Diff: Against
  Previous Version…** (reuses the Versions picker list to choose the stamp), **Diff: Against
  Open Tab…** (submenu of other open tabs), **Diff: Close**. Esc with the pane focused also
  closes. Verbs are disabled for previewable-only documents (images, CSV grid).
- Scope statement (locked-decision discipline): no merging, no per-hunk revert in v1; restore
  stays in Previous Versions; diffing two closed files is out — open them as tabs first.

**Files.** `package.json` (+`@codemirror/merge`), new `src/preview/DiffPane.tsx`,
`src/store.ts`, `src/commands.ts`, `src/App.tsx` (preview-slot branch), `src/App.css`,
`HELP.md`.

**Acceptance.** Edit a saved file: "Diff: Against Saved File on Disk" shows the hunks;
continue typing and the pane updates. "Diff: Against Previous Version…" lists the stamps and
diffs the chosen one. "Diff: Against Open Tab…" diffs two tabs. Session restore after a crash
never reopens a diff pane. Editing remains responsive with the pane open on a 200 KB file.

---

## 2.23.0 [git-marks] — git status in the tree, optional gutter (I.02)

**Goal.** Small Sublime-style marks: which files are modified/added/untracked in the tree
(default ON), and optionally per-line change marks in the editor gutter (default OFF).
Author decisions 2026-09-24: those defaults; palette On/Off verb pairs; `[git] exe` config
for a git not on PATH.

**Eyes-open statement (locked-decision discipline).** This is Writedown's first feature that
runs another program. `git.exe` only; read-only invocations (`status`, `show`, `rev-parse`);
never any mutating git command; no network (all three are purely local). Git absent or the
folder not a repo → the feature is silently off; a one-line footer note the first time, never
an error. `status` cost scales with repo size — that is why every call is per-root, debounced,
and async.

**Change — Rust** (new `src-tauri/src/git.rs`, all commands `#[tauri::command(async)]` — the
G.04 lesson, never on the UI thread):

- Resolve the executable: `[git] exe` from config if set, else `"git"` on PATH.
- `git_status(root)` — `git -C <root> status --porcelain -z`, parsed to
  `Vec<{ path, state }>` with state ∈ modified | added | untracked | deleted | renamed.
  Non-repo or no git → `Ok(empty)` plus a flag the frontend uses for the one-time footer note.
- `git_show_index(path)` — `git -C <dir> show :0:<relpath>` (the index version of the file),
  for the gutter diff. Untracked file → empty base (all lines "added").

**Change — frontend:**

- Config `[git] tree_marks = true`, `gutter_marks = false`, `exe = ""` — parsed alongside the
  editor settings; palette verb pairs **Git: Tree Marks On / Off** and **Git: Gutter Marks
  On / Off** as session overrides (explicit pairs per the no-toggle-verbs UI rule).
- **Tree marks:** store fetches `git_status` per project root on load, on save, and on the
  existing file-watch events, debounced (~1 s). `FileTree.tsx` tints the filename or adds a
  small dot (Sublime-sized, final look in the HMR loop). Directories showing a rolled-up dot
  when they contain changes: only if cheap from the same map — no extra git calls.
- **Gutter marks** (off by default): on open and on save — NOT per keystroke — fetch
  `git_show_index`, diff against the buffer with the `diff` function `@codemirror/merge`
  already exports (in the bundle since 2.22.0), and paint a 3 px gutter stripe: changed /
  added / deleted-here. Live-while-typing is a follow-up only if on-save feels stale.

**Files.** New `src-tauri/src/git.rs`; `src-tauri/src/lib.rs` (register commands),
`src-tauri/src/config.rs`; `src/api.ts`, `src/store.ts`, `src/tree/FileTree.tsx`, new
`src/editor/gitGutter.ts`, `src/commands.ts`, `HELP.md`. Rust changed → **rebuild, and
smoke-boot the built bundle before handover** (memory: the 2.17.0 blank-window lesson).

**Acceptance.** In a repo with one modified and one untracked file, the tree marks both,
correctly distinguished; saving a clean file adds its mark within ~1 s. In a non-repo folder:
no marks, no errors, one footer note at most. Gutter verbs turn line marks on and off; marks
update on save. With git renamed away from PATH and `[git] exe` set, everything still works.
Typing latency is unchanged in both states (marks work is async + debounced).

---

## 2.24.0 [window-routing] — one window per file's project (I.07)

**Goal.** Stop window proliferation from Explorer double-clicks. Author-specified routing
(2026-09-24), by PROJECT MEMBERSHIP first:

1. File lies under a folder of an open window's project → open it THERE (several qualify →
   tie-break: current virtual desktop first, then front-most).
2. Under no open window's folders → first existing window (same tie-break) as a loose tab.
3. No Writedown windows at all → new window, as today.
4. Bare launch with no file arguments → ALWAYS a new window (that is how project instances
   are opened; never reuse).

**Windows-only, compile-gated** (author decision): `#[cfg(windows)]` module with a no-op
stub for other platforms — the `titlebar.rs` pattern — so the crate builds and runs
everywhere with the feature simply absent.

**Why hand-rolled.** `tauri-plugin-single-instance` forces one process total, which would
break the several-instances-one-per-project workflow (the orange title bars). Rejected.

**Mechanism** (new `src-tauri/src/instance.rs`, plus the `windows` crate — compile-time
bindings, no runtime dependency):

- **Instance registry.** Each running window writes `~/.writedown/instances/<pid>.json`:
  `{ pid, hwnd, roots: [...] }` — written at startup, rewritten on project open/close/change
  (the frontend already knows its roots; a tiny `set_instance_roots` command records them),
  deleted on exit. Derived and disposable, consistent with everything else under
  `~/.writedown/`.
- **Window marker.** Each window stamps its HWND with a named property (`SetPropW`); the
  marker name encodes debug vs release so a running `tauri dev` never captures the author's
  real double-clicks. The window also subclasses its wndproc (`SetWindowSubclass`) to accept
  `WM_COPYDATA`.
- **Launcher side** (in `run()` before Tauri builds a window, only when `cli_paths_or_exit`
  returned paths): read the registry files; drop entries whose pid is dead or whose HWND no
  longer carries the marker (stale-file guard); apply the routing rules above, using
  `IVirtualDesktopManager::IsWindowOnCurrentVirtualDesktop` (documented COM API) and z-order
  for the tie-break; send the paths via `WM_COPYDATA`; `AllowSetForegroundWindow`; exit
  before any window exists. Any failure at any step → fall through to a new window: routing
  is best-effort, opening the file is guaranteed.
- **Receiver side:** the `WM_COPYDATA` handler emits a Tauri event with the paths; the
  frontend listens and feeds them through the existing launch-file logic — factor the tail
  of `store.openLaunchFiles` (`src/store.ts:2459`) into a `openPaths(paths)` both call — and
  the window raises itself.

**Known edges, stated up front:** an elevated Writedown cannot receive `WM_COPYDATA` from a
non-elevated launcher (Windows rule; falls through to a new window — acceptable, rare);
Explorer multi-select launches N processes that race — each routes independently to the same
window, which is the right outcome; foreground-rights quirks mean the target window may
flash in the taskbar instead of raising if Windows denies focus — cosmetic, path still opens.

**Files.** New `src-tauri/src/instance.rs`; `src-tauri/src/lib.rs` (startup hook, event,
`set_instance_roots`); `src-tauri/Cargo.toml` (+`windows` crate, Windows-target only);
`src/store.ts` (roots reporting + event listener + `openPaths` factor). Rust changed →
rebuild + smoke-boot; this version additionally needs the REAL exe re-registered via
`scripts/windows-register.ps1` and manual double-click testing — dev builds cannot exercise
Explorer routing end to end.

**Acceptance.** With a project window open on desktop 1: double-click a file inside one of
its folders from any desktop → it opens there as a tab, window raised. Double-click a file
outside all open projects → loose tab in an existing window, preferring the current
desktop's. Close all windows, double-click → one new window. `writedown` with no arguments →
always a new window, even with others open. Kill a window via Task Manager, then
double-click → stale registry entry ignored, file opens in a surviving window or a new one.
`cargo check` passes for a non-Windows target (stub compiles).

---

## Order of work and discipline

Build strictly in version order; each bump is one commit (`X.Y.Z <what changed>` + trailer)
with its CHANGELOG section written at the bump. 2.20.0–2.22.0 are frontend-only (Vite HMR
look-and-feel loop applies); 2.23.0 and 2.24.0 change Rust — rebuild, run `cargo test` /
`cargo check` from `src-tauri/`, and smoke-boot the built bundle before handover. The author
kicks the tires per version; tweaks are ordinary further work. Move this plan to `dev/done/`
only when the author declares the batch done.

---

## Execution log — 2026-09-24

All five bumps landed, in order, one commit each. Gates per bump: `npm run build`
(tsc + vite) every time; `cargo test` from `src-tauri/` wherever Rust changed (2.21.0's
config.rs parse, 2.23.0, 2.24.0); import-cycle check (`npx madge --circular`) and a
headless smoke-boot of `dist/` after the Rust versions. Divergences, all small:

- **[quick-wins] HELP.md has no static key list** (F1 is generated live), so the sort
  family and reflow were documented as prose bullets in the Editing section instead.
- **[reflow] `src/store.ts` needed no settings-type edit** — the store imports
  `EditorSettings` from `api.ts`, where `fill_column` was added.
- **[reflow] wrapping collapses every whitespace run**, not only runs at join points
  (standard fill behavior; undo restores the original byte-for-byte either way).
- **[diff-pane] the store shape gained two fields** beyond the plan's
  `{kind, path?, millis?}`: `for` (the document the diff was opened on — the pane shows
  only while that tab is active and comes back on switch-back) and `base` (the static
  snapshot, fetched in the store rather than the component).
- **[diff-pane] "Diff: Against Open Tab…" is one verb per other open tab** — the palette
  has no submenus; this is the projectSwitches pattern.
- **[git-marks] untracked directories stay one collapsed entry** (porcelain default
  `--untracked-files=normal`): the folder tints and dots, files inside it are not
  individually marked. Cheap by construction; revisit only if it grates.
- **[window-routing] stale-entry validation is the HWND marker check alone**
  (`IsWindow` + `GetPropW`): a dead pid's window is gone and a recycled HWND cannot
  carry the property, so no separate `OpenProcess` liveness probe was needed.
- **Tire-kicking tweaks (2.24.1, author rulings 2026-09-24):** the diff pane takes the
  editor's theme (it was white under dark mode) and became a "Diff" TAB beside
  Preview/Rendered so the preview stays reachable; routing rule 2 (loose tab) is now
  restricted to windows on the current virtual desktop — none there means a new window,
  never a jump to another desktop. Rule 1 (project membership) still crosses desktops.
- **Left for the author:** re-register the freshly built exe via
  `scripts/windows-register.ps1` and double-click-test routing end to end (dev builds
  cannot exercise Explorer routing); kick the tires on each version; declare the batch
  done to retire this plan.
