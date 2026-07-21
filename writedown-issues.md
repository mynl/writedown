# Feature Ideas and Bugs 
## Rubric for all runs
For each of these issues, or product enhancements please tell me:  

* low, medium or high effort, 
* human-understandable one- or two-line summary of problem and diagnosis (existing examples are too detailed and too complicated for me to understand!), 
* any other issues or concerns you may have, again brief, human-understandable
* whether the feature would have any impact on baseline performance of the app in its core functions, 

Create and update a summary table as needed with Item and Description filled in and check blank - for subsequent monitoring. 

***
## Tuesday 2026-07-21 

Fix outstanding issues / punchups. Here is the summary and current status. 

| Item | Check | Description | 
|--:|:---:|:-------------------------|
| Fr 2  | ❌ | ST mirror: preview hidden from Open Files, single slot, edit promotes, click-open closes it (1.94.0) |
| Sa 5  |  | Tab word-completion → sorted popup list by proximity (1.91.0, 1.93.0) |
| Sa 5a| |  completions adapt to typed case; case-insensitive dedup to nearest (1.95.0) 
| Sa 5b| |  private dictionary of longer words with frequency weighting 
| Sa 8  | ❌ disaster | Tab switch: editor anchored (line-snapshot restore), preview syncs once, gesture-gated (1.93.3) |
| Sa 14  |  | All colorization after a YAML block — root cause: trailing space on closing `---` (1.93.2) |
| Tu 1 | | Add MIT license |
| Tu 2| | Any other prep for public repo release |
| READ | | Finalize README file for release | 

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
    **CC: one real blocker: features/ contains personal documents (a diary file, work notes, presentations) that are tracked in git — and history keeps them even after deletion. Recommend: move personal test docs out of the repo, keep sanitized fixtures, and make the public debut a FRESH-history repo (this one stays private as the archive) — cleanest for a LinkedIn launch. Also worth doing first: a README hero screenshot + install section (expect a SmartScreen warning — unsigned exe), a GitHub release with the installer attached, repo description/topics. No secret-leak risk found (the app makes no network calls); I'll run a quick history grep before any flip. Your call: does the issues-file/dev-log charm go public too (it contains personal paths)?**
- [ ] **READ** Edit README for 5Cs  -  esp. double check claims about Typora.  
    **CC: L. 5Cs pass with the Typora row corrected — Typora DOES keep files as plain Markdown on disk, so that claim softens; the honest distinctions are WYSIWYG-fused editing (vs our raw text + separate preview), closed-source paid (vs free MIT), and no Quarto/{python}/BibTeX machinery. Plus: "LiveMarkdown" typo, License section filled in (Tu 1), and a short Install section for the public audience. Claims re-verified before committing. (docs commit)**

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

