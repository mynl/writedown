# Plan — Fast QMD render (1.33.0 markdown pipeline · 1.34.0 python execution)

On-demand, super-fast render of `.qmd`/`.md`: run `{python}` cells, splice their output
(text, matplotlib figures, tracebacks) into the document, resolve citations against the
in-memory bibliography and Quarto cross-references, and show the result through the
**existing** markdown-it/KaTeX/DOMPurify preview. Speed over accuracy. No pandoc, no
jupyter, no quarto, no temp `.qmd` — the only external dependency is a configured
`python.exe`. Nothing is ever written to the user's files; figures travel as base64 data
URIs and never touch disk.

Design discussion: 2026-07-08 session (see human-hints.md). Two shippable stages:
**1.33.0** = everything except execution (Rendered tab, citations, crossrefs,
references); **1.34.0** = the python sidecar. Each stage: one commit + CHANGELOG entry.

## Locked decisions

- Pipeline is in-process Rust → expanded markdown → existing `Preview` component. The
  live buffer is rendered (no save side effect, no temp file, no `_quarto.yml` pickup).
- Citations: `@Mildenhall2022a` → `[Mildenhall (2022)](#ref-Mildenhall2022a)`; a
  generated **References** section (APA-like, sorted by author) anchors each entry.
  No citeproc/CSL — approximation from the already-parsed bib index.
- Kernel: persistent python **process**, fresh **namespace** per render (`sys.modules`
  survives, so imports are paid once; each render is a deterministic clean top-to-bottom
  run). Custom ~150-line JSON-lines runner, NOT the Jupyter protocol.
- Config `[render]`: `python` (explicit path, no discovery), `timeout_seconds = 30`,
  `figure_format = "png"|"svg"`, `figure_dpi = 150`.
- UI: preview pane gets explicit tabs **Preview | Rendered** (same pattern/CSS as
  Folder | Project). Command **Render Document** is **palette-only** (Ctrl+Shift+P →
  "Render Document") — no dedicated key binding (Ctrl+Shift+K, Quarto's render key, is
  taken by CodeMirror's `deleteLine`, and render isn't frequent enough to warrant
  claiming a chord). Rendered view is a static snapshot with a stale badge. No
  mode-toggling buttons.
- Graceful degradation: with no python configured, everything except execution still
  works (cells show source + a one-line notice). Render never blocks the UI thread.

---

## Stage 1.33.0 — Rendered pane + markdown pipeline (no execution)

New Rust module `src-tauri/src/render.rs`; frontend tab + command. Ships useful on its
own: resolved citations, clickable references, numbered crossrefs, cleaned headings.

### 1. Document splitter

Reuse `check.rs` fence machinery — make `fence_open`, `fence_close`, `cell_label`
`pub(crate)`. `split_document(text) -> (FrontMatter, Vec<Segment>)`:

```rust
enum Segment {
    Markdown   { text: String },                 // prose — cite/crossref pass applies
    PlainFence { text: String },                 // ``` blocks incl. fence lines — verbatim
    PythonCell { code: String, opts: CellOpts, first_line: usize }, // 1-based doc line of first body line
    OtherCell  { code: String, lang: String, opts: CellOpts },      // {r}, {julia}… never run
}
struct CellOpts { eval: bool, echo: bool, include: bool, output: bool, // all default true
                  label: Option<String>, fig_cap: Option<String> }
```

- `#|` option lines at the top of a cell parse into `CellOpts` (`#| eval: false`,
  `#| label: fig-x`, `#| fig-cap: "..."` — quotes stripped) and are **stripped from the
  echoed source** (Quarto behavior). Unknown `#|` keys are ignored.
- Front matter: reuse the `Preview.tsx` regex semantics (`^---\n …\n---\n`, tolerate BOM
  and `\r\n`). Hand-extract only top-level `title:` and `bibliography:` (scalar, or
  first item of a block list); no YAML crate. Everything else ignored. Read-only —
  the never-reflow-YAML rule is untouched.

### 2. Citation pass (prose lines only, skipping inline `code` spans)

Mirror the editor's `CITE_RE` (`src/editor/citations.ts:172`). The Rust `regex` crate
has **no lookbehind** — express the guard as a leading group:
`(^|[^\p{L}\p{N}_@/])@([\p{L}\p{N}](?:[\p{L}\p{N}_:.\-]*[\p{L}\p{N}])?)`.
Process crossrefs FIRST (fig-/tbl-/sec-/eq- prefixes, §4), then citations.

