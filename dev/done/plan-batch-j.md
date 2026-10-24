# Plan: Batch J, issues J.01 to J.22

Written 2026-10-24 from the review and the author's rulings recorded in `writedown-issues.md`
(the Batch J table, its `>>CC` rows and the author's `>>` responses, and the **Resolved
2026-10-24** notes under "Batch J: developer notes and implementation plans"). This plan stands
alone: no conversation context is needed to review or implement it. The version at writing is
2.25.0.

Batch J has twenty-two items. J.03, J.05 and J.08 need no work (one was withdrawn, two duplicate
other items), leaving nineteen, grouped into six version bumps. Versions are assigned at
execution, in the order below, one commit and one CHANGELOG section per bump, per house rules.

| Order | Label | Items | Area |
|--:|:--|:--|:--|
| 1 | [quick-fixes] | J.01, J.06, J.09, J.12, J.13, J.15, J.17, J.21, J.22 | frontend, one Rust regex, regenerated picker data |
| 2 | [windows-tabs-citations] | J.02, J.04, J.10, J.14, J.20 | Rust and frontend |
| 3 | [python-environments] | J.16, J.19 | runner, Rust, frontend |
| 4 | [version-history] | J.07 | Rust and frontend |
| 5 | [python-help] | J.18 | runner, Rust, frontend |
| 6 | [html-preview] | J.11 | frontend |

Rationale for the grouping: [quick-fixes] are small, independent and low risk.
[windows-tabs-citations] collects the small pieces of Rust plumbing. [python-environments]
changes how Python processes are chosen and kept, which [python-help] relies on, because a help
request goes to the active document's own process. [version-history] changes the backup store's
retention, so it reverts alone. [html-preview] adds the largest new interface and goes last.

Out of scope for this batch: the CSV grid renderer errors noted under J.xx (a separate item,
partly in the csv-viewer repository); the J.xx wedge hardening (it has not recurred); a Python
language server and Python completions (J.18, deferred); an "Open in Browser" verb (J.11,
declined); opening DjVu files directly in SumatraPDF (J.20, a later step).

Gates for every bump: `npm run build`; `cargo test` with the working directory `src-tauri/`
whenever Rust changes (never `--manifest-path` from the repo root, see CLAUDE.md);
`npx madge --circular --extensions ts,tsx src/main.tsx`; and, before a built exe is handed over,
the headless smoke-boot of `dist/` (serve it with `npx vite preview`, load it with
`msedge --headless=new --enable-logging=stderr --dump-dom <url>`, check for `Uncaught` and a
non-trivial DOM; Tauri-API TypeErrors are expected outside the webview). Look-and-feel work runs
in the `npm run tauri dev` HMR loop. Test data is synthetic only: inline strings in Rust tests,
and files committed under a new `fixtures/` folder where a file is needed.

---

## 1. [quick-fixes]

### [zap] J.01: Alt+Z, zap to character

**Current behavior.** Alt+Z is unbound: it is in neither `DEFAULT_KEYS` (`src/editor/keymap.ts`)
nor the app-level key handler in `src/App.tsx`.

**Change.** Emacs `zap-to-char` semantics (author ruling: "do the same as emacs").

- Alt+Z arms a one-shot capture and the status bar shows "Zap to: type a character (Esc
  cancels)". The next keydown whose `e.key` is a single character is the target, so shifted and
  AltGr characters work (`)` is Shift+0). Esc cancels. Any other key (arrows, Enter, Tab)
  cancels and is then processed normally. Blur cancels.
- For each cursor, search forward from its head across lines for the target and delete from the
  head through the match, the match included. A selection is ignored, as in Emacs: the search
  starts at the range's head and the range collapses. Cursors with no match are left alone; if
  no cursor finds a match, the status bar notes it and nothing changes.
- One transaction (`userEvent: "delete.zap"`), one undo step. Nothing goes to the clipboard,
  consistent with Ctrl+K Ctrl+K. No repeat count and no up-to variant.
- Implementation: `zapToChar` in `src/editor/textOps.ts` sets a module-level armed flag; a
  `Prec.highest(EditorView.domEventHandlers({ keydown, blur }))` extension, added to the editor's
  extension list beside `editingExtras`, consumes the next key while armed. Registry entry
  `zapToChar` ("Zap to character (Emacs M-z)", category Editing) and
  `{ key: "Alt+Z", action: "zapToChar" }` in `DEFAULT_KEYS`.

**Files.** `src/editor/textOps.ts`, `src/editor/commandRegistry.ts`, `src/editor/keymap.ts`,
`src/editor/Editor.tsx` (extension list), `HELP.md`.

**Acceptance.** In `alpha (beta) gamma`, caret before `alpha`: Alt+Z then `)` leaves ` gamma`,
and Ctrl+Z restores the line. Alt+Z then Esc changes nothing and clears the status. Alt+Z then a
character that does not occur changes nothing and shows a status note. Two cursors on two lines each delete
to their own next target. Alt+Z, a click elsewhere, then typing `)` inserts `)` normally.

### [definition-lists] J.06: Markdown definition lists

**Current behavior.** `Term` followed by `: definition` renders as a paragraph with a literal
colon. Alt+Q reflow would join the term and its definition into one line.

**Change.**

- Add `markdown-it-deflist` 4.0.0 (MIT, from the markdown-it organization) with one `.use()` in
  `src/preview/renderCore.ts` beside footnote and task lists. It is pure JavaScript, so it runs
  in `render.worker.ts` unchanged. Syntax is Pandoc's: a term on its own line, then definition
  lines starting with `:` or `~` and whitespace. Quarto's `:::` divs do not match, because the
  marker must be followed by whitespace. Add a type declaration the way the other plugins have
  one.
- Styling in `src/App.css`: `.preview dt` semi-bold; `.preview dd` indented about 1.5em with a
  small bottom margin. DOMPurify already allows `dl`, `dt` and `dd`.
- Reflow (`src/editor/reflow.ts`): `LIST_RE` gains the `:` and `~` markers, so a definition
  wraps with a hanging indent and never merges into a neighbor; a text line immediately followed
  by a `: ` line is a paragraph of its own, so the term is never joined to its definition.
- Editor highlighting is unchanged: the Lezer Markdown grammar has no definition lists, so the
  lines show as ordinary text.
- Regenerate `THIRD-PARTY-NOTICES.md` with `scripts/generate-notices.ps1`.

**Files.** `package.json`, `src/preview/renderCore.ts`, `src/App.css`, `src/editor/reflow.ts`,
`THIRD-PARTY-NOTICES.md`.

**Acceptance.** `Apple` / `: A fruit.` / blank / `Orange` / `: Another fruit.` renders as one
definition list with two pairs, in both Preview and Rendered. A `::: {.callout-note}` block is
unchanged. Alt+Q on a long definition wraps it under its own text and leaves the term line
alone.

### [tables] J.09: table formatter

