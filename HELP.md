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
  Folder/Project tabs and the dropdown at the bottom switch between them. Project
  files are fully managed — you are never asked where to save one.
- **Same-named folders** in a project can carry a label, shown as `docs (papers)`:
  palette → **Project: Label Folder "docs"…**, or add a `labels` map to the `.wdproj`
  (`"labels": { "D:\\b\\docs": "papers" }`, keyed by the path as written in `folders`) —
  the sidebar updates when you save the file. An empty label removes it.
- **Ctrl+Shift+C** copies the active document's full path (palette: Copy File Path /
  Copy File Name); right-click a file in the tree → **Copy Path**.
- **Ctrl+Shift+Q** opens your quick file (`[files] quick_file` in config). Palette
  **Quick Files: Open from List…** searches the `[files] quick_files` list — the handful of
  files you come back to constantly, matched on name or folder, in the order you list them.
- **From a terminal**: `writedown notes.md`, `writedown .` or `writedown C:\docs`,
  `writedown --version`, `writedown --help`. A folder argument opens as **its own
  project**, replacing the restored workspace rather than joining it — and its tabs and
  layout are remembered against that folder, so running it again resumes where you were.
  Nothing is written to disk; the project stays unsaved until you name it. Every
  invocation opens a **new window** — running several at once is supported.
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
- **Ctrl+Shift+D** duplicates the selection when there is one, otherwise the line.
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
  and any you define under `[snippets]` in config, with tab-through fields).
- **Trailing whitespace** is trimmed on save by default, Sublime semantics
  (`[editor] trim_trailing_whitespace`; CSV/TSV are never trimmed).
- Font size: **Ctrl+wheel** or Ctrl+= / Ctrl+- (session-only zoom, with configured
  min/max bounds); "Set as Default" bakes it into config.

## Preview and rendering

- The right-hand pane shows a live preview (markdown-it + KaTeX math, footnotes,
  scroll sync both ways). **Ctrl+Shift+L** cycles editor / split / preview; the
  Split button top right does the same.
- Image paths in documents resolve relative to the file; a path containing a raw
  space needs `%20` or angle brackets (strict CommonMark).
- CSV/TSV tabs show a data grid instead (search, filters, sort, export).
- The **Rendered** tab runs your Quarto-style `{python}` cells: palette → "Render
  Document". The interpreter comes from `[render] python`, overridable per document
  with `wd-python:` in the YAML front matter. A Stale badge appears when the buffer
  has changed since the render.
- Python cell syntax and duplicate Quarto labels are checked automatically (~½ s
  after you stop typing) and appear as squiggles.
- A cell's last value is shown the way Jupyter would: HTML from its MIME bundle or
  `_repr_html_` (pandas tables, `greater_tables` `GT`, …), else an image from the
  bundle, else text. No wrapper needed.
- The working directory is **the document's own folder** — for every cell, including
  Ctrl+Enter — so `pd.read_csv("data.csv")` means what you expect.
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
characters, then browsing groups (checks & crosses, circles & dots, arrows, Greek,
operators, relations, set & logic, sub/superscripts, dashes & quotes).

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
- Issues and source: <https://github.com/mynl/writedown>.
