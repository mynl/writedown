Feature Ideas and Bugs 
================

## Thur 2026-07-16  

Key problem: the UI gets draggy when editing. Looking at task manager, it is  Webview2 manager consuming the CPU cycles. This is a **critical issue** as it renders this fantastic tool close to unusable. (I have a v low tolerance for lags.) What are we doing that likely causes this and what can we do about it?

**CC: addressed in 1.72.2–1.73.2 (keystroke reconfigure fix, KaTeX cache, worker + per-block incremental preview, line-anchored scroll sync). Residual: first-click TOC landing on some sections ("Examples") still imperfect — tracked.** 

For each of these issues, or product enhancements please tell me:  low, medium or high effort, any gotchas or hidden surprises, whether the feature would have any impact on baseline performance of the app in its core functions, and any other issues or concerns you may have.

- [ ] (1) KEYBINDINGS: commands:
    - [ ] ctrl+shift+A beg of line; ctrl+E end of line
    - [ ] ctrl+K ctrl+T title case (we have upper and lower)
    - [ ] ctrl+T transpose characters.
    - [ ] Esc T (emacs) transpose words (super useful, not available in ST AFAIK)
    **CC: L. All four drop into the existing command registry, so config `[keys]` remapping and F1 help come free. Line start/end and transpose-chars already exist in @codemirror/commands; title case is ~15 lines beside upper/lower; transpose-words ~30 lines custom. One flag: binding "Esc T" makes Escape a chord prefix, which delays/steals Escape's current jobs (close search, collapse multi-cursor). Alt+T IS emacs M-t (Esc T is just the terminal ESC-prefix form of Meta) — recommend Alt+T. No perf impact.** ==> use Alt+T in place of ESC - I see using Esc would be a fiasco! 

- [ ] (2) BUG: open file in view mode (one click / no edits) the project/folder (blue background) has HUGE looking font.
    **CC: L (CSS), needs a 10-min repro. The tab strip had this exact disease — the italic preview-name in a synthesized/fallback italic face renders oversized; tabs were fixed with a pinned font-size/line-height. The Open Files row gets the same italic treatment without the compensation. I'll confirm which row/class in dev tools before touching CSS; a screenshot would remove all guessing. No perf impact.**
- [ ] (3) FEATURE: ability to drag and drop open files in the folder/project sidebar to reorg the tabs (like ST)
    **CC: L-M. The tab strip's pointer-event drag (5 px threshold, live reorder via the store's moveTab) transplants to the Open Files rows nearly verbatim — vertical axis instead of horizontal. Open Files order IS tab order, so both views stay in sync for free. The tricky bits (drag-vs-click threshold, the × close target) were already solved once in Tabs.tsx. No perf impact.**
- [ ] (4) FEATURE: show/hide sidebar (Ctrl K + ctrl B, like ST)
    **CC: L. Store flag + conditional render, persisted in the session like the pane widths; Ctrl+K Ctrl+B is free and the chord machinery exists. The key toggles (ST muscle memory); palette gets explicit Show Sidebar / Hide Sidebar verbs per the no-state-flipping rule. One limit: editor-keymap chords fire only when the editor has focus — the palette covers the rest. Hidden state preserves the dragged width. No perf impact.** ==> note this should be a project  level setting. 
- [ ] (5) FEATURE: show/hide outline (Ctrl K + ctrl O)
    **CC: L. Identical pattern to (4); Ctrl+K Ctrl+O is free. Bonus: when hidden, skip outline parsing entirely — a small perf win on big docs. Ship (4)+(5) together as one release.** ==> note this should be a project  level setting.
- [ ] (6) FEATURE: ST-like tab completion (nearby similar words...?!)
    **CC: M — the most design-sensitive of the batch. ST semantics: Tab with the cursor at the end of a word-prefix inserts the nearest matching word from the buffer; Tab again cycles outward. Plan: a custom Tab command + a small cycle state; harvest words with one regex sweep at trigger time (a few ms even on dm.md, and only on an explicit Tab — zero baseline perf cost), ranked by distance from cursor. Gotchas: Tab must fall through to indent when not at a word end; must yield to the @ citation popup; cycle resets on any other key. Prefix matching first (like ST); fuzzy later if wanted.**   **PEND** -> no implementation now. 
