# Plan — Phase 2: CodeMirror editor (spec §30 Phase 2)

Replace the plain textarea with CodeMirror 6. Plain text stays the editable
representation (spec §9). Shipped in climbing bumps:

## 1.4.0 — CodeMirror base + Markdown/Quarto syntax
- Swap the textarea for CodeMirror 6 (via `@uiw/react-codemirror`), wired to the same
  store (value/onChange), preserving dirty tracking, EOL, and atomic save.
- Markdown highlighting with nested fenced-code languages (`@codemirror/language-data`);
  `.qmd` treated as Markdown. Line numbers, word wrap, bracket matching, code folding.
- Light/dark theme via a CodeMirror theme + highlight style (Sublime import is Phase 3).

## 1.4.x — YAML front matter + Quarto niceties
- Highlight/fold YAML front matter (spec §17); Quarto code-cell options where practical.

## 1.5.0 — Sublime keybindings + multicursor
- Ctrl+D / Ctrl+K Ctrl+D, Ctrl+Shift+L, Ctrl+Alt+Up/Down, Ctrl+L, Ctrl+Shift+D,
  Ctrl+Shift+Up/Down, Ctrl+M, Ctrl+/ , column selection (Alt+drag). Command-layer, not
  scattered handlers (spec §10). Multicursor edit = one undo.

## 1.6.0 — Find / replace / go-to-line
- Ctrl+F, Ctrl+H, Ctrl+G (`@codemirror/search`).

## 1.7.0 — Quick-open + command palette
- Ctrl+P quick-open (fuzzy file switch), Ctrl+Shift+P command palette over the command
  layer. Reuses the fzf matcher that Phase 6 citations will need.

## Verify
`npm run tauri dev` → open a `.md`/`.qmd`, confirm syntax colours, fenced-code
highlighting, folding, wrap; edit + Ctrl+S still saves byte-clean; multicursor and
find/replace behave Sublime-like; Ctrl+P / Ctrl+Shift+P open.
