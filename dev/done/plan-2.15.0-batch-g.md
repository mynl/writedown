# Plan 2.15.0 → 2.17.0 — Batch G

Status: **proposed 2026-08-31, not approved, nothing built.** Source: `writedown-issues.md`,
Batch G (2026-08-11), triaged 2026-08-31 with the author's `==>` decisions applied.

This plan stands alone. It states, per item, the goal, what happens today, the change, the
files, and the acceptance check. Root-cause detail lives in the "Batch G — developer notes"
section of `writedown-issues.md`; this document is what gets implemented.

## Shape of the batch

Three version bumps, committed one per bump, in this order:

| Version | Scope | Rust? |
|---|---|---|
| **2.15.0** | [picker] [focus] [palette] [error-bar] [roots] [title] [copy-path] [help] | No |
| **2.16.0** | [freeze] — spell/check commands off the UI thread, lazy suggestions | Yes |
| **2.17.0** | [identify] [syntax] [preview-keys] | No |

Pended by the author, not in this plan: G.07 side-by-side, G.12 highlight-ahead. G.02 needs
only documentation. G.08 is closed.

Tidying committed alongside 2.15.0 with no bump: the CHANGELOG reorder (done, uncommitted),
`vite.config.ts` junction code removal, the `config.rs` example path, the `CLAUDE.md` rewrite.

House rules that bind every step: never write to a user's document; `.wdproj` files are
app-managed and may be rewritten by `save_project` only; session-only state never reaches
config or disk unless the item says so.

---

## 2.15.0

### [picker] — Unicode picker: recents first, visible selection, sane arrows (G.01, G.11)

**Today.** In `src/Palette.tsx`, two effects fight on every keystroke: the seat-on-a-real-row
effect (deps `[results]`, lines 227-234) picks index 1, then `useEffect(() => setSel(0),
[query])` (line 235) puts the selection back on index 0 — the "Recent" heading. Result with any
non-empty query: no row highlighted, Enter does nothing, ArrowUp dead. Separately,
`searchSymbols` in `src/editor/symbols.ts` truncates to 60 rows (line 224) *before* the
recent/rest partition (`Palette.tsx:88-92`), so a recently used character ranked 61st for a
broad query never appears. Symbol rows render without match highlighting (`Palette.tsx:332-356`
uses plain spans; `positions: []` at `symbols.ts:221`). Every row has an unguarded
`onMouseMove={() => setSel(i)}` (lines 338, 374), so scrolling the list under a stationary
pointer snaps the selection back. PageUp/PageDown/Home/End are unhandled.

**Change.**
1. Remove the `[query]` effect. The `[results]` effect always re-anchors to the first
   choosable row (drop the "keep `s` if still valid" branch — a new result set is a new
   anchor).
2. `searchSymbols(query, entries)` with no limit; partition into recent/rest; cap `rest` at
   60. Headings unchanged.
3. Compute display positions with `fuzzyMatch(q, e.name)` (name only) and render the symbol
   name through the existing `<Highlight>`; `searchSymbols` keeps ranking on the haystack.
4. Mouse-move guard: store last `clientX/clientY`; ignore a move with unchanged coordinates.
5. `onKeyDown`: PageUp/PageDown move by the visible row count; Home/End to first/last
   choosable row. Scroll-into-view includes the heading above the selected row when the
   selection is the first row of a group.

**Files.** `src/Palette.tsx`, `src/editor/symbols.ts`.

**Accept.** Ctrl+Shift+U, type `arrow`: first rows are your recent arrows under "Recent", one
row highlighted, Enter inserts it. Ctrl+Shift+U, Enter re-inserts the last character. Use a
character, then query something broad (`circle`): it appears under Recent even if it would
rank past 60. Matched letters in names are coloured. Park the mouse over the list and
press Down ten times: the selection moves ten rows. PageDown moves a page.

### [focus] — the editor gets focus when a file opens (G.03)

**Today.** No open path focuses the editor: tree click/Enter, palette pickers, Ctrl+Shift+Q,
Ctrl+O, project switch, session restore, launch files, tab click, Ctrl+Tab. Only `newFile`,
`newFileIn`, `newScratch`, `saveAs` call `focusEditorSoon()` (`src/store.ts:106`). From the
tree, focus stays in the `tabIndex={0}` tree body (`src/App.tsx:465`), whose key handler owns
Delete — so the first Delete after opening a file from the tree deletes the file. The module
singleton in `src/editor/editorView.ts:6-22` is set in `onCreateEditor` and never cleared on
unmount, so in preview-only mode `getActiveView()` returns a destroyed view.

