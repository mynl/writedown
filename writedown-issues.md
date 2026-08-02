# Feature Ideas and Bugs
## Rubric for all runs2026-08-02 update

One time: insert column "HML" before Status.

For each row in the table add a new row below it for your input, item is ">>CC".

* Enter low, medium or high effort
* Skip Status for now
* Under description add a **human-understandable** **short one- or two-line** summary and diagnosis (existing examples are too detailed and too complicated for me to understand!). Flag any issues here. This level of summary has been lacking prior to Wed 2026-07-22 iteration.
* **BELOW** the table and with title the Item number, add your developer issues and implementation plan - this is "notes for Claude". Here lies comments more like the ones you have been producing.
* In your row, under status put None|!!!|???|<other> as a one word (<5 letters) assessment of whether the feature would have any impact on baseline performance of the app in its core functions.

***

## Batch B: Monday 2026-08-03

| Item | Effort HML | Status/Impact | Description |
|--:|:---:|:---:|:-------------------------|
| **B.01** | | | *item* |




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

