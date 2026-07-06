import { create } from "zustand";
import {
  listDirectory,
  loadSession,
  pickFolder,
  readFile,
  writeFile,
  type Entry,
  type Session,
} from "./api";

const MIN_PANE = 140;
const MAX_PANE = 600;
const clamp = (w: number) => Math.max(MIN_PANE, Math.min(MAX_PANE, w));

export type Doc = {
  path: string;
  /** Working copy, always \n-normalised internally. */
  content: string;
  /** Content as of the last successful save (for the dirty check). */
  savedContent: string;
  /** The file's original newline convention, reapplied on save (spec §12). */
  eol: "\n" | "\r\n";
  /** Sublime-style preview tab: single-click opens here and is replaced by the next
   *  single-click; double-clicking or editing promotes it to a permanent tab. */
  preview: boolean;
  saving: boolean;
  error: string | null;
};

export const isDirty = (d: Doc) => d.content !== d.savedContent;

type AppState = {
  root: string | null;
  rootEntries: Entry[];

  tabs: Doc[];
  activePath: string | null;
  /** Paths of recently closed tabs, for reopen (Ctrl+Shift+T). */
  closedStack: string[];

  treeWidth: number;
  outlineWidth: number;

  treeVersion: number;
  palette: "files" | "commands" | null;

  hydrate: () => Promise<void>;
  openFolder: () => Promise<void>;
  setRoot: (path: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  openFile: (path: string, preview?: boolean) => Promise<void>;
  setActive: (path: string) => void;
  promoteTab: (path: string) => void;
  closeTab: (path: string) => void;
  reopenClosed: () => Promise<void>;
  nextTab: (dir: 1 | -1) => void;
  editActive: (content: string) => void;
  saveActive: () => Promise<void>;
  openPalette: (mode: "files" | "commands") => void;
  closePalette: () => void;
  setTreeWidth: (w: number) => void;
  setOutlineWidth: (w: number) => void;
};

export const useStore = create<AppState>((set, get) => ({
  root: null,
  rootEntries: [],
  tabs: [],
  activePath: null,
  closedStack: [],
  treeVersion: 0,
  palette: null,
  treeWidth: 240,
  outlineWidth: 220,

  // Restore the last session on startup (spec §24). Missing folders/files are
  // skipped silently — a stale session must never block launch.
  hydrate: async () => {
    let s: Session;
    try {
      s = await loadSession();
    } catch {
      return;
    }
    if (s.tree_width != null) set({ treeWidth: clamp(s.tree_width) });
    if (s.outline_width != null) set({ outlineWidth: clamp(s.outline_width) });
    if (s.workspace) {
      try {
        await get().setRoot(s.workspace);
      } catch {
        /* workspace no longer exists */
      }
    }
    for (const p of s.open_tabs ?? []) {
      try {
        await get().openFile(p);
      } catch {
        /* file no longer exists */
      }
    }
    if (s.active_tab && get().tabs.some((t) => t.path === s.active_tab)) {
      set({ activePath: s.active_tab });
    }
  },

  openFolder: async () => {
    const picked = await pickFolder();
    if (picked) await get().setRoot(picked);
  },

  setRoot: async (path: string) => {
    const rootEntries = await listDirectory(path);
    set((s) => ({ root: path, rootEntries, treeVersion: s.treeVersion + 1 }));
  },

  // Re-list the workspace and remount the tree (F5 / Ctrl+Shift+R). External-change
  // auto-refresh via file watching is Phase 4.
  refreshTree: async () => {
    const { root } = get();
    if (!root) return;
    try {
      const rootEntries = await listDirectory(root);
      set((s) => ({ rootEntries, treeVersion: s.treeVersion + 1 }));
    } catch {
      /* folder gone */
    }
  },

  openFile: async (path: string, preview = false) => {
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      // Already open: focus it, and promote if this was a permanent open.
      set((s) => ({
        activePath: path,
        tabs:
          !preview && existing.preview
            ? s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t))
            : s.tabs,
      }));
      return;
    }
    const raw = await readFile(path);
    const eol: Doc["eol"] = raw.includes("\r\n") ? "\r\n" : "\n";
    const content = raw.split("\r\n").join("\n");
    const doc: Doc = {
      path, content, savedContent: content, eol, preview, saving: false, error: null,
    };
    set((s) => {
      // A single preview slot: a new preview replaces the current preview tab.
      if (preview) {
        const idx = s.tabs.findIndex((t) => t.preview);
        if (idx >= 0) {
          const tabs = s.tabs.slice();
          tabs[idx] = doc;
          return { tabs, activePath: path };
        }
      }
      return { tabs: [...s.tabs, doc], activePath: path };
    });
  },

  setActive: (path) => set({ activePath: path }),

  promoteTab: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t)),
    })),

  closeTab: (path) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path);
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activePath = s.activePath;
      if (s.activePath === path) {
        activePath = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].path : null;
      }
      return { tabs, activePath, closedStack: [...s.closedStack, path] };
    }),

  reopenClosed: async () => {
    const { closedStack } = get();
    if (!closedStack.length) return;
    const path = closedStack[closedStack.length - 1];
    set({ closedStack: closedStack.slice(0, -1) });
    try {
      await get().openFile(path);
    } catch {
      /* file no longer exists */
    }
  },

  nextTab: (dir) => {
    const { tabs, activePath } = get();
    if (tabs.length < 2) return;
    const i = tabs.findIndex((t) => t.path === activePath);
    const n = (i + dir + tabs.length) % tabs.length;
    set({ activePath: tabs[n].path });
  },

  editActive: (content) =>
    set((s) => ({
      // Editing promotes a preview tab to permanent (Sublime behaviour).
      tabs: s.tabs.map((t) =>
        t.path === s.activePath ? { ...t, content, preview: false } : t,
      ),
    })),

  saveActive: async () => {
    const { tabs, activePath } = get();
    const doc = tabs.find((t) => t.path === activePath);
    if (!doc || !isDirty(doc)) return;

    const snapshot = doc.content;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === doc.path ? { ...t, saving: true, error: null } : t,
      ),
    }));

    const out = doc.eol === "\r\n" ? snapshot.split("\n").join("\r\n") : snapshot;
    try {
      await writeFile(doc.path, out);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === doc.path ? { ...t, saving: false, savedContent: snapshot } : t,
        ),
      }));
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === doc.path ? { ...t, saving: false, error: String(e) } : t,
        ),
      }));
    }
  },

  openPalette: (mode) => set({ palette: mode }),
  closePalette: () => set({ palette: null }),

  setTreeWidth: (w) => set({ treeWidth: clamp(w) }),
  setOutlineWidth: (w) => set({ outlineWidth: clamp(w) }),
}));

/** The persistable slice of state (spec §24). */
export const sessionSnapshot = (s: AppState): Session => ({
  workspace: s.root,
  // Preview tabs are transient — persist only permanent tabs.
  open_tabs: s.tabs.filter((t) => !t.preview).map((t) => t.path),
  active_tab: s.activePath,
  tree_width: s.treeWidth,
  outline_width: s.outlineWidth,
});
