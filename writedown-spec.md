# Writedown: First-Draft Application Specification

## 1. Purpose

Writedown is a fast, local, predictable Markdown and Quarto editor for Windows.

The application should provide:

* Joplin-style file navigation and split-pane working;
* direct access to ordinary files on disk;
* Sublime Text-style editing behaviour;
* Markdown and Quarto preview;
* first-class BibTeX citation support;
* no proprietary vault format;
* no hidden canonical database;
* no automatic renaming or reorganisation;
* no account, cloud, telemetry, or browser permission prompts.

The first draft should be deliberately focused. The aim is a reliable daily-use editor, not a general knowledge-management platform.

The application name is:

```text
Writedown
```

The executable should be:

```text
writedown.exe
```

The application configuration directory should be:

```text
~/.writedown/
```

On Windows, `~` means the user profile directory, for example:

```text
C:\Users\Steve\.writedown\
```

## 2. Core principles

Writedown must follow these rules.

1. Files on disk are the source of truth.
2. Markdown and Quarto files remain ordinary text files.
3. The directory structure on disk is the notebook structure.
4. Writedown must not rename, move, reorganise, or rewrite files unless the user explicitly requests the operation.
5. A YAML `title` field or document heading must never be interpreted as a desired filename.
6. Any internal index or cache must be disposable and reconstructible from the source files.
7. Sublime-style editing is a primary feature, not a cosmetic option.
8. Rendering must remain separate from plain-text editing.
9. External edits made by Sublime Text, Python, Git, Explorer, or another program must be expected and handled gracefully.
10. The application must work without an internet connection.
11. The application must make no network requests by default.
12. The application should remain responsive on directories containing thousands of files.
13. The application should contain no unnecessary features or hidden behaviour.
14. Save failures, file conflicts, and parse failures must never be silently ignored.

## 3. Target platform and technology

The first draft should target Windows 11 only.

Recommended stack:

* Tauri 2 desktop shell;
* Rust backend;
* TypeScript frontend;
* React or Svelte;
* CodeMirror 6 editor;
* markdown-it or unified/remark/rehype for preview rendering;
* Rust `notify` crate, or equivalent, for filesystem watching.

The agent may choose React or Svelte. The choice should favour implementation speed, maintainability, and ease of integrating CodeMirror.

A pure browser implementation is not desired. Filesystem operations should be handled by the Rust backend so the application behaves like an ordinary local Windows application without recurring browser permission prompts.

## 4. High-level architecture

The application should have three principal layers.

```text
Windows filesystem
    Markdown files
    Quarto files
    BibTeX files
    images and attachments

Rust backend
    directory access
    file reading and writing
    atomic saves
    file watching
    search support
    configuration
    session persistence
    Quarto invocation

TypeScript frontend
    file tree
    tabs
    CodeMirror editor
    Markdown preview
    document outline
    citation autocomplete
    command palette
    status display
```

User documents must never be copied into `~/.writedown/`.

## 5. Configuration

Writedown should use TOML for configuration.

Primary configuration file:

```text
~/.writedown/config.toml
```

The application should create the configuration directory and a default configuration file on first launch.

Suggested directory contents:

```text
~/.writedown/
    config.toml
    session.json
    cache/
    index/
    logs/
    themes/
```

Example configuration:

```toml
[general]
last_directory = "C:/Users/Steve/Documents/Notes"
restore_session = true

[editor]
font_family = "Cascadia Mono"
font_size = 15
tab_size = 4
word_wrap = true
strip_trailing_whitespace = true
preserve_markdown_hard_breaks = true
autosave_on_focus_loss = true
autosave_idle_ms = 1500

[preview]
enabled = true
position = "right"
sync_scroll = true

[outline]
enabled = true
position = "right"

[theme]
name = "sublime-imported"
source = "sublime"
sublime_user_directory = "C:/Users/Steve/AppData/Roaming/Sublime Text/Packages/User"
sublime_color_scheme = ""

[bibliography]
enabled = true
default_file = "C:/s/TELOS/Biblio/uber-library.bib"
additional_files = []
citation_style = "pandoc"
watch_for_changes = true
read_only = true

[files]
extensions = ["md", "qmd", "markdown"]
show_hidden = false
```

The configuration parser should report invalid settings clearly and should fall back safely to defaults where practical.

## 6. Directory and workspace model

The user should be able to:

* open a directory using a native Windows folder-selection dialog;
* pass a directory on the command line;
* reopen the most recently used directory;
* switch to another directory.

