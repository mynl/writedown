// The command registry behind the command palette (Ctrl+Shift+P). Kept small and
// declarative so the palette is one source of truth for user-invocable actions.
import { type StateCommand } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forceLinting } from "@codemirror/lint";
import { addToDictionary, configPath, extractBibEntries, logError, restartKernel } from "./api";
import { mergedProjects, useStore } from "./store";
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
    { id: "new-scratch", title: "New Scratch File (unsaved)", run: () => s().newScratch() },
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
        if (view) insertDateTime({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
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
    { id: "refresh-tree", title: "Refresh File Tree", run: () => void s().refreshTree() },
    { id: "toggle-word-wrap", title: "Toggle Word Wrap", run: () => toggleWordWrap() },
    { id: "toggle-preview", title: "Toggle Preview (editor / split / preview)", run: () => s().cycleView() },
    { id: "help-shortcuts", title: "Help: Keyboard Shortcuts", run: () => s().toggleHelp() },
    { id: "render-doc", title: "Render Document (run code cells)", run: () => void s().renderActive() },
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
      id: "keys-write-config",
      title: "Keybindings: Write All Shortcuts to Config",
      run: () =>
        void s().writeKeymapToConfig(keymapConfigBlock(useStore.getState().editorSettings?.keys)),
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
    // Quick switch: every managed project (~/.writedown/projects/, name-sorted), plus any
    // recent project stored elsewhere that isn't already in the managed set.
    ...projectSwitches(),
  ];
}

/** Switch entries: the deduped, name-disambiguated managed+recent list (see mergedProjects). */
function projectSwitches(): Command[] {
  return mergedProjects(useStore.getState()).map((proj, i) => ({
    id: `proj-switch-${i}`,
    title: `Project: Switch to “${proj.name}”`,
    run: () => void useStore.getState().openProject(proj.path),
  }));
}