- In-text `@key` → `[Mildenhall (2022)](#ref-key)` — author display = existing
  `short_authors` ("Mildenhall and Major", "Gerber et al.").
- Bracketed group `[…@…]` (with `]` not followed by `(` or `[`, and not `![`):
  `;`-split items, each item's `-?@key` replaced — `@key` → `[Mildenhall 2022](#ref-key)`,
  `-@key` → `[2022](#ref-key)` — prefix/suffix text kept verbatim, group wrapped in
  parens: `[see @a, p. 7; @b]` → `(see [Mildenhall 2022](#ref-a), p. 7; [Smith 2020](#ref-b))`.
- Unknown key → `<span class="cite-missing">@key</span>`, no link, no ref entry.
- Collect cited keys (deduped) for the References section.

### 3. References section

`bib.rs`: add field `authors_full: String` to `BibEntry` = the **cleaned verbatim**
author/editor field ("Mildenhall, Stephen J. and Major, John A.") — the existing
`author` short form stays for autocomplete. Expose a lookup for render
(`pub(crate) fn lookup(state, keys) -> Vec<…>` or make fields `pub(crate)`).

When ≥1 key resolved, append:

```markdown
## References

<div class="references">
<p class="ref-entry" id="ref-KEY">AUTHORS_FULL (YEAR). <em>TITLE</em>. <em>CONTAINER</em>.</p>
…
</div>
```