Example:

```powershell
writedown.exe "C:\Users\Steve\Documents\Notes"
```

The selected directory becomes the workspace root.

Writedown should recursively display supported files and subdirectories in a left-side file tree.

First-class document extensions:

```text
.md
.qmd
.markdown
```

The file tree should also display supporting files where useful:

```text
.bib
.csl
.yml
.yaml
.toml
```

The application must not create a special vault structure.

## 7. Main interface

The default layout should be:

```text
┌──────────────────┬────────────────────────────────────┬──────────────────┐
│ File tree        │ Editor and/or rendered preview     │ Document outline │
│                  │                                    │                  │
└──────────────────┴────────────────────────────────────┴──────────────────┘
```

The centre area should support:

* editor only;
* preview only;
* editor and preview side by side;
* editor and preview stacked;
* multiple tabs;
* split editor panes.

The first draft only needs one file-tree pane and one outline pane.

Pane sizes should be resizable and restored between sessions.

## 8. File tree

The left pane should provide:

* recursive directory navigation;
* expand and collapse directories;
* file icons based on extension;
* click to open;
* keyboard navigation;
* refresh;
* create new file;
* create new directory;
* explicit rename;
* explicit delete;
* reveal in Explorer;
* copy full path;
* copy relative path.

Deletion should use the Windows Recycle Bin where practical.

Renaming and moving must only occur after an explicit user command.

The application must never rename a file because:

* its YAML title changed;
* its first heading changed;
* a document was saved;
* a note was moved between tabs;
* preview metadata changed.

## 9. Editor

The editor should use CodeMirror 6 unless a significant technical obstacle is discovered.

Required editor features:

* Markdown syntax highlighting;
* Quarto syntax highlighting;
* YAML front-matter highlighting;
* fenced-code-block highlighting;
* BibTeX syntax highlighting;
* line numbers;
* bracket matching;
* code folding;
* word wrap;
* configurable font and size;
* undo and redo;
* multiple cursors;
* multiple selections;
* column selection;
* find and replace;
* find in files;
* quick-open;
* command palette.

Plain text must always remain the editable representation.

The first draft should not implement rich-text editing or Obsidian-style live preview.

## 10. Sublime Text keybindings

Sublime-style editing is a central requirement.

The first draft should support at least:

```text
Ctrl+P                 quick-open file
Ctrl+Shift+P           command palette
Ctrl+D                 select next occurrence
Ctrl+K, Ctrl+D         skip current occurrence
Ctrl+Shift+L           split selection into lines
Ctrl+Alt+Up            add cursor above
Ctrl+Alt+Down          add cursor below
Alt+drag               column selection
Ctrl+L                 select line
Ctrl+Shift+D           duplicate line or selection
Ctrl+Shift+Up          move line or selection up
Ctrl+Shift+Down        move line or selection down
Ctrl+M                 jump to matching bracket
Ctrl+F                 find
Ctrl+H                 replace
Ctrl+Shift+F           find in files
Ctrl+G                 go to line
Ctrl+W                 close tab
Ctrl+Shift+T           reopen closed tab
Ctrl+Tab               next tab
Ctrl+Shift+Tab         previous tab
Ctrl+/                 toggle comment where applicable
Ctrl+Shift+C           open citation picker
```

The keybindings should be implemented through a dedicated command layer, not scattered event handlers.

All editing commands should operate correctly across multiple selections.

A multicursor edit should be treated as one logical undo action.

## 11. Sublime Text visual configuration import

Writedown must provide colourized editing.

The agent should inspect the installed Sublime Text configuration under:

```text
%APPDATA%\Sublime Text\Packages\User\
```

Relevant files may include:

```text
Preferences.sublime-settings
Markdown.sublime-settings
*.sublime-color-scheme
*.tmTheme
*.sublime-keymap
```

The agent should determine the active Sublime Text colour scheme and reproduce its appearance in Writedown as closely as practical.

The imported theme should cover:

* editor background and foreground;
* gutter background and foreground;
* current-line highlighting;
* selection background and foreground;
* primary and secondary cursor colours;
* Markdown headings by level;
* emphasis and strong emphasis;
* links and images;
* inline code;
* fenced code;
* block quotes;
* list markers;
* comments;
* YAML keys, strings, numbers, booleans, and scalars;
* Quarto code cells;
* Quarto cell options;
* citation keys;
* BibTeX entry types;
* BibTeX keys;
* BibTeX field names;
* BibTeX field values.

