// The command registry behind the command palette (Ctrl+Shift+P). Kept small and
// declarative so the palette is one source of truth for user-invocable actions.
//
// Naming rules (issue G.05): one vocabulary per thing ("temporary file", never "scratch"
// in a title); no verb whose meaning flips with state — explicit On/Off and Show/Hide
// pairs instead of "Toggle …"; and no key names typed into titles: a verb carries either
// `action` (a registry name — the palette shows whatever the merged keymap binds to it,
// so a [keys] rebind updates the hint) or `key` (a fixed app-level chord from App.tsx).
import { type StateCommand } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forceLinting } from "@codemirror/lint";
import { addToDictionary, configPath, extractBibEntries, logError, openShell, restartKernel } from "./api";
import { SCRATCH_PREFIX, isScratch, mergedProjects, useStore } from "./store";
import { getActiveView } from "./editor/editorView";
import { isMarkdownDoc } from "./editor/languages";
import { CITE_RE, CROSSREF_PREFIX, openCitationPicker } from "./editor/citations";
import { isProsePos } from "./editor/prose";
import { renumberOrderedList } from "./editor/lists";
import { reformatTables } from "./editor/tables";
import { toggleBold, toggleItalic } from "./editor/markdownFormat";
import {
  DEFAULT_DATETIME_FORMAT,
  DEFAULT_DATE_FORMAT,
  formatStamp,
  insertStamp,
} from "./editor/textOps";
import { setWordWrap } from "./editor/wrap";
import { keymapConfigBlock } from "./editor/keymap";
import { COMMAND_REGISTRY } from "./editor/commandRegistry";
import { SYNTAX_CHOICES } from "./editor/languages";
import { copyActiveName, copyActivePath } from "./clipboardOps";
import { insertSnippet, mergedSnippets } from "./editor/snippets";

export type Command = {
  id: string;
  title: string;
  run: () => void;
  /** Registry action this verb performs — the palette shows its live key beside it. */
  action?: string;
  /** A fixed app-level key (App.tsx, not rebindable), shown beside the verb. */
  key?: string;
};

