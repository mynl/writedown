# Writedown — User Guide

Writedown is a fast, local Markdown and Quarto editor for Windows. Ordinary files on
disk are the source of truth: no vault, no database, no cloud, no telemetry, and the
app never renames, moves, or rewrites a file behind your back.

This guide ships with the app: it is written to `~/.writedown/help.md` at every
launch (so this copy always matches the running build — edits made here are
overwritten). The canonical copy is `HELP.md` in the repository.

## The three doors

- **Ctrl+Shift+P** — the command palette. Every command lives here; when in doubt,
  open the palette and type a few letters. With an empty query it lists your
  most-recently-used commands, so **Ctrl+Shift+P, Enter** repeats the last one.
- **F1** — the keyboard-shortcuts overlay, generated live from your actual keymap
  (defaults plus your `[keys]` overrides), so it is never out of date.
- **?** (top right, next to the Split toggle) — opens this guide.

## Opening things

- **Ctrl+O** (or palette **Open File…**) opens any file on disk, in or out of the
  workspace — pick several at once if you like.
- **Open Folder** (palette) makes a folder the sidebar's file explorer.
- **Projects** are Sublime-style `.wdproj` files: a named set of folders. Create,
  switch (MRU quick-switch), save, and delete them from the palette; the sidebar's
  Folder/Project tabs and the dropdown at the bottom switch between them; the 📂 button
  beside the dropdown opens the current `.wdproj` for editing. Project files are fully
  managed — you are never asked where to save one.
- **Same-named folders** in a project can carry a label, shown as `docs (papers)`:
  palette → **Project: Label Folder "docs"…**, or add a `labels` map to the `.wdproj`
  (`"labels": { "D:\\b\\docs": "papers" }`, keyed by the path as written in `folders`) —
  the sidebar updates when you save the file. An empty label removes it.
- **Ctrl+Shift+C** copies the active document's full path (palette: Copy File Path /
  Copy File Name); right-click a file in the tree → **Copy Path**.
- **Ctrl+Alt+P** switches project, most recently used first, with the current project
  last: **Ctrl+Alt+P, Enter** goes back to the previous project, as Alt+Tab does.
- **Ctrl+Shift+Q** opens your quick file (`[files] quick_file` in config). Palette
  **Quick Files: Open from List…** searches the `[files] quick_files` list — the handful of
  files you come back to constantly, matched on name or folder, in the order you list them.
- **From a terminal**: `writedown notes.md`, `writedown .` or `writedown C:\docs`,
  `writedown --version`, `writedown --help`, and `writedown --blank` for an empty window
  with the project switcher up. A folder argument opens as **its own
  project**, replacing the restored workspace rather than joining it — and its tabs and
  layout are remembered against that folder, so running it again resumes where you were.
  Nothing is written to disk; the project stays unsaved until you name it.
- **Which window?** Double-clicking (or `writedown file.md`) prefers an existing window:
  the one whose project contains the file — on any desktop, current virtual desktop
  first — else a window **on the current desktop** as a loose tab; with neither, a new
  window starts (a loose tab never yanks you to another desktop). A **new window opened
  this way lands in the first project (list order) whose folders contain the file**, or
  in a clean project-less window — never in whatever workspace happened to be open last.
  A **folder** argument and a **bare launch** always open a new window with the usual
  restore (that is how project instances are started). Running several windows at once
  is supported.
- Palette **Close All Files** saves and closes every real file. Unsaved scratch buffers
  are deliberately left alone: their text exists nowhere but the session.
- The file tree lists **every** file. Muted entries are files Writedown has no
  syntax support for — they still open as plain text. Obviously binary files
  (exe, dll, zip, media, fonts) are muted and inert: right-click → Open Externally.
  Images (png/jpg/gif/webp/svg/bmp/ico/avif) open in an in-app viewer tab.
  PDF/DjVu route to your configured `[tools] pdf_viewer`.
- **The tree keeps up with the disk.** Changes inside a watched project folder appear
  by themselves; the Folder tab (whose root is deliberately never watched — it can be
  an entire synced tree) refreshes when the window regains focus, when you switch panel
  tabs, and on **F5**.