- [ ] (7) PUNCHUP: new line after bullet (* or - or 1.) adds \n\n rather than just \n. Want one new line not two.
    **CC: L once confirmed. There's no custom Enter handler — Enter is lang-markdown's insertNewlineContinueMarkup, which preserves list "looseness": in a list whose items are separated by blank lines it continues with a blank line (your \n\n). Fix: wrap Enter with a tight-continue command (always single newline + marker), registered so it stays rebindable. I'll verify the loose-list diagnosis on a live repro first. No perf impact.**
- [ ] (8) BUG: Remember location in file after save (the Quick file jumps) sometimes? The cursor position is lost? Looks like the same cursor position maybe overlaid on every file? Click away, move cursor, move back -> location has changed.
    **CC: M — real bug, cause confirmed, two strands. (a) Nothing stores per-tab cursor/scroll anywhere; on tab switch the editor keeps the previous doc's raw cursor offset clamped into the new doc — precisely "the same position overlaid on every file." Fix: per-path {selection, scrollTop} captured on switch, restored on activate, persisted in the per-workspace session so restart restores too. (b) The after-save jump is likely our own save echoing back through the file watcher as an "external change" reload — needs a look at echo suppression. Highest daily-pain item on the list; I'd take it first. No baseline perf impact.** ==> note this should be a project  level setting.
- [ ] (9) FEATURE: add palette support for Insert... aligned $$ env; python code block, ... and others -> ideally a system? Config defined? THOUGHTS?
    **CC: M, and yes — make it a system. Design: a `[snippets]` table in config.toml, display name → body (TOML '''multi-line''' strings), with CM snippet placeholders (${1:x} tab-through fields — @codemirror/autocomplete's snippet() is already a dependency). The palette grows one "Insert: name" entry per snippet; ship defaults (aligned $$ env, {python} cell, table skeleton, front matter) that config extends or overrides. A ${SELECTION} token for wrap-around is doable. Config parse errors surface, never swallowed. Perf: palette-time only, zero baseline.** --> set up with begin/end aligned and a python code block - those are my two most used. 
- [ ] (10) BUG: print('λ\tprobability') results in (on render) Î» --> unicode bullshit.
    **CC: L — root cause found. Rust pipes cell code to the kernel as raw UTF-8 JSON, but piped Python stdin on Windows decodes as cp1252 unless told otherwise — so λ (bytes CE BB) arrives as Î» and the cell executes with the mangled literal; the output is faithful mojibake. One-line fix in runner.py: sys.stdin.reconfigure(encoding="utf-8") (replies going the other way are already ASCII-escaped JSON, safe). The runner is rewritten at every kernel spawn, so the fix deploys itself.** 
- [ ] (11) ISSUE: dictionary: add a word eg quantile, surprised that quantiles sill comes up mis-spelled. that is not what i expected.
    **CC: L-M. Your expectation is right; the mechanics aren't there: personal words match exactly (lowercased) with no affix expansion, so quantile ≠ quantiles — and spellbook has no runtime "add with affixes." Pragmatic fix: for an unknown word, also check its base against the personal list after stripping common inflections (s, es, 's; optionally ed/ing). Cheap, cached, covers ~all real cases. The purist alternative — Hunspell "quantile/S" flags in the personal file — is precise but user-hostile. Negligible perf.**
- [ ] (12) decl colorizer - i have my own grammar called decl which as a colorizer built in pygments. Can we use it? See T:\worktrees\aggregate_REFACTOR\src\aggregate.
    **CC: M. Pygments can't run in CM, but I read decl_pygments.py — a simple RegexLexer: word lists (freq/sev/two-param dists, grammar keywords), numbers, operators, note{}/hints{} blocks. Ports cleanly to a CM StreamLanguage (~200 lines), the same pattern as the TOML/stex legacy modes we already use. Registered for .agg/.dec/.decl files AND as a language description, so `decl` fences highlight in both editor and preview; colors come from the Sublime theme automatically. Gotcha: aggregate keeps the keyword list synced to decl.lark by a test — our port is a snapshot and will drift silently when the grammar grows (I'll comment the source path). No baseline perf (loads lazily).** --> OK  accept manual sync; grammar does not change that often. 
- [ ] (13) add "copy file name and path to clipboard" to palette -> full name and resolved path of the current file to clipboard.
    **CC: L (~20 lines). Two explicit palette commands per the separate-verbs rule: Copy File Path (resolved absolute) and Copy File Name. navigator.clipboard.writeText works in the WebView2 secure context — no plugin needed. No perf impact.** 


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

