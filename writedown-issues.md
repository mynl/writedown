# Feature Ideas and Bugs
## Claude Rubric

For each row in the table add a new row below it for your input, item is ">>CC".

* Enter low, medium or high effort
* Enter None, ... as impact on "speed" = user feel for speed of application. MUST remain sprightly.  This is assessment of whether the feature would have any impact on baseline performance of the app in its core functions.
* Under description add a **human-understandable** **short one- or two-line** summary and diagnosis (existing examples were too detailed and too complicated for me to understand!). Flag any issues.
* **BELOW** the table and with title the Item number, add your developer issues and implementation plan - this is "notes for Claude". Here lies comments more like the ones you have been producing.

***


## Batch H: Monday 2026-08-31

| Item | Effort HML | Status/Impact | Description |
|--:|:---:|:---:|:-------------------------|
| **H.01** | | | Insert date swallows preceding space. It should not. If there is no preceeding space it should add one.  |
| >>CC | L | None | **Confirmed, and not the verb's fault: opening the palette blurs the editor, save-on-blur autosaves, and the save trims trailing whitespace — the space you just typed at line end is gone before the stamp lands.** The trim stays (it is right); the stamp verb will add one space when the character before the cursor is not whitespace and it is not at line start. One function, covers both verbs and the key. |
| **H.02** | | | Quite common to edit project file -> link or button to do that lower left (to right of drop down, add a small one-char button that opens the project config file (with the file-open symbol. |
| >>CC | L | None | **Straightforward: the verb already exists ("Project: Edit Project File (.wdproj)"); this adds a 📂 button right of the dropdown that calls it, greyed when a folder is open without a project.** Footer becomes a flex row so the dropdown shrinks and the button never wraps. Plan: `dev/plan-2.18.0-batch-h.md`. |
| **H.03** | | | Ctrl+Shift+F find-in-files (A.08 reopened): ripgrep over the project, accept rg args (`-c` for counts), results in the palette, click through to the file and location. |
| >>CC | M | None at rest | **Built as 2.19.0.** The palette line IS rg's argument line (`TODO`, `-c TODO`, `-l x`, `-i "a b" -g *.qmd`); `--json` for hits, plain lines for `-c`/`-l`; Enter runs, Enter/click on a row opens at the match column, Ctrl+Enter re-runs, Esc cancels. Caps 500 hits / 5 s and default globs under `[search]`. Found while testing: an unquoted two-word query makes rg treat the second word as a path — rg's complaint now shows as a red note above the rows instead of being swallowed. Plan: `dev/plan-2.19.0-find-in-files.md`. |

Pended and waiting are G.07 (read-only split pane), G.12 (highlight-ahead — measure first).

## Batch G: Tuesday 2026-08-11

New config and project syntax.

```toml
[window]
titlebar_color = '#DD9536'       # the bar itself
titlebar_text_color = '#15385D'  # the caption text; white is not so clear!
```

```json
{
  "name": "DOOB",
  "folders": [
    "D:\\Projects\\notes\\DOOB-setup",
    "V:\\dev\\great-backup",
    "C:\\Users\\steve\\.great-backup",
    "D:\\Settings",
    "V:\\dev"
  ],
  "labels": {
    "V:\\dev\\great-backup": "repo",
    "C:\\Users\\steve\\.great-backup": "config"
  }
}
```

| Item | Effort HML | Status/Impact | Description |
|--:|:---:|:---:|:-------------------------|
| **G.01** | | ✅✓| Unicode inserter: it is not searching RECENT first! And why no colored results in search? |
| >>CC | L | None | **Confirmed — two bugs, both mine, both live in the exe you run. (1) The 2.14.2 fix is undone the moment you type: a second effect resets the selection to row 0, which is the "Recent" heading, so no row is highlighted and Enter does nothing until you press Down. (2) The search cuts to the top 60 BEFORE splitting out recents, so a recent match ranked 61st for "arrow" vanishes.** "No colored results": symbol rows never went through the match highlighter and carry no match positions. All three are small, one file each. |
| **G.02** | |✅ | Orange bar: can color be a config setting? What about height? Can the text [Project name] - Writedown be white and a config setting to ensure good contrast |
| >>CC | L | None | **Color: already a setting since 2.14.3 — `[window] titlebar_color` and `titlebar_text_color`; white text is one line, `titlebar_text_color = '#FFFFFF'`. The real bug is that neither key is in HELP.md.** Height: not adjustable — Windows owns the caption height; changing it means drawing our own title bar, which I recommend against. CHALLENGE on white: navy-on-orange measures 4.8:1 contrast (passes AA), white-on-orange 2.5:1 (fails). Try it via config; I would not make it the default. ==>AGREE; i will experiment |
| **G.03** | |✅ | When a file opens (eg quick file) the cursor needs to go in the edit window. This occurs all the time now. First edit of file.  |
| >>CC | L | None | **Confirmed: no open path focuses the editor — only New File, Scratch and Save As do. From the palette, focus falls to the page body; from the tree it STAYS in the tree, where your first Delete deletes the file.** Fix: one focus-on-open effect in the editor, plus clearing the stale editor handle on unmount (a latent bug in its own right, also behind G.13). |
| **G.04** | |✅?Atlas | Open a new file...edit...couple of seconds later-> ~2 second delay, no response from keyboard? Some background task. Investigate if there is anything obvious going on. |
| >>CC | M | **Big win** | **Found, with high confidence. Every backend command except render and build runs on the UI thread, and the first spell-check of a freshly opened document computes suggestions for up to 64 misspellings cold — tens of ms each. That is a one-time 1–2 s freeze, 500 ms after you pause typing, exactly your symptom; it never repeats because the suggestions are cached.** Fix: run the three check commands off the UI thread (one keyword each) and compute suggestions lazily. I have an estimate, not a number — the plan measures first. |
| **G.05** | |✅ | New temp file (Ctl+Shft+N) appear not to have a palette options; All commands hould be accessible from palette. |
| >>CC | L | None | **It exists — as "New Scratch File (unsaved)". You call it a temporary file, and so does its own sibling verb "Name Temporary File…", so searching "temp" finds one and not the other. Same disease as 2.14.1's quick-files rename: one vocabulary.** Audit result: about 35 editor keys (Find, Replace, Go to Line, fold, zoom, case, sort, Copy Path…) have no palette verb at all; they can be generated from the command registry in one pass. ==> Yes several palette things don't quite live where i expect! Pls add below table list of current palette commands so i can review.  |
| **G.06** | | ✅ nice!|Error in config are reported at the top of the program but they are overwritten (line row height is too small) and it cannot be read! |
| >>CC | L | None | **Confirmed. The error bar is one line, no-wrap, ellipsized, with 68 characters of boilerplate BEFORE the error text, no tooltip carrying the text, and nothing written to the log. Worse, it is the app's general error slot — any later error silently replaces the config error.** Fix: error text first, wrap, full text in the tooltip, log it, and a dismiss. |
| **G.07** | |PEND | You said multi window not possible; what about side by side tabs: both code view (in JLab) and  ST support this. Just *viewing* the two side by side. Could take over the space used by preview/render.  |
| >>CC | M | None at rest | **Feasible for exactly what you asked — a DIFFERENT open tab, read-only, in the preview slot, reusing the existing splitter: ~300 lines, no refactor of the editor. YELL: the same file in both panes, or an editable second pane, is L — 25 places assume one editor, and it re-opens the 1.81.0 edits-land-in-the-wrong-file bug. Read-only-other-tab or nothing; your call.** ==>Pend for now; do nothing  |
| **G.08** | | ✅ | ~~Can ctrl+space sp be the auto complete for large words? Or infact as an alternative for any compeletion situation.~~ appears to work already. |
| >>CC | — | — | Nothing to do. |
| **G.09** | |✅ | select a character then palette->identify = unicode info of selected glyph |
| >>CC | L | None | **Half exists: Ctrl+Shift+U with one character selected already prefills its code point. Proposal: an "Identify Character" verb showing code point, Unicode name, LaTeX name and UTF-8 bytes in the status bar, working from a bare cursor too.** Limit: a character outside our 2,322-entry table gets a code point but no name — shipping the full Unicode name list is ~1 MB and not worth it. ==>Agree |
| **G.10** | | ✅ | Can we set the "type" of the file for coloring? (cf ST lower right, scope).   |
| >>CC | L | None | **Doable: syntax is chosen by extension only today. Proposal: "Syntax: Python / Markdown / TOML…" palette verbs plus a clickable "Syntax: X" item in the footer, session-only — never written to the file or config. Coloring only in v1**; Markdown-specific features (math, citations, spelling) stay extension-driven, and making those follow the override is what would turn this into M. |
| **G.11** | | ✅ | Mouse arrows in the unicode select box do not work well. |
| >>CC | L | None | **Confirmed, two bugs: (1) the mouse fights the arrows — any mouse-move event reselects the row under the pointer, and scrolling the list under a stationary mouse generates one, so Up/Down snap back; (2) PageUp/PageDown/Home/End do nothing.** Plus G.01(1) hides the selection while you type. One file, shared with G.01. |
| **G.12** | | PEND | colorization lag on scrolling - white then colored. Can we "color ahead" a bit so that is smoother? |
| >>CC | L | **Risk** | **Not our code: nothing Writedown adds does any work on scroll. It is CodeMirror's parser scheduling — it starts at least 100 ms after the viewport moves, and for .agg/.toml/.tex files it never parses past the visible area at all. Mitigation: a ~20-line "parse ahead on scroll" nudge. Trade-off: it could turn "white then colored" into "colored but stuttery", so the plan measures on a big .qmd and a big .agg before deciding.** ==>PEND |
| **G.13** | | ✅| several commands (eg ctrl k, ctrl f) depend on which window you are in - they do not work in the preview window. That is confusing. Anything we can do about that? |
| >>CC | L | None | **Confirmed. Clicking the preview blurs the editor (focus goes to the page body), and Ctrl+F and the whole Ctrl+K family live in the editor's keymap, so they die there. Fix: the existing global key handler forwards editor chords to the editor whenever focus is nowhere useful — CodeMirror's own chord state handles Ctrl+K Ctrl+x for free.** Preview-ONLY mode has no editor to forward to; Ctrl+F there needs its own small handler. |
| **G.14** | |✅ | New issue: i've just made a project that has three directories with the same name... we need a way to decorate them or distinguish them. Ideas?  |
| >>CC | L | None | **Roots show the folder name only; the full path is already in the hover tooltip. Proposal: when root names collide, label them "name — parent" (and one more level if the parents collide too). The project switcher already does exactly this for same-named projects, so it is a reuse, not an invention.** Optional later: an explicit per-folder name in the .wdproj, Sublime-style.==>I'd like to be able to set an optional str that is shown after the folder name in the config - rather than guess from the folder name, format as dir (str) with the parens. Default '' which is just dir (no parens empty string obvs). ad |
| **G.15** | |✅ | App title bar - can we change to JUST be the project name or just Writedown if there is no project open. Ie omit the - Writedown? I have made the header bar orange to make it stand out, and run with several instances open. I just want to see the project name. It is really helpful and the - writedown part just confuses me.  |
| >>CC | L | None | **One line. Also found while looking: a plain folder workspace restored at launch never sets a title at all — it shows "Writedown" until you open a project. Fix together.** |
| **G.16** | | ✅ | Ctrl+Shift+C as shortcut for copy full file path and name (like OneCommander) V:/dev/writedown/writedown-issues.md |
| >>CC | L | None | **"Copy File Path" already exists as a palette verb with no key. CHALLENGE: Ctrl+Shift+C is the citation picker, documented in HELP. Options: (a) move citations elsewhere and give C to copy-path ==> yes I never knew about that or used it!; (b) copy-path on a free key — Ctrl+Shift+Y or Ctrl+Shift+M. I lean (b): a bib-first editor should keep its citation key. Also worth adding: Copy Path on the tree right-click menu, which is the OneCommander gesture.** |
| **G.17** | | ✅ | **NEW** when I edit this table the preview flies off to another part of the doc...can we have more stability. |
| >>CC | L | None | **Confirmed by reading, not yet reproduced. Preview blocks are keyed by a hash of their rendered HTML, so one edit in a table re-creates the WHOLE table as a new DOM node; new nodes start as a 60 px placeholder (`content-visibility: auto`) for a frame before laying out at full height. A tall table collapsing and re-expanding under the viewport, with its scroll anchor just deleted, is the jump.** Fix: update a replaced block in place (same node, new contents) and carry the old height over as the size hint. One function. Proposed for 2.16.0. |

**Shipped: G.01, G.03, G.05, G.06, G.11, G.14, G.15, G.16 and the G.02 documentation in 2.15.0 (2026-08-31) — none yet confirmed in daily use.** G.14 changed Rust, so rebuild. G.04 (2.16.0) and G.09 / G.10 / G.13 (2.17.0) follow; G.07 and G.12 pended; G.17 triaged 2026-08-31, proposed for 2.16.0.

**Shipped: G.04 and G.17 in 2.16.0 (2026-08-31) — Rust changed, rebuild.** Measured: one suggestion costs ~11 ms, 64 of them cold was the ~0.7 s freeze; suggestions now load when a misspelling is opened, and the six hot commands left the UI thread. Table edits update the preview block in place. Remaining: G.09 / G.10 / G.13 (2.17.0); G.07 and G.12 pended.

**Shipped: G.09, G.10 and G.13 in 2.17.0 (2026-08-31) — frontend only; Batch G is now fully dispatched (G.07 and G.12 pended by decision).** Set Syntax is coloring only, session only; the footer button opens the palette pre-filtered; preview-only Ctrl+F switches to split rather than searching the rendered page (the minimal answer — a find-in-preview is a follow-up if wanted).

**2.17.1 hotfix (2026-08-31): the 2.17.0 build opened an empty window** — a use-before-declaration in the new Set Syntax table killed the frontend at import time. Found by loading the bundle unminified in a headless browser; fixed, and the pre-existing citations/prose circular import removed while hunting it. Rebuilt; test against 2.17.1.

**Release batching, revised 2026-08-31 after the author's `==>` comments. Plan: `dev/plan-2.15.0-batch-g.md`. Nothing built yet.**

- **2.15.0 — confirmed fixes, frontend only:** G.01, G.11, G.03, G.05 (rename + registry-generated verbs, after the inventory review below), G.06, G.14 (explicit folder label), G.15, G.16 (Ctrl+Shift+C → Copy File Path; citation picker unbound but rebindable), G.02 (HELP.md documentation only — author experimenting with the colours).
- **2.16.0 — G.04, Rust:** check commands off the UI thread + lazy suggestions. Measured before and after.
- **2.17.0 — G.09, G.10, G.13.**
- **Pended, author's call:** G.07 (do nothing), G.12 (do nothing).
- **Tidying, no bump, alongside 2.15.0:** CHANGELOG reorder + restored 2.11.0 (done, uncommitted), `vite.config.ts` junction code, `config.rs` example path, `CLAUDE.md` commit.

---

## Batch G — developer notes and implementation plans

### The DOOB review (2026-08-31)

The 2.14.4 migration is holding: `tauri dev` starts, the release exe on disk is the 2026-08-28 build, and every G item is behavior, not environment. Loose ends found while looking, none urgent:

- **`vite.config.ts` junction handling can go** (author's decision 2026-08-31: Writedown is always built from `V:\dev`; `C:\S\dev` never enters into it). `C:\S\dev` is still a symlink to `V:\dev`, so the `realpathSync.native` real-root computation, the `root: realRoot` override on `build`, and the dual-spelling `fs.allow` list would matter if the dev server were ever launched through it — but it will not be, so on `V:\dev` `realRoot === cwd` and the code is inert. Strip it to `process.cwd()`, keep `fs.allow: [cwd, csvGridDist]`, and record the "always from `V:\dev`" rule in `CLAUDE.md` so nobody re-adds it. Also stale in the same file: "Both repos ride the same synced tree" — should say the sibling `csv-viewer` checkout is expected beside this one (`V:\dev\csv-viewer`, present, 3.9.0). Tidying, no bump.
- **`src-tauri/src/config.rs:138`** — the default config template's example line is `personal_dictionary = "C:/Users/steve/Documents/CloudStation/writedown-personal.dic"`: a username and a dead machine path, written into every new user's config.toml. Replace with a neutral example.
- **`src-tauri/src/files.rs`** doc comments describe `C:\S` as a junction to CloudStation. Historical and harmless (they explain why junction handling exists), but the path they name no longer exists; one sentence saying so would stop the next reader going looking.
- **`CLAUDE.md`** rewrite to the house-rules layout is uncommitted (working tree). Commit as tidying.
- **CHANGELOG.md — DONE 2026-08-31, uncommitted.** A 37-section block, 1.81.0 through 2.1.0, sat ASCENDING at the top of the file above 2.14.4, and `## [2.11.0]` was missing (the 2.12.0 commit, 58abb65, dropped it). All 178 sections are now strictly newest-first and 2.11.0 is restored verbatim from commit 4e2f084. Tidying, no bump.
- **This file:** the Batch F section ends with a pasted chat transcript ("from last time: 0.69 ms in release… ✻ Cooked for 9m 24s… ※ recap"). The decision it records (strip the label cache) shipped in 2.14.1; the block is safe to delete.
- **G.02's settings are undocumented** — `[window] titlebar_color` / `titlebar_text_color` appear only in the config template comments and CHANGELOG, never in HELP.md.

### G.01 / G.11 — the Unicode picker (`src/Palette.tsx`, `src/editor/symbols.ts`)

Four defects, one component:

1. **Selection lands on the heading whenever the query is non-empty.** `Palette.tsx:227-235`: the "seat on a choosable row" effect (deps `[results]`) runs first and picks index 1; the next line, `useEffect(() => setSel(0), [query])`, runs second and overwrites it. Its comment says "the effect above re-seats" — it cannot, because on the re-render `results` is the same memo object and the seat effect has no reason to fire. The 2.14.2 fix therefore only ever worked for the empty query. Consequences: no row highlighted (the heading branch never gets `.active` — this is the "no colored results"), Enter is a no-op (`choose()` bails on a heading), ArrowUp dead. **Fix:** delete the `[query]` effect and make the seat effect re-anchor to the first choosable row on every `results` change, which is what a new query wants anyway.
2. **Recents are split out AFTER the 60-row cut.** `searchSymbols(..., limit = 60)` slices at `symbols.ts:224`; the MRU partition happens afterwards at `Palette.tsx:88-92`. A recent character ranked 61st for a broad query is gone before the partition sees it. **Fix:** rank unlimited (2,322 rows, trivial), partition, then cap the *rest* group.
3. **No match highlighting.** Symbol rows render `e.name` as a plain span (`Palette.tsx:332-356`) and `searchSymbols` pushes `positions: []` (`symbols.ts:221`). The fuzzy match runs against a name+alias+latex haystack, so its indices do not map onto the displayed name; the fix is a second `fuzzyMatch(q, e.name)` for display positions, then route through the existing `<Highlight>`.
4. **Mouse fights arrows.** `onMouseMove={() => setSel(i)}` on every row (`Palette.tsx:338, 374`), unguarded. Arrowing scrolls the list under a stationary pointer, Chromium fires a synthetic mousemove, selection snaps back. **Fix:** remember `clientX/Y`, ignore a move whose coordinates are unchanged. Add PageUp/PageDown/Home/End to `onKeyDown` (`Palette.tsx:293-310`) while there. The scroll-into-view selector also skips headings, so the "Recent" label stays off-screen when you arrow onto its first row — include headings in the scroll target.

Bonus, minor: the code-point branch (`u+2299`) and the `\latex` branch bypass the MRU entirely. Acceptable; noting so it is not re-reported as G.01 again.

### G.03 — focus on open (`src/editor/Editor.tsx`, `src/store.ts`, `src/editor/editorView.ts`)

Audit of every open path: tree click, tree Enter, palette/quick-file picker, Ctrl+Shift+Q, Ctrl+O, project switch, session restore, launch files, tab click, Ctrl+Tab — **none focus the editor.** Only `newFile`, `newFileIn`, `newScratch`, `saveAs` call `focusEditorSoon()` (`store.ts:106`). From the palette, `choose()` opens then synchronously `closePalette()`, unmounting the input that held focus (`Palette.tsx:268-283`). From the tree, focus stays in the `tabIndex={0}` tree body (`App.tsx:465`), whose key handler owns Delete/Enter/F2.

**Fix, one place:** a `useEffect` keyed on `path` in `Editor.tsx`, right after the cursor/scroll restore effect (`Editor.tsx:319-353`), calling `view.focus()` — after the synchronous doc swap, so the cursor lands in the right document. **Prerequisite:** `setActiveView(null)` on Editor unmount. Today the module singleton (`editorView.ts:6-22`) is set once in `onCreateEditor` and never cleared, so in preview-only mode `getActiveView()` returns a destroyed view; `Outline.tsx:8-14` already works around this. Fixing it here also unblocks G.13. Guard: do not steal focus when the opened doc is preview-only (images, CSV grid).

### G.04 — the two-second freeze (`src-tauri/src/spelling.rs`, `lib.rs`; `src/editor/prose.ts`)

**Mechanism.** Tauri runs a non-`async` `#[tauri::command]` on the main event-loop thread (macro default `ExecutionContext::Blocking`). In this crate only `render_document`, `run_cell` and `run_build` are `async`; `spell_check`, `check_document`, `check_citation_keys`, `read_file`, `write_file`, `list_all_files` all block the WebView2 host thread for their duration — that is the "no keyboard response".

**Magnitude.** The three linters share one CodeMirror lint timer (`delay: 500` in `spelling.ts:75`, `lint.ts:28`, `citations.ts:263`), so on the first pause after opening a document all three IPC calls fire together and serialize. `spell_check` (`spelling.rs:159-199`) computes `dict.suggest()` for up to `MAX_SUGGEST_WORDS = 64` unknown words, cold; spellbook's suggest is an n-gram scan over the whole word list, tens of ms per word. 64 × 20–40 ms ≈ 1.3–2.6 s, once, then memoized in `suggest_cache`. On the JS side `spellTokens` (`prose.ts:93-164`) does a `syntaxTree().resolveInner()` per candidate word over the whole document first — plausibly 100–500 ms on a 200 KB file, on the same thread, ahead of the IPC.

Timing fits: open → type → 500 ms pause → freeze → never again for that document. A document with few misspellings (or one you have spell-checked before this session) will not show it, which is why it feels random.

**Plan.**
1. *Measure:* an `#[ignore]` benchmark beside the `labels.rs` one — time `spell_check` on a fixture with 64+ unknown words, cold and warm, release build. Numbers, not estimates, in the CHANGELOG.
2. *Off the UI thread:* `#[tauri::command(async)]` on `spell_check`, `check_document`, `check_citation_keys` (and `read_file`, `write_file`, `list_all_files` — `write_file` does a full backup copy on blur). `SpellState` is already behind a `Mutex`; `dict()` is a `OnceLock`. Typing stays responsive during the pass; the pass itself still takes as long.
3. *Cut the pass:* compute suggestions lazily — return misspellings without suggestions, fetch suggestions for one word when the user hovers/opens the fix menu. That removes the cost rather than hiding it. Drop `MAX_SUGGEST_WORDS` to ~8 as an interim if lazy suggestions are more than an hour.
4. *Frontend:* `spellTokens` can skip the per-word tree resolution for words outside any fenced/math region by using the regions it already computes — measure before touching.

Also noted: `check_citation_keys` rebuilds a 7,000-entry `HashSet` per call (`bib.rs:547-556`) — 0.3 ms, wasteful, not the freeze.

### G.05 — palette coverage and naming (`src/commands.ts`, `src/editor/commandRegistry.ts`, `src/editor/keymap.ts`)

Ctrl+Shift+N → `newScratch` (`App.tsx:357`) → palette id `new-scratch`, title "New Scratch File (unsaved) (Ctrl+Shift+N)" (`commands.ts:99`). Sibling verb: "Name Temporary File…" (`commands.ts:107`). Rename to "New Temporary File (unsaved) (Ctrl+Shift+N)"; both verbs say "temporary".

**Current palette inventory (`appCommands()`, `commands.ts:77-408`, in source order) — for the author's review.** Mark what should move, merge, rename, or go.

- *Files:* Open File… (Ctrl+O) · Open Folder… · New File… · New Folder… · New Scratch File (unsaved) (Ctrl+Shift+N) · Name Temporary File… · Open Quick File (Ctrl+Shift+Q) — the single [files] quick_file · Quick Files: Open from List… · Save · Save As… · Set Current Editor Size as Default (write to config) · Previous Versions… · Reload from Disk (discard my edits) · Overwrite Disk with My Version · Diagnostics: File Watch Status · Locate File in Sidebar · Copy File Path · Copy File Name
- *Markdown / editing:* Renumber Ordered List · Reformat Markdown Table(s) · Bold (surround with **…**) · Italic (surround with *…*) · Extract Citations to .bib (scratch) · Insert Date-Time (sample) · Insert Date (sample) · Insert: Unicode Character… (Ctrl+Shift+U) · Insert: ‹snippet› (one per `[snippets]` entry)
- *Spelling:* Toggle Spell Check · Add Word to Dictionary · Ignore Word (this session) · Open Personal Dictionary · Reload Personal Dictionary
- *View / layout:* Refresh File Tree · Show Sidebar (F10 toggles) · Hide Sidebar (F10 toggles) · Show Outline (F11 toggles) · Hide Outline (F11 toggles) · Enter Full Screen (Ctrl+F11 toggles) · Exit Full Screen · Enter Distraction Free (Ctrl+Shift+F11 toggles) · Exit Distraction Free · Enter Plain View — editor only, no sidebars or preview · Exit Plain View · Preview: Zoom In · Preview: Zoom Out · Preview: Reset Zoom · Toggle Word Wrap · Toggle Preview (editor / split / preview)
- *Help:* Open Help (help.md) · Help: Keyboard Shortcuts · About Writedown
- *Tools / render:* Open Shell (document folder) · Render Document (run code cells) · Run This Cell (Ctrl+Enter — live kernel state) · Preview: Number Sections · Preview: Don't Number Sections · Preview: Number Sections — Follow Document YAML · Restart Python Kernel · Edit Config (config.toml) · Keybindings: Write All Shortcuts to Scratch File · Build: ‹name› (one per `[build]` entry)
- *Tabs:* Close Tab · Close All Files (keeps unsaved scratch buffers) · Next Tab · Previous Tab · Reopen Closed Tab
- *Project:* Project: Add Folder to Project… · Project: New Project… · Project: Quick Switch… (Ctrl+Alt+P) · Project: Save / Rename Project… · Project: Open Project… · Project: Close Project · Project: Edit Project File (.wdproj) · Project: Switch to "‹name›" (one per recent project) · Project: Remove Folder "‹dir›" (‹path›) (one per root) · Project: Delete "‹name›"… (one per managed project)
- *Font:* Font: ‹family› (one per `[fonts]` entry) · Font: Reset to Config

**What I see in that list, for you to confirm or reject:**

1. **Prefixes are inconsistent.** `Project:`, `Preview:`, `Insert:`, `Font:`, `Build:`, `Help:` verbs are prefixed; file, edit, spelling, view and tab verbs are not. Searching "sidebar" or "close" works; browsing does not. Proposal: every verb gets a category prefix from a fixed list — `File:` `Edit:` `Insert:` `Spell:` `View:` `Preview:` `Tabs:` `Project:` `Tools:` `Help:` — and the palette shows the prefix dimmed. Cost: retyping titles; the fuzzy matcher is order-free since 2.11.0, so "sidebar hide" and "hide sidebar" both still hit.
2. **Three verbs flip meaning with state,** against your own UI rule: Toggle Spell Check, Toggle Word Wrap, Toggle Preview. The rest of the list already uses explicit pairs (Show/Hide Sidebar, Enter/Exit Full Screen). Proposal: Spell: On / Spell: Off, Wrap: On / Wrap: Off, View: Editor / View: Split / View: Preview. Keys keep toggling; only the palette verbs become explicit.
3. **Key hints in titles are hand-typed and stale-prone** — some verbs show one, most do not, and they cannot follow a `[keys]` rebind. Proposal: strip them from titles and append the *live* binding from the merged keymap when the palette renders, so every verb shows its real key and a rebind updates it.
4. **Missing entirely** (from a diff of `DEFAULT_KEYS` against `appCommands()`): Find, Replace, Go to Line; Fold / Unfold / Fold All / Unfold All; editor Zoom In / Out / Reset (the palette has only *preview* zoom); Select Next Occurrence, Select Line, Add Cursor Above / Below, Subword Left / Right, Line Start / End; Duplicate Selection, Move Line Up / Down, Toggle Comment, Join Lines, Delete Line, Kill to Line End / Start, Upper / Lower / Title Case, Transpose Chars / Words; Sort Lines, Insert Line After / Before, Duplicate Line (registry, no key, no verb); the Ctrl+P file picker; the bare-key Build; and the citation picker (Ctrl+Shift+C lives in `citations.ts:278`, outside the registry, so it is neither rebindable nor in F1 — G.16 moves it). **Generate** these: one `registryCommands()` mapping every `COMMAND_REGISTRY` entry (they already carry `label` and `category`) to a palette verb with its live key appended. That closes the gap permanently.

### G.06 — the config error bar (`src/App.tsx:424-436`, `src/App.css:549-567`, `src/store.ts:1649`)

Rendered as one `<button>` whose text is a 68-character fixed prefix followed by `{configError}`, styled `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. A `toml::de::Error` is multi-line (message, source line, caret, "at line N column M"); the newlines collapse and the error is ellipsized away. The `title` tooltip is the fixed "Open config.toml". Nothing calls `logError`, so the text lands nowhere. And `configError` is the general error slot written from ~25 sites (`store.ts`, `commands.ts`, `Editor.tsx`, `pasteImage.ts`, `spelling.ts`, `Preview.tsx`, `FileTree.tsx`) — last writer wins, no queue.

**Fix:** error text first, boilerplate second; `white-space: pre-wrap` with a `max-height` and `overflow: auto`; full text in `title`; `void logError(...)` beside the `set()`; a dismiss (×) that clears the slot; and a separate `configError` vs `lastError` so a later unrelated error does not erase the config one. Optional verb "Show Last Error" that reopens it.

### G.07 — side-by-side — PENDED (author, 2026-08-31: do nothing)

Analysis kept for when it comes back. One `EditorView` serves all tabs (1.81.0), reached through the module singleton `getActiveView()` from 25 call sites in 7 files. `Editor.tsx` also writes editor font CSS variables on `:root`, saves `store.activePath` on blur, and reconfigures two Compartments on the singleton.

**Design A — read-only second pane, different tab (M, ~300 lines).** Store gains `secondaryPath` (never in the session snapshot). New `SecondaryView.tsx`: a `<CodeMirror editable={false}>` with language + highlight + line numbers only — no save-on-blur, spelling, lint, citations, math, keymap Compartment, cursor reporting — and it never calls `setActiveView`, so every existing call site keeps meaning "the editable pane". Renders in the preview slot ahead of the `showPreview` branch (`App.tsx:566`), inheriting `.split-pane`, the `Resizer` and `splitRatio`. Needs its own `EditorBoundary`. Entry points: "Split: Show <tab> Beside" verbs per open tab; middle-click on a tab. Bypasses the `previewable` gate so a `.py` can sit beside a `.qmd`.

**Design B — editable second pane (L, 800+ lines).** Singleton becomes a focus-tracked registry; blur-save, Compartment fan-out, `:root` variables, footer Ln/Col, doc-swap effect, outline jump and preview scroll-sync all need a pane parameter. Re-opens the 1.81.0 bug class. Not without an explicit ask.

**Same document in both panes** is a third thing: two views cannot share an `EditorState`, so every keystroke is dispatched twice with mapped changes and an anti-echo annotation, doubling decoration and lint work. Not in v1 of either design.

### G.09 — Identify Character

Partial precedent: Ctrl+Shift+U with a one-character selection prefills `u+XXXX` (`Palette.tsx:162-172`), and the code-point branch of `searchSymbols` (`symbols.ts:163-186`) shows that one row. No verb, no status readout, nothing for a bare cursor. **Build:** `identifyCharacter` in `COMMAND_REGISTRY` (rebindable, F1-listed) reading `state.selection.main` — the selected char, else the char at `head` — then `loadSymbols()` lookup by `char`, and `showStatusMessage("U+2192 RIGHTWARDS ARROW · \rightarrow · UTF-8 E2 86 92")` (`store.ts:823-830`, 20 s auto-clear). `symbolData.ts` carries char, name, LaTeX names, aliases, kit, emoji flag for 2,322 characters — no general category; the generator has it and could add a column if wanted. Off-table characters: code point and bytes only.

### G.10 — Set Syntax (`src/editor/languages.ts`, `src/editor/Editor.tsx:149-207`, `src/App.tsx:655-702`)

`languageForPath` is a `switch` on extension (`languages.ts:66-93`), falling back to `@codemirror/language-data` (143 languages, lazy chunks). The language extension sits in the memoized extension array (`Editor.tsx:153`), not in a Compartment; two Compartments already exist to copy (`keymap.ts:16`, `wrap.ts:10`). The footer already has clickable `status-item` buttons (Wrap, Spell — `App.tsx:672-688`).

**Build (S):** `syntaxOverride: Record<path, name>` in the store, excluded from the session snapshot like `fontOverride`; `useLanguageFor(path, override?)` reusing `codeLanguages(name)`; a `langCompartment` around line 153; `syntaxCommands()` in the `fontCommands()` pattern producing "Syntax: Markdown / Python / JSON / YAML / TOML / LaTeX / DecL / Plain Text" plus the registry names; a "Syntax: X" footer item opening the palette pre-filtered. **Scope:** coloring only. `isMarkdownDoc` / `isCsv` (which gate front matter, math, citations, spelling, rainbow) stay extension-driven in v1; the footer label says "Syntax: Python (coloring)" to be honest about it.

### G.12 — highlighting lag on scroll — PENDED (author, 2026-08-31)

Analysis kept. Audit of every ViewPlugin and decoration source in `src/editor/` (`math.ts`, `frontmatter.ts`, `csvRainbow.ts`, `spelling.ts`, `lint.ts`, `citations.ts`): all guard on `docChanged`; none recompute on viewport change; there are no state-facet decoration providers, no CSS transitions on token colors. On a pure scroll Writedown adds zero work. What remains is CodeMirror itself (`@codemirror/language` 6.12.4, `@codemirror/view` 6.43.6):

- The parse worker defers work by ≥100 ms after a viewport move (`requestIdle`, `MinPause`), then needs a dispatch before `treeHighlighter` repaints. That gap is the white band on Markdown.
- The viewport margin is a compile-time 1000 px; there is no facet to widen it.
- `StreamLanguage` (`.agg`, `.toml`, `.tex`, and those languages inside Markdown fences) clamps parsing to `viewport.to` and never parses ahead, so any scroll past the margin guarantees a band.

**If revived:** measure first with a throwaway `updateListener` logging `syntaxTree(state).length` against `viewport.to` on viewport change, on a large `.qmd` and a large `.agg`. Mitigation if warranted: a ~20-line plugin calling `forceParsing(view, viewport.to + 20_000, 25)` inside `requestAnimationFrame` on viewport change; budget ≤25 ms or the white band becomes scroll stutter. Stream parsers ignore the ahead margin — only the earlier start helps them.

Side finding: `csvRainbow` rebuilds its whole decoration set on every keystroke with no debounce (`csvRainbow.ts:72`), unlike `mathHighlight`'s 200 ms. Give it the same treatment if CSV typing ever feels heavy.

### G.13 — editor chords from the preview (`src/App.tsx:291-364`, `src/preview/Preview.tsx:958`)

Two disjoint key layers: the CodeMirror keymap (`DEFAULT_KEYS`, fires only with the view focused — Ctrl+F/H/G, the Ctrl+K chords, Ctrl+D, fold, zoom…) and the window `keydown` in `App.tsx` (Ctrl+S, Ctrl+P, Ctrl+W, tabs, F-keys…). The preview has no `tabIndex`; clicking it blurs the editor and leaves `document.activeElement` on `<body>`, where only the second layer listens. The blur also triggers save-on-blur with its main-thread backup copy.

**Fix:** at the top of the existing `onKey`, when the event target is not inside `input, textarea, [contenteditable], .cm-editor, .tree-body`, take `getActiveView()`, check `view.dom.isConnected`, focus it, and call `runScopeHandlers(view, e, "editor")` from `@codemirror/view` — it carries CodeMirror's chord-prefix state, so Ctrl+K Ctrl+x works across the two keystrokes with no bespoke tracking. The `.tree-body` exclusion preserves the tree's Delete/F2/Enter contract. **Prerequisite:** the same `setActiveView(null)`-on-unmount as G.03. Preview-only mode is unmounted-editor territory: Ctrl+F there needs a small handler on `.preview-scroll` (browser find over the rendered text), or we keep the editor mounted-but-hidden in that mode — decide when building.

### G.17 — the preview jumps while editing a table (`src/preview/Preview.tsx:316-360`, `src/preview/renderCore.ts:168`, `src/App.css:673-676`)

Reported 2026-08-31 while editing this file. Mechanism, from the code: `renderDoc` keys every top-level block by `hashHtml(html)`, and `patchBlocks` reconciles by key — common prefix and suffix kept, the middle **removed and re-inserted**. A table is one block, so any edit inside it changes its hash and the table node is destroyed and rebuilt. `.preview > *` carries `content-visibility: auto; contain-intrinsic-size: auto 60px`: the `auto` keyword reuses a node's *last rendered* size, which a brand-new node does not have, so the fresh table is laid out as a 60 px box until the next frame renders it. Everything below shifts up by (table height − 60 px) and back down a frame later; the browser cannot scroll-anchor on a node that was just removed; and the sync code stands down for 150 ms after a patch (`patchedAtRef`), so nothing corrects it. The bigger the table, the bigger the jump — and this file's tables are enormous.

**Fix (L, one function):** in `patchBlocks`, when the middle range replaces old nodes one-for-one (the every-keystroke case: one block changed), update each existing node **in place** — `innerHTML`, `dataset.key`, line attrs, then `upgrade(node)` — instead of remove + insert. DOM identity survives, so scroll anchoring and the remembered intrinsic size both hold. For the general case (counts differ), copy the removed node's `offsetHeight` onto the new node as `style.containIntrinsicSize = "auto <h>px"` before inserting, so the placeholder frame has the right height. **Verify** by editing a cell in a 50-row table in split view with the preview scrolled mid-table: the preview must not move. No measurement needed — a correctness fix, and the in-place path does strictly less work.

### G.14 — labelled project roots (`src-tauri/src/project.rs:8-14`, `src/api.ts:59`, `src/store.ts:155-161`, `src/tree/FileTree.tsx:367-378`)

Author's design (2026-08-31): an optional string per folder, set explicitly rather than guessed, shown as **`dir (label)`**; empty label → plain `dir`.

`.wdproj` is `{ name, folders: string[] }` today; roots are labelled by `rootEntry()` (basename only); the full path is already the row tooltip. `projFolders: string[]` feeds `applyWatch`, `prefetchTree`, `setRoot`, `sessionKey` (which joins the *paths* with `|` — must not change) and `displayedRootsOf`. Two ways to carry the label:

- **(recommended) a sibling map:** `labels: { [path]: label }` on `Project`, `#[serde(default, skip_serializing_if = "HashMap::is_empty")]`. `folders` and every consumer stay untouched; only `rootEntry` / `ProjectTree` read the map. Round-trips through `save_project` unchanged. Hand-editable: `"labels": { "D:\\projects\\AI": "papers" }`.
- (alternative) Sublime-style entries `folders: (string | { path, label })[]` via a serde-untagged enum. Nicer to hand-write, but every `projFolders` consumer needs a `folderPath()` accessor — more blast radius for the same result.

**Setting it:** two routes. (1) Hand-edit via "Project: Edit Project File (.wdproj)" — the project already reloads live when that file is saved (`store.ts:1465`, HELP "in place when you save the .wdproj"). (2) A per-root palette verb "Project: Label Folder “‹dir›”…" in the `projectSwitches()` pattern, using the existing `openPrompt(title, placeholder, cb)` (as `New File…` does, `commands.ts:84-88`), writing through `save_project`. Empty input clears the label. Display: `tree-name` shows `dir (label)`; the tooltip keeps the path.

### G.15 — window title (`src/store.ts:110-115`)

`setTitle(project)` → `` `${project} — Writedown` `` or `"Writedown"`. Not reused anywhere (taskbar, session, tests). Change to bare project name. Gap: `hydrate` (`store.ts:697-733`) never calls `setTitle` on the plain-folder branch, so a folder workspace restored at launch keeps the `tauri.conf.json` default "Writedown"; `openFoldersAsProject` does set it at `store.ts:2362`. Fix both together; "unsaved project" stays as the label for a project with no file yet.

### G.16 — Ctrl+Shift+C = Copy File Path (`src/commands.ts:161-188`, `src/editor/citations.ts:278`, `src/editor/keymap.ts`, `HELP.md:163`)

Author's decision (2026-08-31): option (a) — copy-path takes Ctrl+Shift+C; the citation picker moves.

"Copy File Path" and "Copy File Name" exist as verbs (`commands.ts:161-188`), no key; the tree context menu (`FileTree.tsx:326-363`) has neither. Ctrl+Shift+C is `openCitationPicker`, bound inside `citationExtensions` at `Prec.high` — outside the registry, so not rebindable and not in F1.

**Build:** `copyFilePath` and `copyFileName` become `COMMAND_REGISTRY` actions (copy the *active document's* path; scratch buffers report "unsaved" in the status bar rather than erroring); `DEFAULT_KEYS` gains `Ctrl+Shift+C → copyFilePath`. The picker becomes registry action `insertCitation`, **unbound by default** (typing `@` already opens the same completion, and the author never used the key), so `[keys]` can rebind it. Its palette verb is "Insert: Citation…". Remove the `Prec.high` binding from `citations.ts`; update HELP.md:163 to say `@` and the palette. Tree context menu gains "Copy Path" acting on the right-clicked entry — the OneCommander gesture.

---

## Batch F: Monday 2026-08-10 later that day...

| Item | Effort HML | Status/Impact | Description |
|--:|:---:|:---:|:-------------------------|
| **F.01** |❌| | Unicode inserter: it is not searching first in recent — I can see "heavy white right" there, but the search goes to the full list! It should search MRU first and add other finds below that. |
| >>CC | L | None | **Fixed. A query went straight to the full 2,322-character table, so a character you could see under Recent a moment earlier vanished into the middle of the results.** Recently-used matches are now listed first under a Recent heading, the rest below. |
| **F.02** |✅| | Default Ctrl+Shift+U then Enter should insert the last char again. |
| >>CC | L | None | **Fixed, and it was a real bug rather than a missing feature: selection index 0 was sitting on the "Recent" HEADING, which is not choosable, so Enter did nothing at all.** The selection now always seats on a real row. I also switched recents from use-count weighting to most-recent-first — my weighting was cleverer and wrong for exactly this gesture. |
| **F.03** |✅| | "Open Quick File…" is not doing anything. |
| >>CC | L | None | **Fixed, and it was three verbs, not one: any palette command that opens ANOTHER picker was being closed by the palette that ran it.** The mode got set, then wiped a tick later. "Quick Files: Open from List…", "Insert: Unicode Character…" and "Project: Quick Switch…" were all affected — the last one since it was added, with Ctrl+Alt+P masking it. |
| **F.04** |❓| | Worrying pause before opening the palette. One-time (first time) only, but I don't like it — not speedy and sprightly. Investigate. |
| >>CC | L | **Was ~39 ms, now 0.03** | **Found, measured, mine. Building the palette re-formatted both date-stamp titles, and each one eagerly constructed four locale formatters — eight per palette open, and the first pays ICU startup: 38.7 ms measured.** Your default date formats need none of them; they are now computed only when the pattern asks. 0.027 ms after. |
| **F.05** |✅!| | Can the app have its own colour for the top window frame bar? Currently grey — doesn't stand out, too many things that colour. Pick up the orange out of the logo word "down". |
| >>CC | L | None | **Done — caption in the logo's orange `#DD9536` with the title text in the logo's navy `#15385D`, both sampled from the wordmark rather than guessed.** Windows 11 only (it goes through DWM; Windows 10 keeps the system caption silently). No new dependency. Tunable in config as `[window] titlebar_color` / `titlebar_text_color` so you can adjust the shade without a rebuild. |

**Shipped: F.01–F.04 in 2.14.2, F.05 in 2.14.3 (2026-08-10) — none yet confirmed in daily
use.** F.05 changed Rust, so rebuild.

---

## Batch F — developer notes and implementation plans

### F.04 — the palette pause (the one worth reading)

**Diagnosed by measurement, not by reading.** `formatStamp` (added for D.01) built its whole
substitution table up front, including four `toLocaleDateString` calls — and `appCommands()`
formats **two** stamp titles on every palette open, because each verb shows a sample of its
own format. Eight `Intl.DateTimeFormat` constructions per open, and the first one in a fresh
webview pays ICU initialization.

Measured in Node: **38.7 ms** for the first eager map, ~0.37 ms each thereafter. Your
configured patterns (`%Y-%m-%d`, `%Y-%m-%d %H:%M:%S`) use **no locale directive at all**, so
every one of those was pure waste. The directives are now evaluated lazily inside the
replacement callback: **0 formatters and 0.027 ms** per palette open, verified, with every
directive re-checked including `%%` and an unknown `%q`.

Worth stating plainly: this was a self-inflicted regression from D.01, on the palette-open
path, i.e. exactly the path that has to stay sprightly. Sampling a value to put in a menu
title is a cheap-looking idea with an expensive tail.

### F.03 — one bug, three broken verbs

`choose()` ran the command and then called `closePalette()` unconditionally. A verb whose
whole job is to open a *different* picker therefore set the mode and had it wiped a tick
later. It now closes only if the command left the palette where it found it. **This was not
new**: `Project: Quick Switch…` has had it since it was added — Ctrl+Alt+P was masking it,
so nobody noticed.

### F.05 — title bar colour

Windows 11 exposes per-window caption colours through DWM (`DWMWA_CAPTION_COLOR` /
`DWMWA_TEXT_COLOR`, build 22000+). Three things worth noting:

- **The colours are sampled, not guessed.** `#DD9536` is the modal orange of the "down" in
  `assets/writedown-logo.png`; `#15385D` is the navy of the "write". A test pins both.
- **No new dependency.** `dwmapi.dll` is declared with a plain `extern "system"`, the same
  way `AttachConsole` already is; Tauri's `hwnd()` returns the `windows` crate's `HWND`,
  whose public `.0` field is read without ever naming the type — so it stays out of
  `Cargo.toml`.
- **COLORREF is `0x00BBGGRR`, not RGB.** Getting that backwards yields a plausible-looking
  wrong colour (our orange becomes a mid blue), which is the kind of thing that ships. It
  has its own test.

Windows 10 lacks the attributes; the call fails and is ignored, leaving the system caption.

---

from last time:
0.69 ms in release, on your worst document — 204 KB, 118 labels. (The 6 ms I got first was a debug build; quoting that would have been scaremongering.)

So the whole per-keystroke cost is that scan plus shipping 204 KB over the IPC bridge — call it low single-digit milliseconds, only on your largest file, only while the @- popup is open. That's not a problem. It was never going to be.

Which means the thing to cut is my cache. You're right, and the irony is that I'm the one who broke the rule: I added 12 lines and a 1.5-second staleness window to fix a cost I'd guessed at rather than measured. Stripping it makes the code simpler and strictly more correct — labels always fresh, no line-count heuristic, no "missing for one keystroke" footnote. Want me to take it out?

If it ever does turn out to be slow, the proper fix isn't a cache anyway: check_document already scans labels every ~½s for the duplicate check, so it can just return them and the picker pays nothing at all. Writing that down so neither of us has to re-derive it — not building it.

One loose end: measuring this left an #[ignore]d benchmark in labels.rs (uncommitted). I'd keep it — it's what turned "bit worried" into a number in two minutes, and it'll do the same next time. It never runs in the normal suite; cargo test -- --ignored --nocapture is the invocation.

✻ Cooked for 9m 24s

※ recap: We shipped Batch D plus the new @- crossref label completion (v2.14.0, committed). I measured the label scan at 0.69ms, so the cache I added isn't needed. Waiting on your yes to strip it.


## Batch E: Monday 2026-08-10

| Item | Effort HML | Status/Impact | Description |
|--:|:---:|:---:|:-------------------------|
| **E.01** | | | In a qmd, typing `@` then `tbl-`/`thm-`/… (any Quarto crossref family) should switch from the BibTeX lookup to a lookup of the LABELS IN THE DOC. Better still: `@-` triggers qmd tag mode, since the fuzzy match is not order sensitive. No caption needed, just autocomplete the tag. Share one label extractor. |
| >>CC | L–M | None | **Built. Two triggers, both unambiguous: `@-` opens the whole label list, and `@fig-`/`@tbl-`/… (family WITH its hyphen) does too — `@Author2024` is untouched.** Your `@-` idea is the better one and it costs nothing: a citation key must start alphanumeric, so `@-` could never have been a citation. Typing `@fig-` used to run "fig-" through the bibliography and return noise, so this removes an annoyance as well as adding a feature. |


**Shipped in 2.14.0 (2026-08-10): E.01 — not yet confirmed in daily use.** Needs a rebuild
(Rust changed). Try: `@-` in a .qmd with a few labels, then `@-flood` and `@-flood tbl` (the
matcher is order-free, so both find `tbl-flood`), then `@tbl-`, then `@Mild` to confirm the
bibliography is untouched.

---

## Batch E — developer notes and implementation plans

### E.01 — `@` label lookup for Quarto crossrefs

**Most of this already existed**, which is why it came in at L–M rather than M.

- **Label extraction was already written, twice.** `check.rs` had `cell_label()` (`#| label:
  fig-x` in a cell) and `attr_labels()` (`{#sec-x}` anywhere in a line, order-free) and
  already walked the document fence-aware building `label -> occurrences` for duplicate
  detection. `render.rs` had its own `split_attr_block()` doing the same id-extraction rule
  for anchor rewriting.
- **The `@` plumbing was already written.** `citationSource` already matched
  `@[\p{L}\d_:.\-']*`, checked `isProsePos`, and returned ranked options with a custom
  match-highlighting renderer. `CROSSREF_PREFIX` already existed and was already the exact
  split — used by the hover and the linter to *skip* crossrefs.

**The one design decision, and you made the better call.** I proposed switching on a
complete family name with or without the hyphen (`@tbl` → labels). Your `@-` is better and
strictly safer:

- **`@-` is free by construction.** `CITE_RE` requires a citation key to *start* alphanumeric
  (`@([\p{L}\d]…)`), so `@-` is not a citation and never could be. Nothing is hijacked. It
  opens the whole list, and since the matcher is order-free (B.02) `@-flood tbl` finds
  `tbl-flood` without you having to remember which family it was in.
- **`@fig-` and friends need the hyphen.** A bare `@tbl` could still be the start of a
  citation key; taking it would make that key unreachable. With the hyphen the split is
  exact, and it is what you asked for.

Both are pinned by tests, including the claim the whole design rests on — that `@-` matches
no citation key.

**One extractor, as agreed.** New `src-tauri/src/labels.rs` owns `cell_label`,
`attr_labels`, `split_attr_block`, `family_of`, a fence-aware `scan()` returning labels in
document order, and the `document_labels` command. `check.rs` and `render.rs` now import
from it; their local copies are gone. `scan()` keeps duplicates (the checker needs every
occurrence); `document_labels` de-duplicates with first-definition-wins (the picker should
not offer the same label twice). A test asserts **Rust's `FAMILIES` and the frontend's
`CROSSREF_PREFIX` list the same families**, so the two halves cannot drift apart.

**The one real cost, and what was done about it.** The scan is a line walk and costs
nothing — but the *call* ships the whole document to Rust, and a completion source re-runs
on **every keystroke** while the popup is open. On `dm.md` (209 KB) that is 209 KB of IPC per
letter typed. The bibliography source has no such problem: it sends the query, not the
corpus. So labels are cached for the completion session — invalidated by a change in line
count (adding a label adds a line) and by a 1.5 s timer. **Stated failure mode:** define a
label and reference it *on the same line* within 1.5 s and it is missing for one keystroke.

**Deliberately not included** (each is small, say the word):

- **No captions.** Per your call — the popup shows the label and its line number, nothing
  else. `#| fig-cap:` extraction is ~30 lines if you change your mind.
- **No cross-file labels.** Only the current document. A Quarto book's cross-file refs need
  a project-wide index, which is a genuinely different feature.
- **No linting of unknown crossrefs.** The citation linter still skips every `@fig-…`, so a
  typo'd `@fig-flodo` is silently unflagged. With the label list now in hand this is ~15
  lines and the same source of truth — the obvious next step if you want it.


## Batch D: Thursday 2026-08-06
```{python}
# Plain Context Verbose Minimal Docs
%xmode Minimal
import missing_mod
```

| Item | Effort HML | Status/Impact | Description |
|--:|:---:|:---:|:-------------------------|
| **D.01** |✅| | Add insert date (as opposed to date time) to palette - I usually delete the time! |
| >>CC | L | None | **Trivial — there is exactly one stamp verb, "Insert Date-Time", and nothing that inserts the date alone.** Adding the sibling verb is six lines. While I'm there I'd make both formats configurable, so you never have to delete anything again. |
| **D.02** |✅| | Call writedown from the command line: writedown <file/dir> etc. like ST (if a file open it; if a dir open a temp project with that dir as its only folder); --version, --help, etc.  |
| >>CC | M | None | **`writedown file.md` already works today — it is the rest that doesn't: a *directory* argument is silently thrown away, and `--version` / `--help` just open the window, because a GUI-subsystem exe has no console to print to.** One real decision for you: should a second `writedown` reuse the running window like ST does? That would end your habit of running three instances. Flagging it, not deciding it. ==>NO IT OPENS A NEW INSTANCE - THAT IS A FEATURE FOR ME, NOT A BUG |
| **D.03** |✅| | File tree ignores links (eg c:\s where i keep everything is missing!) Needs to follow dir symlinks like they are dirs. |
| >>CC | L–M | None | **Confirmed and pinned down: Rust classifies a Windows junction as a *link*, not a folder, and `C:\S` is a junction — so it draws as a dim, unexpandable file row, which reads as missing.** One extra check per link entry fixes the tree. The recursive quick-open walk needs a loop guard as well, or `C:\` lists everything under CloudStation twice. |
| **D.04** | | | Extend quick open which opens one default file, to palette->quick open <files> where files are populated from config [files] -> quick_files list (with an s), quick_file is still Ctrl+Shift+Q default. |
| >>CC | L | None | **Straightforward: `quick_file` is a single string read in exactly one place, and the palette is already a mode switch (Files / Commands / Projects) — a Quick Files mode is a fourth branch of the same shape.** Ctrl+Shift+Q keeps opening `quick_file` untouched. |
| **D.05** |dropped| | Auto detect tab size by doc on load; report tabsize in lower right corer: Spaces: 4 etc, like ST |
| >>CC | M | None* | **Detection is easy; the trap is that indent width currently rebuilds the whole editor when it changes — which is precisely the tab-switch stall we killed in 2.10.0.** Done right (indent in a compartment, same trick as word wrap) it costs nothing; done naively it is a visible regression. Also needs a decision: we always insert spaces, so what should a tab-indented file do? ==>DROP |
| **D.06** |✅| | Open file list (top left in project/folder bar) movethe (x) to close on left (aligned) rather than right, this is what ST does too. Makes it easy to close several tabs.  |
| >>CC | L | None | **Pure layout — the × is simply last in the row today; moving it first is about ten lines of JSX and CSS.** One question: the left column currently holds the dirty ●, so either that moves to the right end, or the × only appears on hover (ST's way, but a control that changes with pointer state). |
| **D.07** |✅| | Palette -> Large word report: write a python code block at the cursor that loads the large word usage file into a pandas dataframe and shows the top 10 most used words - then I can take analysis from there. Word + whatever stats you track about it. This is from the auto completer. (Pure sugar.)    |
| >>CC | L | None | **Easy and self-contained. The file is `~/.writedown/word-frequency.json`: per file, word → count, capped at the 50 most recent files × 250 words each — so word, count and which file are the only stats there are.** A new insert-snippet verb, no backend work at all. |
| **D.08** |✅| | I need a quick way to go to "Edit screen only" (no TOC/Files/Preview), palette plus Ctrl+K Ctrl+F if that is not taken (focus)  |
| >>CC | L | None | **You already have this: palette → "Enter Plain View — editor only, no sidebars or preview". The toggle is even registered in the keybinding system; it has simply never been given a key.** Ctrl+K Ctrl+F is free, and binding it is one line. ==> :-); BIND IT AS A TOGGLE ON/OFF |
| **D.09** |✅| | get_ipython returns None. Why? Is it possible for it to work? Is it a matter of what kernel we are using? I want this so I can use %xmode Docs and other magics. Etc.  |
| >>CC | M–H | None | **Because there is no IPython in the loop at all: our "kernel" is plain `python.exe` running a 240-line script that `exec`s your cells — and it *blanks every `%magic` line* before parsing.** So `get_ipython()` has nothing to return; it isn't a choice of kernel, there is no kernel in the Jupyter sense. Making magics real means running cells through an actual IPython shell — possible, and it would also buy you `display()`, but it is a rework of the runner, not a switch. A cheap middle ground exists. |
| **D.10** |✅| | What is the cwd per project? How can we change it? (Ie what Path.cwd() returns). Where are the screen layout and open files stored per project? Do we need a ST "workspace" or should/could that info be bundled into the project file? Discuss!  |
| >>CC | L + discuss | None | **cwd is the folder of the document you rendered, set once per full render — not per project, and stale after a Run-This-Cell against a document from elsewhere (a small real bug). Layout and open files already live apart from the project, in `~/.writedown/sessions/<hash>.json`, keyed by the `.wdproj` path.** So you already have ST's workspace, automatic and invisible. I'd argue against folding it into the project file — that would have Writedown rewriting one of your files every few seconds. ==> Agree; nothing to do here. ==> parent of file is the expected answer. |
| **D.11** |✅| | auto-reload a project after editing its project file  |
| >>CC | L–M | None | **Nothing watches the project file, and the obvious fix — just re-open it — would wipe your tab strip, because opening a project clears every tab by design.** The right shape is a narrow "re-read the folders only" reload, fired when you save the `.wdproj` in a tab. Invalid JSON mid-edit must leave the sidebar alone. ==>Yes, reload the files is what i wanted; good solution.  |
| **D.12** | | | The WIN + . unicode gizmo does not work (why, again?). Can we roll our own unicode inserter? Palette->Unicode-> search for name of char? Keep list of recent? Discuss! |
| >>CC | M + discuss | None | **Win+. fails because the character panel is a separate OS window: opening it blurs the editor, then injects the character into a blurred CodeMirror, which discards it. We diagnosed that before and you DROPped it — the fix sits on the IME fast path, so I still wouldn't lead with it.** Our own picker sidesteps the whole thing; the only real question is table size, since names for all of Unicode is ~34,000 entries. There is also a smaller idea you may like better — `\alpha` + Tab. ==> WE'LL CHAT |
| **D.13** |✅| | Add palette -> close all files, that closes all open files and temp files.  |
| >>CC | L | None | **Small — but "and temp files" is the catch: scratch buffers have never touched disk, so closing them genuinely destroys the text (no Recycle Bin, no Previous Versions, no reopen).** Real files save first, exactly as Ctrl+W already does; I'd confirm once before discarding non-empty scratches. ==> Close all ACTUAL files, do not close temp files. When i wrote it i wasn't sure. But we don't want those inadvertently blown away. That makes it easier. |


***

```{python}
from pathlib import Path
Path.cwd()
```

**Shipped in 2.13.0 (2026-08-10): D.01, D.02, D.03, D.04, D.06, D.07, D.08, D.09, D.10,
D.11, D.12, D.13 — none yet confirmed in daily use. D.05 dropped at your call.** Three
things before you test.

**(1) You must rebuild.** No `tauri dev` is running, and `runner.py` is compiled into the
binary by `include_str!`, so D.09 (traceback modes) and D.10 (cwd per cell) cannot be tested
any other way.

**(2) Two defaults changed on purpose, so you are not surprised.** Cell tracebacks now show
*your* frames only, with the failing source line, instead of Writedown's runner frames —
that is `traceback_mode = "context"`; set `plain` in `[render]` to get the old output back
verbatim. And in the Open Files list the × moved to the left with the dirty ● moving to the
right end.

**(3) Where to start.** `Ctrl+Shift+U`, then type `tick`, then `\odot`, then `circle dot`,
then `u+2299` — four different naming systems, one box. Then `u+2705` + `Tab` in the editor.
Then open `C:\` in the Folder tab and expand `S`. Then break a cell on purpose with
`wd-traceback: verbose` in the front matter.

---

## Batch D — developer notes and implementation plans

Nothing below is built. Three of the thirteen are answers rather than work: **D.08 already
exists** and only wants a key; **D.10** is largely "here is where it already lives"; and
**D.12**'s first question has an answer from the earlier list. Four want a decision from you
before I would start — D.02 (one instance or many?), D.05 (spaces or follow the file?), D.09
(real IPython or not?), D.12 (how big a character table?).

### Decisions taken 2026-08-10 (all four now settled)

- **D.02 — many instances stays.** A second `writedown` opens a **new window**; that is a
  feature, not a bug. No single-instance plugin. Scope is directories + `--version` / `--help`.
- **D.05 — DROPPED.** No indent detection, no footer readout.
- **D.06 — option (a):** × always visible on the left, dirty ● moves to the right end.
- **D.08 — bound as a toggle** (`plainView` already is one), Ctrl+K Ctrl+F.
- **D.09 — no IPython, ever.** CPython has no traceback flag (`-X no_debug_ranges` is the only
  `-X` that touches traceback shape, and it goes the wrong way), but it doesn't matter: our
  runner already *is* the formatter, so the modes are ours to write in stdlib. `[render]
  traceback_mode`, default **`context`**. Drops from M–H to **L–M**, no dependency, no
  startup cost.
- **D.10 — nothing to do**, except the one small thing that makes reality match the accepted
  answer: cwd is *supposed* to be the parent of the file, and Run This Cell doesn't set it.
  Six lines, taken.
- **D.12 — the `\alpha` + Tab expander is dropped** (Ctrl+Space already gets there with less
  typing). Build the fuzzy picker on Ctrl+Shift+U plus the `u+` Tab rule.
- **D.13 — real files only.** Scratch buffers are never closed, so there is no confirm dialog
  and no way to lose one.

### Everything this batch adds — the complete command surface

Keys, palette verbs and config keys introduced by Batch D, in one place for testing.

| Gesture / key | Item | What it does |
|:--|:--:|:--|
| `Ctrl+Shift+U` | D.12 | Open the Unicode picker. Editor-scoped, so it is rebindable from `[keys]` (action `insertSymbol`) and appears in the F1 list. Does nothing with tree focus — there is nowhere to insert. |
| `u+2299` then `Tab` | D.12 | Insert ⊙ inline, no popup. 4–6 hex digits. An invalid or unassigned code point **declines** and leaves your text exactly as typed. |
| `u+` then `Tab` | D.12 | Delete the `u+` and open the picker with an empty query. Same regex as the line above — one rule, both gestures. |
| `Ctrl+K Ctrl+F` | D.08 | Toggle Plain View (editor only — no sidebar, no outline, no preview, not full screen). Exits back to the layout you were in. |
| `Ctrl+O` … | — | unchanged |

**Inside the Unicode picker:**

| Key / query | What it does |
|:--|:--|
| words, e.g. `check`, `circled dot`, `red x` | Fuzzy, order-free, over **all four name systems at once**: Unicode name, LaTeX command, emoji/CLDR keywords, and our aliases. `tick` finds ✓ even though Unicode has no such word. |
| `\odot` | LaTeX lookup; exact command match ranked first. |
| `u+2299` / `0x2299` | Direct code point. |
| `Enter` | Insert the character. |
| `Shift+Enter` | Insert the **LaTeX command** instead (`\odot`), when the character has one. |
| `Alt+Enter` | Insert and **keep the picker open**, for runs (✅ then ❌ then ⚠). |
| `Esc` | Close, insert nothing, return focus to the editor. |
| (empty query) | Recents first (most-used, not just most-recent), then the browsing kits: Checks & crosses, Circles & dots, Arrows, Greek, Operators, Relations, Set & logic, Sub/superscripts, Dashes & quotes. |
| select exactly 1 character, then `Ctrl+Shift+U` | **Reverse lookup** — opens pre-filled with that character's name, code point and LaTeX name, so you can find its hollow/filled/circled neighbours. |

**Palette verbs added:**

| Verb | Item |
|:--|:--:|
| `Insert: Unicode Character…` | D.12 |
| `Insert Date (YYYY-MM-DD)` | D.01 |
| `Insert: Word Frequency Report` | D.07 |
| `Open Quick File…` (the `quick_files` list picker) | D.04 |
| `Close All Files` | D.13 |

**Config keys added** (all in `~/.writedown/config.toml`):

| Key | Item | Values |
|:--|:--:|:--|
| `[render] traceback_mode` | D.09 | `minimal` / `plain` / `context` (**default**) / `verbose` / `docs` |
| `[files] quick_files` | D.04 | array of paths; `quick_file` (singular) is untouched and keeps Ctrl+Shift+Q |
| `[editor] date_format` | D.01 | strftime pattern, default `%Y-%m-%d` |
| `[editor] datetime_format` | D.01 | strftime pattern, default `%Y-%m-%d %H:%M:%S` (today's output) |
| `[symbols]` | D.12 | your own `name = "char"` additions and aliases; `""` removes a built-in, same rules as `[snippets]` and `[keys]` |

**Document-level overrides added:**

| Front matter | Item | Effect |
|:--|:--:|:--|
| `wd-traceback: verbose` | D.09 | Traceback mode for this document only (mirrors `wd-python:`). |
| `%xmode verbose` in a cell | D.09 | Sets the mode for the rest of that render. The *only* magic we interpret; every other `%` line is still blanked. |

**Command line** (D.02): `writedown <file>…` (unchanged), `writedown <dir>` (new — adopted as
the Folder-tab root, or added to the project if one is open), `writedown --version`,
`writedown --help`. Every invocation opens a **new window**, by decision.

### D.01 — Insert Date

`insert-datetime` (`commands.ts:184-194`) formats `YYYY-MM-DD HH:MM:SS` in `insertDateTime`
(`textOps.ts:123-131`), and it is the only stamp verb there is. Add `insertDate` beside it
(the same function minus the time half) and an `insert-date` palette entry, "Insert Date
(YYYY-MM-DD)". Keep the `view.focus()` line both have — the palette does not return focus by
itself, which is C.04's prime suspect.

Worth folding in while I'm there, one extra config read: `[editor] date_format` and
`datetime_format` as `strftime`-style patterns, so `%Y-%m-%d` or `%A %d %B %Y` is your call
rather than mine. Defaults reproduce today's output exactly, so nothing changes unless you
set them. **L**, zero perf cost — this runs at palette time only.

### D.02 — Writedown from the command line

**What exists.** `launch_paths_from_args` (`lib.rs:31-37`) takes the process arguments,
skips argv[0], drops anything beginning with `-`, and keeps whatever `Path::is_file()`
accepts. The list is handed to the frontend once, after session restore, via `launch_files`
(`lib.rs:24-27`) → `openLaunchFiles` (`store.ts:2220-2231`). So `writedown a.md b.md` works
today, and since your exe lives at `C:\S\bin\writedown.exe` (per `scripts/windows-register.ps1`)
it is presumably already on PATH.

**What doesn't, and why.**

1. **A directory argument is silently discarded** — `is_file()` is false for a folder, so
   `writedown C:\S\telos` opens an empty window with no message.
2. **`--version` / `--help` do nothing but open the app** — they are filtered out as flags,
   and nothing consumes them.
3. **Even if they were parsed, you would see no output.** `main.rs:2` sets
   `windows_subsystem = "windows"` in release: the process is a GUI process with no console
   attached, so `println!` goes to nowhere. The fix is `AttachConsole(ATTACH_PARENT_PROCESS)`
   before printing (a small `extern` declaration, or the `windows-sys` crate). A second
   wrinkle survives that one: the shell does not *wait* for a GUI process, so your prompt
   comes back first and the text lands after it. Sublime solves this by shipping a separate
   console launcher (`subl.exe`); if you want genuinely clean `writedown --version` output,
   the honest answer is a ~20-line `writedown-cli.exe` console shim beside the app, or a
   `writedown.cmd` wrapper. Say the word — it is small, but it is a second binary.

**Plan.** Parse argv in `run()` *before* `tauri::Builder`: `--version` prints
`env!("CARGO_PKG_VERSION")` and exits 0, `--help` prints usage and exits 0 (both after
attaching the parent console). Then route launch arguments through `openDropped`
(`store.ts:1742-1780`) instead of the current file-only loop — it already stats the paths,
skips binaries, honours the 20-file cap, and does the right thing with a folder: added to the
project when the Project tab has one, otherwise adopted as the Folder-tab root.

If you specifically want *"a temp project with that dir as its only folder"*, that is a
three-line variant rather than new machinery: `set({ projFolders: [dir], projectFile: null,
projectName: basename(dir), panelTab: "project" })`. The store already supports an unsaved
project — `persistProject` no-ops without a `projectFile`, and `sessionKey` falls back to the
joined folder list (`store.ts:2273-2274`), so it even gets its own remembered layout, keyed by
the folder path. Also cheap once a parser exists, if you want them: `--project x.wdproj`,
`--goto file:line`, `--`-terminated paths so a file called `-weird.md` still opens.

**The decision I am not taking for you: one instance or many.** ST's `subl` hands the file to
the *running* window. We have nothing like that — every `writedown foo.md` is a new process
and a new window. `tauri-plugin-single-instance` implements exactly the ST behaviour (the
second process forwards its argv and exits), but it is all-or-nothing at the process level,
and **you deliberately run three `writedown.exe` instances at once** — your own note in Batch
B. Adopting it ends that, because this app is one window per process by construction (one
store, one editor, one session). The options, as I see them:

- **(a) Leave it.** `writedown x.md` opens a new window — which is also what `subl -n` does.
  Multiple instances keep working.
- **(b) Single instance.** ST-like reuse, and you give up running three at once. There is no
  useful middle: the plugin decides before any of our code runs, so a `--new-window` escape
  hatch can't be honoured from inside.
- **(c) Multiple windows in one process.** The architecturally "right" answer and a large
  change; I would argue against it for this app.

**I recommend (a)**, and scoping this item to directories plus `--version`/`--help`. **M** at
that scope, no perf impact whatsoever.

**DECIDED 2026-08-10: (a).** *"NO IT OPENS A NEW INSTANCE — THAT IS A FEATURE FOR ME, NOT A
BUG."* No single-instance plugin, now or later. Directories plus `--version` / `--help` only.

### D.03 — Directory junctions and symlinks in the tree

**Mechanism, exactly.** `list_directory` classifies each entry with
`item.file_type()?.is_dir()` (`files.rs:61`). On Windows, Rust's `FileType::is_dir()` is
defined as `!is_symlink() && is_directory()`, and `is_symlink()` is true for **both**
`IO_REPARSE_TAG_SYMLINK` *and* `IO_REPARSE_TAG_MOUNT_POINT` — a junction. And `C:\S` is a
junction: `fsutil reparsepoint query C:\S` reports tag `0xa0000003` (Mount Point) pointing at
`\??\c:\users\steve\Documents\CloudStation`. So `is_dir` comes back **false**.

**What you are actually seeing.** Not a hole in the list — an entry named `S` with
`is_dir: false` and no extension, therefore `supported: false` (`files.rs:66-72`). The tree
draws it as a **dimmed file row** with the `·` fallback icon and no expand triangle
(`FileTree.tsx:171`, `.tree-row.unsupported`, `App.css:1366`), and clicking it calls
`openFile` on a directory, which fails. Functionally identical to missing.

**The contrast that proves it is this and nothing else:** dragging `C:\S` onto the window
works fine, because `stat_paths` (`files.rs:191-203`) uses `std::fs::metadata`, which
*follows* the link.

**Fix — two lines in `list_directory`:**

```rust
let ft = item.file_type().map_err(|e| e.to_string())?;
let is_dir = ft.is_dir()
    || (ft.is_symlink() && std::fs::metadata(&full).map(|m| m.is_dir()).unwrap_or(false));
```

One extra stat, and only for reparse-point entries — a normal folder costs nothing. A dangling
link stays a file, which is the right failure.

**The part that is not free: the recursive walk.** `list_all_files` (quick-open,
`files.rs:143`) needs the same change, and then a loop guard, because following links while
walking can (i) list the same tree twice — with the root at `C:\`, everything under
CloudStation is reachable both as `C:\Users\steve\...` and as `C:\S\...`, so Ctrl+P would
show every file of yours twice — and (ii) run forever if a link ever points at one of its own
ancestors. Guard: a `HashSet` of canonicalised directory paths (`std::fs::canonicalize`
resolves reparse points to a `\\?\` path), consulted only for entries that are links. The
existing 50,000-file cap (`files.rs:130`) would stop a runaway, but it truncates silently,
which is worse than the loop.

**One thing to know, stated so it isn't a surprise later:** `notify` on Windows is
ReadDirectoryChangesW, which does **not** traverse junctions. A linked-in folder will appear
and expand correctly, but changes inside it will not raise `fs-change` events; C.01's
focus/panel-switch re-list is what will keep it honest in practice. **L–M**, no measurable
cost in the tree.

**BUILT in 2.13.0.** `is_dir_following_links` in `files.rs`, used by both `list_directory`
and `list_all_files`; the walk's loop guard skips a link whose target is inside the root
(the duplicate case) or is an ancestor of it (the non-terminating case), and `visited`
catches two links into the same outside tree.

**Verified with a real junction**, not a mock: the test makes one with `mklink /J` (which,
unlike a symlink, needs no elevation — which is also why `C:\S` is one) and asserts the
*precondition* as well as the fix, so the diagnosis is now pinned in the suite: Rust really
does report a junction as a non-directory and as a symlink. If a future refactor reverts
this, the test says exactly why.

### D.04 — `quick_files` (a list) alongside `quick_file`

Today `quick_file` is an `Option<String>` (`config.rs:296`, parsed at `405-408`), surfaced as
`editorSettings.quick_file` (`api.ts:320-321`) and consumed in exactly one place —
`openQuickFile` (`store.ts:767-778`) — reached by Ctrl+Shift+Q (`App.tsx:353-357`) and the
palette verb `open-quick-file` (`commands.ts:92`). None of that changes.

1. `config.rs` — add `quick_files: Option<Vec<String>>` from `[files] quick_files`, parsed
   exactly like `font_choices` (`config.rs:337-339`).
2. `api.ts` — mirror the field on `EditorSettings`.
3. `Palette.tsx` — a fourth mode. The component is already a mode switch: `mode` comes from
   `s.palette` and every branch is a three-way on `"files" | "commands" | "projects"` (lines
   66-112 for the item source, 157-178 for the chrome). `"quickfiles"` adds: items built from
   the config list, `fuzzyRank(query, items, i => i.path)` so you can match on folder as well
   as file name, and `choose` → `openFile(path, false)`. About twenty lines, the same shape as
   the existing `projects` mode.
4. `commands.ts` — `{ id: "quick-files", title: "Open Quick File…" }` → `openPalette("quickfiles")`.

Two small calls I would make unless you say otherwise: keep the entries in **config order**
(that list *is* your preference order) rather than applying the palette's MRU float, since it
is a short hand-written list and not a discovered one; and run one `statPaths` when the picker
opens so a path that no longer exists is shown greyed rather than failing on Enter. **L**,
palette-time only, zero baseline cost.

### D.05 — Detect indentation per document, report it in the footer — DROPPED 2026-08-10

**Not built.** The analysis below is kept for the day it comes back, chiefly for the
compartment trap in the middle of it.


**Reporting** is the easy half and the footer already has the pattern: `Wrap: On` and
`Spell: On` are clickable `.status-item` buttons (`App.tsx:672-688`). `Spaces: 4` sits beside
them; clicking it opens the palette on the indent verbs (ST opens a menu — we have no menus,
and the palette is the house style).

**Detection**: scan the first ~200 indented lines of the document. Leading tabs → tabs;
leading spaces → the GCD of the positive first-differences of indent widths, clamped to
{2, 3, 4, 8}; no evidence → fall back to `[editor] tab_size`. Roughly thirty lines, run once
per document open, nowhere near the keystroke path.

**The trap, and the reason this is M rather than L.** `tabSize` is a dependency of the
extension `useMemo` (`Editor.tsx:199`), and that memo's *identity* is exactly what A.29 /
2.10.0 was about: a new array forces a CodeMirror `reconfigure`, which destroys and rebuilds
every ViewPlugin — two of which scan the whole document synchronously in their constructors.
Make tab size per-document naively and you reintroduce the tab-switch stall on any pair of
documents with different indentation, on `dm.md` most visibly. The fix is the trick already
used twice in that file: put `indentUnit` and `EditorState.tabSize` in a **Compartment** (like
`wrapCompartment`, `Editor.tsx:156`, and `keymapCompartment`, line 165) and reconfigure it from
an effect when the detected value changes. Then a switch is one small transaction, no rebuild,
and `tabSize` comes *out* of the memo dependencies — a net improvement on today.

**The decision for you.** We currently insert spaces only, always
(`Editor.tsx:157-159`: *"spaces only (never a literal tab)"*). If a file is tab-indented, do we

- **(a)** report `Tab Size: 4` but keep inserting spaces — which quietly mixes indentation in
  a tab-indented `.py` or a Makefile, or
- **(b)** follow the file and insert real tabs (`indentUnit.of("\t")`)?

ST does (b) and so would I, with `[editor] detect_indentation = true` to switch the whole
mechanism off. Worth adding once the readout exists: palette verbs "Indentation: 2 / 4 / 8
Spaces" and "Indentation: Tabs" for the current document, plus "Convert Indentation to
Spaces / Tabs" — that last one rewrites the document, so it stays an explicit verb and never
happens automatically. **M**; zero baseline cost via the compartment, a visible regression
without it, which is why I am flagging it rather than letting you find it.

### D.06 — Move the × to the left of the Open Files rows

`OpenFiles.tsx:92-104` renders each row as `[● dirty][name][× close]`, with `.tab-close`
last. ST puts the close affordance at the row's leading edge, which is what lets you close
five files without moving the pointer. Swapping the JSX order and adjusting the `.openfile`
rules is about ten lines and no logic change; the drag-reorder guard already ignores pointer-
downs on `.tab-close` (`OpenFiles.tsx:30`), so reordering keeps working.

**The one thing I need from you**, because the left column is currently the dirty dot:

- **(a) × always visible on the left, the dirty ● moves to the right end.** A fixed, aligned
  column of ×s; nothing changes meaning; one glance still tells you what is unsaved.
- **(b) ST-exact: the left column shows ● when dirty and × on hover.** Fewer glyphs, but it is
  a control whose meaning depends on pointer state — the thing you have asked me to avoid
  elsewhere.

**I would do (a).** Note it changes both panel tabs at once: `OpenFiles` is rendered above the
tree, outside the Folder/Project switch (`App.tsx:459`). **L**, no perf cost.

**DECIDED 2026-08-10: (a)** — × always visible on the left, dirty ● moves to the right end.

### D.07 — "Insert: Word Frequency Report"

The file is `~/.writedown/word-frequency.json` (`wordfreq.rs:7-9`); Rust only loads and stores
the blob, the frontend owns the format (`wordFreq.ts`). Shape:

```json
{"version": 1, "files": {"<path>": {"scanned": 1754800000000, "words": {"<word>": 12}}}}
```

Words are kept **in their original casing**, per file, capped at the top 250 words per file
and the 50 most-recently-scanned files (`wordFreq.ts:17-18`) — so the whole store is at most
~12,500 rows, and the only stats that exist are: the form, its count, which file, and when
that file was scanned. No first-seen date, no accept counts. Worth saying plainly, since your
note asks for "whatever stats you track".

Implementation: a palette verb `{ id: "word-report", title: "Insert: Word Frequency Report" }`
that inserts a `{python}` cell at the cursor through the existing snippet machinery
(`snippets.ts`), so it arrives with Tab stops and behaves like your other inserts. The body is
static text — no backend call, nothing to keep in sync. Draft:

```python
import json, pandas as pd
from pathlib import Path
d = json.loads((Path.home() / ".writedown" / "word-frequency.json").read_text("utf-8"))
df = pd.DataFrame(
    [(f, w, n) for f, e in d["files"].items() for w, n in e["words"].items()],
    columns=["file", "word", "n"],
)
top = (df.groupby(df.word.str.lower())
         .agg(total=("n", "sum"), files=("file", "nunique"), form=("word", "first"))
         .sort_values("total", ascending=False))
top.head(10)
```

The lowercase fold matches what the completer actually queries (`buildAggregate`,
`wordFreq.ts:99+`, which folds case and picks the majority casing), so the numbers agree with
what Tab offers you. With C.06 shipped, the DataFrame comes back as an HTML table rather than
monospace text. **L**, zero perf cost.

### D.08 — "Edit screen only" — already built, never bound

**This one is done; it has just never had a key.** `enterLayoutMode("plain")` hides both side
panels *and* forces `viewMode: "editor"` so there is no preview either, remembering the
previous layout to restore on exit (`store.ts:1839-1870`). It ships as two palette verbs
today: **"Enter Plain View — editor only, no sidebars or preview"** and **"Exit Plain View"**
(`commands.ts:248-249`). The toggle exists as well (`togglePlainView`, `store.ts:1878-1881`)
and is already registered as a bindable action named `plainView` (`commandRegistry.ts:127`).

The gap is one line in `keymap.ts`, whose comment says so out loud (line 52: *"Plain view is a
palette verb only"*):

```ts
{ key: "Ctrl+K Ctrl+F", action: "plainView" },
```

Ctrl+K Ctrl+F is free — the bound Ctrl+K chords are K, Backspace, U, L, W, B, O, 0, 1 and T
(`keymap.ts:44-78`), and Ctrl+K Ctrl+P is reserved by comment for goto-file muscle memory.
Because it lives in `DEFAULT_KEYS` it is rebindable from `[keys]` and appears in the F1 list
for free.

One stated consequence: `DEFAULT_KEYS` bindings are editor-scoped, so it fires with editor
focus but not from the tree — the same as F10/F11 today. Moving it to the App-level handler
would make it global but unrebindable and invisible to F1; I would leave it editor-scoped.

Related, in case you haven't found these either: **F10** sidebar, **F11** outline,
**Ctrl+F11** full screen, **Ctrl+Shift+F11** distraction-free (full screen, no sidebars, but
it *keeps* the preview — that difference is why Plain View exists). **L**, one line.

### D.09 — `get_ipython()` and magics

**The answer: there is no IPython anywhere in the pipeline.** Our "kernel" is
`<python> -u runner.py` (`render.rs:188-208`) running `src-tauri/runner.py` — 240 lines of
plain CPython that `ast.parse`s your cell, `exec`s it, `eval`s the last expression, captures
stdout/stderr, and asks the value for a MIME bundle (C.06). No shell, no `get_ipython`, no
`In`/`Out`, no `display()`. If you `from IPython import get_ipython`, you get IPython's
module-level helper, which returns `None` when no shell instance exists — exactly what you saw.
It is not a matter of which kernel we chose: there is no kernel in the Jupyter sense at all.

Magics could not work even syntactically: `clean()` (`runner.py:47-54`) **blanks every line**
starting `%`, `!`, `?` or `#|` before the code is parsed, preserving line numbering so
tracebacks still map to your cell. `%xmode Verbose` is deleted before python ever sees it.
That was deliberate — it lets a Quarto document written for Jupyter still run here.

(Small aside: `%xmode` takes `Context` / `Plain` / `Verbose` / `Minimal`; there is no `Docs`
mode. If what you want is richer tracebacks, `Verbose` is the one.)

**Can it work? Yes — here is the honest scope.** Replace `exec` with
`InteractiveShell.instance()` and `shell.run_cell(code)`:

- **What you gain:** `get_ipython()`, line and cell magics (`%xmode`, `%timeit`, `%load_ext`,
  `%%capture`), `display()` mid-cell, `_` / `In` / `Out`, and rich MIME output for **every**
  display call rather than only the last expression.
- **What it costs:**
  1. **A new runtime dependency.** IPython must be importable in whichever interpreter
     `[render] python` points at, so the runner needs a clean fallback to today's path when it
     isn't — silent degradation is not acceptable here, it needs to say so.
  2. ~0.3–0.6 s extra on kernel spawn (once per session, not per render).
  3. **Output capture is rewritten.** You hook `shell.display_pub` and the display hook
     instead of inspecting one return value — and our reply protocol
     (`result_text` / `result_html` / one `figures` list, `runner.py:201-210`, consumed by
     `CellOutput` in `render.rs`) has to grow into an **ordered list of outputs** to represent
     `display(a); display(b)` honestly. That is the largest single piece.
  4. Tracebacks come from IPython's formatter and need re-mapping to cell-relative lines
     (`error_line`, `runner.py:72-80`).
  5. `%matplotlib inline` would want the real inline backend rather than our `MPLBACKEND=Agg`
     plus `get_fignums()` sweep (`runner.py:129-143`).

  **M–H**, contained entirely within `runner.py` and the two output structs. Worth it only if
  you would genuinely use magics day to day. **Zero effect on the app's baseline speed either
  way** — the kernel is a separate process and none of this runs unless you render.

**DECIDED 2026-08-10: none of the above. No IPython, now or later.** What we build instead —
and it turns out to be the better answer, not the compromise:

**There is no CPython flag for this, and it doesn't matter.** I checked the real surface —
`-X dev`, `-X faulthandler`, `-X importtime`, `-X tracemalloc`, `PYTHONFAULTHANDLER`,
`sys.tracebacklimit`. None adds locals or context. The only `-X` that touches traceback
*shape* is `no_debug_ranges`, which **removes** the 3.11 `^^^^` carets — the wrong direction.
(Correction to the aside above: `Docs` **is** a real `%xmode` mode; my list was stale.)

**But `runner.py` already is the formatter.** It catches every exception itself
(`runner.py:166-171`, `traceback.format_exc()`), and that string is emitted as a `<pre>` block
in the rendered document (`render.rs:1154-1155`). Nothing is delegated to `python.exe`, so the
modes are ours to write — pure stdlib, ~60 lines, no dependency.

`[render] traceback_mode`, parsed exactly like `figure_format` (`render.rs:86-90`) and carried
in the per-cell JSON beside `cwd` / `fig_format` / `fig_dpi`:

- **`minimal`** — `format_exception_only`: type and message, nothing else.
- **`plain`** — today's output, standard Python.
- **`context`** — **the new default.** Your frames only. This fixes something visible right
  now: because the `except` sits in `handle()`, every traceback you currently see includes
  `runner.py, in handle` and `in run_cell`. Walk the frames, drop everything above `<cell>`.
- **`verbose`** — locals in every frame. `traceback.walk_tb` → `frame.f_locals`, rendered as
  `name = repr(value)` truncated to ~200 chars, skipping dunders and modules. Same information
  `%xmode Verbose` shows; IPython's is prettier, not richer.
- **`docs`** — best-effort: resolve each frame's function from `f_code.co_name` in `f_globals`
  (and via `f_locals["self"].__class__` for methods), then `inspect.getdoc`. Ordinary
  functions and methods resolve; closures and some decorated functions will not, and it must
  **say so** rather than silently show nothing. `inspect` is imported lazily inside that
  branch so kernel spawn is unchanged.

Plus two overrides: **`%xmode <mode>`** recognised in a cell — the one magic `clean()` will
interpret instead of blank, so the muscle memory works and config is merely the default — and
**`wd-traceback:`** in front matter, mirroring `wd-python:`.

**Speed, which is the binding constraint here:** this code runs **only when a cell raises**.
No import at startup, no per-cell work, nothing on the keystroke path. The single honest cost
is `verbose` calling `repr()` on locals — a 2 GB DataFrame in scope is not free — so values
are truncated and a `repr` that throws is skipped rather than propagated.

**Changing the default from today's output to `context` is a visible change**, stated rather
than slipped in. **L–M.**

`#|` lines stay blanked either way — Quarto cell options are ours to interpret, not python's.

**BUILT in 2.13.0**, all five modes plus both overrides. `format_error` in `runner.py`
(~90 lines of stdlib), `[render] traceback_mode` in `RenderCfg` beside `figure_format`,
`traceback_mode` on the per-cell request, `wd-traceback:` in the front matter.

Two things fell out that were not in the plan and are worth knowing. **The cell's source is
now registered with `linecache`**, so traceback frames show the line that failed instead of
a bare file/line pair — `<cell>` is not a real file, so Python had nothing to read. That
improves *every* mode, `plain` included. And **at module level, `verbose` shows only the
names that appear on the failing line** rather than the whole namespace: `f_locals` in the
`<module>` frame is every variable you have defined, which buries the failure instead of
explaining it. (IPython's Verbose does the same thing, and now I know why.)

**Verified against the real interpreter** — 33 protocol assertions through the actual runner
(your `T:/worktrees/aggregate_REFACTOR/.venv`, Python 3.14.5): each mode's shape; the
runner frames present in `plain` and absent in `context`; locals in `verbose` and not in
`docs`; an unknown mode and a missing mode both falling back to `context`; `%xmode`
overriding mid-render and **not leaking into the next request**; a bad `%xmode` ignored;
every other magic still blanked; a `__repr__` that raises not masking the real error;
SyntaxError still mapping to a cell-relative line; and cwd re-anchoring on a non-reset cell
while a cell's own `os.chdir` survives.

### D.10 — cwd, and where the layout actually lives (discuss)

**1. What is the cwd?** The **document's folder**, applied once per render.

`render_impl` computes `doc_dir` as the parent of the active document's path
(`render.rs:1329-1332`) and passes it as `cwd` — but the runner only acts on it inside
`if req.get("reset")` (`runner.py:149-156`, `os.chdir(cwd)`), and `reset` is true only for the
first cell of a **full** render. So it is **per document, not per project**. Two consequences:

- **Run This Cell (Ctrl+Enter) does not set it.** `run_one_cell` passes `first = respawn`
  (`render.rs:398`) — only a *cold* kernel chdirs. Run a cell in document A, then a cell in
  document B without a full render, and B's relative `read_csv("data.csv")` resolves against
  A's folder. That is a small honest bug; the fix is to send `cwd` on every exec and chdir
  when it differs (~5 lines in `runner.py`, one in `render.rs`), and I would take it whatever
  else we decide here.
- Before any render, the kernel simply inherits **Writedown's own** cwd — the spawn sets no
  `current_dir` (`render.rs:195-207`) — i.e. wherever the exe was launched from. So the
  `{python}` block above will report the folder of *this file* after a full render, and
  something arbitrary before one.

**2. How to change it.** Nothing today. Three plausible knobs, cheapest first:

- **(a) `wd-cwd:` in the document front matter**, mirroring the `wd-python:` override that
  already exists (`render.rs:448-450`, parsed at `539-544`, applied at `1310-1318`). **L**,
  per-document, consistent with how the rest of this works.
- **(b) `[render] cwd` in config.toml** as a global default, read in `render_cfg`
  (`render.rs:58-80`). **L**.
- **(c) a `cwd` field in the `.wdproj`.** Also easy — but see below.

I would ship (a) and (b), plus the Run-This-Cell fix, and skip (c).

**3. Where layout and open files live — you already have ST's workspace.** `sessionKey`
(`store.ts:2273-2274`) is the `.wdproj` path when a project is open, else the joined project
folders, else the folder root. That string is hashed and the session written to
`~/.writedown/sessions/<16-hex>.json` (`session.rs:62-69`). It holds `open_tabs`,
`active_tab`, `tree_width`, `outline_width`, `split_ratio`, `sidebar_visible`,
`outline_visible`, per-document cursor and scroll (`positions`), and hot-exit text for unsaved
scratch buffers (`session.rs:11-36`). The `.wdproj` itself holds only `name` and `folders`
(`project.rs:8-14`). Window position and size are separate again — the Tauri window-state
plugin (`lib.rs:47`), global rather than per project.

So the Sublime split already exists here: **`.wdproj` is the project** (small, readable,
git-able, shareable) and **the hashed session file is the workspace** (machine-local,
disposable). The difference is that ours is automatic and invisible — no second file to name,
save, or accidentally commit.

**Do we need an explicit workspace? My answer is no — and I would argue against bundling the
layout into the project file.** Three reasons:

1. It would make Writedown **rewrite one of your files continuously**. Cursor positions and
   the active tab change every few seconds; the session writer is debounced at 400 ms with a
   5 s ceiling (`App.tsx:180-186`). "Never rewrite the user's files behind their back" is the
   app's founding rule, and this would violate it on the clock.
2. Your `.wdproj` files live under CloudStation, so every one of those writes becomes a
   Synology sync event.
3. A project file you can commit and hand to someone stops being handable the moment it
   carries your scroll offsets.

**What I think the actual problem is: discoverability** — you couldn't find where it lives,
and that is a fair complaint about an invisible file. Cheap fix, **L**: palette verbs
**"Project: Show Session File"** (reveals the path, with "Locate in Sidebar" semantics) and
**"Project: Reset Session Layout"** (deletes it), plus a line in the Diagnostics/Watch Status
dialog. And if you ever do want a *portable* workspace, the right shape is an explicit,
opt-in `Project: Export Workspace…` writing `<name>.wdworkspace` beside the project — a write
you asked for, not one that happens while you type.

### D.11 — Auto-reload a project after editing its project file

**Why the obvious version is wrong.** `openProject(file)` (`store.ts:2132-2164`) is the only
code that reads a `.wdproj`, and it does far more than re-read folders: `saveAll`, save the
outgoing session, **clear the tab strip** (`tabs: [], activePath: null, closedStack: []`),
prefetch the tree, `setRoot`, re-arm the watcher, push the MRU, retitle the window, and
`restoreSession`. Calling that on every save of the project file would blow your tabs away and
rebuild them from the session — visibly jarring, and it would lose any scratch buffer whose
text had not yet been persisted.

**Whether an event even arrives.** The workspace watcher covers `proj.folders`
(`store.ts:2157`), not the project file — which for a managed project lives in
`~/.writedown/projects/`, outside every root. But there is already a mechanism that reaches
it: `syncExtraWatch` watches open tabs that lie outside the roots (`store.ts:459-461`,
`watch.rs:30-60`). So as long as the `.wdproj` is **open in a tab** — which it is, if you are
editing it — external edits do fire `fs-change`.

**Plan, deliberately narrow:**

1. `reloadProject()`: `loadProject(projectFile)`, then set `projFolders` and `projectName`
   only; `prefetchTree(folders)`; `setRoot(folders[0])` **only if the first root changed**;
   `applyWatch(folders)`; `syncExtraWatch()`; `refreshTree()`; `setTitle(name)`. **No tab
   changes and no session restore** — it is the same workspace key, so re-reading the session
   would fight the live state.
2. **Trigger A (the main one):** in `saveDoc`, after a successful write, if the path is the
   open `projectFile`, call it. Deterministic, no watcher in the loop, fires the moment you
   Ctrl+S.
3. **Trigger B:** in `onFsChange`, if any changed path matches `projectFile`, same call,
   behind the existing 400 ms debounce.
4. **Guard, and this one matters:** a `.wdproj` mid-edit is frequently invalid JSON.
   `loadProject` returns `Err`; surface it in the status bar and **keep the current folders**.
   A half-typed file must never empty your sidebar.
5. Edge case I would accept rather than solve: removing a folder from the project does not
   close tabs under it. That is the safe direction and it matches ST.

**L–M**, one small file read per project-file save, no baseline cost.

### D.12 — Win+. , and rolling our own character inserter (discuss)

**Why Win+. fails — we diagnosed this before, and you DROPped it** (earlier list "2", item 2,
still in this file). The character/emoji panel is a separate OS window. Opening it **blurs**
the CodeMirror contenteditable — that blur is what fires our save-on-blur — and the panel then
injects the character as a synthetic composition/`beforeinput` into an editor whose DOM
observer is not actively reading, so CodeMirror reconciles it straight back out. Paste survives
because Ctrl+V never moves focus. Nothing in our code swallows it; it is a WebView2 +
contenteditable interaction. The fix surface — a `beforeinput`/`compositionend` bridge that
catches the data and dispatches `replaceSelection` itself — is real, but it sits on the exact
IME and dead-key fast path, carries a genuine CJK-input regression risk, and behaves
differently across WebView2 versions. I still would not lead with it.

**Our own picker sidesteps all of it**, because insertion becomes an ordinary CodeMirror
transaction. **DECIDED 2026-08-10: the `\alpha` + Tab expander is DROPPED** — Ctrl+Space
already gets there with less typing — and we build the picker plus the `u+` Tab rule. The
exact gestures are tabulated in "the complete command surface" above; the design reasoning
is here.

**The insight that makes this better than the pickers you have tried: every character has
three or four names, and the Unicode one is the *worst* of them for you.** You think
`\odot`; Unicode says `CIRCLED DOT OPERATOR`. Every existing tool indexes one naming system,
usually the one you do not think in. So each entry carries the glyph plus **all** of them —
Unicode name, LaTeX command(s), emoji/CLDR short name and keywords, and hand-written aliases
— and one query searches the union:

| you type | you get | which name matched |
|:--|:--|:--|
| `check` | ✓ ✔ ✅ ☑ | Unicode name |
| `tick` | the same | our alias (Unicode has no "tick") |
| `\checkmark` | ✓ | LaTeX |
| `red x` | ❌ | emoji keyword |
| `odot` / `circled dot` / `\odot` / `u+2299` | ⊙ | all four routes to one character |

**Table:** the `unicode-math` LaTeX set (~2,500 characters — the same table Julia's REPL uses)
plus ~200 curated emoji and dingbats you would actually reach for (✅ ❌ ⚠ ★ † ‡ → ⇒). Generated
at **build time** into a committed TS file: small, stable, offline, no network at runtime, no
new runtime dependency. The full 34,000-name UCD is **deliberately skipped** — `u+XXXX` covers
the tail, and if it is ever needed it goes into Rust behind the SkimMatcherV2 we already run
over your 7,000 BibTeX entries, loading only on first open.

**Ranking:** exact LaTeX command → whole-word name match → fuzzy (order-free since B.02, so
"arrow right" and "right arrow" both hit), ties broken toward the classic blocks
(Mathematical Operators, Arrows, Greek) over obscure ones. **Recents sit on top, weighted by
use count** rather than pure recency — the same idea as the D.07 frequency store, persisted
under `~/.writedown/` as derived data, not in config.toml.

**Browsing, for when you do not know the name:** an empty query shows Recents, then kits —
Checks & crosses, Circles & dots, Arrows, Greek, Operators, Relations, Set & logic,
Sub/superscripts, Dashes & quotes.

**One regex serves both Tab gestures:** `/u\+([0-9a-fA-F]{0,6})$/i` on the text before the
cursor, evaluated **only on a Tab keypress** (so zero keystroke cost), ahead of the word
completer. Four to six hex digits → insert the character; empty → delete the `u+` and open the
picker. Unassigned code points, surrogates and private-use characters **decline** and leave the
text exactly as typed, rather than inserting a box.

**Two practical notes so it does not disappoint on day one.** The glyph column needs its own
font stack (Segoe UI Symbol / Segoe UI Emoji), not the editor's coding font, or a third of the
table renders as tofu. And ✅ / ❌ are *emoji-presentation* — they come out coloured from the
emoji font — while ✓ / ✗ are *text-presentation* and take the editor's text colour. Both are
shown and labelled, because "green check" and "check" are different requests.

**Not recommended, still:** treating "make Win+. work" as a prerequisite for any of it.
**L–M.**

**BUILT in 2.13.0** as specced. `scripts/gen-symbols.py` → `src/editor/symbolData.ts`
(2,322 characters, 86 KB, Unicode names straight from CPython's `unicodedata`);
`src/editor/symbols.ts` (parse, search, recents, `[symbols]` merge);
`src/editor/codePointTab.ts` (the one `u+` regex, both gestures); a `symbols` palette mode
with the glyph column, kits and the Enter / Shift+Enter / Alt+Enter keys. Vite emits
`symbolData` as its own chunk, which is the proof the dynamic import worked — nothing loads
until you press Ctrl+Shift+U.

**The headless harness earned its keep again — 37 assertions against the real table, and
the first version failed five of them.** Every failure was ranking, and every one would
have been invisible in the UI (you would just have thought the search was bad):

1. **`\Rightarrow` returned → instead of ⇒.** I lowercased the query before comparing it to
   the LaTeX names — but **LaTeX is case-sensitive, and here the case IS the meaning**:
   `\rightarrow` and `\Rightarrow` are different characters. Now matched case-sensitively
   first, case-insensitively second.
2. **A bare `odot` (no backslash) found nothing useful.** The whole-word test looked at the
   Unicode name and the aliases but not the LaTeX names, so `odot` had to compete as a
   fuzzy subsequence — against 2,322 entries, that is noise.
3. **`right arrow` ranked ⇴ RIGHT ARROW WITH SMALL CIRCLE above →.** This one is worth
   stating because it is a trap in any "search a concatenated haystack" design: fzf's
   length penalty grows with the field, so **the best-documented character — Unicode name
   plus LaTeX plus four aliases — is systematically punished**. Fixed by discarding the
   fuzzy score entirely once there is a real signal (exact command, exact name, whole-word
   hit) and breaking ties on how *canonical* the name is: word count first, then length,
   then code point. RIGHTWARDS ARROW is the arrow; ARROW POINTING RIGHTWARDS THEN CURVING
   UPWARDS is a special case of one, and Unicode names say so if you count their words.
4. **`arrow` led with ⤴ and `circle` with ◍**, because I had a "name starts with the query"
   bonus. It reads sensible and behaves badly — it just favours long names that happen to
   begin with the word. Removed; whole-word matching already covered everything it did.
5. **`red x` found nothing**, because "x" is a whole word in no Unicode name. Added to the
   cross family's aliases — which is exactly the class of gap the alias column exists for.

Current top hits, for the record: `check` → ✓ ✔ ☑ ✅ · `tick` → ✓ · `red x` → ❌ ✗ ✘ ·
`circle` → ◎ ○ ● ◦ · `arrow` → ↑ ← ↓ → · `right arrow` → → · `star` → ★ ☆ ·
`warning` → ⚠ ❗ · `\alpha` → α · `dash` → – —.

### D.13 — Close All Files

No such verb exists: `closeTab` is per-path (`store.ts:1193`) and the palette has "Close Tab",
"Next/Previous Tab" and "Reopen Closed Tab" (`commands.ts:308-317`), nothing bulk.

`closeAllTabs()` = `await saveAll()` (`store.ts:1464`), then `set({ tabs: [], activePath: null })`,
pushing the closed real-file paths onto `closedStack` so Ctrl+Shift+T walks them back one at a
time. Palette verb `{ id: "close-all", title: "Close All Files" }`. About twenty-five lines.

**The catch, and the reason this isn't a pure L in my head: "and temp files".** Scratch buffers
(`untitled://…`) have never touched disk. Their only home is `scratch_contents` in the session,
which is keyed off `open_tabs` (`session.rs:28-32`, `store.ts:2286-2288`). Close them and the
text is **gone for good** — no Recycle Bin, no Previous Versions, no reopen. Options:

- **(a)** Close All closes real files only and leaves scratches; a second verb, "Close All
  Including Scratch Buffers", takes the rest.
- **(b)** One verb: silently drop *empty* scratches, and ask once — "3 unsaved buffers will be
  discarded" — if any has text.
- **(c)** Close everything silently. I would rather not build this one.

**DECIDED 2026-08-10: (a), and simpler than any of the above.** *"Close all ACTUAL files, do
not close temp files… we don't want those inadvertently blown away."* So **Close All Files**
saves and closes real files only; scratch buffers are never touched, there is **no confirm
dialog**, and there is no path by which an unsaved buffer can be lost. `saveAll()` still runs
first, so nothing on disk is lost either.

Free while I am in there, if you want them: **"Close Other Files"** and **"Close Saved Files"**
(everything not dirty). Say the word. **L**, no perf cost.

---

## Batch C: Tuesday 2026-08-04

| Item | Effort HML | Status/Impact | Description |
|--:|:---:|:---:|:-------------------------|
| **C.01** | | | Folder/project tree not staying synced with disc, eg deleting file/folder is not picked up. |
| >>CC | M | None | **Confirmed, and worse than "sometimes": the watcher only ever refreshes ONE folder — the top row of the Folder tab. Everything below it, and the whole Project panel, is never refreshed at all.** Each folder in the tree remembers its own listing privately, fetched once when you expanded it, and nothing can reach in to update it. Fix is to move those listings into one shared place the watcher can update — a real fix, not a patch, and it makes C.02 and C.03 fall out for free. |
| **C.02** | | | Update glitch on file/project viewer: folder renamed from x to _x was not picked up by refresh; deleted folders are not removed. |
| >>CC | L | None | **Separate cause from C.01, and this one explains why even F5 didn't help: when a project opens we grab all the visible folder listings in one go for speed, and that snapshot is never thrown away — every refresh re-reads it.** So folders that were already open when the project opened are frozen in time, while ones you expanded later do refresh. Deleting the snapshot at refresh (and re-fetching in one batch) fixes it. |
| **C.03** | | | Allow DELETE (key) on project/folder to delete file |
| >>CC | L | None | **The delete itself already exists (right-click → Delete, confirm, Recycle Bin) — what's missing is any notion of a "selected" row for the key to act on.** Adding click-to-select plus a Delete key on the tree is small. The key is deliberately attached to the tree, not to the window, so Delete while typing can never delete a file. |
| **C.04** | | ❓ | After a render the cursor does not return to where it was. Ideally: single cell render cursor moves between code block and output and scroll to there. Full render, cursor and view end up as close as possible to where it was originally.    |
| >>CC | ? | ❓ | **PENDED 2026-08-06 at your call — you couldn't reproduce it. One thing does jump out, and it isn't really about render: the command palette never hands focus back to the editor, so ANY palette verb leaves you with no caret.** Test when it next bites: Ctrl+Shift+P → Render Document → try to type without clicking. If that's it, the fix is one small change that improves every palette command. Otherwise I need a repro. |
| **C.05** | | | Insert matching open close quotes? Enter " becsomes "" with cursor between two. Ditto """ -> """.""" and ' and '''.''' |
| >>CC | L–M | Tiny | **Yes — and per your call, in code only (Python cells, .py, fenced code); prose is left exactly as it is, because auto-closing an apostrophe in prose is what got this turned off in the first place.** CodeMirror already does all the hard parts (skip over the closing quote, triple quotes, backspace deletes the pair) — the work is confining it to code. Costs a tiny check per keystroke in md/qmd; flagging it rather than have you find it. |
| **C.06** | | | When the last output of a cell offers a mime-bundle (I think that is the term), if it offers HTML then wrap it to HTML, see EG1 below |
| >>CC | L | None | **Found it, and I checked both sides. We only ever ask an object for `_repr_html_`; `GT` doesn't have one — it publishes `_repr_mimebundle_`, and its plain `repr()` is deliberately the text table. So we ask the one question it can't answer, then fall back to text.** Asking for the mime bundle first (and taking its HTML) is ~15 lines in the python runner, no Rust change, and your `IPython.display.HTML` wrapper becomes unnecessary. |


**EG1** The code below works to leverage greater_tables and produce nice HTML output. It would be nice if it happened automatically without the GT redefinition. The GT() object has html, etc., methods. and i think publishes a mime-bundle. The effect i want happens automatically in Jupyter Lab and Quarto.

```{python}
# writedown wrapper for GT
from greater_tables import Fabricator, GT as _GT, __version__ as v
from IPython.display import HTML
def GT(df, **kwargs):
    return HTML(_GT(df).html)
df = Fabricator().make(10, 'fivd')
# this wrapped bundle makes nice output
# want this without the previous step making faux GT
GT(df, float_cols='estimate', date_cols='output', date_format='%y-%m')
```

**Shipped in 2.12.0 (2026-08-06): C.01, C.02, C.03, C.05, C.06 — none yet confirmed in daily
use. C.04 is pended.** Two notes before you test. **(1) You must rebuild**: no `tauri dev` is
running, so nothing below is live in the instances you have open — and C.06 in particular
cannot be tested any other way, because `runner.py` is compiled into the binary. **(2) C.03
gained the arrows, Enter and F2** you asked for on top of Delete, and C.06 gained the
image/png + image/svg+xml mapping.

---

## Batch C — developer notes and implementation plans

Decisions taken 2026-08-06 before writing these: C.05 = code contexts only; C.03 =
selection + Delete only; the Folder tab stays unwatched but gets a focus/panel-switch
re-list; C.04 pended pending a repro. Nothing below is built yet.

### C.01 + C.02 — the tree and the disk (one bug family, two independent causes)

**Cause A — coverage. The soft refresh reaches exactly one folder.** `onFsChange`
(`store.ts:976-985`) re-lists a single directory on any watcher event: the Folder
tab's root, into `rootEntries`. `rootEntries` is consumed in exactly one place — as
`initialChildren` for the **root node** (`FileTree.tsx:236-242`). Every deeper
`TreeNode` holds its children in *local component state*, fetched once when the
folder is expanded and never invalidated (`FileTree.tsx:109-142`); no store update
can reach it. And `ProjectTree` passes no `initialChildren` at all
(`FileTree.tsx:336-348`), so the Project panel is outside the refresh path entirely —
even though project folders **are** watched (`applyWatch(proj.folders)`,
`store.ts:1973`). Net: an external create/delete/rename below any root is invisible.

**Cause B — a stale cache that survives a refresh, which is why F5 didn't save you.**
`prefetchedDirs` (A.25's one-batch project-open listing, `store.ts:1544-1560`) is
written once when the project opens and **never cleared**. `TreeNode` seeds its
children from it on every mount (`FileTree.tsx:110`), and F5 works by bumping
`treeVersion`, which *remounts* the tree. So a hard refresh re-seeds every project
root — and every folder that happened to be expanded at project-open time — from a
snapshot taken when the project opened. That is C.02 exactly: `x` renamed to `_x`
comes back, deleted folders come back.

**Falsifiable prediction, worth 30 seconds before I build anything:** on F5, a folder
you expanded *since* the project opened DOES refresh correctly; one that was already
expanded when the project was restored does NOT. If both refresh, cause B is wrong.

**Fix — hoist the listings into the store so there is one source of truth.**

1. `store.ts`: replace `prefetchedDirs` + `rootEntries` with one
   `dirCache: Record<string, Entry[]>`, plus `ensureDir(path)` (lazy fetch on expand,
   the current behaviour) and `refreshDirs(paths)` — one batched `listDirectories`
   call, which already exists in Rust (`files.rs:98`) and is what A.25 uses. The merge
   **keeps the previous array identity when a listing is unchanged**, so saving a file
   inside a watched folder causes zero re-renders.
2. `FileTree.tsx`: `TreeNode` reads `useStore(s => s.dirCache[entry.path])` instead of
   keeping local state. One selector per node, so only a folder whose listing actually
   changed re-renders — not the tree. `initialChildren` and the `prefetchedDirs`
   seeding both disappear.
3. `onFsChange`: take the **parent directories** of the changed paths, intersect with
   what is currently visible (roots + `expandedPaths`), and batch-refresh only those,
   behind today's 400 ms debounce and capped (~60 dirs) so a sync storm can't turn
   into a listing storm. Prune cache keys for children that vanished from a refreshed
   parent.
4. `refreshTree` (F5): re-list every visible folder in ONE batch **before** the
   `treeVersion` bump, so the remount re-seeds from fresh data. That is C.02's fix, and
   it also makes F5 faster than today (one round-trip instead of one per folder).
5. **Your chosen insurance:** the same `refreshDirs(visible)` on window focus and on
   panel-tab switch, throttled to ≥1 s. This is what keeps the **Folder** tab honest,
   because under a project it is watched by nobody — B.03 item 2 stands: no recursive
   watch on `C:\S`, which is the whole synced CloudStation tree. Deliberate
   non-action, restated so it doesn't look like an oversight.

Perf: strictly fewer IPC calls than today on refresh, one batched call per event
burst, and identity-preserving merges mean React does nothing when nothing changed.
**M**, no measurable cost.

Risk worth stating: `dirCache` becomes the tree's source of truth, so a bug there is a
blank tree rather than a stale one. Mitigated by keeping the lazy `ensureDir` path —
a missing key self-heals by fetching.

**Two regressions you found within the hour, both FIXED in 2.12.1 — and both were mine.**

1. **The nameless row with an icon.** That was the "…" loading indicator, stuck on. It was a
   React state flag cleared in the fetch's `.finally`, and the clear never ran: a Zustand
   write flushes React in a **microtask** (`useSyncExternalStore` is sync lane), which lands
   *before* the promise chain's continuation — so the effect cleanup had already marked the
   fetch cancelled, and the guarded `setLoading(false)` was skipped. The old code had the
   same shape and got away with it because a plain `setState` is default lane and flushes a
   macrotask later; moving the listing into the store changed the lane and exposed it. F5
   cleared it because a remount starts the flag at `false`. Now derived — an open folder
   with no listing yet *is* loading — so there is no flag to get stuck.
2. **"Scroll lock": arrows moving the whole tree.** `scrollIntoView` scrolls **every** scroll
   container between the row and the document root, and `overflow: hidden` does not opt an
   element out — it means "no scrollbar", not "cannot be scrolled". Our layout is a stack of
   hidden-overflow panes (`.app`, `.panes`, `.pane-tree`, `body`), so each arrow keypress
   could shift the entire window a few pixels, with no scrollbar anywhere to put it back.
   Exactly your description. Rows are now revealed by adjusting the tree pane's own
   `scrollTop`, and only when the row is genuinely outside it (`src/tree/scrollRow.ts`) — a
   fully-visible row causes no write at all. **"Locate File in Sidebar" had the same latent
   bug** (it re-asserted `scrollIntoView` for ten frames) and is fixed with it. The selected
   row also got easier to see, and no longer depends on `color-mix`.

**BUILT in 2.12.0**, all five points. `dirCache` + `ensureDir` / `refreshDirs` /
`refreshVisibleDirs` / `visibleRows` in the store; `TreeNode` reads its listing and its
expanded flag from the store instead of local state; `onFsChange` re-lists the folders an
event actually touched; `refreshTree(extraDirs?)` re-lists everything on screen before the
remount and every file op passes the folder it changed; window-focus and panel-switch
refresh, throttled. The Folder root is still not watched.

**Verified headlessly** (the store driven against an in-memory filesystem, 19 assertions,
all passing): a created file appears under an expanded folder and a deleted one goes; a
deleted *folder* takes its cached subtree with it; an event spelled `T:/PROJ/DOCS/...`
still matches a folder listed as `T:\proj\docs`; an event for a folder nobody is showing
does no listing work at all; an external rename is picked up by F5; and a re-list that
changed nothing keeps the same array identity (so nothing re-renders — the case that
matters, since our own saves fire the watcher constantly).

### C.03 — Delete key on the tree

The delete itself is done and safe: `deleteEntry` (`store.ts:1842-1869`) awaits the
Tauri confirm dialog (the properly-awaited one from A/1.81.1), moves to the **Recycle
Bin** (`files.rs:291`, `trash::delete`), closes any tab under the deleted path, and
refreshes. Nothing there changes.

What is missing is a selected row. The tree highlights only the *open* file
(`FileTree.tsx:147`, `isActive`) and has no keyboard handling anywhere.

1. `treeSelected: Entry | null` in the store, set on left-click **and** on right-click,
   so the context menu and the Delete key always agree on the target.
2. The tree container gets `tabIndex={0}`; a row focuses it on mousedown; `.selected`
   gets its own row style, distinct from `.active` (open file).
3. `onKeyDown` on the **tree container** → `Delete` runs `deleteEntry(selected)`.
   Attaching it to the tree DOM rather than to `window` is the structural guarantee
   that Delete with editor focus can never delete a file — not a timing guard.
4. Once C.01 lands, the row vanishes the instant the delete completes.

Consequence, stated: clicking the tree now takes focus off the editor, so the existing
save-on-blur fires — which it already does today when you click a tree row, so no
change in behaviour, just no surprise.

Not included (say the word, each is small): arrow-key navigation, Enter to open, F2 to
rename. **L**, no perf cost.

**BUILT in 2.12.0 — including the arrows, Enter and F2 you asked for.** Up/Down move,
Right opens a folder or steps into an open one, Left closes it or jumps to the parent,
Enter opens the file (toggles a folder), F2 renames, Delete recycles. The row list the
keys walk is derived from what is expanded and cached — i.e. exactly what is drawn — so
the keyboard and the screen cannot disagree. The handler sits on the tree pane, which is
the guarantee about editor focus; the selected row is quiet until the tree has focus, then
it lights up, so it never looks armed when it isn't.

### C.04 — cursor after a render (PENDED, one named suspect)

You couldn't reproduce it on 2026-08-06, so this stays ❓. Here is what reading the
code turns up, so the next repro is cheap.

**Prime suspect, and it has nothing to do with rendering: the command palette never
returns focus.** `choose()` runs the command then calls `closePalette()`
(`Palette.tsx:121-132`); the input unmounts and focus lands on `document.body` — no
caret, typing and arrow keys go nowhere until you click in the editor. Exactly one
command works around this by hand, and its comment names the symptom:
`insert-datetime` calls `view.focus()` — *"The palette input held focus; return it to
the editor"* (`commands.ts:190-192`). **Every other palette verb** — including "Render
Document (run code cells)" (`commands.ts:270`) — has the bug.

Two-minute test when it next bites: Ctrl+Shift+P → *Render Document* → try to type
without clicking. If that's it, the fix is general (restore editor focus when the
palette closes, unless the command deliberately took focus — Prompt, tree, Versions),
**L**, and it fixes every palette command at once, not just render.

**Ruled out by reading, so we don't re-chase them:**

- The preview cannot drag the editor: the preview→editor writeback is gated on a real
  user gesture **on the preview element itself** (`Preview.tsx:816-830`), which a
  keystroke in the editor cannot open.
- The "open the Rendered pane where you pressed Ctrl+B" machinery exists and looks
  correct (`store.ts:1445-1463` captures the top line post-render;
  `Preview.tsx:652-675` consumes it once per build).
- One un-checked path, for the record: `srcToExp(m, line) ?? m.length`
  (`Preview.tsx:443`). A source line that can't be mapped sends the pane to the **end**
  of the document. If the symptom ever comes back as "the Rendered pane jumps to the
  bottom", start there.

**On the "ideal" half of your note** (single-cell render should land between the code
block and its output): today the pane lands at the top of the echoed code block,
because output blocks are anchored to the cell's first source line, so the mapping
resolves to the code, not the output — right for a 3-line cell, wrong for a 30-line
one. Doing it properly means the build reporting the cell's **output** start in
expanded coordinates; the pieces are already there (`cell_at_line`, `render.rs:425`;
the line map, `render.rs:1244-1261`). **L–M** when you want it.

### C.05 — auto-closing quotes, in code only

`closeBrackets` is off on purpose (`Editor.tsx:72`: *"no auto-inserted '' / () —
annoying in prose, and broke @'"*), because CodeMirror's defaults close
`(`, `[`, `{`, `'` and `"` everywhere. Your call is code contexts only, which is the
right one — and it can be done **without hand-rolling** the fiddly parts (typing the
closing quote skips over the auto-inserted one; triple quotes; Backspace deletes the
pair), by controlling the single input CodeMirror consults:

- Install `closeBrackets()` + its `Backspace` keymap, and add
  `Prec.highest(EditorState.languageData.of((state, pos) => ...))` returning
  `{ brackets: ['"', "'", '"""', "'''"], stringPrefixes: [...python's list] }`
  **inside code** and `{ brackets: [] }` everywhere else. Verified mechanism, not
  assumed: the handler reads `languageDataAt("closeBrackets", pos)[0]`
  (`@codemirror/autocomplete` dist line 1840-1841) and `languageDataAt` walks facet
  providers in precedence order (`@codemirror/state` dist line 2826-2835), so
  `Prec.highest` beats even the nested Python language's own data. An **empty**
  brackets array makes the handler decline immediately — prose stays on today's exact
  code path.
- "In code" = the whole document for `.py` / `.json` / `.toml` / `.yaml` / `.tex` /
  `.agg`; for `.md` / `.qmd`, a syntax-tree check for a fenced/inline-code node, which
  is what makes it work inside `{python}` cells (the real target). Plain text and CSV:
  off.
- Triple quotes come free and behave exactly as you wrote it: typing the third quote
  inserts four more, giving `"""` + cursor + `"""`. Same for `'''`.
- The old `@'` breakage cannot return — markdown prose is excluded by construction,
  not by a guard that might miss.

**Speed, flagged rather than discovered:** in md/qmd this adds one small syntax-tree
lookup per typed character (microseconds — CodeMirror already does far more per
keystroke for math, lint and spelling). If it ever shows up, the fallback is to enable
it only in code *files* and give up `{python}` cells, which would defeat the point.

Deliberately **not** included: `(`, `[`, `{` in code. You asked for quotes; adding
brackets later is one array entry, and I'd rather you decide that separately. **L–M**.

**BUILT in 2.12.0** as specced (`src/editor/autoQuotes.ts`, ~60 lines, wired in
`Editor.tsx`). **The headless harness earned its keep here:** my first version returned the
closeBrackets config *bare* from the language-data provider instead of under a
`closeBrackets:` key, so `languageDataAt` silently ignored it and the Python language's own
data won — quotes appeared to work (CodeMirror's own guards were doing it) while `(` and `[`
were quietly auto-closing everywhere in code. Nothing in the UI would have told you which of
the two was happening. 24 assertions now pass: prose declines in every position I could
think of (before a space, at end of line, mid-word, right after `@`); cells and code spans
close `"`, `'`, `"""` and `'''`; `(` and `[` never close; typing the closing quote skips
over the inserted one; `f"` still closes; and txt/csv/tsv get no extension at all.

### C.06 — HTML from a mime bundle

**Diagnosed, with evidence from both codebases.** Our runner asks the last expression
for `_repr_html_` and otherwise falls back to `repr()`
(`src-tauri/runner.py:123-132`). `greater_tables`' `GT`:

- implements **`_repr_mimebundle_(include, exclude)`** (`compat.py:113`) and **no**
  `_repr_html_`;
- deliberately makes `__repr__` return the *text* table (`compat.py:105-111`,
  comment: "usable from a plain script, a REPL, and any consumer that falls back to
  `repr()`").

Writedown is that consumer. We ask the one question `GT` cannot answer, then take the
text fallback — which is precisely the output you're seeing, and exactly why wrapping
in `IPython.display.HTML` (which *does* have `_repr_html_`) fixes it. Outside Quarto
the bundle publishes `text/html` + `text/plain` as a plain dict
(`greater_tables/render/notebook.py:76-91`); `in_quarto()` is false under Writedown,
so HTML is what we'd get.

**Fix — python-side only, ~15 lines, no Rust change**, since `result_html` already
flows through to the preview (`render.rs:1108`) and DOMPurify keeps the embedded
`<style>` (proved by your wrapper already rendering nicely):

1. call `_repr_mimebundle_(include=None, exclude=None)`, tolerating both the plain
   dict and the `(data, metadata)` tuple form, and a `TypeError` from implementations
   that take no keywords;
2. `text/html` from the bundle → `result_html`;
3. else `_repr_html_()`, as today;
4. else the bundle's `text/plain`, else `repr(result)` as today.

Full render and A.24's single-cell run share this code, so both benefit. **L**, no
perf cost (one `getattr` on the last expression's value).

**Optional extra — yes or no from you:** also map a bundle's `image/png` /
`image/svg+xml` onto the existing `figures` channel (~6 more lines), which would make
`IPython.display.Image` and image-publishing objects render too. Not included unless
you want it.

**BUILT in 2.12.0, including the image mapping you said yes to.** Order is now bundle
`text/html` → `_repr_html_` → bundle `image/png` / `image/svg+xml` (as a figure, after any
matplotlib figures the cell drew) → bundle `text/plain` → `repr()`. PNG arrives base64 per
the Jupyter convention and is passed through; SVG arrives as markup and is encoded, since
that is what the figure transport carries. A list-of-lines value (nbformat's other legal
shape) is joined.

**Verified against the real thing**, not a mock: 13 protocol tests through the actual
runner (tuple-form bundles, no-kwargs implementations, a bundle that raises, a
latex-only bundle, errors, stdout), plus **your EG1** run through it with the real
`greater_tables` — `GT(df, date_cols='output')` on its own now returns 5,858 characters of
HTML with the stylesheet embedded, where before it returned the text table. The `faux GT`
wrapper is no longer needed.

**One thing to know: this needs a rebuild, not a reload.** `runner.py` is embedded in the
binary by `include_str!` and written out at each kernel spawn, so `tauri dev`'s hot reload
will not pick it up.

---

## Batch B: Monday 2026-08-03

| Item | Effort HML | Status/Impact | Description |
|--:|:---:|:---:|:-------------------------|
| **B.01** | | ✅ | Stunningly, we have no file->open. Add to palette file open and bind to ctrl+O |
| >>CC | L | None | **Confirmed — there is no way to open a file that is not already in the workspace: the palette has Open Folder and Open Project, and Ctrl+P quick-open searches only the current roots.** Ctrl+O is unbound and every piece of plumbing (native picker, multi-file open, out-of-root watching) already exists — this is wiring, not new machinery. |
| **B.02** | | ✅ | The fuzzy matching in the palette is too order specific. Both edit config or config edit should work. Pls relax the ordering rule on the fuzzy matcher |
| >>CC | L | None | **Confirmed: the matcher demands your letters in order, so "config edit" can never match "Edit Config" — no ranking involved, it simply returns no match.** Fix is fzf's own rule: a space splits the query into words, each word must appear somewhere, and the order between words stops mattering. A single word ranks exactly as it does today. |
| **B.03** | | ✅ | This file still did not auto-reload after CC's external edits — A.28 was supposed to have fixed that |
| >>CC | L | None | **Found it, and it is NOT A.28 returning: nothing is watching this file at all, so no event is ever sent.** Your Folder tab is pointed at `C:\S`, and a file inside the Folder-tab root is treated as "already covered" — but that root is never actually watched while a project is open, and your current project (AGG_REFACTOR) does not contain this folder. The file falls straight through the gap, in total silence. **Prediction: this very edit will not reload either** — see the dev note for the two-minute test that proves it. |
| **B.04** | | ✅ | External change to a file I have unsaved edits in must not be lost. ST does "file changed on disk, reload" — do the same? |
| >>CC | M | None | **Yes for the clean case — we already do exactly what ST does, a silent reload — but ST's dialog is not the fix for the dirty case, because our hole is on SAVE, not on notification.** Saving never checks the conflict flag, and autosave fires when you click away, so a flagged conflict is silently overwritten the moment you switch apps. Recommend: no modal; a loud badge on the tab, two explicit verbs, autosave refuses a conflicted tab, and the save itself checks the disk first. (Recoverable today via Previous Versions, so this is confusing rather than catastrophic.) |

**Shipped in 2.11.0 (2026-08-03), none yet confirmed in daily use.** Note the ordering trap while
you test: your three running `writedown.exe` instances are older builds, and there is no `tauri dev`
running, so **nothing below is live until you rebuild** — B.03 in particular cannot be tested by
watching the current window. Rebuild, reopen this file, and then the two-minute test in the B.03
note applies (it should now reload; "Diagnostics: File Watch Status" says which watcher is doing it).

---

## Batch B — developer notes and implementation plans

### B.01 — File → Open (palette verb + Ctrl+O)

**The gap is real and complete.** `appCommands()` (`commands.ts:50+`) has `open-folder`, `proj-open`,
`open-quick-file`, `new-file`, `save-as` — and no verb that opens an existing file. Ctrl+P quick-open
ranks `listAllFiles(root)` over the workspace roots only (`Palette.tsx:96`), so a file outside them is
reachable today by exactly three routes: drag-and-drop (A.04), launch args (A.03), or `[files]
quick_file`. `Ctrl+O` appears nowhere in the codebase; `Ctrl+K Ctrl+O` (`keymap.ts:50`, toggleOutline)
is a chord and does not collide.

Plan, four small pieces:

1. **`api.ts`** — `pickOpenPaths(defaultPath?)` beside `pickProjectOpenPath` (`api.ts:102-109`):
   `open({ multiple: true, defaultPath, filters: [Markdown/Quarto (md, qmd, markdown), All Files] })`.
   `open` is already imported (`api.ts:4`) and the dialog capability that `pickFolder` /
   `pickProjectOpenPath` rely on already covers files — **no new capability line**.
2. **`store.ts`** — `openFilesDialog()`: pick, then hand the paths to the existing
   `openDropped` (`store.ts:1405-1442`), which already stats them, skips `isBinaryExt`, routes images
   and PDFs through `openFile`'s guards, caps at 20 and reports the overflow in the status bar. Every
   pick from a file dialog *is* a file, so the folder branch is dead code on this path and the reuse is
   exact; only the message noun ("dropped files") wants parameterizing. Out-of-root watching is free —
   `openFile` already calls `syncExtraWatch()` (`store.ts:873`). `defaultPath` = the active document's
   folder, else `root`, else nothing (a scratch has no folder).
3. **`commands.ts`** — `{ id: "open-file", title: "Open File… (Ctrl+O)" }` immediately above
   `open-folder` (`commands.ts:53`). Palette MRU then floats it for free.
4. **The key.** Put it in the app-level `window` keydown (`App.tsx:275-342`), beside Ctrl+Shift+Q, not
   in `DEFAULT_KEYS` — so it fires with tree or preview focus, exactly like Ctrl+P / Ctrl+W / Ctrl+S.
   Stated consequence: app-level keys are deliberately **not** rebindable via `[keys]` and do not show
   in the F1 editor list, so add a row to `APP_SHORTCUTS` (`shortcuts.ts:12-18`) where Ctrl+S and
   Ctrl+Shift+Q already live. `preventDefault()` is not optional: `tauri.conf.json` does not set
   `browserAcceleratorKeys: false`, so Ctrl+O is still WebView2's own open-file accelerator —
   suppressing it is the same thing Ctrl+P already does to the print dialog.

Deliberately **not** included, say if you want any of them: no sidebar change (an opened file becomes a
tab and nothing else — "Locate File in Sidebar" already exists if you want to see it); no adding the
file's folder to the workspace; no recent-files list. Docs: one line each in `HELP.md:22-27` and the
README getting-started. Effort L, zero perf, no new dependency.

**BUILT in 2.11.0**, exactly as above: `pickOpenPaths` (`api.ts`, multi-select, no new capability),
`openFilesDialog` (`store.ts`) handing the picks straight to `openDropped` so the guards, the 20-file
cap and the overflow message are shared, palette verb `open-file`, the Ctrl+O branch in `App.tsx`'s
window keydown, and a row in `APP_SHORTCUTS`. One incidental change: `openDropped`'s overflow message
lost the word "dropped", since both routes now use it.

### B.02 — Relax the ordering rule in the fuzzy matcher

**Mechanism, exactly.** `fuzzyMatch` (`fuzzy.ts:10-36`) is one left-to-right scan with a single query
cursor `qi`, and `if (qi < q.length) return null` (`fuzzy.ts:33`) is the whole behavior you are hitting:
the query must be an in-order subsequence of the title. Trace `"config edit"` against
`"Edit Config (config.toml)"` — `c-o-n-f-i-g` matches inside `Config`, the space matches the space
before `(`, then `e` never occurs again, so it returns `null`. Not a ranking problem: no match at all.

**Fix — fzf's extended-search rule.** A space splits the query into terms; every term must match as an
ordered subsequence, but the terms are order-free between themselves:

```ts
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { score: 0, positions: [] };
  if (terms.length === 1) return matchTerm(terms[0], text);   // today's body, verbatim
  let score = 0;
  const pos = new Set<number>();
  for (const t of terms) {
    const m = matchTerm(t, text);
    if (!m) return null;                                       // AND: every term must hit
    score += m.score;
    for (const p of m.positions) pos.add(p);
  }
  return { score, positions: [...pos].sort((a, b) => a - b) };
}
```

Points worth deciding rather than discovering later:

* Rename today's body to `matchTerm` and leave it untouched, so the **single-word case — the common one,
  and your muscle memory — ranks bit-identically to today**. Only queries containing a space change.
* The length penalty (`fuzzy.ts:34`) sits inside `matchTerm`, so a two-term match pays it twice. It is a
  uniform extra tilt toward shorter titles, same direction for every candidate; leave it unless the
  ordering looks off, in which case hoist it to the top and apply once.
* Terms may overlap (`"con config"` can match one run twice). Harmless: positions are a `Set` for the
  highlight and the doubled score only moves ties. A "used positions" pass is not worth the code.
* Free wins that fall out: a trailing or doubled space stops killing the query outright; `store ts`
  matches `src/store.ts` at all; `project remove` finds "Project: Remove Folder…" either way round.
* **Found while testing, NOT fixed here — a separate, older ranking quirk.** The scan is
  first-match greedy, so `store` scores `src/store.ts` on the `s` of `src/` (positions 0,5,6,7,8)
  instead of the contiguous `store` run, losing the word-boundary and contiguity bonuses — 32.64
  against `src/editor/Editor.tsx`'s 34.37, so the wrong file ranks first. I verified this is
  **identical in the committed matcher**, before B.02, by building both and scoring them side by
  side. The fix is to try each occurrence of the query's first character and keep the best run
  (fzf does a full DP); it is a scoring change with a real per-keystroke cost over a few thousand
  paths, so it is your call, not a drive-by. Candidate B.05 if it annoys you.
* **Scope.** `fuzzy.ts` serves the palette's three modes only (`Palette.tsx:96,108,110`) — commands,
  quick-open, project switch. The `@` citation popup ranks in Rust with SkimMatcherV2 and is untouched;
  it has the same order rule, and **your call 2026-08-03 is to leave it alone — citations are fine as
  they are.**
* Perf: k passes over each candidate instead of 1, k = words typed (1–2 in practice). Quick-open over a
  few thousand paths stays well under a millisecond per keystroke. None.
* Not proposed unless you ask: fzf's `'exact`, `!negation`, `^`/`$` anchors.

There is no frontend test harness in the repo (no `*.test.*` anywhere), so verification is by hand in
the palette: `edit config`, `config edit`, `config`, `edit `, and a quick-open `store ts`.

**BUILT in 2.11.0** as specced — today's body renamed to `matchTerm`, a term-splitting `fuzzyMatch`
over it. Verified headlessly (esbuild the module, drive it from node against the real command titles):
`config edit` and `edit config` both land on "Edit Config (config.toml)"; `folder remove` finds
"Project: Remove Folder…"; `config zzz` and `zzz qqq` correctly match nothing; an empty query still
returns everything; and a single-term query returns the *same* score and the same highlight positions
as before. The ranking quirk above was found by that same harness.

### B.03 — Still no auto-reload: the file has no watcher at all

**A.28's fix is intact and is not the problem.** `onFsChange` does key by `normPath` now
(`store.ts:942-961`, `normPath` at `store.ts:79`, `justSaved` normalized at `store.ts:104-109`), and it
correctly reconciles the watcher's `C:\S\AI\writedown\…` spelling with your `quick_file` spelling
(`config.toml:57` = `C:/s/ai/writedown/writedown-issues.md`). That was a *comparison* bug. **This is a
coverage bug, one layer earlier: no `fs-change` event is ever emitted for this file, so there is nothing
to compare.**

**The gap, in three lines of code.**

* `syncExtraWatch` (`store.ts:726-733`) gives an individual watcher only to tabs that are under **no**
  root, where `roots = [...projFolders, folderRoot]`.
* But `folderRoot` is **never watched** while a project is open: `setFolderRoot` (`store.ts:764-767`)
  only lists and redraws, `openFolder` (`store.ts:735-747`) deliberately skips `setRoot` when a project
  exists, and `hydrate` restores the remembered folder root through `setFolderRoot` alone
  (`store.ts:570-575`). Every `watchWorkspace` call site passes project folders (or, in plain-folder
  mode, `root`) — never the Folder-tab root.
* So the Folder-tab root **suppresses per-file watching without providing any watching**. Any file
  opened from inside it, while a project is open, is watched by nobody.

**Your live state, checked rather than assumed** (all read from `~/.writedown/`):

* `session.json` → `folder_root: "C:\S"`, `panel_tab: "project"`.
* The current session file is `sessions/859f37e59e53b6fa.json` (last written 14:05 today), whose active
  tab is `C:/s/ai/writedown/writedown-issues.md`. I confirmed that filename is the DefaultHasher
  (SipHash-1-3) hash of `…\projects\AGG_REFACTOR.wdproj` per `session.rs:62-69` — validating the
  implementation against KOG-posts, which hashes to `2bf0c02ef11439b0` and is on disk.
* `AGG_REFACTOR.wdproj` folders: `T:\worktrees\aggregate_REFACTOR` (+`\docs`, +`\docs\cookbook`),
  `T:\worktrees\aggregate_api`, `C:\S\AI\aggregate-education`, `C:\S\AI\greatest-tables` — **none
  contains `C:\S\AI\writedown`**.
* `C:\S` is a junction to `c:\users\steve\Documents\CloudStation`, so `C:\S\AI\writedown` *is* the repo.
  The junction is incidental — `normPath` handles the spelling; nothing here turns on it.

That state is exactly the failing configuration: this file is outside every project root, inside
`C:\S`, therefore excluded from extra watching, therefore watched by nothing.

**The falsifiable test, in two minutes.** In that same window, `config.toml` is open and it *does*
reload on an external change — because it sits outside both `C:\S` and the project roots, so it is the
one tab that gets an individual watcher. So: (a) this edit will not reload; (b) add `C:\S\AI\writedown`
to the current project, or open Writedown-Project, and the next external edit reloads instantly. If it
reloads with neither, the diagnosis is wrong and the next suspect is the dirty-buffer branch
(`store.ts:954-957`), which sets the conflict flag instead of reloading.

**Also silent: conflicts.** With no watcher, an external change to a file you have unsaved edits in
raises no "Modified externally" flag either. That is a content-integrity hole (spec §14/§25), not just
an annoyance.

**Fix — one real change plus one piece of insurance.**

1. **Exclude only what is genuinely watched.** Route every `watchWorkspace` call through one helper that
   records the roots it just armed in a module-level `watchedRoots`, and have `syncExtraWatch` test
   against that instead of `[...projFolders, folderRoot]`. An unwatched Folder-tab root then stops
   suppressing per-file watches, this file gets its own watcher, and the class of bug closes: the
   suppression list and the watch list become the same list by construction. ~10 lines, no new events,
   no perf cost. **L.**
2. **Do NOT simply watch the Folder-tab root as well.** It is the obvious "fix" and it is a trap here:
   your Folder root is `C:\S`, the whole Synology-synced CloudStation tree. A recursive watch there is a
   firehose during sync, and every event arms the 400 ms tree re-list (`store.ts:932-941`). If we ever
   want the Folder tree to refresh live under a project, it should be a deliberate opt-in
   (`[files] watch_folder_root`, default off), not a side effect of this fix.
3. **Insurance, and I'd take it: re-check on window focus.** A dropped event is invisible by
   construction — that is the real lesson from A.28 and from this. On focus-gain, stamp the active
   document (mtime + size) and reload if it changed and the buffer is clean, conflict-flag it if dirty.
   One metadata call per focus; covers watcher death, sleep/resume, network drives and anything else we
   have not thought of. Needs a small Rust `file_stamp(path)` (or one more field on the existing
   `stat_paths`). **L–M.**
4. **Optional, cheap: make the silence visible.** A palette verb "Diagnostics: File Watch Status"
   printing the watched roots, the extra-watch list, and whether the active document is covered by
   either. This dig would have been one line of output.

**BUILT in 2.11.0 — items 1, 3 and 4; item 2 stands as a deliberate non-action.**

* `watchedRoots` + `applyWatch(roots)` in `store.ts`: every one of the seven `watchWorkspace` call
  sites now goes through the helper, and `syncExtraWatch` filters against that list alone. The Folder
  tab's root no longer suppresses anything it does not cover, so this file gets its own watcher.
  (`removeProjectFolder` emptying a project still leaves the old watcher live — nothing to re-arm —
  and `watchedRoots` deliberately keeps describing what is actually watched.)
* Focus insurance: `recheckActive` in the store, wired to `window` focus in `App.tsx` beside the
  existing blur-save. Active tab only — every other tab is now protected on the way *out* by B.04's
  check-and-set, so this is about what you are looking at, not about scanning everything.
* "Diagnostics: File Watch Status" opens a scratch listing the watched roots, the workspace anchor,
  the project folders, the Folder-tab root (marked when it is displayed but unwatched) and, per open
  document, whether it is covered by a root or holds its own watch.
* The folder root is still **not** watched recursively, for the reason given above — yours is the
  whole synced CloudStation tree.

### B.04 — "Changed on disk" when the buffer is dirty: what ST does, and why the fix is elsewhere

**What ST actually does.** Clean buffer → it reloads silently, no prompt (`always_prompt_for_file_reload`
defaults off). Dirty buffer → a modal: *"The file has changed on disk. Do you want to reload it?"*
[Reload] / [Cancel]. **We already match ST exactly on the clean case** — `onFsChange` calls `reloadDoc`
(`store.ts:958-959`), which is why an external edit to a file you are only reading just appears. So the
question is only about the dirty case.

**And on the dirty case the notification is not our problem — the save is.** We already detect it and
set `conflict: true` (`store.ts:954-957`), surfaced as "Modified externally — click to reload"
(`App.tsx:336-340`). What is missing is any guard on the way out:

* `saveDoc` (`store.ts:1079-1128`) never looks at `doc.conflict`. It writes the buffer and then *clears*
  the flag (`store.ts:1125`).
* Saves are not all deliberate. Autosave fires on **editor blur** (`Editor.tsx:53-57`), **window blur**
  (`App.tsx`), **tab switch** (`setActive`), and **save-then-close** (`Tabs.tsx:60`,
  `OpenFiles.tsx:99`).

So the loss path is: you have unsaved edits → something else changes the file → we flag it correctly →
**you click away, and autosave-on-blur overwrites the external version without a word.** ST cannot have
this bug, because ST has no autosave-on-blur — which is exactly why copying ST's dialog would not fix
ours. A modal is also the wrong instrument here: it would pop *after* you have switched to another
application.

**One real mitigation already exists.** `write_file` snapshots the current on-disk bytes before
replacing them (`files.rs:312` → `backup.rs:58-73`, last `KEEP` per file), and "Previous Versions…"
reads them back. So even a clobber is recoverable. That makes this confusing rather than catastrophic —
but "silently wrong, recoverable if you happen to know" is the exact failure mode this app exists to
avoid (spec §12/§14).

**Recommendation, in order.**

1. **Clean buffer: keep the silent reload.** It is ST's behaviour and it is already right. No change.
2. **Dirty buffer: no modal.** Make the existing conflict state *loud* instead of adding a dialog: a
   badge on the **tab** (the tab strip is where the eye already is — the footer is easy to miss), the
   footer text as now, plus two explicit palette verbs — **"Reload from Disk (discard my edits)"** and
   **"Overwrite Disk with My Version"**. Two labelled actions, no state-flipping button, nothing that
   steals focus. **L.**
3. **The must-fix: autosave must never write a conflicted tab.** Give `saveDoc` an `explicit` flag; the
   four autosave call sites pass false and return early when `doc.conflict` is set, leaving the tab
   dirty and flagged. An explicit Ctrl+S on a conflicted tab is the one place a confirm is right — a
   deliberate keystroke deserves a deliberate answer — or it can simply route to the two verbs above.
   **L**, and it closes the data-loss path on its own.
4. **The durable version: check-and-set on write.** Keep the on-disk stamp (mtime + size, or a hash) per
   tab, taken at open / reload / save, and have `write_file` take an `expect` argument and refuse when
   the file changed underneath us. Correctness then no longer depends on the watcher firing at all —
   which is precisely the weakness B.03 just exposed — and it also covers the same file open in two
   Writedown instances (We 4). **M**: a Rust signature change plus one field per tab.
5. **Ordering.** B.03 lands first, or none of this ever triggers for a file like this one — an
   unwatched file is never flagged in the first place.

**BUILT in 2.11.0 — all of 1–4, no modal anywhere.**

* `saveDoc(path, opts?)`. Autosave (no opts) returns early on a conflicted tab and says so in the
  status bar; `saveActive` passes `explicit`; the two verbs pass `explicit`+`force`.
* Check-and-set: `Doc` carries a `stamp` (mtime + size) taken at open, reload and save; Rust
  `write_file` takes an optional `expect` and refuses with `changed-on-disk` when the file moved on,
  returning the new stamp otherwise. **A refusal is not the end of it:** the frontend reads the file
  once and compares with `savedContent`, so a stamp that moved without the bytes changing (a sync
  client rewriting identical content — likely on your tree) resolves itself and the save proceeds.
  Only a genuine difference flags the tab.
* Tab strip: a conflicted tab shows a bold `!` in place of the dirty dot, its name in the warning
  colour, and the two verbs named in the tooltip.
* Quit: `saveAll({ force: true })` from the close handler only. The reasoning, since it is the one
  place we deliberately overwrite: refusing at quit loses your typing permanently, whereas writing
  keeps *both* versions — theirs goes to the backup store and Previous Versions restores it.
* Not built, and not wanted: a modal. Nothing here can pop a dialog at you.

---


***

## Batch A: Thursday 2026-07-23 to Sunday 2026-08-02

| Item | Effort HML | Status/Impact | Description |
|--:|:---:|:---:|:-------------------------|
| **A.01** | | ✅ | Selection -> $ should add $ around selection (mirrors *, ( etc. behavior) |
| >>CC | L | None | **One character missing from a list.** The wrap-on-type table already holds quote, apostrophe, backtick, star and the three bracket pairs — the dollar sign was simply never added. One-line fix; the only decision is whether it should wrap in code files too, or only in md/qmd. |
| **A.02** | | ✅ | Way to edit a project - esp. to remove folders (?right click) and/or palette -> open project file and then edit it |
| >>CC | L | None | **The remove-a-folder function already exists in the code — nothing ever calls it.** Wiring it to a right-click on a project root plus a palette verb is small; I'd also add "Open Project File" so you can hand-edit the `.wdproj` when you want to. |
| **A.03** | | ❓ | Use WD as a windows mapped app -> double click to open py files in WD? |
| >>CC | M | ❓ | **Built, but Writedown does not appear in the Windows "Open with" list — parked at your call (2026-08-02), low value.** Both halves shipped: the installer declares the file types and Writedown opens whatever file it is launched with. What is unproven is Windows actually honouring the registration — likely because associations are written by the **installer**, so they only exist after installing the NSIS package, not for a rebuilt-in-place `.exe`. The launch-with-a-filename half works independently: `writedown.exe some.md` opens it. Revisit only if it starts to matter. |
| **A.04** | | ✅ | WD as a drag and drop target? |
| >>CC | L | None | **Windows already delivers dropped files to the window; nothing is listening.** About twenty lines to open them — drop a folder and it opens as a folder, drop files and they open as tabs. |
| **A.05** | | ✅ | Different font for different file types (eg. more fixed width for python set in config? And/or easy switch font (list switch font to...) list in config from palette |
| >>CC | M | None | **CORRECTION (2026-08-02): I over-called this. "Slow" was wrong.** Two things I got wrong: the syntax colors are cached by theme, not by font, so a font change doesn't rebuild them; and a full editor rebuild *already* happens on every tab switch today, so per-type fonts add none. The only real cost is a small style sheet built per switch that never gets cleaned up — a slow drip over a long session, not a stall. Still worth doing the tidy way, which also fixes the same drip in Ctrl+wheel zoom. |
| **A.06** | | ✅ | selection  + Ctrl+D should duplicate just the selection - not the whole line |
| >>CC | L | None | **Small correction first:** in Writedown Ctrl+D is select-next-occurrence (your favorite); *duplicate* is Ctrl+Shift+D, and it always copies whole lines. Making it copy the selection when there is one is a small, self-contained change. |
| **A.07** | | ❌ | Split screen - look at two files at the same time? Edit mode only. |
| >>CC | H | ❌ | **DROPPED 2026-08-02. YELL — this is by far the biggest structural item on the list.** Writedown has exactly one editor, one "current file" and one layout mode; a second pane breaks all three. Weeks, not days, and two live editors on big docs cost real memory and CPU. |
| **A.08** | | ❌ | ctrl + shift + f -> ripgrep find?! needs a dialog/input box for the query, -g args etc. |
| >>CC | H | ❌ | **DROPPED 2026-08-02. The full thing (results panel, click a hit to jump there) is a genuinely big feature — but you can have 80% of it today.** A `[build]` entry running `rg` already dumps its output into a scratch tab. Worth living with that for a week before I build the panel. |
| **A.09** | | ✅ | Ctrl+Shft+Enter -> all cells or just current cell? partial Python renders? |
| >>CC | L | ✅ | **Answered 2026-08-02, no code needed: ALL cells, top to bottom, in a fresh namespace every single time.** There are no partial renders today — that is exactly what **A.24** adds. |
| **A.10** | | ❌ | "header" Python code somehow, eg import sys, sys.path.append...; import xxx; |
| >>CC | L | ❌ | **DROPPED 2026-08-02 — you already had the better solution.** Put the imports in the first cell with `#\| echo: false` — it runs but never shows. What's genuinely missing is a preamble that lives *outside* the document; I'd add `wd-python-init: setup.py` in the YAML, matching your existing `wd-python:`. |
| **A.11** | | ✅ | TOC in py should include \tdef xx for class members; optional _ and __ members, from config |
| >>CC | L | None | **Found it, and it's a real bug.** Methods ARE parsed — but any class with more than 30 of them has its *entire* member list silently thrown away by a cap in the outline code. Your classes are exactly the ones that trip it. Raise the cap for Python, add the `_` / `__` config switch. |
| **A.12** | | ❌ | Python autocomplete and general LPS implementation? |
| >>CC | DROP | ❌ | **Dropped at your call (2026-08-02)** — Tab word-completion covers it. For the record: the cheap option was completions from the already-running Python kernel; the full one was an LSP client, easily the largest thing ever added to Writedown. |
| **A.13** | | ✅ | Mouse scroll in preview/render window to resize like edit tab? |
| >>CC | L | None | **Ctrl+wheel zoom exists on the editor only — the preview has no zoom at all.** Same trick, one more pane. |
| **A.14** | | ❓ | Tab to get completions for long words currently indents the para when there is no match. that is confusing. It should do nothing / drop down "no matches". |
| >>CC | L | None | **Confirmed exactly as you describe.** When nothing matches, Tab is handed on to CodeMirror's indent — which indents the whole logical line, i.e. your paragraph. Fix: after a long-enough word, swallow the Tab and flash "no matches" instead. |
| **A.15** | | ❌ | Text hard wrap and reflow? Like Emacs esc-Q? (Bad for git diffs?) |
| >>CC | M | ❌ | **DROPPED 2026-08-02. The wrapping is trivial; not wrecking lists, quotes, tables, code fences and YAML is the work.** Command-only, never automatic. On diffs: noise only bites if you reflow *old* text — text wrapped as you write it diffs fine. |
| **A.16** | | ✅ | Easy way to go "edit window only" view = no toc, outline, no preview (perhaps Ctrl K + ctrl P (plain), palette, or ALT+F11) |
| >>CC | L | Tiny | **Shift+F11 already gets you fullscreen with no sidebars — but it keeps the preview.** This is a second, non-fullscreen composite: editor only, no outline, no preview, previous layout restored on exit. Small, and actually a tiny speed-up (outline parsing stops). |
| **A.17** | | ✅ | double click from folder/project opens the file in default app (ii's it in PS speak). Eg html files etc. Can tree view easily use app-specific icons for those files? (like we do for python files?) |
| >>CC | L | None | **Your scheme (single = preview, double = edit, Ctrl+click = default app, all types) is clean and I'd build exactly that.** Bug found on the way: today "Open Externally" on an image or a zip launches your *PDF viewer*, because it's wired to the pdf_viewer setting rather than to Windows. Icons for html/css/js are one line each; real per-app Windows icons are a different, much harder thing. |
| **A.18** | | ✅ | Can we auto-number sections in a md render? Is that just a yaml setting? if so, palette toggle number-sections to adjust yaml |
| >>CC | L–M | None | **Yes it's a Quarto YAML setting (`number-sections: true`) — but our preview is markdown-it, which ignores it.** Cheapest good answer: pure CSS numbering, switched on by reading that key. For the palette toggle I'd flip a *view* setting rather than rewrite your YAML — safer, instantly reversible, and it never touches your file. |
| **A.19** | | ❌ | Can we add a joplin style [TOC] element? |
| >>CC | M | ❌ | **DROPPED 2026-08-02. Needs a list of every heading, but the preview deliberately renders and caches one block at a time.** So the `[TOC]` block has to be rebuilt whenever *any* heading anywhere changes — that bookkeeping is the whole cost of the feature. |
| **A.20** | | ✅ | update decl pygments: aggregate rebuilt its pygments colorizer - can we pick the new version up? |
| >>CC | M | None | **Yes — and it has moved on a long way; I diffed the two.** New since our snapshot: `//` comments, `doc{{{…}}}` blocks, `tags{}`, quoted `"labels"` (we have *no* string rule at all today), `port.` / `dist.` / `distortion.` names, and new keywords (peel, dwait, wait, year/years, splice). This is a re-port, not a patch. |
| **A.21** | | ✅ | Use Decl mode and pygments colorizer for .agg files: add outline via match ^(agg\|port\|x?pnl\|bv\|dist) etc, fold up, comments |
| >>CC | M | None | **`.agg` files already colorize, and Ctrl+/ already comments them.** What's missing is the outline (there is no `.agg` case at all) and folding (the colorizer style we use gets none for free). Both are new, both are small. |
| **A.22** | | ✅ | Ctrl + V with an image on clipboard -> act like Joplin = save file as parent_dir/hash.<ext from clipboard> and insert ![]() link |
| >>CC | M | None | **Rules settled 2026-08-02: image goes to `img/` beside the document, created if it isn't there; a temp file's images go to `~/.writedown/img/`. Accepted in md, qmd and temp files only — Ctrl+V is untouched everywhere else.** Named by content hash, so pasting the same screenshot twice reuses one file and nothing is ever overwritten. One unknown that decides whether this is small or medium: whether the webview hands us the screenshot already PNG-encoded (likely) or we have to encode it ourselves in Rust. |
| **A.23** | | ❓ | Render strings: percent (%) leads to funny coloring for the rest of the line in qmd render |
| >>CC | PEND | ??? | **Parked 2026-08-02 — neither of us can reproduce it.** Next time it bites, note whether it's the left editor or the right rendered pane and paste the offending line; with a sample I'll have it in minutes. |
| **A.24** | | ✅ | ability for incremental render of python blocks or "just this block" |
| >>CC | M | None | **Per your call: run the cell in whatever state the kernel is already in — Jupyter's Shift+Enter.** The running-it half is nearly free (the kernel already persists between renders). The work is remembering each cell's output so the Rendered pane can be rebuilt with just one cell changed. |
| **A.25** | | ✅ | After switch projects -> files "appear" one by one; freeze window and render all at once would be smoother |
| >>CC | M | Tiny | **Diagnosed: every remembered-open folder is fetched in its own separate round-trip, and each answer redraws the tree** — so you literally watch it fill in. Fix is one batched fetch, then draw once. |
| **A.26** | | ✅ | On select, show in lower right, count of number of rows selected, like ST |
| >>CC | L | None | **The status bar already updates on every cursor move, so this hooks straight in:** "N lines / M chars selected", plus a count of cursors when you're multi-selecting, like ST. |
| **A.27** | | ✅ | Ability to NAME temporary files. I really like those - associated with a project, open with the project, but I don't have to decide where to save. (Where ARE they saved?) Palette -> name temporary file. |
| >>CC | L | None | **Answering the question: they are not files at all.** Their text lives inside the project's session file, `~/.writedown/sessions/<hash>.json` — which is why they follow the project around. (That folder is disposable, so they get no backups and no Synology sync — risk noted and accepted by you, no behavior change.) **Scope confirmed: name only.** Palette "Name Temporary File…" and the tab shows the name instead of Untitled-3. Turns out to be smaller than I first thought — renaming the buffer's internal id does the whole job, no new plumbing. |
| **A.28** | | ✅ | BTW writedown-issues.md did not appear to reload after CC's external edits (2026-08-02) |
| >>CC | L | None | **Real bug, found it.** The reload check compares file paths as raw strings, so a tab opened by a path spelled differently from the watched folder (different capitals or slashes — e.g. your Ctrl+Shift+Q quick-file, typed by hand into config.toml) never matches, and the change is dropped **silently**. Same family as the duplicate-projects bug; the correct comparison already exists elsewhere in the code. Second possibility, by design: if the tab had unsaved edits it deliberately won't reload — it shows "Modified externally" in the footer instead. |
| **A.29** | | ✅ | Switching back and forth between tabs freezes briefly — mouse wheel won't scroll. Worse on larger files (writedown-issues.md). Fine once the freeze passes. |
| >>CC | M | None | **Fixed (2.10.0).** Every tab switch was throwing away and rebuilding the *entire* editor — even between two markdown files, where the result is identical. Rebuilding re-scanned the whole document for math, re-parsed it, and re-ran every checker: on a 140 KB file, a visible stall. **Why the wheel specifically died:** the Ctrl+wheel zoom listener forces the browser to ask JavaScript before scrolling, so a busy moment means *no* scrolling rather than jerky scrolling. Now the editor is only rebuilt when the document's *kind* changes (markdown → csv, say), so switching between two markdown files rebuilds nothing at all. **Caveat, and your instinct was right:** the incoming document still has to be re-read into the one shared editor, so a really big file may still show a shorter pause — the only way to make a return to an unchanged file completely free is to keep a separate editor state per tab, which is a bigger change. Tell me if you can still feel it. |

**Legend:** ✅ done · ❌ dropped by decision · ❓ unresolved, needs work or a repro.
Shipped but not yet confirmed in daily use: **A.04**, **A.05**, **A.24**, **A.25**
(A.03 needs an installer build before it can be tested at all).

### Considered and DROPped ideas

Copies of the ❌ rows above, kept together so the reasoning stays visible. They remain in
the main table too — dropped is history worth seeing.

| Item | Effort HML | Status/Impact | Idea, and why it was dropped |
|--:|:---:|:---:|:-------------------------|
| **A.07** | H | ❌ | **Split screen — two files at once.** The one genuinely structural item: Writedown has a single editor, a single "current file" and a single layout mode, and a second pane breaks all three. Weeks not days, plus real memory/CPU for two live editors on big docs. Dropped once sized. |
| **A.08** | H | ❌ | **Ctrl+Shift+F ripgrep find-in-files.** The full version (query dialog, results panel, click a hit to jump) is a big feature; 80% of the value is already available today via a `[build]` entry running `rg` into a scratch tab. Dropped in favor of that. |
| **A.10** | L | ❌ | **"Header" Python code (imports, sys.path).** Already solved better by what you were doing: a first cell with `#\| echo: false` runs but never shows. Nothing to build. |
| **A.12** | DROP | ❌ | **Python autocomplete / LSP.** Tab word-completion covers it. Cheap option would have been completions from the live Python kernel; the full one an LSP client — easily the largest thing ever added to Writedown. |
| **A.15** | M | ❌ | **Hard wrap / reflow (Emacs `M-q`).** Wrapping is trivial; not wrecking lists, quotes, tables, fences and YAML is the actual work. Dropped as not worth that care. |
| **A.19** | M | ❌ | **Joplin-style `[TOC]`.** Needs every heading, but the preview deliberately renders and caches one block at a time — so the TOC must be rebuilt whenever any heading anywhere changes. The Outline pane already does this job live. |

### Cross-cutting notes on this batch

* **Numbering:** renumbered contiguously 2026-08-02 at your request — the old duplicate `A.21` (image paste) is now **A.22**, the `%` item is **A.23**, and the empty `A.23` "deleted duplicate" row is gone. `A.24`–`A.26` keep their numbers, so nothing you have written down elsewhere moved. `A.27`/`A.28` are new. `A.12` is retained with a `DROP` verdict — history, on purpose.
* **Markdown safety:** A.21's regex contained raw `|` characters, which were splitting that table cell — escaped to `\|` so the table renders.
* **Corrections made 2026-08-02:** A.05's "slow" verdict was wrong and is retracted in its row and dev note — the cost is a slow style-sheet drip, not a stall. A.22's folder/type rules and A.27's scope are now settled, not open questions.
* **Agreed plan (2026-08-02): five batched releases**, one version bump / one commit / one CHANGELOG section each. **2.4.0** A.28, A.14, A.11, A.01, A.06, A.26, A.27 · **2.5.0** A.22, A.04, A.17 · **2.6.0** A.05, A.13, A.16, A.02, A.25 · **2.7.0** A.20, A.21 · **2.8.0** A.24, A.18, A.03. A.23 parked pending a repro; A.09 answered. The two silent-wrongness bugs (A.28 stale buffers, A.17's "Open Externally" launching the PDF viewer) lead.

---

## Batch A — developer notes and implementation plans

### A.01 — `$` in the type-to-wrap set

`PAIRS` in `src/editor/wrapOnType.ts:9-17` is the whole feature: an `EditorView.inputHandler` that surrounds every non-empty range when the typed char is a key of that table. Add `"$": "$"`. Behavior falls out for free — multi-range aware, keeps the text selected (so `$` then `$` gives `$$…$$`, which is probably what you want for display math), and empty cursors still type normally.

Decision: `editingExtras` (`keymap.ts:13`) is installed for **every** document, so `$` would wrap in `.py` and `.toml` too. Two options: (a) accept it (consistent, and `$` over a selection in code is a rare intent), or (b) make the pair set language-aware — pass `isMarkdownDoc(path)` down and use an extended table only there. I'd take (a) unless it bites; (b) costs a prop and an extra `useMemo` dep on `path`, which is already there.

Free adjacent adds if wanted: `_` (underscore italics) and `~` (strikethrough) — same table.

### A.02 — Edit a project / remove folders

`removeProjectFolder` already exists and is correct (`store.ts:1587-1593`): filters `projFolders`, re-arms the watcher, calls `syncExtraWatch`, then `persistProject()` writes the `.wdproj` immediately. **It has no caller.** Nothing in `commands.ts:275-285` (the project verb block) or `FileTree.tsx:238-277` (the context menu) invokes it.

Plan:
1. `ProjectTree` (`FileTree.tsx:280-301`) renders each `projFolders[i]` as a depth-0 `TreeNode`. Thread a flag (`isProjectRoot`) into `TreeNode` → `openTreeMenu`, so `TreeContextMenu` can show **"Remove Folder from Project"** only on those rows. Cardinal rule: that verb calls `removeProjectFolder`, *never* `deleteEntry` — it must never touch the folder on disk (spec §2).
2. Palette: `"Project: Remove Folder…"` opening the existing `Prompt`/palette list of `projFolders`.
3. `"Project: Open Project File"` → `openFile(projectFile, false)`. The `.wdproj` is pretty-printed JSON (`project.rs:56`) so it edits fine as a tab. Gotcha: the file is in `~/.writedown/projects/`, outside every watched root, so an external edit won't refresh — but *our* save won't reload the in-memory project either. Either (a) special-case a save to `projectFile` → re-`loadProject` + re-`watchWorkspace` (mirrors the `config.toml` save branch), or (b) label the palette verb "…(reopen project to apply)". (a) is ~10 lines and better.
4. While in there: `addFolderToProject` (`store.ts:1453`) dedupes with `projFolders.includes(picked)` — an exact string compare, the same class of bug as issue 13. Use `samePath`/`normPath`.

### A.03 — Windows file association (double-click `.py` → Writedown)

Genuinely two independent pieces, and *neither* exists:

**(a) Registration.** Tauri 2 supports `bundle.fileAssociations` in `tauri.conf.json` (`ext`, `name`, `description`, `role`). NSIS and WiX both honor it. Caveats to state up front: it only takes effect on **install** (a copied `.exe` gets nothing); uninstall must deregister; and Windows may still show the "how do you want to open this" chooser the first time if another app owns the ProgId.

**(b) Argv handling.** `lib.rs:16-102` never reads `std::env::args()`. Today launching `writedown.exe foo.py` opens an empty window. Need: in `setup` (`lib.rs:28`), collect args, filter to existing file paths, stash them in managed state; expose a `launch_files()` command the frontend calls during `hydrate()` (`store.ts`, after `restoreSession`) and `openFile(p, false)` each. Order matters — open *after* session restore so the launched file ends up active.

**(c) The multi-instance question — settled.** Each double-click spawns a **new process**, consistent with the We 4 decision that multi-instance is the goal (CLAUDE.md). `tauri-plugin-single-instance` would invert that and is deliberately **not** being added. If a second double-click reusing the open window ever turns out to be what you want, that's a decision to revisit, not a bug.

**Extensions to claim** — my default proposal, subject to your call: `.md`, `.qmd`, `.markdown`, `.agg`, `.dec`, `.decl`, `.bib`. I'd *not* claim `.py`, `.json`, `.toml` by default (they belong to your other tools) — but make the list a bundle-config line so it's one edit.

### A.04 — Drag-and-drop target

Tauri 2 sets `dragDropEnabled: true` on the webview by default, which **suppresses HTML5 drag events** and instead emits window-level drag-drop events carrying real OS paths. So the HTML5 route is not just unnecessary, it's actively unavailable.

Plan: one effect in `App.tsx` beside the existing `listen("fs-change")` (`App.tsx:68-71`):

```ts
getCurrentWindow().onDragDropEvent((e) => { if (e.payload.type === "drop") … })
```

For each path: directory → `setFolderRoot` (or `addFolderToProject` if the Project tab is active — decide); file → `openFile(p, false)`. Add a hover highlight from the `over` event (a CSS class on `.app`) so the drop target is visible.

Gotchas: (i) paths arrive as absolute OS strings, so no `convertFileSrc` needed; (ii) dropping 200 files should be capped (say 20) with a status message, or the tab strip explodes; (iii) verify the event needs no extra entry in `capabilities/default.json` — `core:default` includes the event permissions, but confirm at build time; (iv) images/binaries must route through the same `openFile` guards (`isImageDoc` / `isBinaryExt`, `languages.ts:115-121`) rather than being read as text.

### A.05 — Per-file-type fonts + palette font switch

**CORRECTION, 2026-08-02.** My first pass here called this a perf risk and used the word "slow". That was wrong on two counts, and the retraction matters more than the original claim:

* **The HighlightStyle is not rebuilt by a font change.** `highlightStyleFor` memoizes it in a `WeakMap` keyed by the *theme* object (`sublimeTheme.ts:73-85`) — deliberately, so the editor and preview share one instance and their colors match. So a font change does **not** produce a new `HighlightStyle`, and therefore does **not** invalidate the preview's code-highlight cache (`codeHighlight.ts:18`, a `WeakMap` keyed by that instance). My "every fenced block re-highlights on tab switch" concern was simply false.
* **The full reconfigure already happens on every tab switch.** `path` is already a dependency of the `extensions` `useMemo` (`Editor.tsx:149`), and `lang` changes with it — so `@uiw/react-codemirror` already dispatches a whole-stack `StateEffect.reconfigure` on *every* tab switch today, per-type fonts or not. This feature adds **zero** new reconfigures.

**What it actually costs.** One extra `EditorView.theme()` call per tab switch that crosses a font group (`sublimeTheme.ts:37-60`), producing a new `StyleModule` that CodeMirror mounts into the document. CodeMirror never *un*mounts old style modules, so they accumulate over a long session. That is a slow drip, not a stall — and it is worth noting the same drip already exists on **Ctrl+wheel zoom**, which rebuilds the theme once per notch (`fontSize` is in the `built` deps, `Editor.tsx:98-101`). That was flagged in the item-11 note and never fixed.

**Recommended implementation, unchanged — but for tidiness, not speed.** Make `buildSublimeTheme` (`sublimeTheme.ts:37-60`) emit `font-family: var(--wd-editor-font-family, <sublime default>)` and `font-size: var(--wd-editor-font-size, …)`, and set both variables on `.cm-host` from a plain effect keyed on `path`. The theme object then stays stable across both tab switches and zoom notches, which removes the pre-existing zoom churn in the same pass. Costs about the same to build as the naive version.

**Config shape.** `[editor]` already carries `font_family` (`config.rs:293`). Add a nested table, e.g.

```toml
[editor.font_by_ext]
py = "Cascadia Mono"
md = "Source Code Pro"
```

parsed in `load_editor_settings` (`config.rs:275`) into `font_by_ext: Option<HashMap<String,String>>`, resolved as `by_ext[ext] ?? font_family ?? sublime`. Same pattern as `keys`/`snippets`/`build` (`config.rs:354-368`) — nothing new to invent.

**Palette switch.** Add `[editor] font_choices = ["Source Code Pro", "Cascadia Mono", …]` → one `"Font: <name>"` verb each (mirror `snippetCommands`, `commands.ts:299`), setting a **transient** session override (`editorZoom` is the model: `store.ts:209`, localStorage, never written to config unless an explicit "Set as Default" verb). Per the no-state-flipping-buttons rule, these are N explicit verbs, not a cycle.

### A.06 — Duplicate the selection, not the line

Correcting the premise for the record: `keymap.ts:21` binds **Ctrl+D → `selectNextOccurrence`**; **Ctrl+Shift+D → `duplicateLine`** (`keymap.ts:23`), which resolves to `copyLineDown` from `@codemirror/commands` (`commandRegistry.ts:86`). `copyLineDown` is line-oriented by design — it has no selection mode.

Plan: a `duplicateSelection` StateCommand beside the `textOps.ts` family:

* every range empty → delegate to `copyLineDown` (today's behavior, unchanged);
* any non-empty range → `changeByRange`: insert `sliceDoc(from,to)` at `to`, and leave the *new* copy selected (ST leaves the cursor at the end of the copy — match ST, confirm on first use);
* multi-range must be handled by `changeByRange` so offsets self-adjust.

Register as `duplicateSelection` in `COMMAND_REGISTRY`, and repoint `Ctrl+Shift+D`. Keeping the old name available means a `[keys]` line restores the pure-line behavior. Zero perf.

### A.07 — Split screen (two files at once)

**YELL. This is the one item here that is a project, not a task.** Three global singletons all assume exactly one editor:

1. `editorView.ts` — `getActiveView()` is a module-level singleton set by `onCreateEditor` (`Editor.tsx:277`). *Every* editor-acting command (`commands.ts` `onMarkdownView`, the whole `COMMAND_REGISTRY`, `jumpToLine`, `Outline`, `renderActive`'s scroll read at `store.ts:1188`) goes through it. A second view needs a focus-tracked registry, and every one of those call sites re-audited.
2. `store.ts:252` `viewMode` and `store.ts` `activePath` are single-valued. Split panes need per-pane active paths, and the tab strip needs to know which pane it's driving.
3. Session persistence (`sessionSnapshot`, `store.ts:1657+`) stores one layout. Restoring a split adds a schema version.

Plus the per-doc cursor/scroll memory (`Editor.tsx:181-261`) is keyed by `path` alone — the same file open in both panes would fight over one remembered position.

Cost: this is the largest change since the app was built. Two live CodeMirror instances on big documents roughly double the decoration/lint/spell work and the WebView2 memory — the exact thing that made the app draggy in the 1.72 era. Editing-only (your constraint) helps: no second preview, no second render. But I'd want it specced as its own plan doc in `dev/` with an explicit "what it will and won't deliver" statement (the v1.24.0 lesson) before a line is written.

Cheaper things that scratch most of the same itch, in order: (a) a second *window* on the same project (multi-instance already works — We 4); (b) Ctrl+Tab MRU tab switching (currently strictly positional, `store.ts` `nextTab`); (c) a "compare" that opens the other file in the preview pane read-only.

### A.08 — Ctrl+Shift+F → ripgrep find in files

**Try the free version first.** `[build]` (`config.rs:125-136`, `external.rs:76-119`) already runs an arbitrary command through pwsh from the file's folder and dumps stdout/stderr into a scratch tab. `"grep" = "rg --line-number $args"` gets you results today. What it does *not* give you is a query box, or clicking a hit to jump there.

The real feature, scoped:

* **Rust:** a `search_workspace(query, roots, opts)` command. Prefer spawning `rg --json` (you have it, and `--json` gives structured `{path, line_number, submatches}` — no output parsing guesswork) with a hard result cap and a timeout, on `spawn_blocking` like `run_build`. Fallback if `rg` is absent: surface a clear error, do **not** silently degrade to a slow in-process walk.
* **Frontend:** a results panel. The honest options are (a) a new bottom pane (new layout work, new resizer, new session field), or (b) a dedicated results *tab* — a scratch-like read-only doc with a click handler mapping `file:line` → `openFile` + `jumpToLine`. (b) reuses everything that exists and is maybe a third of the work; (a) is what ST does.
* **Query UI:** the existing `Prompt` (`Prompt.tsx`) handles one string. A real Find-in-Files needs query + glob + case/regex toggles — that's a small new modal, not a reuse.

Perf: none at rest, it's on-demand. Risks: the cap and timeout are not optional — an unbounded `rg` on `C:\` with the results streaming into React will wedge the UI.

### A.09 — What Ctrl+Shift+Enter actually does

Answered, no code. `render` → `renderActive` (`store.ts:1178`) → Rust `render_document` → `render_impl` (`render.rs:1217`) → `run_cells` (`render.rs:301`). `run_cells` walks **every** `Segment::PythonCell` in order and passes `first=true` on the first one, which triggers the runner's namespace `reset`. So: all cells, top to bottom, fresh namespace, every time. Cells with `#| eval: false` are skipped (shown as source). If a cell times out, the kernel is killed and every later cell is marked "not run".

There is no partial render today. A.24 is the fix, and per your answer the semantics are Jupyter's.

### A.10 — Python preamble / header code

**Already possible, in-document:** `parse_cell_opts` (`render.rs:408`) honors `#| echo: false`, so a first cell with

```
#| echo: false
import sys; sys.path.append(r"T:/worktrees/...")
```

runs and is invisible in the output. Worth trying before building anything.

**What's actually missing** is a preamble that isn't *in* the document. Two layers, both cheap, both in `render.rs`:

1. **Per-doc:** add `wd_python_init: Option<String>` to `FrontMatter` (`render.rs:370-376`) and a `strip_prefix("wd-python-init:")` branch in `parse_front_matter` (`render.rs:429`) — exactly the shape of `wd_python` (issue 9). Value = a path to a `.py` file. Unlike `wd-python`, **resolve relative paths against the doc folder** (`doc_dir` is already computed at `render.rs:1247`) — that's the more useful semantics here, and `bibliography:`/`doc_bib` already sets the precedent (`render.rs:1183`).
2. **Global default:** `[render] preamble_file` in config, read in `render_cfg` (`render.rs:56`). Doc value overrides config, config overrides nothing — same precedence ladder as `python`.

Execution: in `run_cells`, when `first` is true, send the preamble source to the kernel as a synthetic cell *before* the first real cell, in the same `reset`ed namespace. Its output is discarded; **its errors must be surfaced** as a render warning (the `pre_warnings` vector at `render.rs:1220` is already the channel) — a silently failing preamble would be maddening.

Note the interaction with A.24: a "run just this cell" in the live namespace does *not* re-run the preamble, which is correct (the namespace already has it) but means a cold kernel + run-this-cell needs the preamble injected. Handle by tracking "preamble applied since last reset" in `RenderState`.

### A.11 — Python outline drops class members

**Root cause found and it is not what the item assumes.** `parsePython` (`outline/parse.ts:102-124`) already emits methods at level 2 (`indent > classIndent && indent <= classIndent + 8`). The killer is `capChildren` (`parse.ts:26-40`), called on the result: any node with **more than `MAX_CHILDREN = 30` direct children has all its descendants dropped**. `MAX_CHILDREN` is 30 (`parse.ts:9`). Your aggregate classes comfortably exceed that, so the entire method list vanishes — which reads exactly like "methods aren't included".

Plan:
1. Make the cap per-language or simply much larger for Python (a class with 200 methods is precisely when you *need* the outline). Suggest: keep `capChildren` for Markdown/YAML (where it was defending against pathological documents), skip or raise it to ~500 for `py`.
2. Config knobs in `[outline]`: `python_show_private` (default true — `_foo`) and `python_show_dunder` (default false — `__init__` is the exception you'd want; consider "dunder = show only `__init__`"). Parse in `config.rs:330-333` beside the other `[outline]` keys; filter in `parsePython`.
3. While in there: `parsePython` misses `@property`-style grouping and treats a top-level `def` as ending the class (`classIndent = -1`), which is right. Deeper nesting is deliberately omitted — leave it.

Also worth checking on the same pass: `Outline.tsx:25` debounces at 300 ms with a `path` reset key, so a big `.py` re-parses per typing pause. `parsePython` is a single regex per line — fine even on 10k-line files.

### A.12 — Python autocomplete / LSP

**DROPPED 2026-08-02 at the author's call.** Recorded here so the reasoning survives:

* *Cheap option (M):* the render kernel is already a persistent Python process (`render.rs:167-277`) with a live namespace. A `complete(prefix)` message to the runner returning `jedi`/`rlcompleter` candidates would feed CodeMirror's existing autocompletion with near-zero new machinery. Limits: only meaningful where a kernel exists (`{python}` cells in a doc you've rendered); not type-aware; no hover types, no go-to-definition; results depend on execution state.
* *Full option (H+):* an LSP client in TypeScript, a managed `pyright`/`jedi-language-server` subprocess, config for its path, environment discovery (the exact coupling that killed Quarto render in v1.24.0), plus initialization/shutdown/crash handling. Largest addition ever proposed for Writedown.

### A.13 — Ctrl+wheel zoom in the preview pane

The editor got this in 1.90.0/1.92.0: a **non-passive** wheel listener on `view.scrollDOM` (`Editor.tsx:277-298`) that `preventDefault()`s WebView2's page zoom and accumulates deltas so one physical notch is one step, driving the clamped, session-only `editorZoom` (`store.ts:209`, `setEditorZoom` clamps at `store.ts:826`).

The preview has none of that. `Preview.tsx:910-912` renders `.preview-scroll > .preview`; font size comes from `App.css` (`.preview` and its `h1..h6` / `code` rules).

Plan: mirror the editor exactly.
1. `previewZoom` in the store, same clamp and same localStorage-not-config discipline as `editorZoom`.
2. A non-passive `wheel` listener on `scrollRef` (`Preview.tsx:910`), `{ passive: false }`, `preventDefault()` when `e.ctrlKey` — **required**, or WebView2 zooms the entire app chrome.
3. Apply as a CSS variable, **not** a re-render: `.preview { font-size: var(--wd-preview-font-size, 15px) }` set directly on the element in the handler. The preview's DOM patcher (`Preview.tsx:532`) must not be disturbed by a zoom, and a React state round-trip per notch would fight it.
4. Ctrl+0 to reset; add `zoomPreviewIn/Out/Reset` to `COMMAND_REGISTRY` so they're rebindable and F1-visible.

Watch: KaTeX sizes in `em`, so math scales along — good. Rendered images use explicit `{width=50%}` attributes — those are percentages of the container, so they scale too.

### A.14 — Tab with no match must not indent the paragraph

**Confirmed, and the mechanism is exact.** `tabOpenComplete` (`wordComplete.ts:123-144`) returns `false` when `harvest()` and the frequency dictionary both come up empty. That `false` falls through to the lower-precedence Tab binding (`wordComplete.ts:150-162`) whose `run` ends in `indentMore(v)`. `indentMore` indents **every line touched by the selection** at its start — and with `word_wrap = true` your visually-wrapped paragraph is one logical line, so the whole paragraph shifts. Exactly your symptom.

Fix (small, and it must be precise about *when* it swallows Tab):

* In the fall-through handler, before `indentMore`: read the stem with the existing `stemBefore(state, pos)` (`wordComplete.ts:30`). If there is a stem **and** it is at least `tab_complete_min_len`-ish long (reuse the config value, or a separate `tab_complete_stem_min`, default 2–3 — your "first 1-3 letters, Tab, nail it" workflow means the gate must be *low*), then **consume the Tab and do nothing** rather than indent.
* Feedback: `showStatusMessage("no completions for \"<stem>\"")` — the transient status-bar mechanism already exists (`store.ts` `showStatusMessage`, auto-clearing, used by Locate File). Cheaper and less intrusive than a fake popup, and it's the same affordance you already read.
* Preserve: Tab at line start / after whitespace still indents (that's `stemBefore` returning null), Shift+Tab still dedents, an open popup still accepts.

Consider also: `harvest`'s `min` is `Math.max(minLen, stem.length + 1)` (`wordComplete.ts:70`) with `tab_complete_min_len` defaulting to 5 — so a 1-2 char stem only ever offers ≥5-char words. That is the intended design, but it means short stems fail more often than you'd expect, which is *why* this bug is annoying rather than rare.

### A.15 — Hard wrap / reflow paragraph

No such command exists; CodeMirror ships nothing for it. `wrap.ts` (22 lines) is only the soft word-wrap compartment toggle — unrelated.

Design:
* New command `reflowParagraph` in `textOps.ts`, registered as `reflowParagraph` in `COMMAND_REGISTRY`, bound to `Alt+Q` (Emacs `M-q`; `Esc Q` would make Escape a chord prefix — the same fiasco we avoided for `Alt+T`, see the 2026-07-16 note).
* Scope: with an empty selection, the paragraph containing the cursor (bounded by blank lines and by structural boundaries); with a selection, exactly the selected lines.
* Column from `[editor] wrap_column`, default 79.
* **The actual work is the boundary rules.** Must never reflow across, or destroy: fenced code blocks (``` / ~~~), YAML front matter, tables (any line with a leading/interior ` | `), block quotes (`>` prefix must be re-emitted on each line), list items (marker on the first line, hanging indent on continuations — and never merge two list items), ATX headings, HTML blocks, and `$$…$$` display math (`mathRegions`, `math.ts:76`, gives you the spans for free).
* Never break inside an inline construct: a `[link](url)`, an `![image](path)`, `` `code` ``, or `$inline math$`. Simplest correct approach: tokenize the paragraph into "atoms" (words plus these unbreakable runs) and greedily pack.
* Markdown hard breaks: two trailing spaces are significant. `trim_trailing_whitespace` (`config.rs:296-306`) already has a `"keep-hard-breaks"` mode — reflow must honor the same setting or it will silently eat them.

On your git-diff worry: it's real but self-limiting. Reflowing an existing 5,000-word document rewrites every line once; after that, wrapping as you write produces small diffs. Recommend command-only (never on save, never automatic) so it's always your explicit act.

### A.16 — "Edit window only" view

Existing pieces: `sidebarVisible` / `outlineVisible` (`store.ts:223-224`, toggles at `store.ts:1243-1244`), `viewMode` (`store.ts:252`, `cycleView` at `store.ts:1168`), and the `distractionFree` composite with save/restore (`store.ts:1266-1285`) — which already stashes the previous sidebar/outline state in a module-level `dfRestore` and puts it back on exit.

`enterDistractionFree` does *not* touch `viewMode`, so the preview stays. That's the gap.

Plan: a second composite, `enterPlainView` / `exitPlainView`, modelled directly on `enterDistractionFree` but (a) no `setWindowFullscreen`, (b) also stashes and forces `viewMode: "editor"`. Two explicit palette verbs (Enter/Exit — no state-flipping label), a `togglePlainView` registry entry for the key, and `Ctrl+K Ctrl+P` per your suggestion (free: the `Ctrl+K` chord family at `keymap.ts:43-53` has no `P`). `Alt+F11` also free if you prefer a single key.

Wrinkle to decide: should Plain and Distraction-Free be mutually exclusive, or should Plain be a *modifier* that Distraction-Free also applies? Simplest correct: one `layoutMode: "normal" | "plain" | "distraction"` field with one saved restore-state, rather than two independent booleans that can interleave into a stuck layout. Worth the small refactor — two overlapping save/restore stacks is exactly how "my sidebar won't come back" bugs happen.

Free perf win, as noted: `Outline` is mounted in every layout and re-parses the document every 300 ms of typing pause (`Outline.tsx:25-29`). Not rendering it in plain view stops that work entirely.

### A.17 — Ctrl+click → default app; per-type icons

**Your gesture scheme, as specced:** single = preview in WD, double = edit in WD, **Ctrl+click = OS default app, all file types**. Clean, no ambiguity, no regression for existing files. Building exactly that.

**Bug found on the way (report separately if you want it fixed first).** `TreeContextMenu`'s "Open Externally" (`FileTree.tsx:257-265`) calls `openExternal` → `api.ts:143` → Rust `open_external` (`external.rs:18-29`), which **launches `[tools] pdf_viewer`** with whatever path you gave it. So "Open Externally" on a `.png`, `.zip` or `.exe` today either errors ("no viewer configured") or hands the file to SumatraPDF. It is not, and never was, "open with the Windows default app."

Plan:
1. **New Rust command `open_default(path)`** — the real shell-open. `tauri_plugin_opener` is already registered (`lib.rs:18`); `opener::open_path` needs one capability line (`opener:allow-open-path` in `capabilities/default.json`, which currently grants only `opener:default` + `opener:allow-open-url`). Alternative with zero new capability: `Command::new("cmd").args(["/C","start","",path])` — but the plugin is cleaner and already a dependency. Keep `open_external` as-is for PDF/DjVu (it's the documented `[tools] pdf_viewer` route) and point the context menu's "Open Externally" at the new command for everything else.
2. **Gesture wiring** in `TreeNode.onClick` (`FileTree.tsx:107-120`): `if (e.ctrlKey && !entry.is_dir) { openDefault(entry.path); return; }` before anything else. The handler currently takes no event argument — add it. Ctrl+click on a *folder* should probably open Explorer there; decide (I'd do it, it's free).
3. Note the interaction: Ctrl+click currently does nothing special in the tree, so nothing is displaced. But confirm it doesn't collide with any future multi-select.

**Icons.** `icon()` (`FileTree.tsx:6-50`) is a plain extension switch returning a glyph. Adding `html`/`htm` → `🌐`, `css` → `🎨`, `js`/`ts`/`tsx` → `⚡`, `xlsx`/`xls` → `▤`, `docx` → `📝`, `ps1` → `▶`, `zip`/`7z` → `🗜`, `exe`/`dll` → `⚙` is one line each — trivially L. **Real per-app Windows icons** (extracting the shell icon via `SHGetFileInfo` and shipping it to the webview as a data URI, with a cache) is a different animal: a new Windows API dependency, per-extension caching, and icon-size/DPI handling. My recommendation: glyphs now, and only revisit shell icons if the glyph set genuinely fails you.

### A.18 — Auto-numbered sections in the render

Yes, `number-sections: true` is the Quarto YAML key. Our preview is markdown-it (`renderCore.ts:58-65`) and knows nothing about it — Quarto's numbering happens in pandoc, which is not in our pipeline at all.

**Recommended: CSS counters.** Zero JavaScript, zero render cost, works with the per-block incremental renderer because CSS counters resolve across sibling elements in the DOM regardless of how they got there:

```css
.preview.numbered { counter-reset: h2; }
.preview.numbered h2 { counter-reset: h3; }
.preview.numbered h2::before { counter-increment: h2; content: counter(h2) " "; }
.preview.numbered h3::before { counter-increment: h3; content: counter(h2) "." counter(h3) " "; }
/* …h4, h5 */
```

Switch the class from front matter. The frontend already has a front-matter reader for the editor (`frontmatterShared.ts`, `tolerantFrontmatter.ts`) — read `number-sections:` there and set the class on `.preview` (`Preview.tsx:912`).

Gotchas: (i) start at `h2`, since `h1` is the document title in Quarto convention — but the **Rendered** pane injects a title (`render.rs`), so verify the level offset in both panes; (ii) Quarto's `{.unnumbered}` should suppress — the anchor transform already parses attribute blocks (`render.rs:658`), so `.unnumbered` can become a class the CSS excludes; (iii) the **Outline pane won't show numbers** unless mirrored in `parseOutline` — decide whether that matters (I'd leave it plain).

**On the palette toggle:** I'd make it a *view* setting (a store flag + the CSS class), not a YAML rewrite. Rewriting front matter means re-serializing a block we promise to preserve byte-for-byte (spec §2, CLAUDE.md) — for a display preference that's a poor trade. If you *do* want the YAML edited, it must be a surgical single-line insert/replace via CodeMirror on the open buffer (so it's undoable with Ctrl+Z and visible as a normal edit), never a file rewrite behind your back.

### A.19 — Joplin-style `[TOC]`

The hard part is structural, not the TOC itself.

`renderDoc` (`renderCore.ts:121-176`) parses the whole document once (so cross-block state stays right), then renders and **caches each top-level token group by its source text** (`blockCache`, `renderCore.ts:118`), with the cache key prefixed by an `envFingerprint` (`renderCore.ts:107`) covering reference links and footnote numbering. That fingerprint is precisely the mechanism a TOC needs to join.

Plan:
1. After `md.parse`, walk the tokens for `heading_open` + its inline text + its `map[0]` → a heading list. Cheap (one pass over an array we already have).
2. Extend `envFingerprint` to include a hash of that heading list. Any heading added, removed, renamed or moved changes the fingerprint → **every** block cache key changes → full re-render of the document. That is the correctness/speed trade and it must be stated: editing a heading becomes a full-document re-render instead of a one-block one. Mitigation: fingerprint only when the document actually contains a `[TOC]` marker, so documents without one pay nothing.
3. Recognize the marker: a paragraph whose only content is `[TOC]` (Joplin) — and consider also supporting `[[_TOC_]]` / `{{TOC}}` variants, or don't, and document the one form. Replace that block's HTML with a generated `<nav class="toc">` of anchor links.
4. Anchors: headings need stable ids. In the **Rendered** pane `transform_anchors` (`render.rs:658`) already injects `<a id="sec-x">` for explicit `{#sec-x}` labels, but plain headings have no id in either pane. So the TOC has to generate slugs — and they must match what the click handler expects. Simplest: generate `id="wd-toc-<n>"` on the heading during the TOC pass, and link to those; no slug-collision problem, no dependence on heading text.
5. Clicking a TOC entry should go through the existing `scrollPreviewToLine` (`Preview.tsx:364`) rather than a raw anchor jump, so it plays with the sync-scroll machinery and doesn't fight the settle loop.

Note: you already have a live Outline pane doing exactly this job interactively. The value of `[TOC]` is that it's *in the document* and survives export — worth being explicit that it's for output, not navigation.

### A.20 — Re-port the rebuilt aggregate pygments colorizer

I read the current `T:\worktrees\aggregate_REFACTOR\src\aggregate\decl_pygments.py` against our snapshot (`src/editor/decl.ts`). It has been substantially rewritten — this is a re-port, not a keyword top-up. Concrete diff:

**Missing from our port entirely**
* `//` line comments (we only handle `#`).
* `doc{{{ … }}}` fences, both the multi-line markdown form and the encoded single-line form.
* `tags{ … }` block (slug tokens).
* **Quoted display labels** `"…"` → `String`. **We have no string rule at all** — a quoted label currently tokenizes as punctuation-and-words. Probably the most visible gap.
* `port.` / `distortion.` / `dist.` builtin prefixes (we only match `sev.` / `agg.`).
* `hints{}` bodies are now structured (`key=value;`, `True/False/None`, numbers, operators) — we render the whole body as a comment.
* Keywords: `peel`, `dwait`, `wait`, `years`, `year`.
* `sichel.gamma` / `sichel.ig` and `<DISTRIBUTION>` inside the `mixed` state.
* Operators `**`, `^`, `@`; `,` and `|` are now Text (whitespace to the parser), not punctuation.

**Changed classification (our port will now be wrong)**
* `and` — we treat it as `Generic.Heading`; upstream has it in the plain keyword list.
* `splice` — we treat it as `Generic.Heading`; upstream has it as a keyword.
* `wts` — we map to `typeName`; upstream is a plain keyword.
* `dhistogram` / `chistogram` — upstream `Name.Class` (one-parameter severity family); we lump them with `dsev`/`dbvsev` as `labelName`.
* `dfreq` — upstream moved it *out* of the frequency-distribution list into the declaration group (`Name.Label`) with `dsev`/`dbvsev`/`dwait`; we still have it in `FREQ`.
* `in` / `is` / `not` / `or` — we map these to `operatorKeyword`; **upstream has no such rule**, so they fall to `Name`. Ours may be a deliberate improvement; decide rather than blindly following.
* `negbin` is in both; `neyman`/`neymana`/`neymanA` unchanged.

**Structural note worth stealing.** Upstream uses an explicit word boundary `_KW = (?![a-zA-Z0-9._:~\-])` because `.`, `_`, `:`, `~`, `-` are all name characters — `\b` would split `loss-ratio`. Our port gets this right *by accident*: `ID_RE` (`decl.ts:58`) matches greedily and `classifyWord` runs on the whole match. Keep that structure; it's equivalent and cheaper than a lookahead per keyword.

Plan: rewrite `decl.ts`'s `StreamParser` against the new file — new states for `tags` and the structured `hints`, a string rule, a `doc` fence state (the multi-line body is fine as one comment token; delegating to a markdown sub-parse is not worth it here), plus the keyword/classification corrections above. Re-comment the SOURCE-OF-TRUTH header with today's date so the next drift is datable. Manual sync remains accepted (your 2026-07-16 call). No perf impact — `StreamLanguage` is lazy and per-line.

### A.21 — `.agg` outline, folding, comments

Status of the three parts:

* **Colorizer** — already done. `languages.ts:75-78` maps `agg`/`dec`/`decl` to `declDescription.support`, and `declDescription` (`decl.ts:136-141`) also resolves ` ```decl ` / ` ```agg ` fences in both editor and preview. Nothing to do beyond A.20.
* **Comments** — already work. `declParser.languageData.commentTokens = { line: "#" }` (`decl.ts:121-123`), which is what `toggleComment` (Ctrl+/, `commandRegistry.ts:90`) reads. Add `//` once A.20 lands (CodeMirror takes one line-comment token, so `#` stays primary).
* **Outline** — **missing.** `parseOutline` (`outline/parse.ts:11-24`) has cases for `py`, `toml`, `yaml`, and Markdown as the default; `.agg` falls to the Markdown parser and finds nothing but stray `#` lines.

Plan for the outline: a `parseAgg` beside the others, matching top-level declarations. Your suggested regex `^(agg|port|x?pnl|bv|dist)` is the right shape; from the grammar I'd use `^\s*(agg|port|sev|distortion|dist|pnl|xpnl|bv|bivariate|tower|dfreq|dsev)\s+(\S+)` → level 1, text = `keyword name`. Consider level 2 for `note{`/`tags{` blocks, or don't (probably noise).

Plan for folding: `StreamLanguage` gives no fold ranges for free. Two options: (a) a `foldService.of()` extension registered alongside the decl language that folds from a declaration line to the line before the next top-level declaration (matches the outline regex — one source of truth for "what is a top-level statement"); (b) `foldNodeProp`, which needs a real Lezer grammar and is out of scope. Take (a): ~25 lines, and `Ctrl+Shift+[` / `Ctrl+K Ctrl+1` (`keymap.ts:52,72`) then work on `.agg` files with no further wiring. Also fold `note{…}` / `hints{…}` / `doc{{{…}}}` bodies, which is where the bulk usually is.

### A.22 — Ctrl+V image from clipboard → save file + insert link

Nothing in Writedown touches the clipboard for images today (`navigator.clipboard.writeText` is used for Copy File Path, `commands.ts:98`; that's it).

**Note that this writes a new file to your disk in response to a keystroke** — the one thing this app is otherwise careful about (spec §2). It is fine because it is an explicit user action creating a *new* file and never overwriting one, but every rule below exists to keep it predictable.

**Rules, settled 2026-08-02:**

* **Target folder.** Real document → `<parent>/img/`, **created if it does not exist** (your call — always `img/`, never scattered beside the prose). Scratch/temp buffer → `~/.writedown/img/` (`writedown_dir`, `config.rs:140`), created on demand.
* **Accepted in** md, qmd, and temp buffers only. Temp buffers are `untitled://Untitled-N.md` (`store.ts:1306`), so `isMarkdownDoc` already matches them (`languages.ts:124`) — no special case needed. Everywhere else Ctrl+V behaves exactly as it does today.
* **Name.** Content hash + `.png`. Idempotent: the same screenshot pasted twice reuses one file. Never overwrite — if the name exists with *different* bytes, suffix `-2` (`create_file` already refuses an existing path, `files.rs:161-173`).
* **Inserted link.** Relative for a real document (`![](img/ab12cd.png)`); **absolute** for a temp buffer, which has no `docDir` for the preview to resolve against (`App.tsx:245-248`). **URL-encode spaces** in either case or the preview silently drops the image — strict CommonMark, the known space-in-path behavior.
* **Undo.** Ctrl+Z removes the `![](…)` text, not the file. Report the write in the status bar ("saved img/ab12cd.png") so it is never invisible.

**The one open unknown, and it decides the size of the job.** WebView2 is Chromium, so a screenshot paste *should* arrive as `e.clipboardData.files[0]` already PNG-encoded — in which case the frontend reads the bytes and ships them to a new `write_binary_file(path, bytes)` command and **no new Rust crates are needed at all**. Verify this first. If it does not hold, fall back to reading the clipboard in Rust with `arboard` and encoding with `png` (prefer `png` over the `image` crate — we only ever write PNG, and `image` drags in every codec). `Cargo.toml` currently has neither.

Frontend hook: a `paste` handler in the CM extension stack at high precedence that **declines** whenever the clipboard carries text, so ordinary paste is untouched; on an image, write the file then `replaceSelection("![](" + link + ")")`.

Possible follow-on, not v1: a file copied in Explorer puts a *path list* on the clipboard rather than a bitmap — copy the file in and link it. Different code path; skip unless you want it.

### A.23 — `%` colorization

**PENDED 2026-08-02.** Neither of us can reproduce it on demand. What I ruled out from the code, so the next investigation starts warmer:

* The editor's math highlighter (`math.ts:26`) has no `%` in its token regex — a `%` inside `$…$` lands in the "plain text between tokens" bucket, colored `wd-math-text`. Not a comment, doesn't run to end of line.
* Python cells use `@codemirror/lang-python`, where `%` is an ordinary operator.
* The decl colorizer treats `%` as a number suffix or an operator (`decl.ts:59-60`).
* The one place in the codebase where `%` legitimately comments to end-of-line is **LaTeX** (`stex`, used for `.tex`/`.sty` and for ` ```latex ` / ` ```tex ` fences in both editor and preview, `languages.ts:28-32`). And **KaTeX** also honors `%` as a TeX comment inside math.

So the two live hypotheses are (a) a fence or region being resolved as LaTeX when it shouldn't be, or (b) KaTeX eating the rest of a math expression after a bare `%` (which is *correct* TeX behavior — the fix would be writing `\%`). Next time it happens: note **which pane** (left editor vs right preview/rendered), and paste the exact line.

### A.24 — Incremental render / "just this block"

**Semantics (your call, 2026-08-02): run in the live namespace with no reset — Jupyter's Shift+Enter.** Note the honest consequence up front: a document can then "work" in an execution order a clean full render won't reproduce. That's the standard notebook bargain and it's the right one for iterating, but a full Ctrl+Shift+Enter stays the source of truth.

The execution half is nearly free — `Kernel` (`render.rs:167-277`) already persists across renders, and `run_cells` (`render.rs:301-365`) only sends `reset` when `first` is true. Skip that and you have exactly the requested semantics.

The real work is **keeping per-cell outputs so the Rendered pane can be rebuilt with one cell changed**:

1. **Rust.** `expand()` (`render.rs:1090`) is already pure — `(front matter, segments, bib, exec: HashMap<usize, CellOutput>) → markdown`. So: cache the last `exec` map per document path in `RenderState` (`render.rs:22`), keyed by path. New command `run_cell(text, path, cell_index)`:
   * `split_document(text)` (cheap, pure) → segments;
   * execute **only** `segments[cell_index]` against the live kernel (no `reset`);
   * merge the result into the cached `exec` map;
   * re-run `expand()` over the whole document with the merged map and return a normal `RenderResult`.

   Re-expanding the whole doc costs milliseconds (it's string work plus the bib pass) — no reason to get clever about patching one block.
2. **Identifying "this cell."** Frontend finds the cell containing the cursor. The editor already knows the fence structure — `check.rs`/`documentLint` (`lint.ts`) locate `{python}` cells for the syntax check, and `Segment::PythonCell` carries `first_line` (`render.rs:402`). Simplest robust approach: send the cursor's **line number**, let Rust map line → segment index using the same `split_document` it already ran. One source of truth, no duplicated fence parsing in TS.
3. **Cache invalidation.** The cached `exec` map is keyed by segment index — which shifts the moment you add a cell above. Guard: also store the source text hash per cell; when re-expanding, drop any cached output whose cell source no longer matches. Stale outputs must be *visibly* stale, not silently wrong.
4. **UI.** A new command `renderCell` → `Ctrl+Enter` (free — not in `DEFAULT_KEYS`), plus a palette verb "Run This Cell". Show which cells are stale relative to the current buffer: today the Rendered pane has a single document-level `Stale` badge (`App.tsx:569-571`); per-cell staleness would be a nice follow-on but isn't required for v1.
5. **Preamble interaction** (see A.10): a cold kernel plus "run this cell" needs the preamble injected first. Track "preamble applied since last reset" in `RenderState`.

### A.25 — Project switch: files appear one by one

**Diagnosed.** The pop-in is a cascade of independent async round-trips, each with its own React state update:

* `openProject` (`store.ts:1526-1555`) → `setRoot(proj.folders[0])` → **one** `listDirectory` (`store.ts:698`) for the first folder only.
* `ProjectTree` (`FileTree.tsx:280-301`) then mounts one depth-0 `TreeNode` **per project folder**, each with no `initialChildren`.
* Each `TreeNode` seeds `expanded` from `expandedPaths` (`FileTree.tsx:66-68`) and, if expanded, fires its **own** `listDirectory` in an effect (`FileTree.tsx:83-100`), each `setChildren` triggering its own render — and every restored-expanded *descendant* repeats this one level at a time.

So a project with three roots and a dozen remembered-open folders does ~15 sequential-ish IPC calls and ~15 renders. That's the "files appear one by one."

Plan — batch the fetch, then draw once:
1. **Rust:** `list_directories(paths: Vec<String>) -> HashMap<String, Vec<DirEntry>>` — a thin loop over the existing `list_directory` body (`files.rs:49-90`), one IPC round-trip. (Optionally parallel with `rayon`, but the win here is round-trips, not CPU.)
2. **Store:** on `openProject` (and `setRoot`), compute the set of folders to prefetch = every project root **plus** every path in `expandedPaths` that lives under one of them, call the batch command, and stash the result in a `prefetchedDirs: Record<string, Entry[]>` field.
3. **Tree:** `TreeNode` consults `prefetchedDirs` for its own path before scheduling the lazy fetch — so on mount it already has children and renders complete, with no effect at all. The lazy path stays exactly as-is for folders you expand later (that's the design and it should not change).
4. Bump `treeVersion` **once**, after the prefetch resolves, so there is a single remount rather than a drizzle.

Cap it: if `expandedPaths` holds hundreds of folders, prefetch the first N (say 50) and let the rest fall back to lazy — and `log()` nothing, just degrade. Net perf is *better* than today (one IPC instead of fifteen, one render instead of fifteen).

Nice side-effect: the tree-scroll restore loop (`App.tsx:208-232`), which currently re-applies `scrollTop` for up to 10 frames precisely *because* the height keeps growing as listings land, should settle on the first frame.

### A.26 — Selection stats in the status bar

Everything needed is already wired. `onUpdate` (`Editor.tsx:199-218`) fires on `selectionSet || docChanged` and calls `setCursorPos(line, col)` (`store.ts:1236`, which no-ops when unchanged). `App.tsx:641-648` renders `Ln {cursorLine}, Col {cursorCol}` in `.status-right`.

Plan:
1. Extend the store slice: `selChars`, `selLines`, `selRanges` alongside `cursorLine`/`cursorCol`; one setter, same "skip if unchanged" guard so it can't cause extra renders.
2. In `onUpdate`, compute from `vu.state.selection`: `selRanges = ranges.length`; `selChars = Σ(r.to - r.from)`; `selLines = Σ(doc.lineAt(r.to).number - doc.lineAt(r.from).number + 1)` over non-empty ranges. All O(#ranges) with `lineAt` at O(log n) — negligible even with 200 cursors from Ctrl+D.
3. Render, ST-style, only when there's a selection: `Ln 42, Col 7 · 3 lines, 128 chars` and, when multi-cursor, `· 12 selections`. When nothing is selected the line reads exactly as it does today.

Edge cases: a single empty selection shows nothing extra (today's behavior). Multi-cursor with all-empty ranges should show `12 cursors`, not `0 chars`. `selLines` for a range ending exactly at a line start arguably shouldn't count that line — ST counts it; match ST and don't overthink it.

### A.27 — Named temporary files

**Where they actually live, precisely.** A scratch buffer's path is a sentinel, not a file: `untitled://Untitled-3` (`SCRATCH_PREFIX`, `store.ts:59-60`). Nothing is ever written to disk. Its *text* rides along in the per-workspace session as `scratch_contents` (`session.rs:28-32`), serialized by `sessionSnapshot` (`store.ts:1651-1666`) into `~/.writedown/sessions/<16-hex-hash>.json`, where the hash is of the workspace key — the `.wdproj` path for a project, else the folder root (`session.rs:62-69`, `sessionKey` at `store.ts:1646`). That is exactly why they follow a project around and reappear when you reopen it, and why they vanish when you open a different one.

**Risk noted and accepted (2026-08-02).** `~/.writedown/` is declared derived and disposable (spec §5, CLAUDE.md), so a scratch gets no backup snapshot (`backup::snapshot` runs inside `write_file`, `files.rs:219`, which a scratch never reaches — **Previous Versions cannot recover one**), no Synology sync, and goes away entirely if that directory is ever reset. Author's decision: live with it, no behavior change. Recorded here so it is never a surprise; the "promote to disk" designs are dropped.

**Scope: name only.** And it turns out to be smaller than a `title` field would be — **rename the sentinel path itself**, `untitled://Untitled-3.md` → `untitled://notes.md`. Everything then follows with no new plumbing:

* tab label is `basename(t.path)` (`Tabs.tsx:4,88`) → shows the new name for free;
* `isScratch` matches on the prefix (`store.ts:60`) → still a scratch;
* `scratch_contents` is rebuilt from `tabs` by `sessionSnapshot` (`store.ts:1651-1666`) → hot-exit follows the new key automatically, no session-schema change;
* `saveAs`'s suggested filename (`store.ts:1322-1323`) becomes the chosen name — a free bonus;
* `isMarkdownDoc` keys off the `.md` extension (`languages.ts:124`) → syntax, spellcheck, preview and image-paste (A.22) all keep working.

Implementation: a `renameScratch(oldPath, newPath)` action reusing the tab-rebinding block from `saveAs` (`store.ts:1341-1348`) **minus the disk write** — it already rebinds `tabs` and `activePath` correctly. Palette verb "Name Temporary File…" through the existing `openPrompt`, pre-filled with the current name.

Details to get right:
* **Extension.** If the typed name has none, carry the old one over (so a `.bib` scratch from Extract Citations stays `.bib`); default `.md`.
* **Collision.** If `untitled://<name>.<ext>` is already open, append `-2` — the path is the tab's identity, so a duplicate would alias two buffers.
* **Position memory.** The per-doc cursor/scroll maps in `editorView.ts` are keyed by path; carry the entry across the rename, or accept losing the remembered spot for that buffer (minor).
* `closedStack` and the `rendered` map are also path-keyed — a renamed scratch is a fresh entry in both, which is harmless.
* `scratchCounter` (`store.ts:1305`, and the restore-time max scan at `store.ts:547-555`) only counts `Untitled-N` names, so a renamed buffer simply drops out of that sequence. Correct as-is.

Either way, `newScratch` (`store.ts:1305`) and the hot-exit restore (`store.ts:530-555`) are the two touch points, and the `scratchCounter` collision guard at `store.ts:547-555` already handles restored names — mirror it for titles.

### A.28 — This file did not reload after an external edit

**Confirmed as a real bug, and the mechanism is exact — it is a path-spelling mismatch, and it fails silently.**

`onFsChange` (`store.ts:856-879`) builds `const open = new Map(tabs.map(t => [t.path, t]))` and then does `open.get(p)` on each path Rust emits — a **raw, case-sensitive, separator-sensitive string compare**. `justSaved.has(p)` (`store.ts:868`) is the same. Meanwhile the paths arriving from the watcher are `notify`'s spelling: on Windows, ReadDirectoryChangesW returns names joined onto **the root string as it was passed to `watcher.watch()`** (`watch.rs:88-91`), stringified with `to_string_lossy()` (`watch.rs:76-80`).

So the two strings agree only when the tab's path was derived from that same root listing. They disagree whenever the tab path came from somewhere else — and the standout case is **`[files] quick_file`**, which is an absolute path you typed by hand into `config.toml` and which `Ctrl+Shift+Q` opens verbatim. `C:\S\AI\...` vs `c:\s\ai\...`, or a forward-slashed spelling, is enough. `open.get(p)` misses, the loop `continue`s, and **nothing at all happens** — no reload, no conflict flag, no message. That is precisely "did not appear to reload."

Note the near-miss that makes this hard to spot: `syncExtraWatch` (`store.ts:659-666`) *does* normalize, via `underRoot` → `normPath` (`store.ts:73-75`). So a differently-spelled path that is genuinely inside a watched root is correctly judged "inside", gets **no** individual watch, and is therefore served only by the recursive watcher — the one that emits the root's spelling. The normalization in one place is exactly what routes the event into the un-normalized comparison in the other.

This is the same defect class as issue 13 (`add_recent_project`'s exact-byte dedupe) and the `addFolderToProject` dedupe flagged in A.02: the codebase *has* the right helpers (`samePath` at `store.ts:63`, `normPath` at `store.ts:73`) and this hot path doesn't use them.

**Fix** (small, and I'd do it first — a silently stale buffer is a content-integrity issue, spec §14/§25):

1. In `onFsChange`, key the lookup by `normPath(t.path)` and look up `normPath(p)`. Keep the original `t.path` as the value so `reloadDoc` still gets the tab's own spelling.
2. Make `justSaved` a set of `normPath`ed paths — both on insert (`store.ts:1021`, `store.ts:1338`) and on test. Today the mismatch also runs the *other* way: a save recorded under one spelling won't suppress the echo of an event under another, so our own write can trigger a spurious reload.
3. Same treatment for `syncExtraWatch`'s exclusion list, so a path can never fall between "not watched individually" and "not matched by the recursive watcher".
4. Consider a `logError` line when an `fs-change` path matches no open tab **but** normalizes to one — a one-line canary that would have caught this immediately.

**Second, independent cause worth ruling out when it recurs:** if the tab has unsaved edits, `isDirty(doc)` is true and the design deliberately does **not** reload — it sets `conflict: true` (`store.ts:871-874`), surfaced as "Modified externally — click to reload" in the footer (`App.tsx:336-340`). That behavior is correct (never clobber your edits) but the footer text is small and easy to miss. Worth making a conflicted tab visibly obvious in the **tab strip**, not only the status bar — a separate, tiny UI item if you want it.

### A.29 — Tab-switch freeze (wheel dead for a moment)

**Root cause: every tab switch does a full CodeMirror `reconfigure`, even when the extension set is byte-for-byte identical.**

`extensions` is a `useMemo` keyed on `[path, lang, built, fontSize, fontWeight, spellEnabled, tabSize]` (`Editor.tsx:174`). Switching between two `.md` files changes **only `path`** — `lang` is the same module-level `markdownExt` object for every markdown document (`languages.ts:51`), and since 2.6.0 `built` no longer moves with font size either. So the array is rebuilt, gets a new identity, and `@uiw/react-codemirror` dispatches `StateEffect.reconfigure` over the whole stack — to install an extension set that is exactly what was already there. `path` is in the deps only to drive `isMarkdownDoc(path)` / `isCsv(path)` branches, which produce the same answer for both files.

**What that reconfigure actually costs on a large document** (writedown-issues.md is now ~140 KB):

* Every `ViewPlugin` is destroyed and reconstructed, and two of them do whole-document work **synchronously in the constructor**: `mathHighlight` (`math.ts:121-123` → `doc.toString()` on the full 140 KB, then `mathRegions` regex-scans it and tokenizes every `$…$`) and `frontmatterBlock` (`frontmatter.ts:46-48`). The 200 ms debounce in `math.ts` protects the *edit* path — it does nothing for construction.
* Reconfiguring the language invalidates the syntax tree, so markdown + every nested `{python}`/`decl` block re-parses from scratch.
* The three linters (spell, `documentLint`, `citationLint`) all re-arm and re-scan; `citationLint` additionally calls `isProsePos` per hit, which forces syntax-tree access.

**Why it shows up as "the wheel does nothing" rather than "it's a bit slow".** The Ctrl+wheel zoom handler is registered `{ passive: false }` on the editor's scroller (`Editor.tsx:355`). A non-passive wheel listener means the browser **must** wait for the main thread to run the handler before it can scroll, because the handler might call `preventDefault`. Normally scrolling happens off the main thread and survives a busy moment; here it cannot. So the same stall that would otherwise be mild jank becomes a hard freeze of exactly the gesture you were using. (The preview pane got a second such listener in 2.6.0 — same property.)

**FIXED in 2.10.0.** Three changes, all small:

1. **The extensions memo is keyed on the document's SHAPE, not its path** (`Editor.tsx`). `path` was only ever used to evaluate `isMarkdownDoc(path)`, `isCsv(path)` and the csv dialect — so those derived values are the deps now, and `path` is gone. Two markdown files produce the *same array identity*, React's dep comparison sees no change, and the switch dispatches no reconfigure whatsoever. `csvRainbow(path)` became `csvRainbow(dialect)` so nothing inside the memo needs the path either.
2. **Language supports are per-language singletons** (`languages.ts`). `languageForPath` was calling `python()` / `json()` / `yaml()` / `StreamLanguage.define(toml)` / `…(stex)` **on every invocation**, handing back a brand-new extension object each time — so switching between two `.py` files reconfigured for the same reason. Only `markdownExt` had been hoisted. Now all of them are.
3. **`frontMatterFlag` scans a bounded head** (`frontmatterShared.ts`), not `src.split("\n")` over the whole file. This one was mine, added with A.18, and ran in the `Preview` body on every render — including every keystroke. Front matter is at the top by definition, so 8 KB is both cheaper and the correct scope.

**What is deliberately NOT changed, and the honest limit.** There is still ONE CodeMirror view shared by every tab, so a switch still replaces its document wholesale and the incoming text still has to be parsed. That is inherent to the shared-view design (which exists, and is carefully guarded, because of the issue-12 cross-tab overwrite). Your instinct — "the file usually hasn't changed while I was away, so why redo the work?" — points at the real remaining answer: **keep an `EditorState` per tab** and `setState` on switch, which preserves each document's parsed tree, decorations and history, making a return to an unchanged file essentially free. That is the canonical CodeMirror multi-document pattern and it would also give per-document undo. It is also a real refactor through the most safety-critical code in the app, so it is a deliberate follow-up, not a drive-by.

**Two plugin constructors are still whole-document** — `mathHighlight` (`math.ts:121`) and `frontmatterBlock` (`frontmatter.ts:46`). They now run far less often (only on a genuine kind-change or config save), so making them viewport-bounded is deferred: `mathHighlight` needs whole-document scope to find a `$$…$$` that opens above the viewport, so a viewport-only build is a behaviour change, not just an optimisation. Revisit only if a residue remains.

**Not a regression from Batch A** — the reconfigure-per-switch predates it (2.6.0 made it slightly *less* likely by stabilising `built`). Item 3 was new, and was mine.

---


## Wednesday 2026-07-22

| Item | Check | Description |
|--:|:---:|:-------------------------|
| We 1 | ✅ | README Getting-started section (palette, F1, quick open) + hero screenshot wired (docs commit) |
| We 2 | ✅ | HELP.md user guide: in repo + embedded in exe, ? button by Split, F1 footer pointer, palette Open Help; README links it (2.1.0) |
| We 3 | ✅ | Tree lists all files: unsupported muted, images open in-app, binaries inert w/ Open Externally; zips dropped (2.1.0) |
| We 4 | DROP | Multi-instance: already designed in (per-workspace sessions); nothing built |
| Th 1 | ✅ |  Open links to other docs? [my file](../filename.md)? Spaces in filenames? |
| Th 2 | ✅ |  Pandoc/quarto external run to publish pdf. -> Use build system and write your own scripts. Ctrl+Shift+B or palettet; Render is not Ctrl+Shift+Enter. |


[doc link test](c:/tmp/dm.md)

- [ ] **[We 1]** Some help in README! Introduction to usage! Ctrl+Shift+P at least!

  * **CC: L, docs only. The README explains what Writedown *is* but never how to drive it — there is no usage section and Ctrl+Shift+P appears nowhere in it. Add a short Getting-started (open a folder or project, the palette, F1 shortcuts, quick open, single-click peek vs double-click edit, F11) and wire in the hero screenshot — assets/writedown-file-text-preview.png is sitting in the tree unreferenced, which also closes half the Release Checklist item. No perf impact; docs commit, no bump.**
  * Dev: insert "Getting started" after the intro and before *What it gives you*; today's only how-to content is the quick-peek line (README.md:60). Cover: open folder/project; Ctrl+Shift+P palette as the front door; F1 shortcuts overlay (App.tsx:287, Help.tsx); Ctrl+Shift+Q quick open; single/double-click preview semantics; Ctrl+Shift+L view cycle; F11/Shift+F11; `@` citations; Tab complete. Roughly 20 lines, link HELP.md (We 2) for the full tour. Hero image near the logo (README.md:14). Fold in the uncommitted one-word diff (flow to workflow).

- [ ] **[We 2]** Palette command to pop a helpfile.md (show help) that is part of the project. Link to that from README.md on github. Put ? to right of Split icon top right?

  *  **CC: L–M as proposed. Meanwhile real help partly exists: F1 already pops a live shortcuts overlay, and About is on the palette. Proposal: HELP.md in the repo (README links to it on GitHub), embedded in the exe so it ships, opened by a palette verb — plus a small "?" button in our own status bar as the visible affordance. Recommend that; skip the title-bar button. Concern: HELP.md is a second doc to keep honest — keep README short, HELP.md canonical for usage. Perf: none (one small file write at startup).**

- [ ] **[We 3]** Display all / more file types? (eg muted font color if not supported? open images?) Perhaps not obviously binary files (dll, exe, ...). Look through zips? (zips rejected - JNWS[^jnws].

  *  **CC: M for the useful 90%, with one recommended cut. Today the tree literally drops anything not on a ~35-extension whitelist — unsupported files never reach the UI (nothing to mute; even LICENSE is invisible, no extension). Phase 1: list everything, grey out what we can't open, open images in-app in the right-hand pane, keep exe/dll visible but inert (right-click Open Externally); unknown text files already open fine as plain text. DROP ZIPS: Zips are the expensive one — browsing inside an archive threads fake paths through open/watch/preview everywhere; recommend skip (zip goes to Open Externally), revisit only if it itches. Concerns: .git and build folders would fill with muted junk rows (dotfiles show by default) — keep a small skip/mute list; quick-open keeps its whitelist so Ctrl+Shift+Q stays clean. Perf: listing stays lazy per level, muted rows are pure CSS, images load via the asset protocol not the text path — no baseline cost.**
  - Dev: whitelist DOC_EXTS/SUPPORT_EXTS (files.rs:7-15); drop gate files.rs:59-67 (extensionless dropped too). Change: always emit files, add `supported: bool` to DirEntry (files.rs:17-23) + Entry (api.ts:6); FileTree row gains an `.unsupported` class (FileTree.tsx:118-123; `--muted` token already in App.css). New predicates beside isCsv/isExternalDoc (languages.ts:106-113): `isImage` (png/jpg/jpeg/gif/webp/svg/bmp/ico) opens an image tab; binary blacklist (exe/dll/bin/obj/pdb/zip/7z/wasm, etc.) renders inert + existing ctx-menu Open Externally (FileTree.tsx:238). Everything else opens as text — `read_file` already hard-errors on non-UTF-8 (files.rs:197-200), surfaced in the tab error field; optionally add a 1 KB null-byte probe for a friendlier message.
  - Dev, image tab: follow the CSV-grid pattern (previewable derivation App.tsx:234-235; render branch App.tsx:505-520; CsvPreview.tsx as template) — but images must bypass `readFile` in `openFile` (store.ts:751) the way isExternalDoc early-returns (store.ts:728-731), while still creating the Doc tab (empty content, kind derived from path at render). Viewer is an `img` element with `convertFileSrc(path)` — asset protocol already enabled with wildcard scope (tauri.conf.json:23-29). Wrinkle: viewMode is global (store.ts:247), so an image doc must force the viewer pane regardless of editor/split/preview — special-case in App.tsx.

- [ ] **We 4** Multiple instances of the exe working on different projects -> do we need to add anything for support? DROP - nothing to do.
  *  **CC: L, and mostly nothing to add — this was designed in. Sessions are keyed per workspace/project precisely so two instances don't clobber each other, and documents are safe because files on disk are the truth: edit the same file in both and the watcher raises the conflict flag instead of silently overwriting. Two caveats: the SAME project open twice shares one session file (last one closed wins the remembered tabs/layout — livable, or just don't); and the Tab-completion word-frequency cache is a whole-file write, so one instance can wipe the other's counts (disposable, self-heals on reopen — an L merge-on-save fix if wanted). Config edits in one instance reach the other only after its restart. Perf: none.**
  *  Dev: session.rs:1-4 states the design ("Keyed per workspace so multiple instances on different folders don't clobber each other") — per-workspace files `~/.writedown/sessions/<hash>.json`; global session.json holds only the last-opened workspace (cold-start pointer; last-writer-wins is benign). recent-projects.json is read-modify-write per add (project.rs:207-215), cap 10 — interleaves fine, ms-scale race at worst. word-frequency.json: each instance holds the whole blob in memory (single-load latch, wordFreq.ts:21-39) and saves it wholesale, debounced 5 s (wordFreq.ts:41-50) — cross-instance last-writer-wins; fix = re-read and merge the per-path `files` map before write (Rust side wordfreq.rs or before wordFreqSave). Same-doc-in-both: autosave-on-blur means switching windows saves first, then the other instance's watcher refreshes or flags conflict — the designed path. No single-instance plugin: multi-instance is the goal.

[^jnws]: Juice not worth the squeeze.

***
## Build Instructions

1. Build the installer. Close the running Writedown exe first (it blocks release builds — the known lock issue), then npm run tauri build. That's the full release compile, a few minutes. With targets: "all" in tauri.conf.json you get both artifacts, on V: per the firewall:
  - V:\dev\writedown\target\release\bundle\nsis\Writedown_1.99.0_x64-setup.exe — the NSIS installer the README points at
  - V:\dev\writedown\target\release\bundle\msi\Writedown_1.99.0_x64_en-US.msi — a WiX MSI, optional to attach
2. Tag the commit: git tag v1.99.0 then git push origin v1.99.0. Releases hang off tags.
3. Publish: gh release create v1.99.0 <installer> --title "Writedown 1.99.0" --notes ... — I just verified gh is installed and logged in as mynl with repo scope, so this works from your machine today. Add --draft if you want it staged but invisible.
4. That's it. While the repo is private only you can see the release; it becomes public automatically when the repo flips. And since Writedown deliberately has no auto-updater, Releases is purely a download page — you don't need one per version, just a current one.

## Release Checklist

- [ ] Release (2.0.0) and gh builds
- [ ] Add hero screenshot in the README ; repo description + topics (markdown, quarto, tauri, rust, codemirror, windows); commit the still-pending st-screenshot.png deletion (a Sublime UI shot shouldn't ship publicly anyway); decide whether Issues stays enabled for feedback. ==> not sure here what is required.
    **CC: row 1 is done — v2.0.0 tagged + GitHub Release live (X4); check it off. This row, concretely: (1) hero screenshot — writedown-file-text-preview.png is in assets/ but referenced by nothing; wiring it into the README is exactly We 1; (2) description + topics = one `gh repo edit` command, about a minute, say the word; (3) the st-screenshot.png deletion is ALREADY committed (3b9dfd0 "Tidying up") — nothing pending; (4) Issues on/off is a GitHub setting and your call — recommend ON for post-LinkedIn feedback.**

***
## Tuesday 2026-07-21

Fix outstanding issues / punchups. Here is the summary and current status.

| Item | Check | Description |
|--:|:---:|:-------------------------|
| Fr 2  | ❌ | ST mirror: preview hidden from Open Files, single slot, edit promotes, click-open closes it (1.94.0) |
| Sa 5  | ✅ | Tab word-completion → sorted popup list by proximity (1.91.0, 1.93.0) |
| Sa 5a| ✅ | Completions adapt to typed case; case-insensitive dedup to nearest (1.95.0)
| Sa 5b| ✅ | Frequency dictionary: background per-file scan, nearby-then-frequent on Tab (1.96.0)
| Sa 8  | ✅ | Tab switch: editor anchored (line-snapshot restore), preview syncs once, gesture-gated (1.93.3) |
| Sa 14  | ✅ | All colorization after a YAML block — root cause: trailing space on closing `---` (1.93.2) |
| Tu 1 | ✅ | MIT LICENSE + THIRD-PARTY-NOTICES (generator script) + README License section (docs commit) |
| Tu 2| ✅ | Audit clean: features/ already gitignored, history secret-free; pre-flip checklist in comment (docs commit) |
| READ | ✅ | README 5Cs: External software descriptions corrected, Install section added, License filled (docs commit) |
| Tu 3 | ✅ | palette: Write All Shortcuts → scratch file, never config.toml (1.97.0) |
| Tu 4 | | `[editor] trim_trailing_whitespace` on save, default true; hard breaks + CSV safe (1.98.0) |
| Tu 5 | ✅ | F11 full screen; Shift+F11 distraction-free (no sidebars), layout restored on exit (1.99.0) |
| Tu 6 | ✅ | CSV rainbow: RFC-4180 quotes honored; delimiter keyed to csv/tsv (1.98.1) |
| Tu 7 | ✅ | Replace group refs are `$1`/`$&` (JS style), not `\1` — answered |
| X1 |   | Create tag and  Release instructions follows tags.
| X2 |   | trim on save trims ALL trailing whitespace (ST semantics); "keep-hard-breaks" / false opt-outs (2.0.0) |
| X3 |   | README truth pass: win-only build footnote, no-net + dictionary footnotes, real language list; open_shell cfg-guarded (docs commit) |
| X4 |   | v2.0.0 tagged; GitHub Release live — exe / MSI / NSIS with friendly labels; scripts/publish-release.ps1 for reruns |

- [ ] **Fr 2** When a file is opened in preview mode (single click) it's tab is italics. In the sidebar (blue background / italics) it is currently too high. This has been on the list the last three+ goes around. **HOWEVER** it have just realized that ST does NOT put preview files in the list of open files in the project at all! We should do the same - preview files do not appear in the list. They do appear once they are open for editing. Note that can occur because you edit the preview - so there needs to be a file change trigger. ST has at most one preview file - if you preview another one it reuses the same tab. If you click (in the sidebar) onto a file that is already open) then the preview should close. We should try to mirror the ST behavior.
    **CC: M — your spec changed this from a styling tweak to the ST mirror, and that's the better fix. Done as specced: preview files no longer appear in Open Files at all (the italic tab is the only clue); at most ONE preview tab exists — previewing another file reuses it; any edit instantly promotes the preview to a real tab (that's when it joins Open Files); sidebar-clicking an already-open file just activates its tab and closes the preview. Double-click promotion still works. Safe because an edited preview always promotes first — a discarded preview is always pristine. The old sidebar preview styling is deleted as dead code, so the balloon cannot exist anymore. No perf impact. (1.94.0)**
- [ ] **Sa 5** Tab complete basically working well. Would like to add (**Sa 5a**) case sensitive - respect the case of the word being "tabbed" (easy?!). (**Sa5b**) Build and maintain a list of completions - can we (background) on open scan the doc for five (config setting) plus letter words, track their frequency, and use a combo nearby in current doc, used frequently algo for what is offered by the auto complete? It works wonderfully but that would be killer.
    **CC (5a): L — easy, as you guessed. Today the popup inserts the word exactly as it appears in the doc ("Lognorm" typed + "lognormal" in the buffer → "lognormal"). Now the completion adapts to YOUR case: log→lognormal, Log→Lognormal, LOG→LOGNORMAL; duplicates differing only in case collapse to the nearest one. Runs only on Tab — no perf impact. (1.95.0)**
    **CC (5b): M. Built as asked: each opened/saved doc is background-scanned for 5+-letter words (config: tab_complete_dict_min_len); counts are stored per-file in a disposable ~/.writedown/word-frequency.json, so re-opening never double-counts. Tab then offers nearby words first (as now), then your frequent words — and it fires even when the word isn't nearby, which is the killer case (first 2–3 letters, Tab, nail it). Zero cost while typing; scan is once per open/save. One concern: the dictionary is global across projects (simplest; per-project slicing possible later if it bothers you). (1.96.0)**
- [ ] **Sa 8** Switch tabs to a long doc (C:\S\AI\temp\large-test-doc-dm.md is my test) is a disaster - cursor flies around etc. Point is you remember where the cursor is (left md panel) and move right to match - in one go close-enough is OK and preferred to any flashing and jumping. But cursor cannot move,.
    **CC: M — structural fix this time, not another timer. Diagnosis: on a long doc the editor re-measures line heights for ~a second after a switch; every previous guard was a 40–200 ms window that expired first, after which preview scroll events kept writing back into the editor and the two panes chased each other — that's the flying. Now: the preview can only move the editor when YOU actually scroll the preview (wheel/click) — programmatic churn can never touch it; the editor's restore is line-anchored so it holds through re-measure; and the preview does its single close-enough sync only after its content has finished loading. Slight semantics change (preview drives editor only on real preview scrolls) — believed to be exactly what you want. No baseline perf impact. (1.93.3)**
- [ ] **Sa 14** claimed that Python cell coloring can become messed up. This was perhaps a false-issue. This misdirection may have led to unnecessary code - pls investigate.
  It appears linked to having explicit yaml at the top of the file, see C:\S\AI\writedown\features\test.md. In that file the # heading ater the yaml is not correct. So this is really about **all** colorization after a yaml block. In test.md everything is fine if I delete the yaml.   The yaml inquestion is

    ```yaml
    ---
    wd-python: "T:/worktrees/aggregate_REFACTOR/.venv/Scripts/python.exe"
    # wd-python: "C:/Users/steve/miniconda3/envs/working313/python.exe"
    ---
    ```
    **CC: L–M, and you were right on both counts. Real bug (verified against the file's bytes): your closing --- has a trailing space; the editor's front-matter parser demands --- exactly, never sees the close, and silently treats the entire rest of the file as YAML — killing all coloring after the block. (The preview tolerates the space, which is why it looked fine there.) Fix: tolerant front-matter parsing — trailing spaces OK on both delimiters, and a block with no close is treated as no front matter rather than swallowing the document. Misdirection confirmed: 1.93.1's static-lang change couldn't have fixed this — but it does fix a separate real flicker (async language loading), so it stays; the actually-unnecessary code was an older dead front-matter highlighter, now deleted. No perf impact. (1.93.2)**
- [ ] **Tu 1** Add MIT licence to repo and README section.  Then per parallel chat: "You drop in the LICENSE file(s), wire up the notices-generation, write a real THIRD-PARTY-NOTICES.md, and update the README — and I can fold it into the same commit as the README refresh."
    **CC: L. LICENSE (MIT, your copyright) at root; THIRD-PARTY-NOTICES.md generated from the real dependency sets (cargo metadata + node_modules — offline, no new tooling) by scripts/generate-notices.ps1; README License section filled in, and the SCOWL dictionary note moves there. Everything in the tree is permissive (MIT/Apache/BSD-family) — the generator proves it. Folded into the README commit as agreed; docs only, no version bump.**
- [ ] **Tu 2** Is there any other prep we should do before a public repo release? (ATM the repo is private. I plan to post about this wonderful tool on LinkedIn - w full credit to you!)
    **CC: good news — the scary finding un-found itself. My triage flagged features/ (diary, work notes) as a blocker, but on checking: it is already GITIGNORED — your firewall was in place — so none of it is in git history; and a history grep for secret-like strings is clean too (the only hits are spellchecker dictionary words). The repo can go public as-is, history included. Remaining pre-flip checklist: (1) this issues file and dev/ plans ARE tracked and full of personal paths + dev chatter — charming dev-log or cull, your call; (2) README hero screenshot (grab one from your running app into assets/); (3) GitHub Release with the NSIS installer attached — expect a SmartScreen warning (unsigned exe; noted in the README install section); (4) repo description/topics. LICENSE + THIRD-PARTY-NOTICES land with the docs commit (Tu 1). No other blockers found.**
- [ ] **READ** Edit README for 5Cs  -  esp. double check claims about Typora.
    **CC: L. 5Cs pass with the Typora row corrected — Typora DOES keep files as plain Markdown on disk, so that claim softens; the honest distinctions are WYSIWYG-fused editing (vs our raw text + separate preview), closed-source paid (vs free MIT), and no Quarto/{python}/BibTeX machinery. Plus: "LiveMarkdown" typo, License section filled in (Tu 1), and a short Install section for the public audience. Claims re-verified before committing. (docs commit)**
- [ ] **Tu 5** FEATURE: F10 or F11 full screen mode? (no sidebars)
    **CC: L–M, and F11 (F10 is the Windows menu-bar key — best left alone). Recommend the ST pair: F11 = full screen (real window fullscreen; the API is one call plus one capability line, so it needs a dev-app restart, not just HMR), Shift+F11 = distraction-free (fullscreen + sidebar and outline hidden, previous layout restored on exit). The sidebar/outline toggles and the keymap/palette machinery all exist — this is wiring, not construction; palette gets explicit Enter/Exit verbs, and the keys stay rebindable in [keys]. No perf impact. Built as recommended. (1.99.0)**
- [ ] **Tu 6** BUG: csv colorizer does not respect quoted strings with commas
    **CC: L–M, confirmed in the code — two defects, one small fix. The rainbow pass splits every line on EVERY comma and tab with no quote state, so "Smith, John" bleeds across two column colors — and a comma inside a TSV field (or a tab inside a CSV field) also miscolors, because the delimiter isn't keyed to the file type. Fix: pick the delimiter from the extension and scan RFC-4180 style (quotes toggle, "" is an escaped quote); same single pass and 5000-line cap as today, so no perf change. Note the csv-grid preview pane is separate code — if you see the same there, that's csv-grid's parser, not this. Built as described. (1.98.1)**
- [ ] **Tu 7** Qu: Does code mirror regex not allow \1 etc. ST style replacements?
    **CC: answered, no code needed. Group references ARE supported — but in JavaScript syntax: in the Replace field use $1, $2… ($& = whole match, $$ = a literal $); \1 there is just a literal backslash-one. In the search PATTERN itself, \1 backreferences work as usual. Verified in @codemirror/search's replacement code. A tiny shim could translate \1→$1 in Replace for ST muscle memory, but it would also eat intentional literal \1s — I'd skip it unless it keeps biting you.**

***

## Saturday 2026-07-18 to Monday 2026-07-20

auto tab preserve case
build library of used words - freq etc.

| Item | Check | Description |
|--:|:---:|:-------------------------|
| Fr 2  | ❌ | Open Files preview row no longer balloons (1.81.2) **not solved** |
| 1  | ✅  | Insert Date-Time: return focus + cursor after the stamp (1.86.1) |
| 2  | DROP  | Windows emoji picker (Win+.) inserts into the editor |
| 3  | ✅ | MRU projects dropdown; theme-aware dark background (1.87.0, 1.91.2) |
| 4  | ✅ | Ctrl+D: bold, bold bold clearly-visible selection highlight (1.86.3) |
| 5  |  | Tab word-completion → sorted popup list by proximity (1.91.0, 1.93.0) |
| 6  | ✅ | Preview↔Rendered switch syncs to editor location (1.89.1) |
| 7  | ✅ | @ citation works in an indented footnote definition (1.86.2) |
| 8  | ❌ disaster | Tab switch syncs preview; editor stays anchored (1.89.1, 1.91.1) |
| 9  | ✅ | Per-doc Python kernel via YAML `wd-python:` (absolute only) (1.89.0) |
| 10 |  DROP | Palette: sort sidebar by name (default) or mod date |
| 11 | ✅  | Ctrl+MouseWheel font size; config bounds font_size_min/max (1.90.0, 1.92.0) |
| 12 | ✅ | Palette: delete project (recycle .wdproj, confirm) (1.88.0) |
| 13 | ✅ | Dedup duplicate "AI" project in quick-switch (one was saved manually) (1.86.4) |
| 14  |  | {python} cell colouring stable (static nested lang) (1.93.1) |


- [ ] (1) after insert date time cursor needs to be put after insert; currently focus is lost
    **CC: L — one missing line. `insertDateTime` (textOps.ts:101) already leaves the cursor *after* the stamp via `replaceSelection`, so cursor placement is a non-issue — the real symptom is lost focus. The palette command `insert-datetime` (commands.ts:149) dispatches into the CM view but never calls `view.focus()`, then `choose()` unconditionally closes the palette (Palette.tsx:121), so focus falls to `<body>`. Proof it's just that: `insertSnippet` (snippets.ts:34) does the identical palette-invoked edit and *does* call `view.focus()` — and keeps focus fine. Fix: `view.focus()` after the dispatch (or refocus editor-acting commands centrally in `onMarkdownView`, which has the same gap for bold/italic/extract-refs). Zero perf.**
- [ ] (2) windows emoji (Win + .) does not work to insert emojis? They can be pasted in (minor irritation but i use the green check etc in the table.)
    **CC: M–H, and it's a WebView2/CodeMirror platform bug, not our code. Nothing in the repo swallows it — the one `inputHandler` (wrapOnType.ts:19) cleanly declines non-pair chars, and the controlled-value round-trip is sound. Mechanism: the Win+. panel is a separate OS window; opening it *blurs* the CM contenteditable (this is what fires our `saveOnBlur`, Editor.tsx:47), then injects the emoji via a synthetic composition/`beforeinput` into a blurred editor whose DOMObserver isn't actively reading — CM reconciles it away. Paste survives because Ctrl+V keeps focus. Fix surface: a small `beforeinput`/`compositionend` bridge in src/editor that catches `insertText`/`insertCompositionText` data and dispatches `replaceSelection(data)` itself. Real gotchas: (i) double-insertion risk on the normal focused path — needs focus/`view.composing` guards; (ii) this is the exact IME/dead-key fast path, so CJK-input regression risk is real and it needs on-device testing; (iii) WebView2 version can shift the behavior. Handler must early-return O(1) since it sits on the keystroke path. I'd scope this as its own careful spike, not a quick fix.** ==> DROP
- [ ] (3) Add a drop down select box at the bottom of the Project display that lists the current projects in MRU order for quick switching. Ditto folders in the folder display. SWIM?
    **CC: Project dropdown L, folder dropdown M. The recent-projects MRU already exists end-to-end — `recentProjects` (store.ts:139) ← Rust `recent_projects` (project.rs:160), persisted to `~/.writedown/recent-projects.json`, and `mergedProjects` (store.ts:1440) already returns the deduped `{name,path}[]` the palette switch consumes. So a `<select>` footer under `.pane-tree` (App.tsx ~424) wired to `openProject` is ~30 lines. Folders are the catch: there is *no* recent-folders MRU — only a single `folder_root` is persisted (session.rs:54); that side needs a new persisted MRU mirroring projects (clone project.rs:155-181 + store wiring + append in `openFolder`). Gotchas: a native `<select>` in WebView2 renders the OS dropdown (themable only so far — a custom popup if you want ST chrome), and it'll show the item-13 duplicate until that's fixed. SWIM: yes — build the project dropdown now (data's already there), fold folders in with a small recent-folders MRU. No baseline perf cost.** ==> Do for proejcts, not folders.
- [ ] (4) control D (one of my fave features) -> the highlighting of selected items is too insipid. Just selecting an item you get a nice gree highlight - but that becomes much harder to see with ctrl+D. i want something very bold and clear.
    **CC: L (a color change), but the diagnosis matters: the green you like and the faint one are two different features. A single selection paints the *other* occurrences via `highlightSelectionMatches` = `.cm-selectionMatch`, whose effective color under a Sublime scheme is @codemirror/search's built-in vivid green `#99ff7780` (sublimeTheme.ts never restyles it). Ctrl+D (`selectNextOccurrence`, keymap.ts:21) converts matches into *real* selection ranges — and @codemirror/search switches `highlightSelectionMatches` OFF once there are ≥2 ranges, so every hit is now drawn as `.cm-selectionBackground` = `--cm-sel` = faint blue `rgba(120,150,200,0.4)` (sublime.rs:159 default). CSS can't distinguish primary from secondary ranges (drawSelection gives them one class), so we can't style "just the Ctrl+D ones." Fix = make the selection color itself bold: raise alpha / switch to a strong hue in `--cm-sel` (App.css:1023, sublime.rs:159). Concern: that also restyles ordinary selection (intended, but confirm), and very opaque colors bury the glyphs — keep some translucency. No perf.**
- [ ] (5) REVISIT: I am missing sublime tab completions... For me, this should work that I will only deploy on a long word, so the possibility set needs to be long words that match the current stem that are nearby in the file. Pls scope out again - this is a deffo killer feature. Pres. little/no runtime impact because only runs on tab request.
    **CC: M, ~100–150 lines, frontend-only, and the re-scope is clean. Today the *only* authored Tab binding is `retriggerTab` (citations.ts:143), which re-opens the `@` picker or falls through; there is no `indentWithTab`/`insertTab` anywhere, so in prose Tab currently does nothing useful (it even lets focus escape). The new "insert nearest matching longer word, Tab-cycle" command must yield, in order, to: (1) an active snippet field (`nextSnippetField`, Prec.highest), (2) an open completion popup (`completionStatus==="active"`), (3) an `@` citation stem, then only (4) fire when at the end of a stem ≥ threshold. Design: read the stem with a `\p{L}[\p{L}\p{N}_]*$` regex, require length ≥ ~4 (config `[editor]` key — your "only on a long word" gate), harvest candidates from a *window* around the cursor (±N lines, not the whole doc), keep a `StateField` cycle {from,stem,cands,idx} that self-invalidates on any non-cycle transaction. Do NOT reuse `spellTokens` (prose-only, over-filtered). Gotchas: bail on multi-cursor; the `@`-guard must precede the harvest; decide whether Tab should also fall back to `indentWithTab` (a visible new behavior — flag it). Perf: zero at rest — runs only on explicit Tab; the first Tab's windowed scan is a few ms even on dm.md, cycles are O(1) off the cache. Deffo a killer feature and cheap — recommend building.** ==> clarify: the *completions* will be longer words, but the tab will be hit after just one or two chars - the point is I know i'm going to type a long word but don't want to, i want to do the first 1-3 letters TAB nail it. See?
- [ ] (6) switching between preview and rendered tabs should sync with editor tab location
    **CC: L, and it shares one root cause with (8). Switching `previewTab` remounts `<Preview>` because live vs. rendered sit in different JSX branches (App.tsx:507 bare `<Preview>` vs 508-534 a fragment), so the new pane mounts at scrollTop 0. Rendered→Live gets *no* `initialSourceLine` at all (App.tsx:507) so it stays pinned at top; Live→Rendered *does* get one, but it's `ren.srcLine` — the editor's top line frozen at *build* time (store.ts:1047), not where you are now. The one-shot that exists (Preview.tsx:538) is Rendered-only and uses that frozen value. Fix: generalize it to fire on either pane's mount, reading the editor's *current* top line via `getActiveView()` + `lineBlockAtHeight` (same read as store.ts:1048) and calling the existing `scrollPreviewToLine` (Preview.tsx:364, already does source→expanded mapping + settle). Gotcha: in preview-only mode there's no live editor and the destroyed view isn't nulled on unmount — bail when there's no editor pane. Negligible perf (one O(log n)+settle per switch).**
- [ ] (7) editing index.qmd suffered failure of bibtex insert - @... stopped working (it works in this file now but has died in index.qmd). Any thing in the logs to help with that? Ah - identified: it was in a footnote para [^key]: ...  when I (accidentally) tabbed the key in @ stopped working.
    **CC: L, and the cause is exact — your own diagnosis nailed it. `matchBefore(/@…/)` (citations.ts:41) is fine; the killer is the prose gate `isProsePos` (prose.ts:16), which returns false on any node whose name `.includes("code")` (prose.ts:21). The editor's Lezer markdown grammar has *no* footnote rule (footnotes are a markdown-it *preview* plugin only), so a footnote line `[^key]: …` indented by a tab / 4+ spaces is parsed as an indented code block (`CodeBlock`/`CodeText`) — one tab is enough (≥4 col). So `citationSource` returns null before it ever queries the bib. That's why it works unindented (falls back to Paragraph) and dies "when you tabbed the key in"; the same gate also silently kills spellcheck on that line (corroboration). Fix (recommended): in `isProsePos`, when the disqualifying node is *indented* code (not `FencedCode`/`InlineCode`), if the line after leading whitespace matches a footnote-definition marker (`^\s*\[\^…\]:`) treat it as prose — ~5 lines, fixes citations AND spell in one shot. Caveat: rescues the marker line, not deeply-indented continuation lines (add a Lezer footnote rule if you need those, M). No baseline perf cost.**
- [ ] (8) switch between tabs - the preview does not sync immediately - it does as soon as you scroll the new tab.
    **CC: L–M, same family as (6). All editor↔preview sync is driven purely by live `scroll` events (`fromEditor`/`fromPreview`, Preview.tsx:669/679; deps `[]`, attached once). On a tab switch the live `<Preview>` is *not* remounted (same JSX slot) — it just re-renders the new doc, async + 200ms-debounced. The editor's restore-scroll on switch *does* fire one scroll event, but at that instant the new doc's preview hasn't rendered yet, so `stale()` (Preview.tsx:598) correctly drops it; by the time the render patches in, no further scroll fires, so the preview sits at top until you scroll. Fix: a one-shot that fires *after* the new docKey's render is patched (hook the patch landing, Preview.tsx:532), reads the editor's current top line, and calls `scrollPreviewToLine` — the same generalized effect that fixes (6), just keyed by `docKey` so a switch re-arms it. Gotchas: fire after patch (not on the dropped switch-scroll), and key the guard by docKey so typing's debounced re-renders don't re-yank. One mechanism covers (6)+(8). Negligible perf.**
- [ ] (9) add ability to specify the python kernel in yaml at the top of the file, wd-python: path perhaps?
    **CC: L — ~4 edits in one file (render.rs), no frontend/IPC change, layering onto the existing `[render] python` key. The interpreter is picked once into `cfg.python` (render.rs:67) and everything downstream reads it; the doc's front matter is already hand-parsed in the same file (`parse_front_matter`, render.rs:426, currently just title/bibliography). So: add `wd_python` to `FrontMatter`, add a `strip_prefix("wd-python:")` branch, and in `render_impl` override `cfg.python` from `fm.wd_python` before `run_cells` — giving doc > config > default for free. Bad-path errors already surface (`Kernel::spawn` → visible render warning) and the kernel cache already respawns when `python_path` changes. Main design question (AQIN): relative paths — resolve `wd-python: .venv/Scripts/python.exe` against the doc folder (copy the `bibliography:`/`doc_bib` pattern, render.rs:1183), and decide behavior for unsaved buffers (path is None) and conda envs (this spawns the interpreter directly — no `conda activate`, consistent with why Quarto render was dropped). No baseline perf impact.**
- [ ] (10) palette sort files in sidebar by name (default) or mod date
    **CC: M. Tree sort is Rust-side and name-only: `list_directory` sorts dirs-first, case-insensitive name (files.rs:77); the JS tree renders in returned order and `DirEntry` carries *no* mtime (files.rs:17). So: add `mtime: Option<u64>` to `DirEntry` + `Entry` (api.ts:6) from `metadata().modified()`, add a `sort` param to `list_directory` and branch the comparator, two explicit palette verbs "Sort Tree by Name"/"Sort Tree by Modified Date" (no state-flipping label), and a `treeSort` store field that bumps `treeVersion` to remount. Wrinkle: the tree lazy-lists each folder independently, so the mode must be threaded into *every* `list_directory` call (favor the Rust-param approach as one source of truth) and the soft fs-refresh must reuse it. Perf: `metadata().modified()` adds one stat per entry — bounded because listing is lazy/per-level; do NOT add mtime to the recursive `list_all_files` (quick-open, files.rs:99). Decisions: persist per-panel (localStorage like `wd.editorZoom` is cheapest); and whether dirs sort by mtime too or stay dirs-first. No steady-state perf hit.** ==> DROP
- [ ] (11) mouse wheel font size change (like ST and many others), not permanent, floor and cap for font size (unlike others!)
    **CC: L–M, and 90% is already built. `editorZoom` (store.ts:209) is already transient (localStorage, never config unless you run "Set as Default") and already clamped [-10,32] in `setEditorZoom` (store.ts:826); Ctrl+=/-/0 already drive it. Missing piece: a Ctrl+wheel gesture → `setEditorZoom(±1)`. Two real gotchas: (i) Ctrl+wheel is WebView2 page-zoom by default, so you must `preventDefault()` on a *non-passive* wheel listener (manual `addEventListener(...,{passive:false})`, not the default domEventHandlers) or the whole page zooms; (ii) trackpad wheel arrives in bursts — accumulate delta / step per threshold or the size jumps wildly. Add an absolute px floor/cap in the clamp per your "unlike others." Perf watch-out: each zoom change invalidates the theme `useMemo` → full CM `reconfigure` (entire extension stack) per notch — key-zoom already pays this, but continuous wheeling on dm.md would thrash. For *buttery* wheel-zoom, drive font-size through a CSS var on `.cm-host` (sublimeTheme.ts:43 → `var(--wd-editor-font-size)`) set directly in the handler — zero reconfigure per tick. Recommend the CSS-var path.**
- [ ] (12) palette -> delete project (and/or open project folder - which do you think is best?)
    **CC: Reveal L (and safer); Delete L–M. No delete/reveal project verbs exist today (commands.ts:258 has add-folder/new/switch/save/open/close). Reveal-in-Explorer: `tauri_plugin_opener` is already registered (lib.rs:17) and its `revealItemInDir` is one capability grant away (`opener:allow-reveal-item-in-dir` in capabilities/default.json) — or reuse the existing `explorer.exe` shell pattern (external.rs:36) with no new capability; act on `projFolders[0]` or the `.wdproj` itself. Delete: a `.wdproj` is just `{name, folders}` (project.rs:8) — path strings, no user content — so a delete must remove *only* the managed `.wdproj` file (guard `starts_with(projects_dir)` + `.ends_with(".wdproj")`, recycle via `trash` for recoverability), then refresh `loadProjects`/`loadRecentProjects` and `closeProject` if it's current. Cardinal rule: never `delete_path` the `projFolders` — that would recycle your actual documents (spec §2). My take: build **Reveal** (higher daily value, near-zero risk); add Delete behind a confirm dialog if you want tidy management. Also purge the deleted path from `recentProjects` so it doesn't linger. No perf cost.** ==> delete project from app is best, need tidy up diaglog pos-delete (note 13 may make this less relevant but it is still important longer-term)
- [ ] (13) quick switch projects -> two AI projects appear? where are they (the sidebar footer will help manage these...)
    **CC: L, real normalization bug. Rust `add_recent_project` dedups with an *exact byte* compare (`p != &path`, project.rs:175) — case- and separator-sensitive. Meanwhile store.ts has three different normalizers (`normPath`:65 strips the trailing slash; `samePath`:58 and `mergedProjects`' local `norm`:1441 don't), so the recent list can hold `AI.wdproj` twice when the two strings differ by case, separator, trailing slash, or short/extended-length form — e.g. the managed path built by `new_project` vs. a path picked through the native Open dialog. `mergedProjects.norm` masks most but not a trailing-slash/non-canonical variant, and the `name — parent` disambiguator then yields two look-alike "AI" rows. Fix: normalize (lowercase + backslash→slash + strip trailing slash, ideally `canonicalize` via `dunce`) *before* dedup in `add_recent_project`, and make `mergedProjects.norm` reuse `normPath` so all three agree. Note: genuinely-distinct `AI.wdproj` files (you're working under `…\CloudStation\AI\`) won't and shouldn't merge — the footer dropdown (item 3) is the right place to see/manage them. ≤10 entries, so canonicalize's stat cost is trivial; no baseline perf impact.**

***
## Friday 2026-07-17

| Item | Check | Description |
|--:|:---:|:-------------------------|
| 1   | ✅ | TOC click lands on the first jump (1.81.4) |
| 2  | ❌ | Open Files preview row no longer balloons (1.81.2) |
| 3  |       | saving personal-dictionary.txt takes effect at once (1.81.3) |
| 4  | ✅ | rendered view: sync tracks source lines; build opens at your spot (1.86.0) |
| 5  | ✅ | "typing" a **quote**/bracket/star (over) a selection wraps it (1.82.0) |
| 6  | ✅ | no jump-to-bottom while editing big display math (1.81.5) |
| 7  |  — | dropped — footnotes already rendered |
| 8  | ✅ | palette "Locate File in Sidebar"; bottom-left "(not found)" note (1.84.0) |
| 9  | ✅ | no jump-to-top on paste (1.81.0 + 1.81.5) |
| 10 | ✅ | Ctrl+Shift+P, Enter reruns the last command; MRU order on empty query (1.83.0) (nice!) |
| 11 | ✅ | this file auto-refreshes when written externally (1.85.0) |
| 12 |     | cross-tab overwrite impossible — edits stick to the tab that showed them (1.81.0) |
| +  |     | side-find: Delete asks for confirmation again (1.81.1) |

- [ ] (1) click on TOC: mapping to location still not perfect - gets there with second jump. See also (4).
    **CC: L — cause found, and it's an asymmetry. The preview-side jump got an 8-frame settle loop in 1.73.2; the editor-side jumpToLine never did — it computes the target y from CM's *estimated* heights for never-drawn lines and scrolls once. The first click scrolls near the target, which forces real measurement, so the second click computes from true heights and lands. Fix: give jumpToLine the same settle treatment (re-check the target y for a few frames after scrolling, superseded by newer navigation — the pattern sits in Preview.tsx ready to copy). Click-time only; no baseline perf impact.**
- [ ] (2) BUG: open file in view mode (one click / no edits) the project/folder (blue background) has HUGE looking font. **Not Fixed!** See images correct.png and incorrect.png in . for examples. Pls delete these files once you are done looking at them.
    **CC: L — real disease understood this time, not just treated. The 1.76.1 pin can't work: line-height sets a *floor* for the line box, not a ceiling. Your [tree] font has no true italic (the screenshot's italic is a serif fallback), and the fallback face's huge ascent/descent inflates the line box past the strut — the −0.5px font nudge is noise against that. The tab strip survives the identical italic not because of its pins but because it's *clipped* (fixed-height bar + overflow:hidden); the Open Files row has neither. Fix: clip the row like the tabs — pinned row height + overflow:hidden on the Open Files rows, plus font-synthesis:none so a fake italic isn't fabricated at all. (Screenshots reviewed — deleted per your note.) No perf impact.**
- [ ] (3) BUG: reload personal dictionary when word is added to it, otherwise adding a word has no effect.
    **CC: L — solved: there are two add paths and only one works. The palette/tooltip "Add Word to Dictionary" chain is verified complete (appends the file, updates the in-memory set, clears the spell cache, forces a re-lint). What doesn't work is what you actually do — editing personal-dictionary.txt as a tab and saving. That file lives in the app-config dir outside every watched root, and save-time special-casing reloads spelling only for config.toml — so saved words sit on disk while the checker keeps its startup snapshot until restart. (Palette "Reload Personal Dictionary" is the existing workaround.) Fix: teach the store the personal-dict path and mirror the config.toml branch — save → reload → re-lint; optionally watch the file for external edits too. If you've seen the *command* itself have no effect, yell — that would be a different bug. No baseline perf impact.**
- [ ] (4) BUG: sync location does not work well for rendered view; and (related) location should sync back to current location after build. ATM i think it goes to top.
    **CC: M — both symptoms, one root cause. The Rendered tab feeds the *expanded* markdown (cell outputs spliced after each cell, injected title, generated References) into the same Preview component, so its blocks carry line numbers of the expanded document, not your buffer — the sync machinery runs but speaks the wrong coordinate system, degrading as outputs accumulate. And a build mounts a fresh Preview at scrollTop 0 with nothing to restore: your "goes to top." Proper fix: render.rs already splits the doc into segments with source-line ranges, so it can cheaply emit an expanded→source line map alongside the markdown; sync translates through the map, and "return to current location after build" falls out of the same table. Rust + frontend touch, hence M. The map is built during render — zero baseline cost.**
- [ ] (5) ENHANCE: sublime " ( { [ * around selection --> "SELECTION" etc. I.e. highlight a word and type one of these characters -> put at start and finish. ATM replaces the selection with the character.
    **CC: L. CM's closeBrackets would do brackets/quotes natively but was deliberately disabled (auto-close in prose was annoying and broke @-citations) and doesn't cover `*` anyway. Better: the multicursor-aware surround helper already exists — Ctrl+B/Ctrl+I are `toggleSurround("**"/"*")` — so this is one input handler: typed char in `" ' ( [ { *` with a non-empty selection → wrap each range (paired for brackets, symmetric for quotes/asterisk); empty selections and every other char fall through untouched. Backtick is a free add if wanted. One caveat: an input handler isn't a key binding, so it's not [keys]-rebindable — a config flag can make it toggleable if you ever want out. No baseline perf impact.**
- [ ] (6) UI can get jumpy editing big display math eg an aligned. It often jumps to bottom of page.
    **CC: M — two confirmed strands; "jumps to bottom" points at (a). (a) Preview: a whole `$$…aligned…$$` is ONE rendered block, and preview re-render is debounced 200 ms — so while you type, block line-ranges lag the buffer. Your keystroke scrolls the editor to keep the caret visible; sync maps the top line against stale ranges, falls off the end, clamps to the bottom — and the settle loop *holds* it there. Worse mid-edit when an unbalanced `$$` transiently swallows the rest of the doc into one giant math block. The fix is surgical (L): suppress editor→preview sync while rendered ranges are stale (rendered line count ≠ buffer line count). (b) Editor: the error boundary remounts the editor on transient CM measure crashes in big docs, and the remount replays the 1.77 cursor/scroll restore including a rAF scrollTop re-assert — a visible snap; the math highlighter's per-keystroke decoration churn is the plausible crash trigger. (b) needs a dev-console repro before touching. Neither fix costs baseline perf.**
- [ ] (7) Question: can we get footnotes rendered? Our build is ad hoc adjustments to the raw markdown passed through the standard markdown viewer, right? No pandoc in the pipeline. So this is probably too hard to be worth it? But just checking.
    **CC: zero effort — they already render. markdown-it-footnote has been in the pipeline since the 1.73.0 per-block renderer, which parses the whole doc once precisely so cross-block state (footnote numbering, the end-of-document list, reference links) stays correct — only rendering+caching is per-block. Preview and Rendered use the same renderer, so `[^1]` refs, `[^1]: definitions`, and inline `^[like this]` all work today, globally numbered, with back-links. Your mental model is right (markdown-it, no pandoc) but the conclusion inverts: footnotes are a markdown-it plugin, not a pandoc feature. If you've actually seen one fail to render, send the sample — that's a bug, not a gap.**  --> OK my mistake. DROP
- [ ] (8) palette function -> locate file - find the open file in the Project or Folder panel = open tree and highlight containing folder. Note it may fail - that should be noted in the status bar at bottom on the left filename (not found) which disappears after say 20 seconds.
    **CC: M — every primitive exists, but each piece is real (small) work. The tree already highlights the active file; the catch is it only renders if its ancestors are expanded, and expansion state is deliberately non-reactive (a Set read once at mount, for perf) — so reveal = write every ancestor dir into expandedPaths, bump treeVersion to remount the tree (the refreshTree mechanism), switch panelTab to whichever panel's root contains the file, then scroll the row into view once the lazy per-level listings settle (the tree-scroll-restore retry loop is the model; no tree scrollIntoView exists yet). Gotchas: the containing-root check must be case-insensitive and separator-normalized — the one correct helper is the norm lambda in mergedProjects; the existing tree prefix checks are case-sensitive backslash-only and would misfire. And there's no transient status-message infra yet: new statusMessage store field rendered bottom-left, auto-cleared with the justSaved setTimeout idiom (20 s). Palette entry itself is one line beside copy-file-path. Command-time only; zero baseline perf.**
 - [ ] (9) UI has become extremely jumpy, eg jumps to top after paste? I am using 1.80.0, in an exe build. i had not noticed this behavior before - it is very odd but totally unacceptable. Happens at random times but consistently on paste. Odd cos i had used the editor a lot and not come across it before.
    **CC: Priority #1, and I've already run the discriminating test. The shipped exe logs every editor crash/remount and every CM exception to ~/.writedown/logs/writedown.log — and your jumpy sessions logged *nothing* (the 7 crash + 73 exception lines in that file are all July 8, the CM-tile era; exe logging demonstrably works). So the crash-remount theory is dead — this also retires (6b) — and the jump is a *silent* mechanism, one of two: (a) the preview→editor half of scroll sync has no settle or staleness guard, and a paste churns the preview DOM (estimated heights, scroll clamping), firing preview scroll events that rewrite the editor's scrollTop — same family as (6a); or (b) the @uiw controlled-value race — if the value prop ever lags the doc, it dispatches a whole-document replace, the textbook silent scroll-to-top. Either way, 1.77's scroll memory is the amplifier that made this suddenly noticeable: a transient reset-to-0 gets recorded as the doc's position and replayed on the next tab switch, so one glitch becomes sticky — and it's the only editing-path change in all of 1.74–1.80. Your 10-second experiment: switch to editor-only view (no preview mounted) and paste. Jumps stop → (a), and the (6a) stale-range guard fixes both bugs at once. Jumps persist → (b), and I add one log line to the value-sync path to catch it red-handed. Fix M either way, plus a small hardening: never record a scroll of 0 that lands right on the heels of a mount or doc replace. No baseline perf cost to any of it.**
- [ ] (10) ENHANCE: Can palette remember last command so to redo is just C+S+P? ST does this. very helpful.
    **CC: L — ~20 lines, and the palette code is clean for it. choose() is the single point where a command runs; record its id there (per-run module state, optionally persisted in the session like recent projects if you want it across restarts). Then when the palette opens in command mode with an empty query, float the remembered command to the top with the selection on it — so Ctrl+Shift+P, Enter = redo, exactly ST. (Full ST behavior is MRU ordering of the whole list on empty query — same mechanism with an id list instead of one id; no harder, and I'd do that version.) Typed queries stay pure fuzzy rank. One gotcha: Insert-snippet commands are config-defined, so a remembered id can vanish after a config edit — skip missing ids silently. Zero baseline perf.**
- [ ] (11) BUG? This file is not refreshing automatically when you write to it. I thought it did in the past.
    **CC: confirmed, and the answer fell straight out of this morning's forensics — two layers. (1) The watcher only covers workspace roots (your folder root / project folders). This file lives outside KOG-posts and is opened via Ctrl+Shift+Q quick-open, so it is never watched at all — no fs-change events, no refresh. "In the past" it refreshed because you had its folder open as the workspace (e.g., the writedown repo during dev), which put it under watch. (2) Even for watched files, a tab with unsaved edits deliberately never auto-reloads — it gets the conflict flag and the status-bar "Modified externally" notice instead. That part is correct behavior (never clobber dirty edits), and note it's exactly how your issues tab was serving stale content this morning — which became overwrite #2's payload in item (12). Fix for (1): when a tab opens outside every watched root, add a watch on its containing folder, dropped when the last such tab closes — the save-echo suppression is already per-path, so our own saves won't self-trigger. L-M (watcher lifecycle care on the Rust side). No baseline perf impact.**
- [ ] (12) CRITICAL BUG (logged by CC): this morning index.qmd was overwritten wholesale — twice in ~90 s (7:39:50–7:41:16 AM), first with the Untitled scratch buffer's content, then with the writedown-issues tab's content. Recovered byte-perfect via palette Previous Versions.
    **CC: H severity, M fix — root cause traced end to end, and it's the app's cardinal sin (spec §2), so I'd build this before everything else on the list. Mechanism: there is ONE CodeMirror view reused across all tabs (no key={path}); clicking a tab flips activePath synchronously, but @uiw/react-codemirror defers the actual document swap while its typing latch is live (nominal 200 ms, reset per keystroke, wider in practice because WebView2 clamps its 1 ms countdown timer) — so for a beat the view still shows the OLD tab's text. onChange is unconditional, so an edit landed in that beat (your paste) writes the old tab's entire buffer into the NEW tab's content, and the next autosave (blur / switch / Ctrl+S) persists it wholesale. The scratch never-saves-to-disk guard is bypassed because the scratch's text travels through the content store into a real tab. Evidence: index.qmd's backup chain captures both foreign states exactly (the 2,323 B xpnl note, then the issues-tab content), and the current file is SHA256-identical to the pre-incident backup — the snapshot-before-every-write net worked perfectly. This is almost certainly (9)'s other face: when the deferred swap finally fires, it's a whole-document replace — the silent scroll-to-top. Fix: key the editor by path (remount per tab — 1.77's cursor/scroll memory already restores position, so the shared-view rationale is gone), or force the swap to apply immediately when the PATH changes and guard onChange with the doc the view actually shows. Side-find from the trace: the exe's delete confirmation never appears (dialog ACL denies confirm; the rejected Promise is truthy, so deletion proceeds unconfirmed to the Recycle Bin) — separate small fix. No baseline perf cost to any of this.**

***
## Thur 2026-07-16

```{python}
print('λ\tprobability')
```

```decl
agg ONE 10 claims 1000 xs 0 sev 10 * lognorm cv 12 mixed gamma .335
```

Key problem: the UI gets draggy when editing. Looking at task manager, it is  Webview2 manager consuming the CPU cycles. This is a **critical issue** as it renders this fantastic tool close to unusable. (I have a v low tolerance for lags.) What are we doing that likely causes this and what can we do about it?

**CC: addressed in 1.72.2–1.73.2 (keystroke reconfigure fix, KaTeX cache, worker + per-block incremental preview, line-anchored scroll sync). Residual: first-click TOC landing on some sections ("Examples") still imperfect — tracked.**

- [ ] (1) KEYBINDINGS: commands: DONE NICE!
    - [ ] ctrl+shift+A beg of line; ctrl+E end of line
    - [ ] ctrl+K ctrl+T title case (we have upper and lower)
    - [ ] ctrl+T transpose characters.
    - [ ] Esc T (emacs) transpose words (super useful, not available in ST AFAIK)
    **CC: L. All four drop into the existing command registry, so config `[keys]` remapping and F1 help come free. Line start/end and transpose-chars already exist in @codemirror/commands; title case is ~15 lines beside upper/lower; transpose-words ~30 lines custom. One flag: binding "Esc T" makes Escape a chord prefix, which delays/steals Escape's current jobs (close search, collapse multi-cursor). Alt+T IS emacs M-t (Esc T is just the terminal ESC-prefix form of Meta) — recommend Alt+T. No perf impact.** ==> use Alt+T in place of ESC - I see using Esc would be a fiasco!

- [ ] (2) BUG: open file in view mode (one click / no edits) the project/folder (blue background) has HUGE looking font.
    **CC: L (CSS), needs a 10-min repro. The tab strip had this exact disease — the italic preview-name in a synthesized/fallback italic face renders oversized; tabs were fixed with a pinned font-size/line-height. The Open Files row gets the same italic treatment without the compensation. I'll confirm which row/class in dev tools before touching CSS; a screenshot would remove all guessing. No perf impact.**
- [ ] (3) FEATURE: ability to drag and drop open files in the folder/project sidebar to reorg the tabs (like ST) DONE NICE!
    **CC: L-M. The tab strip's pointer-event drag (5 px threshold, live reorder via the store's moveTab) transplants to the Open Files rows nearly verbatim — vertical axis instead of horizontal. Open Files order IS tab order, so both views stay in sync for free. The tricky bits (drag-vs-click threshold, the × close target) were already solved once in Tabs.tsx. No perf impact.**
- [ ] (4) FEATURE: show/hide sidebar (Ctrl K + ctrl B, like ST) DONE NICE!
    **CC: L. Store flag + conditional render, persisted in the session like the pane widths; Ctrl+K Ctrl+B is free and the chord machinery exists. The key toggles (ST muscle memory); palette gets explicit Show Sidebar / Hide Sidebar verbs per the no-state-flipping rule. One limit: editor-keymap chords fire only when the editor has focus — the palette covers the rest. Hidden state preserves the dragged width. No perf impact.** ==> note this should be a project  level setting.
- [ ] (5) FEATURE: show/hide outline (Ctrl K + ctrl O) DONE NICE!
    **CC: L. Identical pattern to (4); Ctrl+K Ctrl+O is free. Bonus: when hidden, skip outline parsing entirely — a small perf win on big docs. Ship (4)+(5) together as one release.** ==> note this should be a project  level setting.
- [ ] (6) FEATURE: ST-like tab completion (nearby similar words...?!) PENDED
    **CC: M — the most design-sensitive of the batch. ST semantics: Tab with the cursor at the end of a word-prefix inserts the nearest matching word from the buffer; Tab again cycles outward. Plan: a custom Tab command + a small cycle state; harvest words with one regex sweep at trigger time (a few ms even on dm.md, and only on an explicit Tab — zero baseline perf cost), ranked by distance from cursor. Gotchas: Tab must fall through to indent when not at a word end; must yield to the @ citation popup; cycle resets on any other key. Prefix matching first (like ST); fuzzy later if wanted.**   **PEND** -> no implementation now.
- [ ] (7) PUNCHUP: new line after bullet (* or - or 1.) adds \n\n rather than just \n. Want one new line not two.  DONE NICE!
    **CC: L once confirmed. There's no custom Enter handler — Enter is lang-markdown's insertNewlineContinueMarkup, which preserves list "looseness": in a list whose items are separated by blank lines it continues with a blank line (your \n\n). Fix: wrap Enter with a tight-continue command (always single newline + marker), registered so it stays rebindable. I'll verify the loose-list diagnosis on a live repro first. No perf impact.**
- [ ] (8) BUG: Remember location in file after save (the Quick file jumps) sometimes? The cursor position is lost? Looks like the same cursor position maybe overlaid on every file? Click away, move cursor, move back -> location has changed.
    **CC: M — real bug, cause confirmed, two strands. (a) Nothing stores per-tab cursor/scroll anywhere; on tab switch the editor keeps the previous doc's raw cursor offset clamped into the new doc — precisely "the same position overlaid on every file." Fix: per-path {selection, scrollTop} captured on switch, restored on activate, persisted in the per-workspace session so restart restores too. (b) The after-save jump is likely our own save echoing back through the file watcher as an "external change" reload — needs a look at echo suppression. Highest daily-pain item on the list; I'd take it first. No baseline perf impact.** ==> note this should be a project  level setting.
- [ ] (9) FEATURE: add palette support for Insert... aligned $$ env; python code block, ... and others -> ideally a system? Config defined? THOUGHTS? DONE NICE!
    **CC: M, and yes — make it a system. Design: a `[snippets]` table in config.toml, display name → body (TOML '''multi-line''' strings), with CM snippet placeholders (${1:x} tab-through fields — @codemirror/autocomplete's snippet() is already a dependency). The palette grows one "Insert: name" entry per snippet; ship defaults (aligned $$ env, {python} cell, table skeleton, front matter) that config extends or overrides. A ${SELECTION} token for wrap-around is doable. Config parse errors surface, never swallowed. Perf: palette-time only, zero baseline.** --> set up with begin/end aligned and a python code block - those are my two most used.
- [ ] (10) BUG: print('λ\tprobability') results in (on render) Î» --> unicode bullshit. DONE NICE!
    **CC: L — root cause found. Rust pipes cell code to the kernel as raw UTF-8 JSON, but piped Python stdin on Windows decodes as cp1252 unless told otherwise — so λ (bytes CE BB) arrives as Î» and the cell executes with the mangled literal; the output is faithful mojibake. One-line fix in runner.py: sys.stdin.reconfigure(encoding="utf-8") (replies going the other way are already ASCII-escaped JSON, safe). The runner is rewritten at every kernel spawn, so the fix deploys itself.**
- [ ] (11) ISSUE: dictionary: add a word eg quantile, surprised that quantiles sill comes up mis-spelled. that is not what i expected. OK
    **CC: L-M. Your expectation is right; the mechanics aren't there: personal words match exactly (lowercased) with no affix expansion, so quantile ≠ quantiles — and spellbook has no runtime "add with affixes." Pragmatic fix: for an unknown word, also check its base against the personal list after stripping common inflections (s, es, 's; optionally ed/ing). Cheap, cached, covers ~all real cases. The purist alternative — Hunspell "quantile/S" flags in the personal file — is precise but user-hostile. Negligible perf.**
- [ ] (12) decl colorizer - i have my own grammar called decl which as a colorizer built in pygments. Can we use it? See T:\worktrees\aggregate_REFACTOR\src\aggregate.
    **CC: M. Pygments can't run in CM, but I read decl_pygments.py — a simple RegexLexer: word lists (freq/sev/two-param dists, grammar keywords), numbers, operators, note{}/hints{} blocks. Ports cleanly to a CM StreamLanguage (~200 lines), the same pattern as the TOML/stex legacy modes we already use. Registered for .agg/.dec/.decl files AND as a language description, so `decl` fences highlight in both editor and preview; colors come from the Sublime theme automatically. Gotcha: aggregate keeps the keyword list synced to decl.lark by a test — our port is a snapshot and will drift silently when the grammar grows (I'll comment the source path). No baseline perf (loads lazily).** --> OK  accept manual sync; grammar does not change that often.
- [ ] (13) add "copy file name and path to clipboard" to palette -> full name and resolved path of the current file to clipboard.
    **CC: L (~20 lines). Two explicit palette commands per the separate-verbs rule: Copy File Path (resolved absolute) and Copy File Name. navigator.clipboard.writeText works in the WebView2 secure context — no plugin needed. No perf impact.**

***
# Earlier
## Wed 2026-07-15 --> *All Resolved*

For each of these issues, or product enhancements please tell me:  low, medium or high effort, any gotchas or hidden surprises, whether the feature would have any impact on baseline performance of the app in its core functions, and any other issues or concerns you may have.

- [x] (1) read and colorize rst files; what other types of text files should be considered (c, cpp, r, ...); how hard to add each one?
- [x] (2) what is :xx: colorizing? --> it is an emoji thing - OK
- [x] (3) ability to reorder tabs and/or show open tabs at top of Project (a la ST)
- [x] (4) **NO** add a pdf viewer? Sumatra? DJVU files? -> External open
- [x] (5) **NO** add directory browser option...? (double click on a directory -> table listing in the right where md files usually open
- [x] (6) **NO** rg query support (palette ->rg -> enter search -> parse output somehow - click to open files...) --> open shell here
- [x] (7) **NO** better help?! --> what exactly?
- [x] (8) add an About from palette - includes version, components used, etc.
- [x] (9) file -> save as was glacially slow - i thought the app had crashed! OK - first-time windows overhead, rare occurrence
- [x] (10) **NO** add a shell? --> Open shell here

## July 14 Round 2

- [x] (1) Min length of word for spell check = 4 / where is the list of ignored words? add all file extensions!

## July 14 bugs, punchups, and features

### Bugs / Punchups
- [x] (1) save on lost focus = when you move off the tab onto folder or project it does not save ATM. it should
- [ ] (2) change folder results in projects being reset? - the folder and projects should be independent --> seems to still be an issue
- [x] (3) do **not** filter dot files! (eg in users\steve\.writedown should be visible in the tree view)
- [x] (4) @ REEYYYY defeated by trailing period, colon punctuation (comma, semicolon ok) - adjust regex. @Mildenhall2022a.
- [x] (6) spell check should ignore words in all caps. it DOESE already, doese.

### Questions
- [x] (5) what happens when you have multiple instances of the exe running?
- [x] (e) what is the universe of ST commands available?
- [x] (f) Project save file location: this should be completely managed - user never asked where to save a project. I don't think that is the case right now.  User should not be asked about where to save projects. Quick switch projects discovers those in saved location. What does palette -> save project as do? It should just rename (no file dialog box)?
- [x] (g) when we iterate on code, an I keep the old compiled exe open and use it - and iterate on a tauri dev instance?

### Features
- [x] (a) FEATURE: Extract refs in qmd / md file to *.bib file - put in a new scratch buffer.
- [x] (d) FEATURE: insert date time function on palette YYYY-MM-DD HH:MM:SS format. 2026-07-14 16:45:25
- [x] FEATURE: Use csv-grid for csv preview - load with fzf and column headers and resize, and copy/export buttons (see C:/s/AI/csv-viewer).
- [x] (4) FEATURE: add Ctrl+Shift+Q -> quick open a file. Default for me is the writedown bug reporter:  \s\ai\writedown\writedown-issues.md (my bug reporter). Customize location in config.

Past Issues {#sec-one}
================

- [x] (1) new project -> the (dev) features folder gets added in addition to the folder you add

- [x] (2) TAB heights: new file in preview mode (italics file name, single click on the file in folder/proj col)--> the tab does not pick up default size. It comes out very tall. When you edit it, it shrinks.

- [x] (3) quarto @sec-this-and-that tags appear as a missing reference. sec-, tbl- etc., the standard quarto labels should be all excluded from the tag ref regex. Note, my tags are almost always @ Author[0-9]{4}[a-z]*, but occasionally there are some just @ Authors. I almost always use - in my quarto section etc. tags.

- [x] (4) BIGGIE: in the rendered preview mode: is the pipeline to create a temp file version? We need to look for simple includes in the containing folder. eg my standard op proc is to have an img folder with images. We need ![](img/xxx) refs to work. Can we do that by linking the img (and other if appropriate) folders into the temp folder too - that's a quick move, largely just at start up.

- [x] (5) Can the Rendered tab revert to Preview automatically if there is no render available?

- [x] (6) Folder = not acting like a folder now we have proj, it should just be a file explorer, right? Just shows open-able files.

- [x] (7) Split between preview and editor window re-sizeable?

### July 12 punch ups

*I think these are all done*

- [ ] (2) new file -> lose spot in files/projects (dir list folds up); ditto delete me etc. investigate file ops and folder/project tree interaction.
- [x] (3) text wrap on / off in editor window (see (4) too)
- [x] (4) other ST key mappings (Ctrl K + Ctrl W toggle wrap, Ctrl +K kill to end of line, make Ctrl + B **xxx** (and Ctrl + I for italics); remap build to Ctrl+Shift + B; help shows list of key bindings;
- [x] (5) spell checker on/off; add word; ignore word (??not working)
- [x] (6) table format - add ST ctrl + alt + shft + T as shortcut (strong muscle memory)


### Too hard - pend

- [ ] (8) Add R support

***

see @sec-one and @Mildenhall2022a.

````{mermaid}
sequenceDiagram
    Browser->>Flask: GET /dashboard
    Flask->>Data: Load CSV files
    Data-->>Flask: Transactions
    Flask-->>Browser: Rendered page
````

<!-- remember this is deleted each evening!  -->
![caption Space 20](C:/s/Photos/Headshots/roman%20med.jpg){width=10%}

![caption A](C:/s/Photos/Headshots/roman%20med.jpg){width=50%}

![caption B](C:\s\Photos\Headshots\roman_med.jpg){width=35%}

![caption C](C:/s/Photos/Headshots/roman_med.jpg){width=25%  #fig-cyp}

*Missing file*
![caption D](/s/Photos/Headshots/roman_med.jpg){width=25%  #fig-cyp2}

![caption E](c:\\s\\Photos\\Headshots\\roman_med.jpg){width=12.5%  #fig-cyp3}


<!-- need to escape the backslash
![caption2](../../../../tmp/cypriot_medium.jpg){width=25%}
![caption3](..\\..\\..\\..\tmp\cypriot_medium.jpg){width=5%}
-->

```{python}
f = lambda x: x ==0 or x * f(x-1)
x = f(59)
print(len(str(x)), x)
```

| A                          |                     B |      C      |
| :------------------------- | --------------------: | :---------: |
| asfd asdfasdfasdfasdf jasd |                     a |     tab     |
| asfd jasd                  | asdfa askdfj ;lasd jf |     tab     |
| asfd jasd asdfasdf         |                     a | tab asdfasd |