## The file tree, from the keyboard

Click a row to select it, then:

| Key | Does |
|---|---|
| **Up / Down** | move the selection |
| **Right** | open a folder, or step into an open one |
| **Left** | close a folder, or jump to its parent |
| **Enter** | open the selected file (a folder opens/closes) |
| **F2** | rename |
| **Delete** | move to the Recycle Bin (asks first) |
| **F5** | re-read the tree from disk |

Only when the tree itself has focus — with the caret in the editor, Delete is just
Delete.

## Tabs, Sublime-style

- **Single-click** a file: opens in the *preview tab* (italic title). There is at
  most one preview tab; previewing another file reuses it. **Double-click** (or any
  edit) makes the tab permanent. **Ctrl+click** hands the file to Windows — whatever
  app owns that type opens it, exactly like a double-click in Explorer. Works on any
  file, and on folders (they open in Explorer).
- **Drag and drop** files or folders onto the window: files open as tabs, a folder
  becomes the Folder-tab root — or is added to the project, if the Project tab is
  showing.
- Drag tabs to reorder. **Ctrl+W** saves and closes; **Ctrl+Shift+T** reopens the
  last closed tab. **Ctrl+Shift+N** opens a new scratch buffer (in memory until you
  Save As).
- Palette **Reopen Closed Tab…** lists the tabs you closed, newest first: type to filter,
  Enter reopens one. The list is kept per project with the session (the last 25), so it
  and Ctrl+Shift+T survive a restart.
- **Ctrl+Alt+Shift+N** (palette **Window: New Window**) opens a second, empty Writedown
  window with the project switcher up: Enter opens a project in it, Esc leaves it empty.
  It may open exactly on top of the current window, which keeps its saved geometry.
- Scratch buffers belong to the workspace you opened them in and come back with it.
  Palette → **"Name Temporary File…"** replaces `Untitled-3` with a name of your own;
  the buffer is still unsaved — Save As is what puts it on disk.

## Editing

The editor is CodeMirror with a Sublime keymap: multiple cursors, **Ctrl+D**
select-next-occurrence, line manipulation, and the rest — press **F1** for the full,
truthful list (bold/italic, table reformat **Ctrl+Alt+Shift+T**, title case, and
more live in its Markdown/Editing sections). Typing a quote, bracket, `*` or `$` over
a selection wraps the selection — press `$` twice for `$$…$$`.

- **Tab completion**: type the first letters of a long word and press **Tab** — it
  completes from words near your cursor first, then from a frequency dictionary
  built in the background from the files you open. Case adapts to what you typed.
  With no match, Tab does nothing and says so in the status bar; it never indents
  the paragraph. (Tab at the start of a line, or after whitespace, still indents.)
  The dictionary is one for everything, not per project: the 50 files most recently opened
  or saved, the top 250 words of each. Several windows share it, each adding its words
  when it saves.
- **Jump back**: **Alt+-** returns to where you navigated from, **Alt+Shift+-** goes
  forward again. A stop is left by an outline click, a Find in Files hit, a palette go-to,
  find next and previous (one stop for a run of F3), Go to Line (Ctrl+G), and Ctrl+Home or
  Ctrl+End. Typing, arrows, PageUp and PageDown, clicks and scrolling leave none. Each file
  keeps its own history while you work in others, and Alt+- never moves to another file.
  Stops move with your edits; the history ends with the session.
- **Word Count** (palette): words and characters in the status bar, of the selection when
  it spans more than one line, else of the whole document. Prose only: front matter, code
  cells, HTML comments and tags, display math and link targets are left out; inline math
  and a citation count as one word each.
- **Ctrl+Shift+D** duplicates the selection when there is one, otherwise the line.
- **Alt+Z** zaps to a character, as Emacs M-z does: press Alt+Z, then a character, and
  everything from the caret through the next occurrence of that character is deleted,
  across lines if need be. Every cursor does its own; one Ctrl+Z restores. Esc (or any
  key that is not a character) cancels. Nothing goes to the clipboard.