Sorted by `(authors_full.to_lowercase(), year, key)`. Empty title/container/year parts
skipped cleanly (no dangling periods/parens). Raw-HTML block, so use `<em>` not `*…*`.
Doc front-matter `bibliography: x.bib` (resolved relative to the doc's folder) replaces
the default for this render: `parse_bib` on demand, cached in `RenderState` by
`(path, mtime)`. If citations exist but no bib is loaded → summary warns
"bibliography not loaded", keys render as `cite-missing`.

### 4. Crossrefs + heading anchors

Collect labels in document order: cell `#| label:` values and prose `{#fig-…}`,
`{#tbl-…}`, `{#sec-…}`, `{#eq-…}` attributes (the `attr_labels` logic). Number
per family in doc order. Replace in prose: `@fig-x` → `[Figure N](#fig-x)`,
`@tbl-x` → `[Table N](#tbl-x)`, `@eq-x` → `[Equation N](#eq-x)`,
`@sec-x` → `[§ Heading Text](#sec-x)`. Transform heading lines
`## Title {#sec-x}` → `## <a id="sec-x"></a>Title` (markdown-it doesn't understand
pandoc attrs — today they render as literal `{#sec-x}` text; this cleans them up).
Unresolved crossref keys fall through to the citation pass (and thus `cite-missing`).

### 5. Assembly + command

`#[tauri::command] async fn render_document(app, text: String, path: Option<String>)
-> RenderResult { markdown: String, cells: usize, errors: usize, elapsed_ms: u64,
python: String /* "ok" | "off" | "not_configured" | error msg */ }`.
Async so the webview never blocks; heavy work in `tauri::async_runtime::spawn_blocking`.
Wire it into `lib.rs`: add `mod render;`, `.manage(render::RenderState::default())`
(holds the doc-bib cache now, the kernel from 1.34), and `render::render_document` in
`generate_handler!` (`restart_kernel` joins it in 1.34).

Output document, tight (one blank line between blocks, never more):
summary line first — `<p class="render-summary ok">✓ 3 cells · 0.4 s</p>` /
`class="…err"` on errors / an extra `warn` line when python is unconfigured —
then front-matter `title:` as `# Title`, then segments in order. In 1.33.0 every
python cell renders source-only (```` ```python ```` fence) — execution arrives in
1.34.0; the `python` field says why ("off" = stage 1).

### 6. Frontend

- `api.ts`: `renderDocument(text, path)`; types above.
- `store.ts`: `previewTab: "live" | "rendered"` + setter; `rendered:
  Record<path, { markdown, source, at, cells, errors, elapsedMs, python }>`
  (in-memory only, not session); `renderBusy: boolean`; action `renderActive()` —
  markdown docs only; on success store result (`source` = exact text rendered,
  `at` = `Date.now()`), set `previewTab = "rendered"`, and if `viewMode === "editor"`
  set it to `"split"` so the result is visible.
- `App.tsx`: Preview split-pane gets a `panel-tabs` header row (reuse Folder|Project
  CSS): **Preview | Rendered**. (Render is invoked from the command palette — see
  `commands.ts` below — so no window/editor keydown wiring is needed here.)
  Rendered tab = status strip (✓/✗ · n cells · elapsed · rendered HH:MM ·
  **Stale** badge when `activeDoc.content !== rendered.source` · spinner while
  `renderBusy`) above `<Preview content={rendered.markdown} />` (component reused
  verbatim — proportional scroll sync comes along free). Empty state: "No render yet —
  run Render Document (Ctrl+Shift+P)".
- `Preview.tsx` onClick: handle `href` starting `#` — resolve inside the preview via
  `querySelector('#' + CSS.escape(id))` + `scrollIntoView()` (today ALL internal
  navigation is suppressed; citation links need this).
- `commands.ts`: `{ id: "render-doc", title: "Render Document (run code cells)" }`.
- `App.css`: `.render-summary(.ok/.err/.warn)`, `.cite-missing` (red dotted underline),
  `.references`/`.ref-entry` (hanging indent), `.render-status` strip, `.stale-badge`.
  Quiet chrome throughout.

### 7. Verify-early risks (do these on day one, before building out)

1. **DOMPurify + data URIs**: confirm `<img src="data:image/png;base64,…">` survives the
   existing `DOMPurify.sanitize` (it should — img is in DOMPurify's default
   `DATA_URI_TAGS`). If not, extend `ALLOWED_URI_REGEXP` for `data:image/`.
2. **Anchor ids survive sanitize** (`SANITIZE_DOM` only strips DOM-clobbering ids;
   `ref-*`/`fig-*` are safe) and in-preview `#` scroll works.
3. Rust regex crate: confirm the no-lookbehind citation pattern matches the editor's
   behavior on the same corpus (shared test strings).

---

## Stage 1.34.0 — Python sidecar execution

### 8. Runner script (`src-tauri/runner.py`, embedded via `include_str!`)

Written to `~/.writedown/cache/runner.py` at each kernel spawn (cache = disposable,
allowed; debuggable; avoids `-c` quoting). Spawned as `<python> -u runner.py` with
`MPLBACKEND=Agg` in the environment (backend fixed before any user import) and
`CREATE_NO_WINDOW` (0x08000000) on Windows so no console flashes.

JSON-lines protocol on stdin/stdout, one object per line:

```json
→ {"id": 1, "code": "...", "reset": true, "cwd": "C:/docs/paper",
   "fig_format": "png", "fig_dpi": 150}
← {"id": 1, "stdout": "…", "stderr": "…", "result_text": null, "result_html": null,
   "figures": [{"format": "png", "b64": "…"}], "error": null, "ms": 12}
```

Runner behavior:
- On start: print `{"ready": true, "python": "3.12.1"}`. On stdin EOF: exit 0 (backstop
  so a dead app never leaves an orphan). Internal failure → error reply, never crash.
- `reset: true` (first cell of every render): fresh namespace
  `{"__name__": "__main__"}`, `os.chdir(cwd)` (doc's folder — relative
  `pd.read_csv("data.csv")` works like Quarto), `plt.close("all")` if loaded.
- Per cell: blank out `#|`/`%`/`!`/`?` lines preserving line numbers (as `check.rs`
  does); `ast.parse`; if the last statement is an expression, `exec` the rest then
  `eval` it — non-None result: `_repr_html_()` if present (pandas tables!) else
  `repr()`. stdout/stderr captured via `contextlib.redirect_*`.
- Exceptions: `{"error": {"message": "ZeroDivisionError: …", "traceback": "…",
  "line": 3}}` — `line` = cell-relative from the last `<cell>` frame
  (`compile(…, "<cell>", …)`); Rust maps to the document line via `first_line`.
- Figures: if `matplotlib.pyplot` is in `sys.modules`, save each open fignum to
  `BytesIO` (`format`, `dpi` from request), base64, then `plt.close("all")`.

### 9. Kernel management (`render.rs`)

`RenderState { kernel: Mutex<Option<Kernel>> }` managed in `lib.rs`;
`Kernel { child, stdin, stdout: BufReader, python_path }`. `ensure_kernel(cfg)` spawns
if absent/dead/path-changed. Round-trip per cell with a `timeout_seconds` deadline
(reader thread + channel, or non-blocking read loop): on timeout **kill the process**,
report the cell as "timed out after Ns — kernel restarted", and render remaining cells
as `<div class="cell-skipped">not run (kernel restarted after cell N timed out)</div>`.
`#[tauri::command] fn restart_kernel(state)` kills; next render respawns (this is the
Windows "interrupt"). Kill the child on `RunEvent::Exit` too (EOF backstop
notwithstanding) — note `lib.rs` currently ends `.run(generate_context!()).expect(…)`
with **no** run-event callback, so this means restructuring to `let app = builder
.build(generate_context!())?;` then `app.run(|_h, e| if matches!(e, RunEvent::Exit) { … })`.
(`RenderState` itself already exists from 1.33 for the doc-bib cache — §3.) Config read
like `bib_path` does — direct from `config.toml`:
`python` missing/empty → `python: "not_configured"`, cells render source + notice, no
spawn attempt. Document the new keys in `DEFAULT_CONFIG` (new installs) and CHANGELOG
(existing configs are NEVER rewritten — Steve adds one line by hand).

### 10. Cell splicing (honoring CellOpts)

Per executed cell, in order, blocks separated by single blank lines:
- `echo` → ```` ```python ```` fence (source minus `#|` lines).
- `output` → stdout as ```` ```text ````; stderr as `<pre class="cell-stderr">`;
  `result_text` as ```` ```text ````; `result_html` wrapped in
  `<div class="cell-result">` (existing DOMPurify pass sanitizes).
- Figures → `<a id="LABEL"></a><img class="cell-figure" src="data:image/FMT;base64,…"
  alt="CAP">` + `<p class="fig-caption">Figure N: CAP</p>` when labeled/captioned.
- Error → `<div class="cell-error"><p>Cell N (line L): MESSAGE</p><pre>TRACEBACK</pre></div>`
  (L = mapped document line). Execution continues to the next cell.
- `eval: false` → source per `echo`, not sent to kernel. `include: false` → run,
  emit nothing. `OtherCell` (r/julia/…) → source-only fence, never run.

Frontend adds: command `render-restart-kernel` "Restart Python Kernel"; CSS
`.cell-error` (red left border), `.cell-stderr` (amber), `.cell-skipped` (muted),
`.cell-figure` (`max-width: 100%`), `.fig-caption`, `.cell-result`.

### 11. Tests

Rust unit (no python needed): splitter segments + options + `#|` stripping; citation
replacements (`@key`, `[@a; @b]`, `[see @a, p. 7]`, `[-@a]`, trailing `@key.`
punctuation, `` `@key` `` in code span skipped, fenced blocks skipped, unknown key);
references formatting/sorting/anchors; crossref numbering + heading-attr transform;
front-matter title/bibliography extraction (incl. CRLF + BOM). Kernel integration tests
`#[ignore]` (need a real python): stdout, last-expr repr, `_repr_html_`, figure b64
non-empty, error line mapping, timeout→kill→respawn.

### 12. Verify (manual, `npm run tauri dev`)

Pure-md doc with citations → Render: instant; cites linked; References sorted; clicking
a cite scrolls to its entry; unknown key red-dotted. Doc with 2 python cells (print +
matplotlib) → first render ~1–2 s (imports), second < 0.5 s; figure displays; DataFrame
as last expression renders as a table. Cell raising `1/0` → red traceback at the right
doc line, later cells still run. `while True: pass` → timeout error, kernel restarts,
next render works. Bad python path → clear notice, markdown features all still work.
Edit after render → Stale badge; Preview tab still live. Render Document (Ctrl+Shift+P)
from editor-only view switches to split. No files created anywhere; no console window flash.

## Out of scope (recorded, not forgotten)

Click-to-source line map (natural v1.1 — we control splicing, so expanded→source line
table + data-line attrs); **better scroll sync** (Steve: proportional sync "doesn't work
that great" — separate punch-up, applies to live preview too); prefix caching of
unchanged cells (likely unnecessary given namespace-fresh warm speed); opt-in pandoc
`--citeproc` accuracy pass (expanded markdown is a clean pandoc input if ever wanted);
plotly/widgets/JS; `:::` callouts/tabsets (render as plain text); `{{< include >}}`
shortcodes (literal); R/Julia execution; CSL styles; Quarto themes; mid-cell interrupt
without restart.
