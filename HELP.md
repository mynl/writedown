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
- **Ctrl+Shift+Q** opens your quick file (`[files] quick_file` in config).
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

## Citations (BibTeX)

Point `[bibliography]` at your `.bib` file (it is watched, and never modified).
Then type **@** and a few letters for ranked autocomplete; **Ctrl+Shift+C** opens
the citation picker; hovering a key shows the title. "Extract refs" collects the
entries a document cites into a scratch `.bib`. Quarto cross-reference prefixes
(`@sec-`, `@fig-`, `@tbl-`, …) are left alone.

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

## View modes

**F11** full screen; **Shift+F11** distraction-free (sidebars hidden, layout
restored on exit); **Ctrl+K Ctrl+B** sidebar; **Ctrl+K Ctrl+O** outline. The
outline pane doubles as a click-to-jump table of contents.

## Configuration

Everything lives in `~/.writedown/config.toml` — palette → "Edit Config" opens it,
and saving applies live (fonts, colors, keymap, spelling, tools). Import a Sublime
Text color scheme for the editor theme. Remap editor keys under `[keys]`; palette →
"Keybindings: Write All Shortcuts to Scratch File" gives you the full current map
to paste from. App state under `~/.writedown/` is disposable — your documents are
never copied there.

Multiple Writedown windows are fine — sessions are kept per workspace, and the
files themselves are the single source of truth.

## More

- **About Writedown** (palette): version and components.
- Issues and source: <https://github.com/mynl/writedown>.