**Change.**
1. `Editor.tsx`: on unmount, `setActiveView(null)`.
2. `Editor.tsx`: a `useEffect` keyed on `path`, placed after the cursor/scroll restore effect
   (lines 319-353), calling `view.focus()`. Skip when the active doc is not an editor doc
   (image tab, CSV grid) or when the palette is open (`paletteMode !== null`).
3. `focusEditorSoon()` checks `view.dom.isConnected` before focusing.

**Files.** `src/editor/Editor.tsx`, `src/editor/editorView.ts`, `src/store.ts`.

**Accept.** Open a file from the tree, the quick-file picker, Ctrl+Shift+Q, Ctrl+Tab and the
project switcher; type immediately — the text lands in the document. Open from the tree, press
Delete: a character is deleted, not the file. Switch to preview-only mode and back: no console
error, typing works.

### [palette] — one vocabulary, every editor action reachable (G.05)

**Today.** "New Scratch File (unsaved) (Ctrl+Shift+N)" (`src/commands.ts:99`) sits beside
"Name Temporary File…" (`commands.ts:107`); a search for "temp" finds only the second. About 35
registry actions (find, replace, goto line, folds, editor zoom, case changes, sort lines,
transposes, cursors, subword moves, the Ctrl+P file picker, bare build) have no palette verb.
Key hints are hand-typed into some titles and absent from others.

**Change.**
1. Rename to "New Temporary File (unsaved)"; keep the id `new-scratch`.
2. `registryCommands()`: for every `COMMAND_REGISTRY` entry not already covered by an
   explicit verb, emit `{ id: "cmd:" + name, title: <category>: <label>, run }` that focuses
   the active view and runs the command. Explicit verbs win on id collision.
3. Key hints: strip `(Ctrl+…)` from titles; the palette appends the live binding from the
   merged keymap (`mergedKeys` in `src/editor/keymap.ts`) at render, dimmed, so a `[keys]`
   rebind updates it. App-level keys (Ctrl+S, Ctrl+W, Ctrl+Shift+N…) come from a small static
   table in `src/shortcuts.ts`, which already lists them for F1.
4. Naming pass on the existing verbs **only after the author reviews the inventory** in the
   Batch G notes (prefixes, explicit on/off pairs for the three "Toggle" verbs). Not started
   until that review is back; steps 1-3 do not depend on it.

**Files.** `src/commands.ts`, `src/Palette.tsx`, `src/editor/keymap.ts`, `src/shortcuts.ts`.

**Accept.** Palette "temp" finds both temporary-file verbs. Palette "find", "go to line",
"fold all", "sort lines", "upper case" each run. Rebind Ctrl+F in config `[keys]`; the
palette shows the new key beside Find without a restart.

### [error-bar] — a config error you can read (G.06)

**Today.** `src/App.tsx:424-436` renders one `<button>`: a 68-character fixed prefix, then
`{configError}`, in a `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` strip
(`src/App.css:549-567`). A multi-line `toml::de::Error` collapses and is ellipsized away; the
tooltip is the fixed "Open config.toml"; nothing is logged. `configError` is also the general
error slot written from ~25 sites, so a later unrelated error replaces the config error.

**Change.**
1. Split the slot: `configError` (config parse only) and `lastError` (everything else). Both
   render in the same bar style; config first if both are set.