- **Ctrl+Alt+Shift+T** formats the table at the caret: the first press aligns it (wide),
  the next press compacts it (narrow, `| a | b |` over `|--|:--|`), and the next widens it
  again. Narrow resets the delimiter dashes, which Pandoc reads as relative column
  widths, so set those by hand afterwards if they matter. A selection formats every
  table it touches; outside a table the status bar says so.
- **F9** sorts the selected lines — case-insensitive and numeric, so `item2` sorts before
  `item10`; **Shift+F9** sorts in reverse. The palette adds case-sensitive and
  from-caret-column variants (the latter pairs with Alt+drag column selection).
- **Alt+Q** reflows the paragraph at the caret (or every paragraph a selection touches):
  hard-wraps at `[editor] fill_column` (default 80), one undo step, never automatic.
  List items keep their marker with a hanging indent and never merge; `>` quotes keep
  their prefix on every line. Fences, tables, headings, front matter and display math
  are left alone (a status-bar note says so). Ctrl+Shift+J (join lines) is its inverse.
  A definition (`: text`) wraps like a list item, and its term line is never touched.
- **Quotes close themselves in code** — inside `{python}` cells and code spans, and in
  code files: `"` gives you `""` with the caret between, and a third quote completes a
  `"""` docstring pair. Same for `'`. Prose is untouched (apostrophes stay apostrophes),
  and brackets are never auto-closed anywhere. Backspace between a pair removes both.
- **Paste an image** (Ctrl+V with a screenshot on the clipboard) into a Markdown,
  Quarto or temporary document: the image is written to an `img/` folder beside the
  document — created if needed — and an `![](img/…)` link is inserted. Temporary
  buffers have no folder, so theirs go to `~/.writedown/img/` and get a full path.
  Files are named by content, so pasting the same screenshot twice reuses one file and
  nothing is ever overwritten. The status bar reports what was written. Pasting text is
  completely unaffected.
- **Run one cell**: **Ctrl+Enter** runs just the `{python}` cell under the cursor, in the
  kernel's current state (Jupyter's Shift+Enter). Fast, and the rest of the Rendered view
  keeps its existing output. **Ctrl+Shift+Enter** is still the real render: fresh
  namespace, every cell top to bottom — use it when you want a result you can trust.
- **Numbered sections**: a document with `number-sections: true` in its front matter gets
  numbered headings in the preview. Palette verbs force it on or off for the view without
  touching your YAML.
- **Fonts**: `[editor] font_family` sets the editor face; `[editor.font_by_ext]` overrides
  it per file type (`py = "Cascadia Mono"`). List families in `[editor] font_choices`
  and each becomes a palette "Font: …" verb for a session-only switch.
- **Zoom**: Ctrl+wheel (or Ctrl+= / Ctrl+-) in the editor, and now in the preview pane
  too. Both are session-only; "Set Current Editor Size as Default" writes it to config.
- **Panels**: **F10** toggles the Folder/Project sidebar, **F11** toggles the Outline.
  **Ctrl+F11** is full screen; **Ctrl+Shift+F11** is distraction-free (full screen, no
  sidebars). Palette "Enter Plain View" is editor-only — no sidebar, outline or preview,
  and not full screen. Exiting any of them restores the layout you had.
- **Snippets**: palette → "Insert: …" (aligned `$$` environment, `{python}` cell,
  and any you define under `[snippets]` in config, with tab-through fields). With a
  selection, "Insert: Python Code Cell" wraps the whole lines it touches, the fences on
  lines of their own, and leaves the code exactly as it was (backslashes and tabs too).
- **Trailing whitespace** is trimmed on save by default, Sublime semantics
  (`[editor] trim_trailing_whitespace`; CSV/TSV are never trimmed).
- Font size: **Ctrl+wheel** or Ctrl+= / Ctrl+- (session-only zoom, with configured
  min/max bounds); "Set as Default" bakes it into config.

## Git marks

