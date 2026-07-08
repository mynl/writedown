// The command registry behind the command palette (Ctrl+Shift+P). Kept small and
// declarative so the palette is one source of truth for user-invocable actions.
import { type StateCommand } from "@codemirror/state";
import { configPath, restartKernel } from "./api";
import { useStore } from "./store";
import { getActiveView } from "./editor/editorView";
import { isMarkdownDoc } from "./editor/languages";
import { renumberOrderedList } from "./editor/lists";
import { reformatTables } from "./editor/tables";

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
    { id: "refresh-tree", title: "Refresh File Tree", run: () => void s().refreshTree() },
    { id: "toggle-preview", title: "Toggle Preview (editor / split / preview)", run: () => s().cycleView() },
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
    { id: "proj-save-as", title: "Project: Save Project As…", run: () => void s().saveProjectAs() },
    { id: "proj-open", title: "Project: Open Project…", run: () => void s().openProject() },
    { id: "proj-close", title: "Project: Close Project", run: () => s().closeProject() },
    // Quick switch: one entry per recent project (MRU order).
    ...s().recentProjects.map((p, i) => {
      const name = p.replace(/\\/g, "/").split("/").pop()!.replace(/\.wdproj$/i, "");
      return {
        id: `proj-switch-${i}`,
        title: `Project: Switch to “${name}”`,
        run: () => void s().openProject(p),
      };
    }),
  ];
}