2. Bar content: the error text first, `white-space: pre-wrap`, `max-height: 8em`,
   `overflow: auto`; the boilerplate ("config.toml did not parse — fonts and bibliography fell
   back to defaults; click to edit") after it in a second line; full text in `title`.
3. A `×` dismiss that clears the slot without opening anything; clicking the text still opens
   `config.toml`.
4. `void logError(...)` beside every `set({ configError })`, so the text reaches
   `~/.writedown/logs/writedown.log`.
5. Palette verb "Show Last Error" re-displays the last dismissed message.

**Files.** `src/App.tsx`, `src/App.css`, `src/store.ts` (`configError` sites at 1649-1653 and
the ~25 `lastError` sites), `src/commands.ts`.

**Accept.** Break `config.toml` (unbalanced quote), save: the bar shows the TOML message with
its line and column, readable, scrollable if long, and the same text is in the log. Trigger an
unrelated error (copy path on a scratch buffer): the config error stays. `×` clears it; "Show
Last Error" brings it back.

### [roots] — explicit labels for project folders (G.14)

**Today.** `.wdproj` is `{ name, folders: string[] }` (`src-tauri/src/project.rs:8-14`,
`src/api.ts:59`). Tree roots are labelled by basename (`rootEntry`, `src/store.ts:155-161`);
three folders named `docs` render as three identical rows. The full path is already the row
tooltip (`src/tree/FileTree.tsx:176`). Saving the `.wdproj` in a tab already reloads the
project live (`store.ts:1465`).

**Change.** Author's design: an optional per-folder string shown as `dir (label)`; empty label
→ `dir`.
1. `Project` gains `labels: HashMap<String, String>` with
   `#[serde(default, skip_serializing_if = "HashMap::is_empty")]`, keyed by the folder path
   exactly as it appears in `folders`. `folders` and every consumer of `projFolders` are
   untouched; `sessionKey` keeps joining paths.
2. `api.ts`: `Project = { name; folders; labels?: Record<string, string> }`; store keeps
   `projLabels`.
3. `ProjectTree` passes `label` = `labels[path]` into the root `TreeNode`; `tree-name` renders
   `dir (label)` when the label is non-empty. Tooltip unchanged (path).
4. Palette: one verb per root, "Project: Label Folder “‹dir›”…", via `openPrompt` (as
   `New File…` does, `commands.ts:84-88`), prefilled with the current label; empty input
   clears it; writes through `save_project` and reloads.
5. HELP.md: document the `labels` key and the verb, with a hand-edit example.

**Files.** `src-tauri/src/project.rs`, `src/api.ts`, `src/store.ts`, `src/tree/FileTree.tsx`,
`src/commands.ts`, `HELP.md`. (Rust change is a struct field; `cargo test` covers
serialization round-trip — add a test that a file without `labels` loads and saves
byte-identical.)

**Accept.** Project with three `docs` roots: label two of them; the tree shows `docs (AI)`,
`docs (papers)`, `docs`. Hand-edit the `.wdproj` to change a label and save it in a tab: the
tree updates without reopening the project. A `.wdproj` with no labels saves without a
`labels` key.

### [title] — the window title is the project name (G.15)

**Today.** `setTitle` (`src/store.ts:110-115`) writes `"<project> — Writedown"` or
`"Writedown"`. `hydrate` (`store.ts:697-733`) never calls it on the plain-folder branch, so a
folder workspace restored at launch shows "Writedown" until a project is opened.

**Change.** Title is the bare project name (folder name for a folder workspace, "unsaved
project" for a project with no file yet, "Writedown" with nothing open). `hydrate` sets it on
the folder branch.

**Files.** `src/store.ts`.

**Accept.** Open project "AI": title bar reads `AI`. Close it: `Writedown`. Restart with a
folder workspace: the folder name.

### [copy-path] — Ctrl+Shift+C copies the file path (G.16)

**Today.** "Copy File Path" / "Copy File Name" exist as verbs (`src/commands.ts:161-188`), no
key, not in the tree context menu (`src/tree/FileTree.tsx:326-363`). Ctrl+Shift+C opens the
citation picker, bound at `Prec.high` in `src/editor/citations.ts:278` — outside the registry,
not rebindable, not in F1. Author's decision: copy-path takes Ctrl+Shift+C.

**Change.**
1. Registry actions `copyFilePath`, `copyFileName` (active document; a scratch buffer reports
   "unsaved — no path" in the status bar). `DEFAULT_KEYS`: `Ctrl+Shift+C → copyFilePath`.
2. Registry action `insertCitation` (the existing `openCitationPicker`), **unbound by
   default** — typing `@` already opens the same completion — rebindable via `[keys]`; palette
   verb "Insert: Citation…". Remove the `Prec.high` keymap from `citations.ts`.
3. Tree context menu: "Copy Path" on the right-clicked entry.
4. HELP.md:163 (citations) and the shortcuts list.

**Files.** `src/editor/commandRegistry.ts`, `src/editor/keymap.ts`, `src/editor/citations.ts`,
`src/commands.ts`, `src/tree/FileTree.tsx`, `src/shortcuts.ts`, `HELP.md`.

**Accept.** Ctrl+Shift+C in the editor, paste elsewhere: the full path. Same from the preview
pane once [preview-keys] lands (2.17.0); until then, palette. Right-click a tree file → Copy
Path. `@` still opens citation completion. `[keys] "Ctrl+Shift+E" = "insertCitation"` binds
the picker.

### [help] — document the title-bar settings (G.02)

**Change.** HELP.md gains a short "Window" subsection: `[window] titlebar_color`,
`titlebar_text_color`, `#RRGGBB` or `"none"`, single-quote the value (a `#` inside double
quotes ends a TOML basic string), Windows 11 only, defaults orange `#DD9536` / navy `#15385D`.
No code.

### Tidying (no bump, committed after 2.15.0)

- `vite.config.ts`: replace `realRoot` with `process.cwd()`; `fs.allow: [cwd, csvGridDist]`;
  fix the "same synced tree" comment; drop the `command === "build"` root override. `CLAUDE.md`
  build-paths section: "always run from `V:\dev\writedown`; the `C:\S\dev` symlink is not a
  supported launch path."
- `src-tauri/src/config.rs:138`: neutral example path for `personal_dictionary`.
- `src-tauri/src/files.rs`: one sentence noting the CloudStation junction no longer exists.
- Commit the `CLAUDE.md` rewrite and the CHANGELOG reorder.

---

## 2.16.0 — [freeze] the two-second stall after the first edit (G.04)

**Today.** All `#[tauri::command]` functions in this crate except `render_document`,
`run_cell`, `run_build` are synchronous, and Tauri runs synchronous commands on the main
event-loop thread — the WebView2 host thread. The three CodeMirror linters share one 500 ms
idle timer (`src/editor/spelling.ts:75`, `lint.ts:28`, `citations.ts:263`), so after the
first typing pause in a freshly opened document `spell_check`, `check_document` and
`check_citation_keys` fire together and serialize on that thread. `spell_check`
(`src-tauri/src/spelling.rs:159-199`) computes `dict.suggest()` for up to
`MAX_SUGGEST_WORDS = 64` unknown words, cold — an n-gram scan per word, tens of ms each —
then memoizes in `suggest_cache`. Estimated 1.3–2.6 s, once per document. Ahead of it on the
JS thread, `spellTokens` (`src/editor/prose.ts:93-164`) resolves a syntax-tree node per
candidate word over the whole document.

**Change, in order, each measured.**
1. *Measure.* `#[ignore]` benchmark in `spelling.rs` (pattern: `labels.rs` `scan_speed`):
   `spell_check` on a fixture with 80 unknown words, cold and warm, release build. Record
   the numbers in the CHANGELOG entry. Also a `performance.now()` around the lint sources in
   dev to time `spellTokens` on the author's largest document.
2. *Off the UI thread.* `#[tauri::command(async)]` on `spell_check`, `check_document`,
   `check_citation_keys`, `read_file`, `write_file`, `list_all_files`. `SpellState` is behind
   a `Mutex`, `dict()` is a `OnceLock`, `BibState` is a `Mutex` — no new synchronization.
   Typing stays responsive while a pass runs.
3. *Lazy suggestions.* `spell_check` returns misspellings without suggestions; new command
   `spell_suggest(word) -> Vec<String>` (cached) is called by the lint action/hover when the
   user opens a misspelling. `MAX_SUGGEST_WORDS` goes away.
4. *`spellTokens`.* Skip the per-word tree resolution for words outside any fenced/math
   region using the regions the function already computes — only if step 1 shows it matters.

**Files.** `src-tauri/src/spelling.rs`, `src-tauri/src/check.rs`, `src-tauri/src/bib.rs`,
`src-tauri/src/files.rs`, `src-tauri/src/lib.rs`, `src/api.ts`, `src/editor/spelling.ts`,
`src/editor/prose.ts`. Rust changes — rebuild.

**Accept.** Open a large document with many unknown words, type, pause: no freeze; squiggles
appear while typing continues. Hover a squiggle: suggestions appear (first hover may take tens
of ms). Benchmark numbers before/after in the CHANGELOG. `cargo test` green.

---

## 2.17.0

### [identify] — Identify Character (G.09)

**Today.** Ctrl+Shift+U with a one-character selection prefills `u+XXXX` in the picker
(`src/Palette.tsx:162-172`); no verb, no status readout, nothing for a bare cursor.

**Change.** Registry action `identifyCharacter` (rebindable, in F1; palette "Edit: Identify
Character"): the selected character, else the character after the caret; look it up in
`loadSymbols()`; `showStatusMessage("U+2192 RIGHTWARDS ARROW · LaTeX \rightarrow · UTF-8 E2 86
92")`. Off-table: code point and bytes only. Multi-character selection: identify the first and
say "(first of N)".

**Files.** `src/editor/commandRegistry.ts`, `src/editor/symbols.ts`, `src/commands.ts`.

**Accept.** Select `→`, run the verb: status bar shows the line above. Bare cursor before `é`:
`U+00E9 LATIN SMALL LETTER E WITH ACUTE`. A CJK character outside the table: `U+4E2D · UTF-8
E4 B8 AD`.

### [syntax] — Set Syntax, session-only, colouring only (G.10)

**Today.** `languageForPath` chooses by extension (`src/editor/languages.ts:66-93`), falling
back to `@codemirror/language-data`. The language extension is in the memoized extension
array (`src/editor/Editor.tsx:153`), not a Compartment. The footer already has clickable
status items (`src/App.tsx:672-688`).

**Change.**
1. Store: `syntaxOverride: Record<string, string>` (path → language name), **not** in the
   session snapshot, never written anywhere.
2. `useLanguageFor(path, override?)` resolves an override name through `codeLanguages(name)`.
3. `langCompartment` around the language extension; override changes dispatch a reconfigure
   instead of rebuilding the extension array.
4. `syntaxCommands()`: "Syntax: Markdown / Python / JSON / YAML / TOML / LaTeX / DecL /
   Plain Text" plus the `language-data` names; "Syntax: Auto (by extension)" clears.
5. Footer item "Syntax: ‹name›" (suffix "(colouring)" when overridden) that opens the palette
   filtered to `Syntax:`.

**Scope statement (locked decision rule).** Delivers colouring only. Markdown-specific
features — front matter, math, citations, spelling, list continuation — and CSV rainbow stay
extension-driven. Setting "Markdown" on a `.txt` colours it; it does not spell-check it.

**Files.** `src/editor/languages.ts`, `src/editor/Editor.tsx`, `src/store.ts`,
`src/commands.ts`, `src/App.tsx`.

**Accept.** Open a `.txt` containing Python; "Syntax: Python" colours it; the footer says
`Syntax: Python (colouring)`; switch tabs and back — still Python; restart — back to plain
text. "Syntax: Auto" restores.

### [preview-keys] — editor chords work from the preview (G.13)

**Today.** The CodeMirror keymap fires only with the view focused; clicking the preview
(`src/preview/Preview.tsx:958`, no `tabIndex`) blurs the editor and leaves focus on `<body>`,
where only the window handler in `src/App.tsx:291-364` listens — so Ctrl+F, Ctrl+H, Ctrl+G,
the Ctrl+K chords, folds and zoom are dead.

**Change.**
1. At the top of `onKey`: if the event target is not inside `input, textarea,
   [contenteditable], .cm-editor, .tree-body`, take `getActiveView()`; if
   `view.dom.isConnected`, focus it and call `runScopeHandlers(view, e, "editor")`
   (`@codemirror/view`); return if handled. CodeMirror's own chord state carries
   Ctrl+K Ctrl+x across the two keystrokes.
2. Preview-only mode (editor unmounted): Ctrl+F opens a minimal find over the rendered
   preview (browser `window.find` is unavailable in WebView2 for this; implement as a small
   highlight-and-scroll over `.preview-scroll` text nodes, Enter/Shift+Enter to step, Esc to
   clear). Other editor chords are ignored there.

**Depends on** [focus] step 1 (`setActiveView(null)` on unmount).

**Files.** `src/App.tsx`, `src/preview/Preview.tsx`.

**Accept.** Split view, click in the preview, Ctrl+F: the editor search panel opens with the
editor focused. Ctrl+K Ctrl+U with a selection, from the preview: upper-cases it. In the tree,
Delete still deletes a file and never reaches the editor. Preview-only, Ctrl+F: finds text in
the rendered page.

---

## Acceptance for the batch as a whole

- `npm run build` and `cargo test` green at every bump.
- Each bump: one commit `X.Y.Z <what changed>`, CHANGELOG section of 3-8 bullets, footer
  version reads correctly in the built exe.
- The author kicks the tires on 2.15.0 before 2.16.0 starts; 2.16.0 ships its benchmark
  numbers; 2.17.0 items each carry the scope statement above.