In a git repository, the file tree tints modified (amber), added/untracked (green) and
deleted (red) files, and folders containing changes carry a small dot: on by default,
`[git] tree_marks` in config, session verbs **Git: Tree Marks On / Off**. The marks are
refreshed when you come back to Writedown from another window, 2 s after a save, when the
project's folders change, and on **Git: Refresh Tree Marks**; at most once every 10 s, and
never because files changed on disk. So they do not follow changes made by other programs
while Writedown has focus: switching away and back, or **Git: Refresh Tree Marks**, updates
them. Only repositories that contain a project folder are marked.

Per-line change stripes in the editor gutter mark lines changed, added or deleted against the
index, that is since the last `git add` (`[git] gutter_marks`, off by default; **Git: Gutter
Marks On / Off** for the session); they update on open and save.

Every git command Writedown runs (`rev-parse`, `status`, `show`, `blame`) is read-only and
lock-free: it never takes `index.lock`, so it cannot collide with a commit in another
program. Outside a repository (or with no git installed) the feature is silently off;
`[git] exe` points at a git that is not on PATH.

## Diff (what changed?)

Palette-only, read-only: **Diff: Against Saved File on Disk** shows your unsaved edits;
**Diff: Against Previous Version…** picks a stamp from the Previous Versions list;
**Diff: Against Open Tab "name"** compares two open tabs. The diff opens as a **Diff
tab** beside Preview/Rendered in the right-hand pane — click Preview to go back, Diff to
return — and follows your typing. Unchanged stretches collapse into a clickable
"⋯ n lines ⋯" bar, so you see hunks, not the whole file. Close it with the **×** on the
tab, **Esc** in the pane, or **Diff: Close**. No merging and no per-hunk revert —
restoring stays in Previous Versions.

**Diff: When Did This Line Change** follows the caret's line back to the change that last
touched it and shows that one change in the Diff tab, scrolled to the line. An unsaved edit
on the line says so and opens the diff against the saved file. In a git repository a
committed line names its commit, date and summary and shows the commit's change to the
file. Otherwise, and for a line changed since the last commit, the saved versions are
searched: the status bar names the save, or, deep in the thinned history, the two saves it
falls between.

## Find in files