Because Sublime Text and CodeMirror use different syntax-scope systems, exact scope-by-scope reproduction is not required.

The acceptance criterion is close visual equivalence during ordinary Markdown and Quarto editing.

The agent should also import, where practical:

* font family;
* font size;
* line padding;
* caret style;
* word-wrap preference;
* visible-whitespace preference.

The generated Writedown theme should be stored under:

```text
~/.writedown/themes/
```

Writedown must not modify the Sublime Text configuration.

## 12. Autosave

Autosave is mandatory.

A dirty document must save when:

* the editor loses focus;
* the user switches tabs;
* the user switches to another file;
* the application window loses focus;
* the configured idle timeout expires;
* the application closes.

The default idle timeout should be:

```text
1500 ms
```

Saving should be atomic where practical:

1. write to a temporary file in the same directory;
2. flush the content;
3. replace the original file.

The save operation should preserve:

* UTF-8 encoding;
* the existing newline convention where possible;
* the final newline state where possible;
* YAML formatting;
* user spacing;
* comments;
* document structure.

The interface should show an unobtrusive status:

```text
Saved
Saving…
Modified externally
Conflict
Save failed
```

A save failure must remain visible until resolved or dismissed.

## 13. Trailing whitespace

Trailing whitespace should be stripped on save by default.

The implementation must be conservative.

Rules:

* remove ordinary trailing spaces and tabs;
* preserve exactly two trailing spaces when they encode a Markdown hard line break and `preserve_markdown_hard_breaks = true`;
* do not alter whitespace inside fenced code blocks;
* do not alter whitespace inside indented code blocks;
* do not alter YAML block scalar content;
* do not modify content where parsing is uncertain.

The behaviour must be configurable in `config.toml`.

## 14. External file changes

Writedown must watch the workspace for changes made by external programs.

When a file changes externally and has no unsaved local edits:

* reload it automatically;
* preserve cursor and scroll position where practical;
* update the preview;
* update the document outline.

When a file changes externally and also has unsaved local edits:

* do not overwrite either version;
* show a clear conflict state;
* offer:

  * reload the external version;
  * keep the local version and overwrite;
  * open a comparison view.

The first draft may omit the comparison view if necessary, but must provide the first two choices.

The Rust backend should use a filesystem-watching library such as `notify`.

## 15. Markdown preview

The preview should render the current document without modifying its source.

Required support:

* headings;
* paragraphs;
* lists;
* tables;
* block quotes;
* fenced code blocks;
* inline code;
* links;
* images;
* footnotes;
* task lists;
* mathematical notation;
* YAML-aware document titles;
* Pandoc-style citations where practical;
* Quarto heading identifiers;
* Quarto callouts where practical.

Relative links and images should resolve relative to the current document.

External links should open in the default browser.

Supported local links should open inside Writedown.

The preview should not execute arbitrary code.

Support table-reformatting like Sublime Text, but only when triggered by user. 

## 16. Quarto support

`.qmd` files must be first-class documents.

The editor should understand:

* YAML front matter;
* Markdown content;
* fenced executable code blocks;
* code-cell options;
* Pandoc citation syntax;
* heading identifiers;
* cross-reference labels;
* equations;
* figures;
* tables;
* callouts;
* raw blocks;
* Quarto shortcodes.

Writedown should provide two preview modes.

### 16.1 Fast internal preview

The default preview should render immediately using the internal Markdown renderer.

It does not need to execute code.

### 16.2 Exact Quarto rendering

Where a local Quarto installation is available, Writedown should optionally invoke:

```powershell
quarto render
```

or:

```powershell
quarto preview
```

The first draft may provide an explicit command:

```text
Render with Quarto
```

Writedown should discover `quarto.exe` from `PATH`.

Quarto execution must never happen automatically merely because a file was opened or saved.

## 17. YAML front matter

YAML front matter should be handled gracefully and conservatively.

Required behaviour:

* recognise front matter at the beginning of `.md` and `.qmd` files;
* syntax highlight it;
* fold it;
* validate syntax;
* show non-blocking warnings;
* preserve field order;
* preserve comments;
* preserve scalar styles;
* preserve list formatting;
* never automatically reformat;
* never alphabetise keys;
* never convert between inline and block forms.

Common recognised fields should include:

```text
title
subtitle
author
date
format
bibliography
csl
execute
filters
crossref
toc
number-sections
```

The first draft does not need a graphical YAML editor.

Raw YAML remains authoritative.

## 18. Automatic document outline