**Current behavior.** `reformatTables` (`src/editor/tables.ts`) formats every table in the file
when there is no selection, or the tables a selection touches. Delimiter cells are padded with
spaces (`| --- |`). There is one style.

**Change.**

- (a) No selection: only the table containing the cursor's line. Outside a table:
  `showStatusMessage("not in a table")`, return true, no change. A selection keeps today's
  behavior.
- (b) Delimiter rows unpadded.
- (c) Two styles, toggled without stored state: if the table already equals its wide form,
  produce the narrow form; otherwise produce the wide form. Repeated presses go wide, narrow,
  wide.
  - Wide is today's alignment (each cell padded to the column width, one space inside each
    pipe). Each delimiter cell spans width plus 2 characters so the pipes line up:
    `|:-----|------:|:----:|------|`.
  - Narrow is one space each side and no padding (`| a | b |`), with every delimiter cell reset
    to two characters, as the author ruled: `|--|:--|--:|:-:|`. The author knows this discards
    Pandoc's dash-count column widths; narrow is for a table that has grown far too wide, after
    which the author sets widths by hand.
- The app-level Ctrl+Alt+Shift+T fallback in `src/App.tsx` (needed because WebView2 treats
  Ctrl+Alt as AltGr) ignores the command's result today; it must show the same status note. The
  palette verb follows the same rules.

**Files.** `src/editor/tables.ts`, `src/App.tsx`, `src/commands.ts` (verb title, if changed).

**Acceptance.** In a document with two tables, caret in the second: the key formats only the
second (wide); again gives narrow with `|--|` delimiters; again gives wide. Caret in prose: the
status note appears and the text is unchanged. Alignment colons survive both directions. Tables
inside fences are untouched.

### [error-strip] J.12: error strip squeezed to a sliver

**Current behavior.** `.error-bar` (`src/App.css`) has `overflow: auto; max-height: 8em` and the
default `flex: 0 1 auto`. In `.app`, a column flexbox, its sibling `.panes` has
`flex: 1 1 auto` with its content height as basis. A scroll container's automatic minimum height
is zero, so when the panes' content is tall both shrink in proportion to their basis and the
strip is reduced to a few pixels with its own scrollbar.

**Change.** `.error-bar { flex: 0 0 auto; }`.

**Acceptance.** In the HMR loop, expand a long tree so the panes' content is tall, then save a
config.toml with a syntax error: the strip shows the whole TOML error (message, source line,
caret) up to about six lines before it scrolls. The general error strip behaves the same.

### [project-switcher-order] J.13: Ctrl+Alt+P in recency order

**Current behavior.** The palette's "projects" mode (`src/Palette.tsx`) lists `mergedProjects()`:
managed projects by name, then recents from elsewhere. The footer dropdown (`projSwitch` in
`src/App.tsx`) already sorts by rank in `recentProjects`.

**Change.**

- Move the footer's sort into `projectsByRecency(state)` beside `mergedProjects` in
  `src/store.ts`, and use it in both places.
- In the palette only, move the current project (`projectFile`, compared with normalized
  separators and case, as `projSwitch` does) to the end. The previous project is then first and
  preselected, so Ctrl+Alt+P then Enter returns to it (author ruling: the last project must be
  easy to reach).
- With a typed query, fuzzy score orders the list and recency breaks ties, since the sort is
  stable over a recency-ordered input.

**Files.** `src/store.ts`, `src/Palette.tsx`, `src/App.tsx`.

**Acceptance.** Open projects A, then B, then C. In C, Ctrl+Alt+P lists B, A, the others, then C;
Enter opens B. Typing narrows the list, and equal scores keep recency order. The footer dropdown's
order is unchanged.

### [stale-mark] J.15: stale render mark and two wrong key hints

**Current behavior.** The status row above the Rendered view shows a small grey "Stale" badge
(`.stale-badge`) when the buffer differs from the rendered source. The empty-render placeholder
and the Rendered tab's tooltip both say "press Ctrl+B", which is Bold. Ctrl+Shift+B is bound to
`build` (the `[build]` command) in the editor keymap and to render in the app-level handler, and
only the file tree and text inputs reach the app-level binding, so from the tree it renders and
everywhere else it builds.

**Change.** No new bar (author ruling).

- A red square before "Rendered" in the tab label while the render is stale:
  `<span className="stale-mark" />`, an 8 px square with a red background and a 1 px radius,
  vertically centered, drawn in CSS rather than as an emoji so its size and color match in both
  themes. The tab's tooltip reads "Edited since this render: <render key> re-renders". The
  status row's badge turns red to match.
- Both "press Ctrl+B" hints show the live render key from `keyForAction(editorSettings?.keys)`
  (Ctrl+Shift+Enter by default).
- Ctrl+Shift+B means build everywhere: the app-level branch calls `runBuild()` instead of
  `renderActive()`, and its comment is updated.

**Files.** `src/App.tsx`, `src/App.css`.

**Acceptance.** Render a document, then type a character: the red square appears before
"Rendered" and the tooltip shows the right key; re-render and it disappears. Rebind `render` in
`[keys]`: both hints follow. Ctrl+Shift+B with the tree focused runs the build command, as it does
from the editor.

### [python-cell-wrap] J.17: wrapping a selection in a Python cell

**Current behavior.** `insertSnippet` (`src/editor/snippets.ts`) splices the selected text into
the template and hands the result to CodeMirror's `snippet()`. Verified in
`@codemirror/autocomplete`: `Snippet.parse` drops the backslash from `\{` and `\}` and turns
`${…}` or `#{…}` in the selection into fields; `Snippet.instantiate` prefixes every line after
the first with the indentation of the insertion line and converts leading tabs to indent units.
Nothing extends the selection to whole lines, so a selection starting mid-line puts the opening
fence mid-line, where it is not a fence.

**Change.** Author ruling: Python cells only, no generic "Code Block" insert, whole lines. With a
non-empty selection and a body containing `${SELECTION}`:

- if the body ends with a newline (a block template, as both built-ins are), extend the range to
  whole lines, from the start of the line containing `from` to the end of the line containing
  `to`; when `to` sits at column 0 of a later line, end at the previous line's end;
- split the body at `${SELECTION}`, strip the field markers (`${}`, `${n}`, `${n:…}`) from the
  two literal parts and remember the first marker's offset;
- dispatch one plain change, prefix plus the selected text verbatim plus suffix, without
  doubling a newline the range already ends with; put the cursor at the first marker's position
  if there was one, else after the block;
- an empty selection keeps today's snippet path.

Aligned Math benefits from the same code: `\{` in LaTeX survives.

**Files.** `src/editor/snippets.ts`.

**Acceptance.** Select from the middle of one line through a later, tab-indented line containing
`re.compile(r"\{a\}")`, then run "Insert: Python Code Cell": the opening fence sits on its own
line above the first selected line, the closing fence on its own line after the last, and the
text between is byte-identical, backslashes and tabs included. One Ctrl+Z restores it. With an
empty selection the behavior is unchanged, and Tab walks the field.