**Ctrl+Shift+F** (palette → **Find in Files…**) runs ripgrep over the project's folders
(or the open folder, or the current file's folder). The line you type is `rg`'s argument
line, so it takes whatever `rg` takes:

- `TODO` — every hit, grouped by file, the match highlighted. **Enter** on a row (or a
  click) opens the file with the cursor on the match.
- `-c TODO` — hits per file, most first; `-l amsmath` — the files that mention it.
- `-i "risk measure" -g *.qmd` — case-insensitive, `.qmd` only. Your own `-g` / `-t`
  replaces the default file globs (`[search] globs` in config.toml: md, qmd, py, bib,
  toml, txt, yaml). Smart case is on unless you say `-s`.

**Enter runs the search** when the line has changed; once results are up, Enter opens
the selected row and **Ctrl+Enter** re-runs. Esc cancels a running search. A selection
in the editor pre-fills the line. The last query and results stay for the session.
Hard caps: 500 hits and 5 seconds (`[search] max_hits`, `timeout_ms`) — the list says
when it was cut. Flags that read files or run programs (`--pre`, `-f`, `--files`) are
refused; nothing here ever writes to a file (no replace — that is Sublime's job).

## Preview and rendering

- The right-hand pane shows a live preview (markdown-it + KaTeX math, footnotes,
  scroll sync both ways). **Ctrl+Shift+L** cycles editor / split / preview; the
  Split button top right does the same.
- Text in the Live and Rendered tabs is set in STIX Two Text, bundled with Writedown, with
  table figures lined up in columns; `[preview] font_family` in config changes it. Code
  keeps the editor's monospace face, and math its own.
- Image paths in documents resolve relative to the file; a path containing a raw
  space needs `%20` or angle brackets (strict CommonMark).
- CSV/TSV tabs show a data grid instead (search, filters, sort, export).
- **HTML files** (`.html`, `.htm`) show a sealed preview: the page as a browser draws it,
  refreshed about half a second after you stop typing, keeping its scroll position. Local
  CSS and images load from beside the file; no script runs and nothing loads from the web,
  so MathJax math stays raw TeX, a Quarto tabset shows only its first tab, and plotly
  figures are blank (open those in a browser). Links to the web or `mailto:` open in your
  browser or mail program; `#` links scroll the page; links to local files do nothing. The
  outline lists the `<h1>` to `<h6>` headings that open and close on one line, and a click
  moves both the editor and the preview. Files over 2 MB get no outline. Very large
  self-contained Quarto output is slow in the editor itself.
- The **Rendered** tab runs your Quarto-style `{python}` cells: palette → "Render
  Document" or **Ctrl+Shift+Enter**. When the buffer
  has changed since the render, a red square sits before "Rendered" in the tab and the
  status row shows a red Stale badge. **Ctrl+Shift+B** runs the `[build]` command, from
  anywhere, as in Sublime.
- **Definition lists**, Pandoc's syntax: a term on its own line, then `: definition`
  (or `~ definition`) on the next. Quarto's `:::` divs are unaffected.
- **Which Python runs a document**, first match wins: `wd-python:` in its front matter
  (an absolute path); else a `.venv` or `venv` in the document's folder or any folder
  above it (`[render] auto_venv = false` turns this off); else `[render] python`. Palette
  **Python: Which Python** shows the interpreter, why it was chosen, and its version if it
  is running. Up to three Python processes stay alive per window, one per interpreter
  (`[render] max_kernels`), so switching between documents in different venvs is instant
  and each keeps its variables for Ctrl+Enter. Each idle one holds its memory. **Restart
  Python Kernel** restarts the active document's one.
- **Python help**: **Ctrl+K Ctrl+H** (palette **Python: Help on Name at Caret**) with the
  caret on a name in a `{python}` cell, or anywhere in a `.py` file, opens a **Help** tab
  beside Preview with exactly what `help(name)` prints, signature first. It comes from the
  document's own Python process, so the names are those the last render defined, and it is
  looked up without running anything (help on a property shows its docstring, never its
  value). A name not defined yet falls back to jedi's reading of the code when jedi is
  installed in that environment, otherwise it says to render first. During a render it
  answers "busy". The tab's **×** or **Esc** closes it.
- **Python warnings**: the first of each distinct message by default, reset at every
  render, so a warning from a library shows every time rather than only on the first
  render. `[render] warnings = "all"` or `"off"` changes it, `wd-warnings: all` changes it
  for one document, and palette **Python Warnings: First of Each Kind / All / Off** changes
  it for the session (**Use Document or Config Setting** undoes that).
- Python cell syntax and duplicate Quarto labels are checked automatically (~½ s
  after you stop typing) and appear as squiggles.
- A cell's last value is shown the way Jupyter would: HTML from its MIME bundle or
  `_repr_html_` (pandas tables, `greater_tables` `GT`, …), else an image from the
  bundle, else text. No wrapper needed.
- The working directory is **the document's own folder** — for every cell, including
  Ctrl+Enter — so `pd.read_csv("data.csv")` means what you expect. That folder is also
  first on Python's import path, so `import style` finds the `style.py` beside the
  document, as in Jupyter and Quarto. Modules from document folders are re-imported at
  every render, so an edit to `style.py` shows on the next render; installed packages stay
  loaded. No `__pycache__` folder is written beside your documents. As in Jupyter, a file
  named like an installed package (`pandas.py`) hides the real one.
- **When a cell fails**, `[render] traceback_mode` decides how much you are told:
  `minimal` (type and message), `plain` (exactly what python prints), `context`
  (**default** — your frames only, with the failing line), `verbose` (adds the local
  variables in each frame), `docs` (adds each function's docstring). Override it for
  one document with `wd-traceback: verbose` in the front matter, or from inside a cell
  with `%xmode verbose` — the one magic Writedown interprets rather than ignores.
  (There is no IPython here: Writedown formats tracebacks itself, so none of this
  costs anything, and none of it runs unless a cell actually raises.)

## Citations (BibTeX)

Point `[bibliography]` at your `.bib` file (it is watched, and never modified).
Then type **@** and a few letters for ranked autocomplete (palette → **Insert:
Citation…** opens the same picker; give it a key under `[keys]` as `insertCitation` if
you want one — **Ctrl+Shift+C** is Copy File Path); hovering a key shows the title.
"Extract Citations" collects the entries a document cites into a temporary `.bib`.
A key may contain `&` (`@S&P2019`); it still ends on a letter or digit, so a sentence's
final period stays outside it.

**Open a reference's document.** Set `[bibliography] viewer_url` in config.toml to a page
that shows a reference by key, with `{key}` where the key goes, for example
`"http://127.0.0.1:9124/view/{key}"` for archivum. Then right-click a citation key for
**Open Document for @key** (or **Copy @key**), use palette **Citation: Open Document
(PDF/DjVu)** with the caret on a key, or click **Open ↗** in the hover card. The page opens
in your browser; Writedown itself makes no request. Browsers cannot show DjVu, so a DjVu
document arrives as a download. Without `viewer_url` none of this appears and right-click
gives the usual menu.

**Cross-references complete too, from the document itself.** Type **`@-`** for every
Quarto label in the file, or **`@fig-`** / **`@tbl-`** / **`@thm-`** / … for a family.
Matching is order-free, so `@-flood tbl` finds `tbl-flood`. Both ways of writing a
label are found — `#| label: fig-x` in a cell and `{#fig-x}` on a heading, figure,
table or div. A citation key (`@Author2024`) is untouched: the leading hyphen is what
picks label mode, and a citation key can never start with one.

## Spelling

Offline en-US checking with suggestions. Add words to your personal dictionary from
the tooltip or palette; saving the dictionary file applies immediately. ALL-CAPS
words and short words are skipped. Toggle for the session from the status bar.

## Saving and safety

- Saves are **atomic** (temp file + rename) and every save snapshots the previous
  version first — palette → "Previous Versions" restores byte-perfect.
- **Version history is kept in tiers**, like Synology's: the newest 20 versions of a file
  whatever their age, then one per hour for a day, one per day for a month, one per week
  for a year, and one per month beyond. Each survivor is the file as it stood at the end of
  its hour, day, week or month. Palette **Version History: Stats** shows the count, size
  and oldest version for this project and for the whole store; **Version History: Prune
  This Project…** deletes everything beyond the newest 20 of each of the project's files,
  after a confirmation stating what it frees. The store (`~/.writedown/backups`) is
  disposable; deleting it loses only history.
- Autosave fires on window blur and tab switch; **Ctrl+S** any time.
- If a file changes on disk outside Writedown, a clean tab reloads automatically;
  a tab with unsaved edits is flagged instead — a bold `!` on the tab and a footer
  notice. Autosave will not write that tab while it is flagged, and every save is
  checked against the disk anyway, so neither version can be lost by accident.
  Resolve it with the palette: **Reload from Disk (discard my edits)** or
  **Overwrite Disk with My Version** (the replaced version goes to Previous
  Versions either way). Quitting saves your buffer — losing your typing would be
  the worse failure, and the disk version is still recoverable.
- Writedown never renames or reorganizes files, never touches YAML front matter
  formatting, and works fully offline.

**Editor shortcuts work from the preview too.** With focus on the preview (or nowhere in
particular), a modified chord — Ctrl+F, Ctrl+G, the Ctrl+K family, folds, zoom — is handed
to the editor as if it were focused; plain typing is never forwarded, and Ctrl+C still
copies whatever is selected in the preview. In preview-only view, Ctrl+F switches to split
and opens Find there.

**Syntax coloring** follows the file extension. The footer's **Syntax: X** button (or the
palette's **Syntax: Python / JSON / TOML / …** verbs) recolors the active document for this
session only — nothing is written anywhere, and **Syntax: Auto (by file extension)**
restores the default. Coloring only: spelling, math and citations still follow the real
file type.

**Identify a character**: palette → **Identify character at cursor** shows its code point,
Unicode name, LaTeX command and UTF-8 bytes in the status bar (rebindable in `[keys]` as
`identifyCharacter`). Ctrl+Shift+U with one character selected still opens the picker on
that character for the fuller view.

## View modes

**Ctrl+F11** full screen; **Ctrl+Shift+F11** distraction-free (full screen, sidebars
hidden, but the preview stays); **Ctrl+K Ctrl+F** plain view — editor only, no sidebar,
no outline, no preview, not full screen. All three toggle, and exiting restores the
layout you came from. **F10** / **Ctrl+K Ctrl+B** sidebar; **F11** / **Ctrl+K Ctrl+O**
outline. The outline pane doubles as a click-to-jump table of contents.

## Inserting characters

**Ctrl+Shift+U** (palette: **Insert: Unicode Character…**) searches every name a
character has at once — its Unicode name, its LaTeX command, emoji keywords, and
aliases — so `tick`, `check`, `\checkmark` and `u+2713` all find ✓, and `odot`,
`circle dot` and `\odot` all find ⊙. With an empty query it lists your most-used
characters, then browsing groups (colors, checks & crosses, circles & dots, arrows,
Greek, operators, relations, set & logic, sub/superscripts, dashes & quotes).

- **Colored characters** are in the table: squares, circles, hearts, pictographs,
  emoticons, transport symbols. Try `red square`, `green circle`, `rocket`. A character
  such as ⚠ or ❤ is plain text by default and turns colored only when followed by the
  invisible U+FE0F; each has a second row, "warning sign (color)", that inserts the
  colored form. Colored emoji show in the preview and in HTML; a PDF through LaTeX needs
  a color emoji font configured, or they come out blank.

- **Enter** inserts the character, **Shift+Enter** inserts its LaTeX command
  (`\odot`) instead, **Alt+Enter** inserts and keeps the picker open for a run.
  **Ctrl+Shift+U then Enter repeats the character you last inserted** — the recents
  list is most-recent-first, and a search lists your recents above everything else.
- Select exactly one character and press **Ctrl+Shift+U** to look it up — name, code
  point and LaTeX name — which is how you find its hollow or filled sibling.
- Know the code point already? Type **`u+2299`** then **Tab** in the editor: no popup.
  A bare **`u+`** then **Tab** opens the picker.
- ✅ and ❌ are color emoji (they come from the emoji font); ✓ and ✗ take your editor's
  text color. The picker labels which is which and draws each one the way your document
  will. A character carries no color of its own — a *green* ✓ is styling, not a
  different character.
- Add your own names under `[symbols]` in config.toml.

(Windows' own **Win+.** panel does not work in Writedown, and cannot be made to: it
blurs the editor and then injects the character into an editor that is no longer
listening. This picker exists because of that.)

## Configuration

Everything lives in `~/.writedown/config.toml` — palette → "Edit Config" opens it,
and saving applies live (fonts, colors, keymap, spelling, tools). Import a Sublime
Text color scheme for the editor theme. Remap editor keys under `[keys]`; palette →
"Keybindings: Write All Shortcuts to Temporary File" gives you the full current map
to paste from. App state under `~/.writedown/` is disposable — your documents are
never copied there.

Multiple Writedown windows are fine — sessions are kept per workspace, and the
files themselves are the single source of truth. The window title is the project
name (or the folder's, or plain "Writedown"), so several instances tell apart at a glance.

**Window caption colours** (Windows 11): the title bar is the logo's orange with navy
text. `[window] titlebar_color` and `titlebar_text_color` in config.toml take
`'#RRGGBB'` — single-quoted, since `#` ends a double-quoted TOML string — or `'none'`
to hand that part back to Windows. Defaults `'#DD9536'` / `'#15385D'`. (Navy on the
orange measures 4.8:1 contrast; white would be 2.5:1 — try it, but it is not the default.)

**Errors** appear as a strip above the panes — config.toml problems in amber (click the
message to open the file), everything else in red. The full text wraps and is also in the
strip's tooltip; **×** dismisses it and palette → **Show Last Error** brings it back.
Everything shown there is also written to `~/.writedown/logs/writedown.log`.

## More

- **About Writedown** (palette): version and components.
- **Help: Check for Updates** (palette) asks GitHub for the latest release, says whether
  this build is current, and opens the release page if a newer one exists; you run the
  installer yourself. It is the only request Writedown itself makes, and only when you ask.
- Issues and source: <https://github.com/mynl/writedown>.