The right pane should show an automatically generated document outline.

The outline should:

* parse Markdown and Quarto headings;
* support ATX headings beginning with `#`;
* support heading identifiers such as `{#sec-risk}`;
* ignore headings inside code blocks;
* preserve heading hierarchy;
* update immediately as the document changes;
* allow clicking a heading to jump to it;
* highlight the heading containing the current cursor position;
* optionally track preview scroll position;
* remain read-only.

Example:

```text
1 Introduction
2 Model
  2.1 Assumptions
  2.2 Calibration
3 Results
4 Conclusion
```

Display numbering should only be shown where appropriate.

The outline must never insert or rewrite a table of contents in the source document automatically.

## 19. Authoritative BibTeX database

The user maintains an authoritative BibTeX database containing approximately 7,000 entries.

Writedown must treat the configured `.bib` file as the source of truth.

The default bibliography file must be set in:

```text
~/.writedown/config.toml
```

Example:

```toml
[bibliography]
enabled = true
default_file = "C:/Users/Steve/Documents/Bibliography/library.bib"
additional_files = []
citation_style = "pandoc"
watch_for_changes = true
read_only = true
```

Bibliography resolution precedence should be:

1. bibliography declared in the current document YAML;
2. workspace-specific bibliography configuration;
3. global `bibliography.default_file`.

The authoritative BibTeX file must:

* remain at its existing path;
* remain an ordinary text file;
* never be copied into `~/.writedown`;
* never be imported into a proprietary database;
* never be reformatted;
* never be rewritten during ordinary use;
* be watched for external changes;
* refresh citation autocomplete after changes;
* remain usable by external programs.

Writedown may build a disposable citation index under:

```text
~/.writedown/index/
```

The index must be fully reconstructible from the authoritative `.bib` file.

The citation index should contain:

* citation key;
* entry type;
* author or editor;
* year;
* title;
* journal or book title;
* keywords;
* BibTeX file path;
* source byte or line position where practical.

The BibTeX parser should tolerate:

* `@string` definitions;
* concatenated values;
* escaped TeX;
* nested braces;
* multiline fields;
* comments;
* accented names;
* missing optional fields;
* duplicate keys.

Duplicate keys should generate a warning but must not cause Writedown to modify the database.

BibTeX integration should be read-only by default.

Jumping to an entry may open the `.bib` file in Writedown or Sublime Text.

## 20. Citation autocomplete

Typing `@` in Markdown or Quarto prose should open a citation autocomplete popup backed by the authoritative BibTeX database.

The popup should fuzzy-match against:

* citation key;
* author;
* title;
* year;
* journal or book title;
* keywords.

Example queries:

```text
@mil pri ins
@major 2022
@collective risk
```

Each result should show:

```text
MildenhallMajor2022
Mildenhall and Major · 2022
Pricing Insurance Risk: Theory and Practice
```

The selected result or tooltip should display:

* full citation key;
* complete author list;
* title;
* year;
* journal, book, or publisher;
* entry type;
* source BibTeX file.

Keyboard behaviour:

```text
Up / Down       move through results
Enter           insert selected citation
Tab             insert selected citation
Escape          close popup
Ctrl+Enter      insert bracketed citation
```

Supported insertion forms:

```markdown
@MildenhallMajor2022
```

```markdown
[@MildenhallMajor2022]
```

```markdown
[see @MildenhallMajor2022]
```

```markdown
[@MildenhallMajor2022; @Other2024]
```

Typing `@` should only trigger citation completion in prose.

It should not trigger inside:

* YAML front matter;
* fenced code blocks;
* inline code;
* comments;
* URLs;
* email addresses.

`Ctrl+Shift+C` should open the citation picker directly without first typing `@`.

## 21. FZF-style fuzzy matching

Citation autocomplete must use fzf-style fuzzy subsequence matching rather than ordinary prefix matching.

A query should match when its characters occur in order, even when non-contiguous.

Example:

```text
mm22
```

may match:

```text
MildenhallMajor2022
```

Another example:

```text
prinsrisk
```

may match:

```text
Pricing Insurance Risk: Theory and Practice
```

Ranking should favour:

* exact citation-key matches;
* prefix matches;
* contiguous runs;
* word-boundary matches;
* matches following punctuation;
* camel-case boundary matches;
* shorter gaps;
* earlier matches;
* citation-key matches over other fields;
* fewer unmatched characters.

Suggested field weighting:

```text
citation key             highest
author                   high
title                    high
year                     medium
journal or book title    medium
keywords                 lower
```