### [colored-unicode] J.21: colored characters in the Unicode picker

**Current behavior.** `scripts/gen-symbols.py` sweeps a fixed list of blocks with no emoji block
in it, plus ten hand-picked emoji; the D.12 scope was "the picker is for symbols, not for
browsing all of emoji". Characters such as ⚠ ❤ ✔ ☑ ☀ are text-style by default and insert in
that form.

**Change.** Author ruling: add all seven blocks.

- Add to `BLOCKS`: U+2B00 to U+2BFF, U+1F300 to U+1F5FF, U+1F600 to U+1F64F, U+1F680 to
  U+1F6FF, U+1F780 to U+1F7FF, U+1F900 to U+1F9FF, and U+1FA70 to U+1FAFF; 1,692 named
  characters under Unicode 16.0. Drop the `EXTRA` emoji these blocks now cover, keeping their
  aliases.
- Colored twins: copy the ranges of characters with Emoji=Yes and Emoji_Presentation=No from
  Unicode 16.0's `emoji-data.txt` into the generator, as the Emoji_Presentation ranges already
  are (`unicodedata` exposes neither), excluding ASCII (digits, `#`, `*`). For each such
  character in the table, emit a second row: the character followed by U+FE0F (VARIATION
  SELECTOR-16), named "<name> (color)", with the same LaTeX names, the aliases plus
  "color emoji", and the emoji flag set.
- A "Colors" kit first in `KITS`: 🟥🟧🟨🟩🟦🟪🟫⬛⬜, 🔴🟠🟡🟢🔵🟣🟤⚫⚪, and the hearts (the
  color twin of ❤, then 🧡💛💚💙💜🤎🖤🤍).
- Aliases for odd names as found; at least ❤ (Unicode "heavy black heart") gains
  "heart red love".
- `src/editor/symbols.ts` and the picker must handle an entry of two code points: the code-point
  label shows both (`U+26A0 U+FE0F`), and use counting keys by the full string.
- Regenerate. DOOB has no `python` on PATH; run
  `uv run --no-project python scripts/gen-symbols.py`, whose `unicodedata` is Unicode 16.0,
  matching the current table.

**Files.** `scripts/gen-symbols.py`, `src/editor/symbolData.ts` (generated),
`src/editor/symbols.ts`, `src/Palette.tsx` (label, if needed).

**Acceptance.** Ctrl+Shift+U, type "red square": 🟥 appears in color, and Enter inserts U+1F7E5.
Type "warning": both ⚠ and "warning sign (color)" appear, and the color row inserts U+26A0 U+FE0F,
shown in color in the editor. An empty query shows "Colors" first. Time the picker's first open
and a keystroke's filtering in the HMR loop and record the figures in the execution log; neither
should be visibly slower. The generated file's header shows the new count.

### [ampersand-keys] J.22: citation keys containing `&`

**Current behavior.** Citation-key patterns allow letters, digits and `_ : . -` inside a key, so
`@S&P2019` matches as `@S`, which is not in the bibliography, and the not-found check flags it.
Five keys in the author's .bib contain `&`. The .bib parser itself is fine.

**Change.** Author ruling: `&` only, not Pandoc's full punctuation set. Add `&` to the internal
character class in all four copies of the pattern; a key must still end on a letter or digit.

- `CITE_RE` in `src/editor/citePatterns.ts` (not-found check, hover card, spelling exclusion,
  "Extract Citations to .bib").
- `cite_re()` in `src-tauri/src/render.rs` (the citation pass in Render).
- The `@` completion's `matchBefore` pattern and the Tab re-trigger pattern in
  `src/editor/citations.ts`.

Update the comments beside each. Add `render.rs` tests with a synthetic `S&P2019` entry in the
test bibliography: `@S&P2019` links to `#ref-S&P2019`; `Smith & Jones` stays unchanged;
`see @AT&T2001.` leaves the period outside the key.

**Files.** `src/editor/citePatterns.ts`, `src/editor/citations.ts`, `src-tauri/src/render.rs`.

**Acceptance.** A document citing a real `&` key from the configured .bib shows no not-found
mark; the hover card shows the entry; typing `@S&` keeps the completion open; Render links the
citation, and the link jumps to its reference entry.

---

## 2. [windows-tabs-citations]

### [new-window] J.02: Ctrl+Alt+Shift+N opens a new window

**Current behavior.** No such command. A bare launch opens a new window that restores the last
workspace (`hydrate()` in `src/store.ts`), which is usually the project of the window the user is
in.

**Change.** Author ruling: a blank window with the project switcher open.

- `src-tauri/src/lib.rs`: `parse_args` recognizes `--blank`, carried in `Cli::Open` alongside the
  paths; a managed take-once flag and a `launch_blank()` command, in the pattern of
  `launch_files`; `HELP_TEXT` documents the flag; a unit test covers the parsing.
- A `new_window()` command spawns `std::env::current_exe()` with `--blank`, detached, and
  surfaces a spawn failure. Routing never intercepts it: a launch without file arguments always
  opens a new window (I.07 rule 4).
- `hydrate()`: when `launchBlank()` is true, skip the workspace restore and call
  `openPalette("projects")`.
- `src/App.tsx` keydown: `e.ctrlKey && e.altKey && e.shiftKey && e.code === "KeyN"` calls
  `newWindow()`. `e.code`, because WebView2 treats Ctrl+Alt as AltGr (the Ctrl+Alt+Shift+T
  precedent); the Ctrl+Shift+N branch already requires `!e.altKey`.
- Palette verb "Window: New Window".
- Known and accepted: the window-state plugin restores the last saved geometry, so the new
  window may sit exactly over the current one, as with the Start menu.

**Files.** `src-tauri/src/lib.rs`, `src/api.ts`, `src/store.ts`, `src/App.tsx`, `src/commands.ts`,
`HELP.md`.

**Acceptance.** Ctrl+Alt+Shift+N opens a second window with no project and the switcher open; Esc
leaves it empty, Enter opens the chosen project. The original window is unaffected.
`writedown --blank` from a shell behaves the same.

### [pointer-flag] J.04: pointer lost over the Save As dialog