// Run an editor command against the active Markdown view (no-op elsewhere), so
// document-editing palette entries only act where they make sense.
function onMarkdownView(cmd: StateCommand): () => void {
  return () => {
    const { activePath } = useStore.getState();
    const view = getActiveView();
    if (!view || !activePath || !isMarkdownDoc(activePath)) return;
    cmd({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
  };
}

// The word under the caret (or the current selection) — for "Add Word to Dictionary".
function wordAtCursor(view: EditorView): string | null {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return state.sliceDoc(sel.from, sel.to).trim() || null;
  const line = state.doc.lineAt(sel.head);
  const rel = sel.head - line.from;
  const re = /[\p{L}][\p{L}\p{M}']*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    const s = m.index;
    const e = s + m[0].length;
    if (rel >= s && rel <= e) return m[0].replace(/'+$/, "");
  }
  return null;
}

// ---- date stamps (issue D.01) -------------------------------------------------------
// Formats come from [editor] date_format / datetime_format; the defaults reproduce the
// output these verbs had before they were configurable.
const dateFormat = () => useStore.getState().editorSettings?.date_format || DEFAULT_DATE_FORMAT;
const datetimeFormat = () =>
  useStore.getState().editorSettings?.datetime_format || DEFAULT_DATETIME_FORMAT;

/** Today rendered in `pattern` — shown IN the palette title, so the verb tells you what
 *  you are about to get rather than making you learn strftime. */
const sampleStamp = (pattern: string) => formatStamp(new Date(), pattern);

function stampCommand(pattern: string): () => void {
  return () => {
    const view = getActiveView();
    if (!view) return;
    insertStamp(pattern)({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
    // The palette input held focus; return it to the editor so the caret (already placed
    // after the stamp by replaceSelection) is live and typing continues.
    view.focus();
  };
}

/** The last path segment of a folder, for verb titles. */
const baseName = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

export function appCommands(): Command[] {
  const s = useStore.getState;
  return [
    { id: "open-file", title: "Open File…", key: "Ctrl+O", run: () => void s().openFilesDialog() },
    { id: "open-folder", title: "Open Folder…", run: () => void s().openFolder() },
    {
      id: "new-file",
      title: "New File…",
      run: () =>
        s().openPrompt("New file (relative to workspace)", "notes/idea.md", (v) =>
          s().newFile(v),
        ),
    },
    {
      id: "new-folder",
      title: "New Folder…",
      run: () =>
        s().openPrompt("New folder (relative to workspace)", "notes/drafts", (v) =>
          s().newFolder(v),
        ),
    },
    {
      // "Temporary file" here and in the verb below it, on purpose: the two used to say
      // "Scratch" and "Temporary" and a search for either found only one (issue G.05).
      id: "new-scratch",
      title: "New Temporary File (unsaved)",
      key: "Ctrl+Shift+N",
      run: () => s().newScratch(),
    },
    {
      // Names the buffer only — it stays unsaved and lives with the project, exactly as
      // before (issue A.27). Save As is still how one becomes a file on disk.
      id: "name-scratch",
      title: "Name Temporary File…",
      run: () => {
        const a = s().activePath;
        if (!a || !isScratch(a)) {
          useStore.setState({ lastError: "name temporary file — no temporary file active" });
          return;
        }
        const current = a.slice(SCRATCH_PREFIX.length);
        s().openPrompt("Name for this temporary file", "notes.md", (v) => s().renameScratch(a, v), current);
      },
    },
    {
      id: "open-quick-file",
      title: "Open Quick File — the single [files] quick_file",
      key: "Ctrl+Shift+Q",
      run: () => void s().openQuickFile(),
    },
    {
      // The `[files] quick_files` pick-list (issue D.04). Ctrl+Shift+Q still opens the
      // single `quick_file`; this is the list, fuzzy-searchable by name or folder.
      //
      // Named "Quick Files:" rather than "Open Quick File…" so it cannot be confused with
      // the verb above it: the two titles were near-identical, the fuzzy matcher scored
      // both for "quick file(s)", and the MRU floated whichever had been used before — so
      // the list looked absent. A distinct leading word is the fix.
      id: "quick-files",
      title: "Quick Files: Open from List…",
      run: () => s().openPalette("quickfiles"),
    },
    { id: "save", title: "Save", key: "Ctrl+S", run: () => void s().saveActive() },
    { id: "save-as", title: "Save As…", run: () => void s().saveAs() },
    {
      id: "size-as-default",
      title: "Set Current Editor Size as Default (write to config)",
      run: () => void s().setSizeAsDefault(),
    },
    { id: "previous-versions", title: "Previous Versions…", run: () => s().openVersions() },
    // Conflict resolution: two explicitly labelled verbs, never one button that changes
    // meaning with state (issue B.04).
    {
      id: "reload-from-disk",
      title: "Reload from Disk (discard my edits)",
      run: () => void s().reloadFromDisk(),
    },
    {
      id: "overwrite-disk",
      title: "Overwrite Disk with My Version",
      run: () => void s().overwriteWithMine(),
    },
    {
      id: "watch-status",
      title: "Diagnostics: File Watch Status",
      run: () => s().showWatchStatus(),
    },
    { id: "show-last-error", title: "Show Last Error", run: () => s().showLastError() },
    { id: "locate-file", title: "Locate File in Sidebar", run: () => s().revealActive() },
    { id: "copy-file-path", title: "Copy File Path", action: "copyFilePath", run: copyActivePath },
    { id: "copy-file-name", title: "Copy File Name", action: "copyFileName", run: copyActiveName },
    { id: "renumber-list", title: "Renumber Ordered List", action: "renumberList", run: onMarkdownView(renumberOrderedList) },
    { id: "reformat-tables", title: "Reformat Markdown Table(s)", action: "reformatTable", run: onMarkdownView(reformatTables) },
    { id: "format-bold", title: "Bold (surround with **…**)", action: "bold", run: onMarkdownView(toggleBold) },
    { id: "format-italic", title: "Italic (surround with *…*)", action: "italic", run: onMarkdownView(toggleItalic) },
    {
      // Pull every cited @key's raw BibTeX out of the configured .bib into a .bib scratch
      // buffer — same key detection as the linter (CITE_RE, prose-only, crossrefs skipped).
      id: "extract-refs",
      title: "Extract Citations to .bib (temporary file)",
      run: () => {
        const { activePath } = useStore.getState();
        const view = getActiveView();
        if (!view || !activePath || !isMarkdownDoc(activePath)) return;
        const text = view.state.doc.toString();
        const keys: string[] = [];
        const seen = new Set<string>();
        for (const m of text.matchAll(new RegExp(CITE_RE.source, CITE_RE.flags))) {
          const k = m[1];
          if (m.index === undefined || CROSSREF_PREFIX.test(k) || seen.has(k)) continue;
          if (!isProsePos(view.state, m.index + 1)) continue;
          seen.add(k);
          keys.push(k);
        }
        if (keys.length === 0) {
          useStore.setState({ lastError: "extract refs — no citation keys in document" });
          return;
        }
        void extractBibEntries(keys)
          .then((bib) => useStore.getState().newScratch({ content: bib, ext: "bib" }))
          .catch((e) => useStore.setState({ lastError: `extract refs — ${String(e)}` }));
      },
    },
    {
      // Insert `@` and open the bibliography picker. Its former key, Ctrl+Shift+C, is now
      // Copy File Path (issue G.16); typing `@` opens the same picker, and the action is
      // in the registry so [keys] can bind it again.
      id: "insert-citation",
      title: "Insert: Citation… (opens the @ picker)",
      action: "insertCitation",
      run: () => {
        const { activePath } = useStore.getState();
        const view = getActiveView();
        if (!view || !activePath || !isMarkdownDoc(activePath)) return;
        view.focus();
        openCitationPicker(view);
      },
    },
    {
      // Any editor, not just markdown — timestamps are useful in every file type.
      id: "insert-datetime",
      title: `Insert Date-Time (${sampleStamp(datetimeFormat())})`,
      run: stampCommand(datetimeFormat()),
    },
    {
      // Issue D.01: the date on its own, because the time half was being deleted by hand
      // every time. Both formats are configurable — [editor] date_format / datetime_format.
      id: "insert-date",
      title: `Insert Date (${sampleStamp(dateFormat())})`,
      run: stampCommand(dateFormat()),
    },
    {
      // Issue D.12. Searches the Unicode name, the LaTeX command, emoji keywords and our
      // aliases at once — "tick" finds ✓ even though no Unicode name contains the word.
      id: "insert-symbol",
      title: "Insert: Unicode Character…",
      action: "insertSymbol",
      run: () => s().openPalette("symbols"),
    },
    // Explicit On/Off, not "Toggle": a verb must not change meaning with state.
    { id: "spell-on", title: "Spell Check: On", action: "toggleSpell", run: () => useStore.setState({ spellOn: true }) },
    { id: "spell-off", title: "Spell Check: Off", action: "toggleSpell", run: () => useStore.setState({ spellOn: false }) },
    {
      id: "spell-add-word",
      title: "Add Word to Dictionary",
      run: () => {
        const { activePath } = s();
        const view = getActiveView();
        if (!view || !activePath || !isMarkdownDoc(activePath)) return;
        const word = wordAtCursor(view);
        if (word)
          void addToDictionary(word)
            .then(() => forceLinting(view))
            .catch((e) => {
              // Surface it — swallowing this is why "add word" appeared not to work.
              void logError("add to dictionary failed: " + String(e));
              useStore.setState({ lastError: String(e) });
            });
      },
    },
    {
      id: "spell-ignore-word",
      title: "Ignore Word (this session)",
      run: () => {
        const { activePath } = s();
        const view = getActiveView();
        if (!view || !activePath || !isMarkdownDoc(activePath)) return;
        const word = wordAtCursor(view);
        if (word) {
          s().ignoreWord(word);
          forceLinting(view);
        }
      },
    },
    {
      id: "spell-open-dictionary",
      title: "Open Personal Dictionary",
      action: "openSpellDictionary",
      run: () => void s().openPersonalDictionary(),
    },
    {
      id: "spell-reload-dictionary",
      title: "Reload Personal Dictionary",
      action: "reloadSpellDictionary",
      run: () => void s().reloadPersonalDictionary(),
    },
    { id: "refresh-tree", title: "Refresh File Tree", key: "F5", run: () => void s().refreshTree() },
    // Explicit Show/Hide verbs (no state-flipping labels); the shown key toggles.
    { id: "sidebar-show", title: "Show Sidebar", action: "toggleSidebar", run: () => s().setSidebarVisible(true) },
    { id: "sidebar-hide", title: "Hide Sidebar", action: "toggleSidebar", run: () => s().setSidebarVisible(false) },
    { id: "outline-show", title: "Show Outline", action: "toggleOutline", run: () => s().setOutlineVisible(true) },
    { id: "outline-hide", title: "Hide Outline", action: "toggleOutline", run: () => s().setOutlineVisible(false) },
    { id: "fullscreen-enter", title: "Enter Full Screen", action: "toggleFullscreen", run: () => s().setWindowFullscreen(true) },
    { id: "fullscreen-exit", title: "Exit Full Screen", action: "toggleFullscreen", run: () => s().setWindowFullscreen(false) },
    { id: "distraction-enter", title: "Enter Distraction Free", action: "toggleDistractionFree", run: () => s().enterDistractionFree() },
    { id: "distraction-exit", title: "Exit Distraction Free", action: "toggleDistractionFree", run: () => s().exitDistractionFree() },
    { id: "plain-enter", title: "Enter Plain View — editor only, no sidebars or preview", action: "plainView", run: () => s().enterLayoutMode("plain") },
    { id: "plain-exit", title: "Exit Plain View", action: "plainView", run: () => s().exitLayoutMode() },
    { id: "preview-zoom-in", title: "Preview: Zoom In", action: "zoomPreviewIn", run: () => s().setPreviewZoom(1) },
    { id: "preview-zoom-out", title: "Preview: Zoom Out", action: "zoomPreviewOut", run: () => s().setPreviewZoom(-1) },
    { id: "preview-zoom-reset", title: "Preview: Reset Zoom", action: "zoomPreviewReset", run: () => s().setPreviewZoom("reset") },
    { id: "wrap-on", title: "Word Wrap: On", action: "toggleWordWrap", run: () => setWordWrap(true) },
    { id: "wrap-off", title: "Word Wrap: Off", action: "toggleWordWrap", run: () => setWordWrap(false) },
    // The three layouts by name; the key (Ctrl+Shift+L) cycles them.
    { id: "view-editor", title: "View: Editor Only", action: "togglePreview", run: () => useStore.setState({ viewMode: "editor" }) },
    { id: "view-split", title: "View: Editor and Preview (split)", action: "togglePreview", run: () => useStore.setState({ viewMode: "split" }) },
    { id: "view-preview", title: "View: Preview Only", action: "togglePreview", run: () => useStore.setState({ viewMode: "preview" }) },
    { id: "open-help", title: "Open Help (help.md)", run: () => void s().openHelp() },
    { id: "help-shortcuts", title: "Help: Keyboard Shortcuts", key: "F1", run: () => s().toggleHelp() },
    { id: "about", title: "About Writedown", run: () => s().toggleAbout() },
    {
      id: "open-shell",
      title: "Open Shell (document folder)",
      // [tools] shell (default pwsh) at the active document's folder; a scratch buffer
      // has no folder, so it (and no-document) falls back to the workspace root.
      run: () => {
        const st = s();
        const a = st.activePath;
        const dir = a && !isScratch(a) ? a.replace(/[\\/][^\\/]*$/, "") : st.root;
        if (dir) void openShell(dir).catch((e) => useStore.setState({ lastError: String(e) }));
      },
    },
    { id: "render-doc", title: "Render Document (run code cells)", action: "render", run: () => void s().renderActive() },
    { id: "render-cell", title: "Run This Cell (live kernel state)", action: "renderCell", run: () => void s().renderCell() },
    // A view setting, not a YAML edit: front matter is preserved byte-for-byte (spec §2).
    { id: "number-sections-on", title: "Preview: Number Sections", run: () => s().setNumberSections(true) },
    { id: "number-sections-off", title: "Preview: Don't Number Sections", run: () => s().setNumberSections(false) },
    { id: "number-sections-doc", title: "Preview: Number Sections — Follow Document YAML", run: () => s().setNumberSections(null) },
    {
      id: "render-restart-kernel",
      title: "Restart Python Kernel",
      run: () => void restartKernel().catch(() => {}),
    },
    {
      id: "edit-config",
      title: "Edit Config (config.toml)",
      run: () =>
        void (async () => {
          try {
            await s().openFile(await configPath(), false);
          } catch {
            /* ignore */
          }
        })(),
    },
    {
      // A scratch buffer, deliberately NOT config.toml: review the full effective
      // keymap without a command silently rewriting your config file (paste the
      // block into [keys] yourself if you want to customize).
      id: "keys-write-scratch",
      title: "Keybindings: Write All Shortcuts to Temporary File",
      run: () =>
        s().newScratch({
          content:
            "# Effective Writedown shortcuts — paste into config.toml's [keys] to customize.\n" +
            keymapConfigBlock(useStore.getState().editorSettings?.keys),
          ext: "toml",
        }),
    },
    {
      id: "close-tab",
      title: "Close Tab",
      run: () => {
        const { activePath, closeTab } = s();
        if (activePath) closeTab(activePath);
      },
    },
    {
      // Issue D.13: real files only. Temporary files stay open by decision — their text
      // exists nowhere but the session, so closing one would destroy it outright.
      id: "close-all",
      title: "Close All Files (keeps unsaved temporary files)",
      run: () => void s().closeAllTabs(),
    },
    { id: "next-tab", title: "Next Tab", action: "nextTab", run: () => s().nextTab(1) },
    { id: "prev-tab", title: "Previous Tab", action: "prevTab", run: () => s().nextTab(-1) },
    { id: "reopen-tab", title: "Reopen Closed Tab", key: "Ctrl+Shift+T", run: () => void s().reopenClosed() },
    // ---- Projects (ST-style) ----
    {
      id: "proj-add-folder",
      title: "Project: Add Folder to Project…",
      run: () => void s().addFolderToProject(),
    },
    { id: "proj-new", title: "Project: New Project…", run: () => s().newProject() },
    { id: "proj-quick-switch", title: "Project: Quick Switch…", key: "Ctrl+Alt+P", run: () => s().openPalette("projects") },
    { id: "proj-save", title: "Project: Save / Rename Project…", run: () => s().saveRenameProject() },
    { id: "proj-open", title: "Project: Open Project…", run: () => void s().openProject() },
    { id: "proj-close", title: "Project: Close Project", run: () => s().closeProject() },
    {
      id: "proj-open-file",
      title: "Project: Edit Project File (.wdproj)",
      run: () => {
        const f = s().projectFile;
        if (!f) {
          useStore.setState({ lastError: "open project file — no project open" });
          return;
        }
        void s().openFile(f, false);
      },
    },
    ...projectFolderRemovals(),
    ...projectFolderLabels(),
    // ---- Syntax recolor (issue G.10) — session-only, coloring alone ----
    ...syntaxCommands(),
    // ---- Editor font (config [editor] font_choices) — session-only overrides ----
    ...fontCommands(),
    // ---- Insert snippets (built-ins + config [snippets]) ----
    ...snippetCommands(),
    // ---- Build commands (config [build]) ----
    ...buildCommands(),
    // Quick switch: every managed project (~/.writedown/projects/, name-sorted), plus any
    // recent project stored elsewhere that isn't already in the managed set.
    ...projectSwitches(),
    // Delete: managed projects only (the Rust guard refuses anything else).
    ...projectDeletes(),
    // Every remaining registry action, so nothing bindable is unreachable from here.
    ...registryCommands(),
  ];
}

/** Registry actions that already have an explicit verb above (or are not verbs at all —
 *  `continueList` is what Enter does in a list). Everything else is generated. */
const COVERED_ACTIONS = new Set([
  "togglePreview", "zoomPreviewIn", "zoomPreviewOut", "zoomPreviewReset", "plainView",
  "insertSymbol", "toggleWordWrap", "toggleSpell", "toggleSidebar", "toggleOutline",
  "toggleFullscreen", "toggleDistractionFree", "openSpellDictionary", "reloadSpellDictionary",
  "render", "renderCell", "build", "nextTab", "prevTab", "commandPalette", "bold", "italic",
  "reformatTable", "renumberList", "insertDateTime", "continueList", "copyFilePath",
  "copyFileName", "insertCitation",
]);

/** One palette verb per registry action without an explicit entry (issue G.05): Find,
 *  Go to Line, folds, editor zoom, case changes, sort lines, cursors, … — with the live
 *  key beside it. Runs against the editor after giving it focus, as the key would. */
function registryCommands(): Command[] {
  return Object.entries(COMMAND_REGISTRY)
    .filter(([name]) => !COVERED_ACTIONS.has(name))
    .map(([name, entry]) => ({
      id: `action-${name}`,
      title: entry.label,
      action: name,
      run: () => {
        const view = getActiveView();
        if (!view || !view.dom.isConnected) return;
        view.focus();
        entry.run(view);
      },
    }));
}

/** "Syntax: <name>" verbs (issue G.10): recolor the ACTIVE document as another
 *  first-class language, for this session only — never written to the file, the config,
 *  or the session. Coloring alone: markdown features (math, citations, spelling) and the
 *  CSV rainbow stay keyed on the extension. "Auto" restores the by-extension choice. */
function syntaxCommands(): Command[] {
  if (!useStore.getState().activePath) return [];
  const setFor = (name: string | null) => () => {
    const p = useStore.getState().activePath;
    if (p) useStore.getState().setSyntaxOverride(p, name);
  };
  return [
    ...SYNTAX_CHOICES.map((c, i) => ({
      id: `syntax-${i}`,
      title: `Syntax: ${c.name}`,
      run: setFor(c.name),
    })),
    { id: "syntax-auto", title: "Syntax: Auto (by file extension)", run: setFor(null) },
  ];
}

/** "Insert: <name>" palette entries — defaults overlaid with config [snippets]. */
function snippetCommands(): Command[] {
  const snippets = mergedSnippets(useStore.getState().editorSettings?.snippets);
  return [...snippets.entries()].map(([name, body], i) => ({
    id: `snippet-${i}`,
    title: `Insert: ${name}`,
    run: () => {
      const view = getActiveView();
      if (view) insertSnippet(view, body);
    },
  }));
}

/** "Build: <name>" palette entries from config [build] (Sublime-style build commands). */
function buildCommands(): Command[] {
  const builds = useStore.getState().editorSettings?.build ?? {};
  return Object.keys(builds).map((name, i) => ({
    id: `build-${i}`,
    title: `Build: ${name}`,
    run: () => void useStore.getState().runBuild(name),
  }));
}

/** Switch entries: the deduped, name-disambiguated managed+recent list (see mergedProjects). */
function projectSwitches(): Command[] {
  return mergedProjects(useStore.getState()).map((proj, i) => ({
    id: `proj-switch-${i}`,
    title: `Project: Switch to “${proj.name}”`,
    run: () => void useStore.getState().openProject(proj.path),
  }));
}

/** "Project: Remove Folder" verbs, one per project root. Removes the folder from the
 *  project file only — the folder and everything in it stay exactly where they are. */
function projectFolderRemovals(): Command[] {
  return useStore.getState().projFolders.map((folder, i) => ({
    id: `proj-remove-folder-${i}`,
    title: `Project: Remove Folder “${baseName(folder)}” (${folder})`,
    run: () => useStore.getState().removeProjectFolder(folder),
  }));
}

/** "Project: Label Folder" verbs, one per root (issue G.14): an optional string shown as
 *  "dir (label)" in the sidebar, stored in the .wdproj. An empty answer clears it. */
function projectFolderLabels(): Command[] {
  const st = useStore.getState();
  return st.projFolders.map((folder, i) => {
    const dir = baseName(folder);
    return {
      id: `proj-label-folder-${i}`,
      title: `Project: Label Folder “${dir}”… (${folder})`,
      run: () =>
        useStore
          .getState()
          .openPrompt(
            `Label for “${dir}” — shown as “${dir} (label)”; leave empty to remove`,
            "papers",
            (v) => useStore.getState().setFolderLabel(folder, v.trim()),
            st.projLabels[folder] ?? "",
          ),
    };
  });
}

/** "Font: <name>" verbs from `[editor] font_choices`, plus a reset. Session-only: the
 *  choice never reaches config.toml (the editorZoom discipline). */
function fontCommands(): Command[] {
  const choices = useStore.getState().editorSettings?.font_choices ?? [];
  if (choices.length === 0) return [];
  return [
    ...choices.map((family, i) => ({
      id: `font-${i}`,
      title: `Font: ${family}`,
      run: () => useStore.getState().setFontOverride(family),
    })),
    {
      id: "font-reset",
      title: "Font: Reset to Config",
      run: () => useStore.getState().setFontOverride(null),
    },
  ];
}

/** Delete entries: managed projects only (~/.writedown/projects/) — the Rust guard refuses
 *  anything else, and a project file the user saved elsewhere is theirs to remove. Confirmed
 *  before the .wdproj is recycled; the referenced folders are never touched. */
function projectDeletes(): Command[] {
  return useStore.getState().projects.map((proj, i) => ({
    id: `proj-delete-${i}`,
    title: `Project: Delete “${proj.name}”…`,
    run: () => void useStore.getState().deleteProject(proj.path, proj.name),
  }));
}