Every matched character or contiguous matched span should be highlighted in the results.

Example query:

```text
mildmaj22
```

Possible display:

```text
[Mild]enhall[Maj]or20[22]
Mildenhall and Major · 2022
Pricing Insurance Risk: Theory and Practice
```

The author and title tooltip should use the same highlighting where the query matched those fields.

Matched highlighting should be implemented with styled spans and must not modify the underlying source text.

A suitable result structure is:

```ts
type FuzzyMatch = {
    score: number;
    positions: number[];
    field: "key" | "author" | "title" | "year" | "container" | "keywords";
};
```

The UI should use `positions` to highlight matched letters.

The implementation may use an existing fuzzy-matching library if it provides:

* subsequence matching;
* deterministic ranking;
* matched-character positions;
* weighted fields;
* good performance for at least 10,000 records.

Exact numerical compatibility with fzf is not required.

The behavioural requirement is that matching and ranking feel like fzf.

## 22. Citation performance

The citation database should be parsed:

* at application startup where needed;
* when the configured bibliography file changes;
* when the bibliography configuration changes.

The database must not be reparsed on every keystroke.

The popup should:

* update on every query keystroke;
* display approximately 10–20 results;
* remain visibly instantaneous for at least 10,000 entries.

The first draft should be tested against the approximately 7,000-entry authoritative database.

## 23. Search

The first draft should provide:

* filename search;
* full-text search across supported files;
* case-sensitive option;
* regular-expression option;
* whole-word option;
* result preview;
* click result to open at the matching line.

A direct filesystem search is acceptable initially.

A disposable SQLite FTS index may be added if needed.

Search should include `.md` and `.qmd` files by default.

## 24. Tabs and session restoration

The application should support multiple open files in tabs.

For each tab, restore:

* file path;
* cursor position;
* selection;
* scroll position;
* editor or preview mode.

On restart, Writedown should restore:

* the last workspace;
* open tabs;
* active tab;
* pane sizes;
* outline visibility;
* preview visibility.

Session state should be stored under:

```text
~/.writedown/session.json
```

Session restoration must not modify user documents.

## 25. Logging

Application logs should be written under:

```text
~/.writedown/logs/
```

Logs should include:

* startup failures;
* configuration parse errors;
* save failures;
* file-watcher failures;
* Quarto invocation failures;
* BibTeX parse failures;
* unexpected frontend errors;
* unexpected backend errors.

Routine file access should not produce excessive logging.

## 26. Security and local operation

Writedown is a local desktop application.

It should:

* access files through the Rust backend;
* avoid browser File System Access API prompts;
* make no network requests by default;
* contain no telemetry;
* contain no analytics;
* contain no account system;
* contain no advertising;
* contain no automatic update checker in the first draft;
* execute Quarto only through an explicit command;
* expose only the backend commands required by the frontend.

Ordinary Windows filesystem permissions still apply.

## 27. Suggested Rust backend responsibilities

The Rust backend should handle:

* opening directories;
* recursively listing files;
* reading files;
* atomic writes;
* file creation;
* directory creation;
* explicit rename;
* explicit delete;
* file watching;
* path normalisation;
* Explorer integration;
* Quarto process invocation;
* configuration loading and saving;
* session loading and saving;
* logging;
* optional bibliography parsing and indexing;
* optional search indexing.

Suggested Tauri commands:

```text
open_workspace
list_directory
read_file
write_file
create_file
create_directory
rename_path
delete_path
reveal_in_explorer
watch_workspace
find_quarto
render_with_quarto
load_config
save_config
load_session
save_session
load_bibliography
search_bibliography
```

The frontend must not receive unrestricted shell access.

## 28. Suggested frontend responsibilities

The frontend should handle:

* file-tree rendering;
* tabs;
* CodeMirror editor state;
* Sublime keybindings;
* multicursor commands;
* Markdown preview;
* YAML presentation;
* document outline;
* citation autocomplete;
* matched-letter highlighting;
* full-text search interface;
* pane layout;
* status indicators;
* conflict prompts;
* command palette;
* theme application.

## 29. Non-goals for the first draft

Do not implement:

* cloud synchronisation;
* mobile applications;
* collaborative editing;
* user accounts;
* plugin architecture;
* graph view;
* canvas view;
* rich-text editing;
* Obsidian-style live preview;
* automatic note renaming;
* automatic link rewriting;
* automatic folder organisation;
* embedded web browser;
* AI features;
* automatic code execution;
* bibliography editing forms;
* Git integration;
* publishing;
* theme marketplace.

