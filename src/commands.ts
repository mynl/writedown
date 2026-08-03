// The command registry behind the command palette (Ctrl+Shift+P). Kept small and
// declarative so the palette is one source of truth for user-invocable actions.
import { type StateCommand } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forceLinting } from "@codemirror/lint";
import { addToDictionary, configPath, extractBibEntries, logError, openShell, restartKernel } from "./api";
import { SCRATCH_PREFIX, isScratch, mergedProjects, useStore } from "./store";
import { getActiveView } from "./editor/editorView";
import { isMarkdownDoc } from "./editor/languages";
import { CITE_RE, CROSSREF_PREFIX } from "./editor/citations";
import { isProsePos } from "./editor/prose";
import { renumberOrderedList } from "./editor/lists";
import { reformatTables } from "./editor/tables";
import { toggleBold, toggleItalic } from "./editor/markdownFormat";
import { insertDateTime } from "./editor/textOps";
import { toggleWordWrap } from "./editor/wrap";
import { keymapConfigBlock } from "./editor/keymap";
import { insertSnippet, mergedSnippets } from "./editor/snippets";

export type Command = { id: string; title: string; run: () => void };

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

export function appCommands(): Command[] {
  const s = useStore.getState;
  return [
    { id: "open-file", title: "Open File… (Ctrl+O)", run: () => void s().openFilesDialog() },
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
      id: "new-scratch",
      title: "New Scratch File (unsaved) (Ctrl+Shift+N)",
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
          useStore.setState({ configError: "name temporary file — no temporary file active" });
          return;
        }
        const current = a.slice(SCRATCH_PREFIX.length);
        s().openPrompt("Name for this temporary file", "notes.md", (v) => s().renameScratch(a, v), current);
      },
    },
    {
      id: "open-quick-file",
      title: "Open Quick File (Ctrl+Shift+Q)",
      run: () => void s().openQuickFile(),
    },
    { id: "save", title: "Save", run: () => void s().saveActive() },
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
    { id: "locate-file", title: "Locate File in Sidebar", run: () => s().revealActive() },
    {
      id: "copy-file-path",
      title: "Copy File Path",
      run: () => {
        const a = s().activePath;
        if (!a || isScratch(a)) {
          useStore.setState({ configError: "copy path — no file on disk (scratch buffer?)" });
          return;
        }
        void navigator.clipboard
          .writeText(a)
          .catch((e) => useStore.setState({ configError: `copy path — ${String(e)}` }));
      },
    },
    {
      id: "copy-file-name",
      title: "Copy File Name",
      run: () => {
        const a = s().activePath;
        if (!a || isScratch(a)) {
          useStore.setState({ configError: "copy name — no file on disk (scratch buffer?)" });
          return;
        }
        void navigator.clipboard
          .writeText(a.split(/[\\/]/).pop() ?? a)
          .catch((e) => useStore.setState({ configError: `copy name — ${String(e)}` }));
      },
    },
    { id: "renumber-list", title: "Renumber Ordered List", run: onMarkdownView(renumberOrderedList) },
    { id: "reformat-tables", title: "Reformat Markdown Table(s)", run: onMarkdownView(reformatTables) },
    { id: "format-bold", title: "Bold (surround with **…**)", run: onMarkdownView(toggleBold) },
    { id: "format-italic", title: "Italic (surround with *…*)", run: onMarkdownView(toggleItalic) },
    {
      // Pull every cited @key's raw BibTeX out of the configured .bib into a .bib scratch
      // buffer — same key detection as the linter (CITE_RE, prose-only, crossrefs skipped).
      id: "extract-refs",
      title: "Extract Citations to .bib (scratch)",
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
          useStore.setState({ configError: "extract refs — no citation keys in document" });
          return;
        }
        void extractBibEntries(keys)
          .then((bib) => useStore.getState().newScratch({ content: bib, ext: "bib" }))
          .catch((e) => useStore.setState({ configError: `extract refs — ${String(e)}` }));
      },
    },
    {
      // Any editor, not just markdown — timestamps are useful in every file type.
      id: "insert-datetime",
      title: "Insert Date-Time (YYYY-MM-DD HH:MM:SS)",
      run: () => {
        const view = getActiveView();
        if (!view) return;
        insertDateTime({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
        // The palette input held focus; return it to the editor so the caret (already
        // placed after the stamp by replaceSelection) is live and typing continues.
        view.focus();
      },
    },
    { id: "spell-toggle", title: "Toggle Spell Check", run: () => s().toggleSpell() },
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
              useStore.setState({ configError: String(e) });
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
      run: () => void s().openPersonalDictionary(),
    },
    {
      id: "spell-reload-dictionary",
      title: "Reload Personal Dictionary",
      run: () => void s().reloadPersonalDictionary(),
    },
    { id: "refresh-tree", title: "Refresh File Tree", run: () => void s().refreshTree() },
    // Explicit Show/Hide verbs (no state-flipping labels); Ctrl+K Ctrl+B / Ctrl+K Ctrl+O toggle.
    { id: "sidebar-show", title: "Show Sidebar (F10 toggles)", run: () => s().setSidebarVisible(true) },
    { id: "sidebar-hide", title: "Hide Sidebar (F10 toggles)", run: () => s().setSidebarVisible(false) },
    { id: "outline-show", title: "Show Outline (F11 toggles)", run: () => s().setOutlineVisible(true) },
    { id: "outline-hide", title: "Hide Outline (F11 toggles)", run: () => s().setOutlineVisible(false) },
    { id: "fullscreen-enter", title: "Enter Full Screen (Ctrl+F11 toggles)", run: () => s().setWindowFullscreen(true) },
    { id: "fullscreen-exit", title: "Exit Full Screen (Ctrl+F11 toggles)", run: () => s().setWindowFullscreen(false) },
    { id: "distraction-enter", title: "Enter Distraction Free (Ctrl+Shift+F11 toggles)", run: () => s().enterDistractionFree() },
    { id: "distraction-exit", title: "Exit Distraction Free (Ctrl+Shift+F11 toggles)", run: () => s().exitDistractionFree() },
    { id: "plain-enter", title: "Enter Plain View — editor only, no sidebars or preview", run: () => s().enterLayoutMode("plain") },
    { id: "plain-exit", title: "Exit Plain View", run: () => s().exitLayoutMode() },
    { id: "preview-zoom-in", title: "Preview: Zoom In", run: () => s().setPreviewZoom(1) },
    { id: "preview-zoom-out", title: "Preview: Zoom Out", run: () => s().setPreviewZoom(-1) },
    { id: "preview-zoom-reset", title: "Preview: Reset Zoom", run: () => s().setPreviewZoom("reset") },
    { id: "toggle-word-wrap", title: "Toggle Word Wrap", run: () => toggleWordWrap() },
    { id: "toggle-preview", title: "Toggle Preview (editor / split / preview)", run: () => s().cycleView() },
    { id: "open-help", title: "Open Help (help.md)", run: () => void s().openHelp() },
    { id: "help-shortcuts", title: "Help: Keyboard Shortcuts", run: () => s().toggleHelp() },
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
        if (dir) void openShell(dir).catch((e) => useStore.setState({ configError: String(e) }));
      },
    },
    { id: "render-doc", title: "Render Document (run code cells)", run: () => void s().renderActive() },
    { id: "render-cell", title: "Run This Cell (Ctrl+Enter — live kernel state)", run: () => void s().renderCell() },
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
      title: "Keybindings: Write All Shortcuts to Scratch File",
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
    { id: "next-tab", title: "Next Tab", run: () => s().nextTab(1) },
    { id: "prev-tab", title: "Previous Tab", run: () => s().nextTab(-1) },
    { id: "reopen-tab", title: "Reopen Closed Tab", run: () => void s().reopenClosed() },
    // ---- Projects (ST-style) ----
    {
      id: "proj-add-folder",
      title: "Project: Add Folder to Project…",
      run: () => void s().addFolderToProject(),
    },
    { id: "proj-new", title: "Project: New Project…", run: () => s().newProject() },
    { id: "proj-quick-switch", title: "Project: Quick Switch… (Ctrl+Alt+P)", run: () => s().openPalette("projects") },
    { id: "proj-save", title: "Project: Save / Rename Project…", run: () => s().saveRenameProject() },
    { id: "proj-open", title: "Project: Open Project…", run: () => void s().openProject() },
    { id: "proj-close", title: "Project: Close Project", run: () => s().closeProject() },
    {
      // Removes a folder from the project — never touches the folder on disk (spec §2).
      // The store action existed since projects shipped but nothing ever called it (A.02).
      id: "proj-open-file",
      title: "Project: Edit Project File (.wdproj)",
      run: () => {
        const f = s().projectFile;
        if (!f) {
          useStore.setState({ configError: "open project file — no project open" });
          return;
        }
        void s().openFile(f, false);
      },
    },
    ...projectFolderRemovals(),
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
    title: `Project: Remove Folder “${folder.replace(/[\\/]+$/, "").split(/[\\/]/).pop()}” (${folder})`,
    run: () => useStore.getState().removeProjectFolder(folder),
  }));
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