**Current behavior.** WebView2 runtime 152 and later support Windows' "Hide pointer while
typing", and the pointer can stay hidden over a dialog opened straight after typing
([WebView2Feedback #5687](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5687),
reopened 2026-10-19). DOOB runs 155.0.4283.62. The author confirmed the diagnosis by turning the
setting off; the setting is on by default in Windows, so other machines meet the bug.

**Change.** In `src-tauri/tauri.conf.json`, under `app.windows[0]`:

```json
"additionalBrowserArgs": "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,HideCursorWhileTyping"
```

Setting the field replaces wry's defaults (`wry-0.55.1/src/webview2/mod.rs:294-297`), so the three
defaults are restated, and Chromium honors only the last `--disable-features` switch, so all four
share one list. JSON allows no comments, so the reason goes in the CHANGELOG and in a comment
beside the builder in `src-tauri/src/lib.rs`. Cost: the pointer no longer hides while typing in
the editor. Remove the feature name once Microsoft ships a fix.

Gotcha, stated in the CHANGELOG: every instance shares one WebView2 data folder, and WebView2
refuses a second environment with different arguments, so close every Writedown window, dev and
release, before the first launch of the new build.

**Files.** `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs` (comment).

**Acceptance.** With "Hide pointer while typing" turned on: type in an Untitled buffer, press
Ctrl+S, and the pointer is visible over the Save As dialog. The author can then turn the Windows
setting back on.

### [update-check] J.10: Check for Updates

**Current behavior.** None.

**Change.** Author ruling: an explicit check that opens the release page; no download, no
install.

- New `src-tauri/src/update.rs` with `check_for_update()`, `#[tauri::command(async)]`, the
  application's single egress point. The URL is a constant,
  `https://api.github.com/repos/mynl/writedown/releases/latest` (the repository is public; latest
  release v2.25.0 on 2026-10-24). It runs
  `curl.exe -s -m 10 -H "Accept: application/vnd.github+json" <URL>` with `CREATE_NO_WINDOW`
  (curl ships with Windows 10 and later; the git and ripgrep shell-out pattern, no new crate),
  parses `tag_name` and `html_url` with serde_json, and compares the tag, less a leading `v`,
  with `env!("CARGO_PKG_VERSION")` as SemVer. It returns current, latest, whether latest is
  newer, and the URL. No request body, no cookies, no other host.
- Tests: the constant URL's scheme is https and its host exactly `api.github.com`; the version
  comparison orders 2.9.0 before 2.10.0.
- Palette verb "Help: Check for Updates": "up to date (X)", or "this build (X) is newer than the
  latest release (Y)" (the usual case on DOOB), or "Y is available: opening the release page",
  after which `openUrl` opens it. A failure (offline, curl missing) goes to the error strip with
  its reason. Never automatic, never at startup.

**Files.** `src-tauri/src/update.rs` (new), `src-tauri/src/lib.rs`, `src/api.ts`,
`src/commands.ts`, `HELP.md`.

**Acceptance.** On DOOB the "newer than the latest release" message. With the network off, a
clear error. `cargo test` passes both tests.

### [closed-tabs] J.14: Reopen Closed Tab picker, persisted

**Current behavior.** `closedStack` (`src/store.ts`) is filled by `closeTab` and `closeAllTabs`
(preview tabs and scratch buffers excluded), popped by Ctrl+Shift+T, emptied when a project or
folder opens, and not saved in the session, so a restart empties it.

**Change.**

- A palette mode "closed" (added to `PaletteMode`): `closedStack` newest first, deduplicated,
  minus files already open, each row showing name and folder like the quick-files rows. Enter
  opens the file and removes it from the stack; a file that no longer exists is removed with a
  status note.
- Registry action `reopenClosedPicker` ("Reopen closed tab…", category "Tabs & palette") and the
  palette verb "Reopen Closed Tab…". No default key; Ctrl+Shift+T keeps its one-step job.
- Persistence: `closed_tabs: Vec<String>` with `#[serde(default)]` in the Rust `Session`
  (`src-tauri/src/session.rs`) and `closed_tabs?: string[]` in the TypeScript `Session`;
  `sessionSnapshot` writes the newest 25; `sessionFingerprint` includes them so a close triggers
  the debounced save; `restoreSession` sets `closedStack` from them, which follows the reset to
  empty that opening a project performs.

**Files.** `src/store.ts`, `src/Palette.tsx`, `src/api.ts`, `src-tauri/src/session.rs`,
`src/editor/commandRegistry.ts`, `src/commands.ts`.

**Acceptance.** Close three tabs: "Reopen Closed Tab…" lists them newest first, and Enter reopens
the chosen one, which leaves the list. Restart Writedown: the others are still listed and
Ctrl+Shift+T reopens the newest. Each project keeps its own list.

### [citation-document] J.20: open a citation's document

**Current behavior.** The hover card (`citeHover` in `src/editor/citations.ts`) describes the
entry. The editor has no context menu of its own (WebView2's default appears). The capability
file already grants `opener:allow-open-url`.

**Change.** Author rulings: the URL template goes in config; "open bibtex doc" means open the
reference's PDF or DjVu file. Archivum's `/view/<tag>` route
(`V:\dev\archivum\src\archivum\web\routes\documents.py`) already does exactly that: it opens a
PDF in archivum's PDF.js reader, sends any other format as the raw file, and records a read. So
the menu item, the palette verb and the hover link are one action.

- Config `[bibliography] viewer_url`, a template whose `{key}` is replaced by the
  `encodeURIComponent`-encoded key; added to `EditorSettings` (`src-tauri/src/config.rs` and
  `src/api.ts`) and to the commented config template as
  `# viewer_url = "http://127.0.0.1:9124/view/{key}"`. The author settles whether the `@`
  belongs in the URL by trying one key in a browser. Unset: no menu item, no link, and the verb
  gives a status note stating the setting to add.
- `citeKeyAt(state, pos)` in `citations.ts`, factored out of `citeHover` and shared by all three
  entry points; Quarto crossrefs (`CROSSREF_PREFIX`) are excluded.
- Editor `contextmenu` handler: over a key, prevent the default and show a small menu at the
  pointer with "Open Document for @key" and "Copy @key"; anywhere else, the default menu. The
  file tree's menu markup and backdrop (`openTreeMenu` in `src/tree/FileTree.tsx`) move into a
  shared `src/ContextMenu.tsx` used by both.
- Palette verb "Citation: Open Document (PDF/DjVu)", for the key at the caret.
- Hover card: an "Open ↗" link at its foot when `viewer_url` is set; clicking it opens the page
  and closes the card.
- Writedown makes no request itself: `openUrl` hands the URL to the default browser.
- Known limit, stated in the CHANGELOG: browsers cannot display DjVu, so a DjVu document arrives
  as a download.

**Files.** `src/editor/citations.ts`, `src/editor/Editor.tsx`, `src/ContextMenu.tsx` (new),
`src/tree/FileTree.tsx`, `src/commands.ts`, `src-tauri/src/config.rs`, `src/api.ts`, `HELP.md`.

**Acceptance.** With `viewer_url` set: right-click a citation key, choose the menu item, and the
archivum reader opens on that reference in the browser. Right-click on prose shows the normal
menu. The palette verb with the caret in a key does the same; the hover card's link does the
same. A `@fig-x` crossref offers no menu item. With `viewer_url` unset the verb reports what to
set. The tree's context menu behaves exactly as before.

---

## 3. [python-environments]

### [warnings] J.16: Python warning modes

**Current behavior.** `src-tauri/runner.py` never touches `warnings`, so Python's stock filters
apply: each warning once per message, category and line, recorded in the registry of the module
the warning is attributed to. For library code that module survives in `sys.modules`, so such a
warning appears on the first render and not again until the Python process restarts.

**Change.** Author ruling: as proposed.

- Three modes: first (Python's `"once"`, the default), all (`"always"`), off (`"ignore"`).
- Config `[render] warnings = "first"`, read in `render_cfg` and validated like
  `traceback_mode`, with a comment in the config template. Front matter `wd-warnings:` as a new
  `FrontMatter` field, with a render warning on an unknown value, like `wd-traceback:`.
- Palette verbs "Python Warnings: First of Each Kind", "Python Warnings: All", "Python Warnings:
  Off", and "Python Warnings: Use Document or Config Setting", which clears the override.
  Separate verbs, never one toggle. A store field `warningsOverride` is passed as an optional
  `warnings` argument to `render_document` and `run_cell`. Precedence: palette override, then
  front matter, then config. A status note confirms each change.
- `CellReq` gains `warnings`. Runner: at startup snapshot `STOCK = list(warnings.filters)`; on
  `reset`, and whenever the mode differs from the previous request's, set
  `warnings.filters[:] = STOCK` and then `warnings.simplefilter(action, append=True)`. Appending
  keeps the stock category policy ahead of the mode, so "all" does not surface library
  DeprecationWarnings; `simplefilter` bumps the filter version, which invalidates every
  `__warningregistry__`, so each render starts clean. A cell's own `warnings.filterwarnings(...)`
  lasts for that render only.

**Files.** `src-tauri/runner.py`, `src-tauri/src/render.rs`, `src-tauri/src/config.rs`,
`src/store.ts`, `src/api.ts`, `src/commands.ts`, `HELP.md`.

**Acceptance.** A cell `import warnings; [warnings.warn("w") for _ in range(3)]` shows one warning
in "first", three in "all", none in "off". A synthetic `helper.py` beside the document defining
`def f(): warnings.warn("lib")`, called from a cell, shows its warning on every render in
"first", not only the first render. `wd-warnings: alls` produces a render warning listing the
valid values. `cargo test` covers the front-matter parse.

### [venvs-and-kernel-pool] J.19: per-folder virtual environments, kept warm

**Current behavior.** The interpreter is `[render] python`, replaced by front-matter `wd-python`
(absolute paths only). `RenderState` holds one kernel per window and replaces it whenever the
interpreter changes, which wipes its namespace.

**Change.** Author rulings: as proposed; keep processes warm and swap.

- `resolve_python(doc_dir, front_matter, cfg)` in `src-tauri/src/render.rs`, returning the path
  and its source. Order: `wd-python`; then the nearest venv, walking from the document's folder
  up to the drive root and testing `.venv\Scripts\python.exe`, then `venv\Scripts\python.exe` at
  each level (`bin/python` on other platforms, compile-gated); then `[render] python`.
  `[render] auto_venv = true` by default; false skips the venv step. A scratch buffer, which has
  no folder, uses the configured interpreter. Used by both the full render and Run This Cell.
- Kernel pool: `kernel: Mutex<Option<Kernel>>` becomes `kernels: Mutex<Vec<Kernel>>`, most
  recently used first, capped by `[render] max_kernels` (default 3, minimum 1). Take the kernel
  whose `python_path` matches or spawn one; when full, drop the least recently used, which kills
  it. A kernel that times out or dies is removed alone. `max_kernels = 1` reproduces today's
  behavior. Each kernel records its Python version from the runner's ready line.
- `restart_kernel` gains an optional path: the palette's restart verb restarts the active
  document's kernel; with no path, all of them.
- Palette verb "Python: Which Python", backed by a `which_python(path)` command using the same
  resolver: a status message with the interpreter, the reason it was chosen (venv found in
  `<folder>`, `[render] python`, or `wd-python`), its version if running or "not started", and
  the number of kernels alive.
- Config template comments for `auto_venv` and `max_kernels`.
- Accepted with eyes open: each idle kernel holds memory (a few hundred MB with pandas and
  matplotlib imported), in each window; and a document that relied on the global interpreter's
  packages fails once its folder has a venv without them.

**Files.** `src-tauri/src/render.rs`, `src-tauri/src/config.rs`, `src-tauri/src/lib.rs`,
`src/api.ts`, `src/commands.ts`, `HELP.md`.

**Acceptance.** `cargo test` for `resolve_python` over a temporary folder tree (venv in the
document's folder, in a parent, none; `wd-python` overriding a venv; `auto_venv = false`). By
hand, with synthetic folders A (with a venv made by `uv venv`) and B (without): a cell printing
`sys.executable` shows A's venv for a document in A and the configured interpreter for one in B;
"Which Python" reports each with its reason; alternating renders of A and B start without a
respawn after the first of each, and Run This Cell in A still has a variable from A's last
render after a render in B.

---

## 4. [version-history]

### J.07: tiered version history, stats, prune, line history

**Current behavior.** `src-tauri/src/backup.rs` keeps the newest 20 versions of each file
(`KEEP`) and deletes the rest at every save. `list_backups` reads every version in full to build
a 120-character preview. The diff pane compares the live buffer with one static base.
`src-tauri/src/git.rs` runs only `status`, `show` of the index version, and `rev-parse`, all with
stdin closed.

**Change**, in four parts.

**[tiered-retention].** A pure function `retained(stamps, now)` decides what `prune` keeps: the
newest 20 whatever their age; beyond those, the newest version in each hour for ages under 24
hours, each day under 30 days, each week under 365 days, and each calendar month beyond. Buckets
are computed from the UTC millisecond stamps. It applies to every file, git-tracked or not
(author ruling). `list_backups` reads only the first 4 KB of each version for its preview.

**[stats-and-prune].**

- `backup_stats(roots)`: walk the project's files with the same walk `list_all_files` uses, map
  each path to its history folder with `key_for`, and sum versions, bytes and the oldest stamp;
  then total the whole store. Palette "Version History: Stats" shows a status message such as
  "This project: 143 files with history, 2,870 versions, 212 MB, oldest 2026-07-06. Whole store:
  237 files, 31 MB." A deleted or renamed file's history belongs to no project and counts only
  in the whole-store figures.
- `backup_prune_project(roots, dry_run)`: delete every version beyond the newest 20 of each of
  the project's files. Palette "Version History: Prune This Project…" runs it dry first, then
  asks through the existing `confirm` dialog ("Delete N older versions (S MB) for this project?
  The newest 20 of each file are kept."), then runs it and reports. It never touches the newest
  20.

**[line-history].** Palette verb "Diff: When Did This Line Change", for the caret's line.

1. Unsaved: if the line differs from the file on disk, report "changed since the last save" and
   open the diff against the saved file.
2. Git, when the file is tracked: `git blame -L n,n --porcelain --contents - -- <path>` with the
   buffer on stdin, through a new read-only helper `run_git_stdin` beside `run_git`. A committed
   line gives the commit, author time, summary, original line number and filename (which
   follows renames). Open a pair diff of that commit for this file, base
   `git show <rev>^:<filename>` (empty for a root commit) and other `git show <rev>:<filename>`,
   scrolled to the original line, with the status "line last changed in <short hash> on <date>:
   <summary>". "Not Committed Yet" falls through to step 3.
3. Saved versions: V0 is the file on disk, V1 onward the backups, newest first, fetched in one
   batched call. For k = 1, 2, …, diff V(k-1) against Vk with `diff` from `@codemirror/merge`
   (character offsets). If any change overlaps line L's span in V(k-1), stop; otherwise map L
   through the unchanged stretches into Vk's numbering and continue. Found: a pair diff of Vk
   against V(k-1), scrolled to the line, with the status "line changed in the save at <time>",
   or "between <time> and <time>" where thinning left a gap. Not found: "unchanged across the
   saved history (since <oldest stamp>)". An untracked file, or no git, uses steps 1 and 3 only.
4. Diff pane pair mode: `diffAgainst` gains `other`, `label` and `line`. With `other` set, the
   pane shows that static text against `base` instead of the live buffer, the header reads
   "Diff: <label>", and the view scrolls `line` to the center once mounted. Closing is
   unchanged.

**Files.** `src-tauri/src/backup.rs`, `src-tauri/src/git.rs`, `src-tauri/src/lib.rs`,
`src/api.ts`, `src/store.ts`, `src/preview/DiffPane.tsx`, `src/lineHistory.ts` (new),
`src/commands.ts`, `HELP.md`.

**Acceptance.**

- `cargo test`: `retained` over synthetic stamps (for example 2,000 stamps spread over 400 days)
  keeps the newest 20 plus at most one per bucket, always keeps the newest, and gives identical
  output for identical input.
- "Version History: Stats" reports plausible figures for a project. "Prune This Project…" shows
  the dry-run figures in its confirmation, deletes only beyond the newest 20, and Stats
  afterwards reflects it.
- In a git repository, on a line last changed in an earlier commit, the status shows that commit
  and the pane shows its change at the line. Edit a line and save twice: the command reports the
  right save and shows that save's change. An untracked file uses saved versions only. An unsaved
  edit on the line reports "changed since the last save".
- Opening Previous Versions on a large file with many versions stays quick.

---

## 5. [python-help]

### J.18: Help tab for the name at the caret

**Current behavior.** None. The author's habit is `print(help(x))` in a cell.

**Change.** Author ruling: help first; completions and a language server wait.

- Runner: a request may carry `op`; without it, a cell runs exactly as today. `op: "help"` with
  `code`, `line` and `col` (1-based within `code`): find the dotted name at the caret and resolve
  it in the namespace with `inspect.getattr_static` at each step, so no property or descriptor
  runs. Found: the text `help()` would print, `pydoc.render_doc(obj, renderer=pydoc.plaintext)`,
  with `inspect.signature` on the first line where available. Not in the namespace: if `jedi`
  imports, `jedi.Interpreter(code, [ns])` signatures and docstrings; otherwise "'name' is not
  defined: render first". The reply contains the text, the name and its source (namespace, jedi,
  none). Cell code is never executed; output is capped at 200 KB with a truncation note.
- `code` is every `{python}` cell up to and including the caret's cell, joined, for a Markdown or
  Quarto document, so names defined in earlier cells resolve; for a `.py` file it is the whole
  buffer.
- Rust: a generic `Kernel::request` and a `python_help(path, code, line, col)` command that
  resolves the document's interpreter with J.19's resolver and asks that kernel. It uses
  `try_lock` and returns "busy (rendering)" rather than waiting behind a render. No kernel for
  that interpreter yet: start one; its empty namespace leaves jedi or "render first". Timeout
  5 seconds.
- Front end: `previewTab` gains "help"; a "Help" tab in the preview tab bar while the active
  document has help content, with a close ×; content in a scrollable monospace pane under the
  header "Help: <name> (<source>)". Help content is stored per document path, never in
  the session. Registry action `pythonHelp` on Ctrl+K Ctrl+H (free) and the palette verb
  "Python: Help on Name at Caret". For a `.py` file, which has no preview pane, the pane appears
  for Help the way it does for a diff. Outside Python code: status "help: the caret is not in
  Python code". Esc in the pane closes it, like the diff.

**Files.** `src-tauri/runner.py`, `src-tauri/src/render.rs`, `src-tauri/src/lib.rs`,
`src/api.ts`, `src/store.ts`, `src/App.tsx`, `src/App.css`, `src/preview/HelpPane.tsx` (new),
`src/editor/commandRegistry.ts`, `src/editor/keymap.ts`, `src/commands.ts`, `HELP.md`.

**Acceptance.** In a rendered `.qmd` that builds a pandas DataFrame `df`: caret on `df.groupby`,
Ctrl+K Ctrl+H opens the Help tab with the same text `print(help(df.groupby))` gives in a cell,
signature first. A synthetic class whose property prints to stdout: help on that property shows
its docstring and prints nothing. Before any render, with jedi installed, `np.linspace` resolves
through jedi; without jedi, "render first". During a long render: "busy". In a `.py` file help
works on the buffer.

---

## 6. [html-preview]

### J.11: HTML outline and sealed preview

**Current behavior.** A `.html` file opens as text with HTML highlighting and no preview
(`previewable` covers Markdown and CSV only) and no outline.

**Change.** Author ruling: the sealed preview and the outline, KISS to start; no "Open in Browser"
verb.

Scope, stated plainly for the record. It will show hand-written pages, greater_tables output and
saved pages with local CSS and images faithfully; refresh about half a second after typing stops;
outline the h1 to h6 headings; and open links in the default browser. It will not run JavaScript
(MathJax math stays raw TeX, a Quarto tabset shows only its first tab, plotly figures and widgets
are blank), load anything from the web, or sync scrolling line by line. Very large
self-contained Quarto files remain slow in the editor; that is a known limit, not handled in v1.

- Outline: `parseOutline` (`src/outline/parse.ts`) gains `html` and `htm`, a per-line scan for
  `<h1>` to `<h6>` elements that open and close on one line, skipping `<script>` and `<style>`
  blocks and comments; inner tags stripped and the common entities decoded; level from the tag,
  line from the source. Above 2 MB of source, no outline and one status note.
- Preview: new `src/preview/HtmlPreview.tsx`, an
  `<iframe sandbox="allow-same-origin" srcDoc={…}>`. Without `allow-scripts` nothing in the page
  runs; `allow-same-origin`, harmless with scripts off, gives our code access to the frame
  document for scrolling, link routing and heading lookup. Before the source goes in, insert
  right after `<head>` (or at the top when there is none) a `<base href>` set to the
  asset-protocol URL of the file's folder, so relative CSS and images load from disk, and a
  `<meta http-equiv="Content-Security-Policy">` with `default-src 'none'` and `img-src`,
  `style-src`, `font-src` and `media-src` limited to the asset origin, `data:` and inline styles,
  so nothing reaches the network. Remove every `<meta http-equiv="refresh">`.
- Refresh debounced at 500 ms; keep the frame's scroll position across the reload.
- On each frame load, a click listener on the frame document: http, https and mailto links open
  with `openUrl`; `#fragment` links scroll within the frame; everything else is blocked.
- Outline click: the editor jumps to the line as for any outline, and the frame scrolls to the
  matching heading, the k-th heading in the source being the k-th `h1` to `h6` element in the
  frame.
- `previewable` includes HTML; the preview tab bar shows a single "Preview" tab for it.

**Files.** `src/preview/HtmlPreview.tsx` (new), `src/App.tsx`, `src/App.css`,
`src/outline/parse.ts`, `src/outline/Outline.tsx`, `src/editor/languages.ts` (an `isHtmlDoc`
helper), `fixtures/html/` (new, synthetic), `HELP.md`, and `README.md` if its feature list
names the previewable types.

**Acceptance.** A synthetic page under `fixtures/html/` with a local `style.css`, a local image,
an external CDN stylesheet, `<script>alert(1)</script>`, a `<meta http-equiv="refresh">`, h1 to
h3 headings and some links: the preview shows the local styling and image; no alert, no
navigation, and no network request (checked in the dev tools Network panel under
`npm run tauri dev`); the outline lists the headings at the right lines, and a click moves both
the editor and the preview; an external link opens the default browser; typing refreshes the
preview within about half a second and keeps its scroll position.

---

## Order of work and discipline

Build in the order above. Each bump is one commit, subject `X.Y.Z <what changed>` with the
trailer, pushed as it lands, with its CHANGELOG section written at the bump. This plan moves to
`dev/done/` in the commit that lands the first bump and collects its execution log there.
Wherever Rust changes, run `cargo test` from `src-tauri/`, rebuild, and smoke-boot before
handover. The author kicks the tires after each bump; tweaks are ordinary further work. Release
notes for [windows-tabs-citations] must tell the author to close every Writedown window before
first launching that build (J.04).

---

## Execution log

Started 2026-10-24 against 2.25.0 (`d4b4bac`). Versions as assigned: [quick-fixes] 2.26.0, [windows-tabs-citations] 2.27.0, [python-environments] 2.28.0, [version-history] 2.29.0.

### Review, 2026-10-24

Ruled and ready: every Batch J question carries a dated ruling in `writedown-issues.md`. Baseline gates green before any edit: `npm run build`, `cargo test` (68 passed, 8 ignored), `npx madge --circular` (none). Plan claims the code contradicts, none of which a ruling rests on, so each is a divergence rather than a question:

- J.04: there is no window or webview builder in code (the window comes from `tauri.conf.json`); the comment goes beside `tauri::Builder::default()` in `lib.rs`.
- J.10: README.md says "It makes no network requests" and "never calls out"; both need a qualifier for the explicit check, so README.md joins J.10's files.
- J.14: `closeTab` excludes scratch buffers only; preview tabs ARE pushed onto `closedStack` (only `closeAllTabs` skips them). Left as it is. `openFolder` does not reset the stack.
- J.20: `openTreeMenu` is a store action and the menu markup is `TreeContextMenu` in `FileTree.tsx`, mounted in `App.tsx`; the shared component is extracted from that.
- J.16, J.19: `render_cfg` lives in `render.rs`, not `config.rs`. The config template is written only on first launch, so existing users see new keys through HELP.md, as for every key before.
- J.19: `render_impl` reports "not configured" on an empty `[render] python` before the document folder is known; venv resolution must come first.
- J.07: `list_backups` and `read_backup` are synchronous commands; the batched read is a new command. `DiffPane` takes no props (the store drives it).
- J.18: the runner is single-threaded; on a help timeout the kernel is kept (see that phase).
- J.11: `convertFileSrc` encodes the whole path into one segment, so the `<base href>` is built by hand; `.htm` is not in the tree's extension list.
- Release exe: four `target\release\writedown.exe` windows are running and lock the file, so `npm run tauri build` is left to the author (who must close every window before the J.04 build anyway). Gates per bump as in Batch I: `npm run build`, `cargo test`, `madge`, smoke-boot of `dist/`.

### [quick-fixes] 2.26.0

All nine items landed. Verification beyond the gates: a scratch harness (not committed; there is no frontend test runner) bundles the real modules with esbuild, stubs `store.ts`, and runs 33 acceptance checks in headless Edge on a real CodeMirror view, including the zap keystrokes, the three table presses, the wrap byte comparison and undo, the definition-list render, and the picker searches. All pass. The smoke-boot also loads `dist/` with a stubbed Tauri bridge, which renders the whole layout (status bar included) with no crash page; the plain page stops at the expected `metadata` TypeError.

Divergences:

- **[colored-unicode] exact Emoji_Presentation ranges.** The generator listed U+1F004 to U+1FAFF as one range, harmless with ten emoji; the swept blocks also hold text-default emoji (🌡 U+1F321) and non-emoji characters, which would have been drawn with the color font. The exact ranges from Unicode 16.0's `emoji-data.txt` replace it (the ranges below U+1F000 were already exact).
- **[colored-unicode] kits are arrays.** `SYMBOL_KITS` was one string per kit, split into code points on load; a color twin is two code points, so each kit is now an array of `char` strings.
- **[colored-unicode] timing measured in headless Edge**, the same engine as WebView2, rather than in the HMR loop: first load and parse 4.0 ms; a search over the full 4,191 rows 0.1 to 1.6 ms per keystroke. 188 color twins.
- **[definition-lists] the term line is special, like a heading**, rather than "a paragraph of its own": a long term wrapped onto two lines is no longer a term. A term is a one-line paragraph (blank line, construct or top above it, Pandoc's rule) directly above a `: ` or `~ ` line, so a definition's lazy continuation line followed by a second definition stays prose.
- **[tables] the command posts "not in a table" itself**, so the palette verb and the App-level fallback report alike and the fallback needed only a comment. The minimum column width of 3 stays. Labels now name the toggle: registry "Reformat table at caret (wide; again for narrow)", palette "Reformat Markdown Table (wide, again for narrow)".
- **[python-cell-wrap] a field's placeholder text is kept** (`${1:x}` inserts `x`), as `Snippet.parse` does, rather than stripped; the caret goes to the first field. Fields after the first are inert in a wrap.
- **[ampersand-keys] Render escapes the key in HTML** it writes: the reference entry's `id` and the not-found span carry `&amp;`. The browser decodes the attribute, so the id still equals the `#ref-S&P2019` fragment (the preview's anchor jump uses `CSS.escape`).
- **[stale-mark] one color for both themes**, `--stale-red: #d93a3a` on `:root`. The Rendered tab's tooltip also shows the live key before the first render.
- **[project-switcher-order]** `projectsByRecency` normalizes paths with the store's `normPath` (trailing slash stripped too); the footer keeps its `recentProjects` subscription so it re-renders when the list loads.
- Left for the author to see in the running app: the error strip with a long TOML error (J.12), the red square and badge (J.15), the switcher in daily use (J.13), the `&` keys against the real .bib, hover card and `@` completion (J.22), and colored glyphs in the editor (J.21).

### [windows-tabs-citations] 2.27.0

All five items landed. Gates: `npm run build`, `cargo test` (74 passed, 8 ignored; the two update tests and the `--blank` parse test are new), `madge` (none), smoke-boot as before. A harness pass checks `citeKeyAt` (an `&` key, its span, a crossref, prose) and the URL template's encoding (`S&P2019` → `S%26P2019`); the GitHub reply's shape was checked with the same curl command (tag v2.25.0, a github.com `html_url`).

Divergences:

- **[new-window]** `Cli::Open` became `{ paths, blank }`; `--blank` applies only to a launch with no paths, so `--blank a.md` is an ordinary file launch. The spawned child gets null stdio and is not waited on.
- **[pointer-flag]** the comment sits beside `tauri::Builder::default()` (see the review note); the JSON line is exactly the plan's.
- **[update-check]** curl also gets `-S -f --proto =https`: an HTTP error such as GitHub's rate limit fails with its reason instead of being parsed as JSON, and only https is allowed. The command returns `latest_is` ("newer", "same", "older") rather than a bare "is newer" flag, so the three messages need no string compare in the frontend. An `html_url` not on https github.com falls back to the releases page. README.md's two no-network sentences now name the verb.
- **[closed-tabs]** the persisted list is each path once (its latest close wins), newest last, capped at 25 (`recentClosed`); the fingerprint carries the stack's tail. Preview tabs still enter the stack through `closeTab`, as before. The registry action `reopenClosedPicker` has an explicit palette verb so the title reads "Reopen Closed Tab…".
- **[citation-document]** with `viewer_url` unset the whole custom menu is absent, not just its Open item, so right-click is exactly as before; with it set, the menu appears only over a key in prose (the hover card keeps its old behavior, no prose test). "Open Document" is also a registry action, `openCitationDocument`, unbound, so `[keys]` can bind it. `CiteContextMenu` sits in `src/ContextMenu.tsx` beside the generic `ContextMenu`; the tree menu keeps its fixed 176 by 210 size estimate, so it lands where it always did.
- Left for the author in the running app: the new window (and `writedown --blank`), the pointer over Save As with "Hide pointer while typing" back on, the update verb's message, the closed-tab picker across a restart, and the citation menu, verb and hover link against archivum (including whether the template wants `{key}` or `@{key}`).

### [python-environments] 2.28.0

Both items landed. Gates: `npm run build`, `cargo test` (81 passed, 11 ignored; the `resolve_python` tree tests and the `wd-warnings` parse are new), `madge`, smoke-boot. The opt-in kernel tests, `cargo test kernel_ -- --ignored` with `WRITEDOWN_TEST_PYTHON` (a scratch venv with matplotlib) and `WRITEDOWN_TEST_PYTHON_B` (the uv-managed 3.14), all 8 pass, three of them new: `kernel_warning_modes` (one, three, none), `kernel_library_warning_repeats_per_render` (a synthetic `helper.py` warns on each of three renders in "first"), and `kernel_pool_keeps_two_interpreters_warm` (no respawn after the first of each, A's `x` survives a render in B, a pool of one evicts).

Divergences:

- **[warnings] checked on real interpreters first.** Python's "once" action keeps its own registry, which a filters-version bump might not clear; a probe on 3.13.15 and 3.14.7 showed each render reporting its warnings afresh with the plan's scheme as written, so the runner adds nothing beyond it. The palette's verbs say "re-render to apply", since the override takes effect on the next render or Run This Cell.
- **[venvs-and-kernel-pool] `restart_kernel` and `which_python` take the document's text as well as its path**: `wd-python` lives in the live buffer's front matter. Both are async commands; Which Python uses `try_lock` and reports "busy (rendering)" while a render holds the pool, and the restart no longer blocks the window while it waits.
- **[venvs-and-kernel-pool] `checkout` takes the runner folder, pool size and timeout** rather than the app handle (`checkout_for` supplies them), so the opt-in test drives the real pool logic. `Kernel::exec` takes an `ExecOpts` struct in place of seven positional arguments.
- **[venvs-and-kernel-pool]** the not-configured message now also suggests adding a `.venv`.
- Left for the author in the running app: Which Python and a render in a folder with a `uv venv` and in one without, and the behavior change for documents that relied on the global interpreter.

### [version-history] 2.29.0

All four parts landed. Gates: `npm run build`, `cargo test` (85 passed, 12 ignored; `retained` over 2,000 LCG stamps across 400 days, the few-stamps case, the calendar months and the blame porcelain parse are new), `madge`, smoke-boot. The opt-in `cargo test line_history -- --ignored` runs blame against this repository's README: a committed line, the same line edited in the buffer (not committed yet), and a file outside any repository (none). A harness pass checks `traceLine` (an insertion and a deletion above, an edit, an appended tail, a last line without newline, and a four-version walk).

Divergences:

- **[tiered-retention] the newest 20 also claim their buckets**, so an older version sharing an hour (or day, week, month) with one of them is dropped rather than kept as a near-duplicate. The bound is unchanged. Weeks start on Monday (UTC); months are calendar months from a hand-rolled civil-date conversion (no date crate). The store today holds at most 20 versions per file, so the change deletes nothing that exists.
- **[stats-and-prune] the project walk keeps every extension**, not only quick-open's list, since Writedown saves whatever text file it opens; `walk_files` is factored out of `list_all_files`, which keeps its behavior. A capped walk says so in the Stats line.
- **[line-history] backups are fetched eight at a time**, stopping at the change, rather than all in one call: a heavily edited 360 KB file has over a hundred versions. `read_backups` is the batched command; `list_backups` became async.
- **[line-history] the git base is blame's `previous` commit and file name**, not `<rev>^:<filename>`, so a line whose commit also renamed the file still gets the right base; no `previous` (a root commit, or the commit that added the file) means an empty base. The blame and both `git show` calls are one command, `git_line_history`, whose body takes the git executable so the opt-in test can run it. The buffer is sent with the file's own line endings.
- **[line-history] "changed in the save at" or "between"**: a change found within the newest 20 is pinned to one save, since nothing between two of the newest 20 was ever thinned away; beyond them the message gives the save and the next surviving version's stamp. The unsaved step diffs the buffer against the tab's saved text, the same text the disk diff then shows.
- Left for the author in the running app: the verb on a committed line, on a line edited and saved twice, in an untracked file, and with an unsaved edit; Stats on a project; Prune's confirmation figures and the Stats after it; Previous Versions on a long history.