A simple light theme, dark theme, and imported Sublime-derived theme are sufficient.

## 30. Recommended implementation sequence

### Phase 1: Desktop shell and files

Implement:

* Tauri application;
* workspace selection;
* file tree;
* open and save;
* tabs;
* configuration directory;
* session restoration.

### Phase 2: Editor

Implement:

* CodeMirror;
* Markdown syntax;
* Quarto syntax;
* YAML syntax;
* Sublime keybindings;
* multicursor;
* find and replace;
* quick-open;
* command palette.

### Phase 3: Sublime appearance

Implement:

* inspect Sublime configuration;
* identify active colour scheme;
* map Sublime scopes to CodeMirror tags;
* generate a Writedown theme;
* import font and editor preferences where practical.

### Phase 4: Reliability

Implement:

* autosave;
* atomic writes;
* trailing-whitespace rules;
* external file watching;
* conflict handling;
* logging.

### Phase 5: Preview and outline

Implement:

* internal Markdown preview;
* local image and link resolution;
* YAML-aware rendering;
* right-side document outline;
* outline navigation;
* optional synchronized scrolling.

### Phase 6: BibTeX

Implement:

* configured authoritative `.bib` file;
* bibliography discovery;
* robust parsing;
* disposable index;
* external-change refresh;
* citation autocomplete;
* fzf-style ranking;
* matched-letter highlighting;
* citation insertion;
* missing-key warnings;
* jump to BibTeX entry.

### Phase 7: Quarto integration

Implement:

* `.qmd` first-class behaviour;
* Quarto-aware syntax;
* local Quarto discovery;
* explicit render command;
* output and error display.

## 31. Acceptance criteria

The first draft is acceptable when the following workflow works reliably.

1. Launch Writedown.
2. Open a directory on `C:`.
3. See folders, `.md` files, and `.qmd` files in the left pane.
4. Click a file and open it in a tab.
5. Edit using Sublime-style keybindings.
6. Use multiple cursors with `Ctrl+D`.
7. Use column selection.
8. See Markdown and Quarto syntax colourization.
9. Confirm the theme closely resembles the installed Sublime Markdown scheme.
10. See the rendered preview.
11. See the automatic outline on the right.
12. Click an outline item and jump to the heading.
13. Switch focus and have the file autosave.
14. Confirm trailing whitespace is removed conservatively.
15. Confirm Markdown hard breaks are preserved.
16. Confirm fenced-code whitespace is preserved.
17. Edit the same file externally and see Writedown reload it safely.
18. Create a local conflict and receive an explicit choice.
19. Open a `.qmd` file and see appropriate highlighting.
20. Confirm YAML front matter is preserved exactly.
21. Confirm no YAML fields are reordered or reformatted.
22. Configure the authoritative BibTeX database in `config.toml`.
23. Type `@` and receive citation suggestions.
24. Search using fzf-style fragments.
25. See matched letters highlighted.
26. See author, year, and title in the result display or tooltip.
27. Insert a Pandoc citation.
28. Confirm the `.bib` file was not modified.
29. Modify the `.bib` file externally and see autocomplete refresh.
30. Restart Writedown and restore the workspace and tabs.
31. Confirm no files were renamed or moved.
32. Confirm every document remains readable and editable in Sublime Text.
33. Confirm the application works without an internet connection.

## 32. Deliverables

The agent should produce:

* a working Tauri project;
* Rust backend source;
* TypeScript frontend source;
* a Windows development build;
* a production Windows executable or installer;
* a sample `config.toml`;
* a concise `README.md`;
* an architecture note;
* a list of incomplete features;
* basic automated tests.

Tests should cover at least:

* configuration parsing;
* atomic file saving;
* autosave triggers;
* trailing-whitespace handling;
* Markdown hard-break preservation;
* fenced-code preservation;
* YAML preservation;
* external file-change detection;
* BibTeX parsing;
* duplicate BibTeX keys;
* bibliography refresh;
* fuzzy-match scoring;
* matched-position output;
* citation insertion;
* session restoration.

## 33. Working definition of done

The first draft is done when Writedown provides:

```text
ordinary files on disk
+ Sublime-style editing
+ autosave
+ conservative whitespace cleanup
+ Markdown and Quarto preview
+ automatic document outline
+ authoritative BibTeX integration
+ fzf-style citation lookup
+ no hidden surprises
```
