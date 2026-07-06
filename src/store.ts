import { create } from "zustand";
import {
  configPath,
  listDirectory,
  loadEditorSettings,
  loadLastWorkspace,
  loadSession,
  loadSublimeTheme,
  pickFolder,
  readFile,
  saveLastWorkspace,
  watchWorkspace,
  writeFile,
  type EditorSettings,
  type Entry,
  type Session,
  type SublimeTheme,
} from "./api";

// Paths Writedown just saved — used to ignore the watcher event our own write triggers.
const justSaved = new Set<string>();
let fsRefreshTimer: ReturnType<typeof setTimeout> | undefined;

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
  /** Changed on disk externally while this tab had unsaved edits (spec §14). */
  conflict: boolean;
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
  viewMode: "editor" | "split" | "preview";
  cursorLine: number;
  sublimeTheme: SublimeTheme | null;
  editorSettings: EditorSettings | null;
  configFile: string | null;

  hydrate: () => Promise<void>;
  loadTheme: () => Promise<void>;
  openFolder: () => Promise<void>;
  setRoot: (path: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  openFile: (path: string, preview?: boolean) => Promise<void>;
  reloadDoc: (path: string) => Promise<void>;
  onFsChange: (paths: string[]) => void;
  setActive: (path: string) => void;
  promoteTab: (path: string) => void;
  closeTab: (path: string) => void;
  reopenClosed: () => Promise<void>;
  nextTab: (dir: 1 | -1) => void;
  editActive: (content: string) => void;
  saveDoc: (path: string) => Promise<void>;
  saveActive: () => Promise<void>;
  saveAll: () => Promise<void>;
  openPalette: (mode: "files" | "commands") => void;
  closePalette: () => void;
  cycleView: () => void;
  setCursorLine: (n: number) => void;
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
  viewMode: "split",
  cursorLine: 1,
  sublimeTheme: null,
  editorSettings: null,
  configFile: null,
  treeWidth: 240,
  outlineWidth: 220,

  // Restore the last session on startup (spec §24), keyed by workspace. Missing
  // folders/files are skipped silently — a stale session must never block launch.
  hydrate: async () => {
    let ws: string | null = null;
    try {
      ws = await loadLastWorkspace();
    } catch {
      return;
    }
    if (!ws) return;
    try {
      await get().setRoot(ws);
    } catch {
      return; // workspace no longer exists
    }
    let s: Session;
    try {
      s = await loadSession(ws);
    } catch {
      return;
    }
    if (s.tree_width != null) set({ treeWidth: clamp(s.tree_width) });
    if (s.outline_width != null) set({ outlineWidth: clamp(s.outline_width) });
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
    void saveLastWorkspace(path); // remember for the next cold start
    void watchWorkspace(path).catch(() => {}); // watch for external changes (spec §14)
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
      conflict: false,
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

  setActive: (path) => {
    const prev = get().activePath;
    if (prev && prev !== path) void get().saveDoc(prev); // autosave the tab we leave
    set({ activePath: path });
  },

  promoteTab: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, preview: false } : t)),
    })),

  reloadDoc: async (path) => {
    if (!get().tabs.some((t) => t.path === path)) return;
    try {
      const raw = await readFile(path);
      const eol: Doc["eol"] = raw.includes("\r\n") ? "\r\n" : "\n";
      const content = raw.split("\r\n").join("\n");
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path
            ? { ...t, content, savedContent: content, eol, conflict: false, error: null }
            : t,
        ),
      }));
    } catch {
      /* file removed/unreadable — leave the tab as-is */
    }
  },

  // React to external filesystem changes (spec §14): refresh the tree (soft, so expanded
  // folders stay open), reload unmodified open files, flag conflicts on modified ones.
  // Ignores the events our own saves trigger.
  onFsChange: (paths) => {
    const root = get().root;
    if (root) {
      clearTimeout(fsRefreshTimer);
      fsRefreshTimer = setTimeout(() => {
        listDirectory(root)
          .then((rootEntries) => set({ rootEntries }))
          .catch(() => {});
      }, 400);
    }
    const open = new Map(get().tabs.map((t) => [t.path, t]));
    for (const p of paths) {
      if (justSaved.has(p)) continue;
      const doc = open.get(p);
      if (!doc) continue;
      if (isDirty(doc)) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.path === p ? { ...t, conflict: true } : t)),
        }));
      } else {
        void get().reloadDoc(p);
      }
    }
  },

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

  saveDoc: async (path) => {
    const doc = get().tabs.find((t) => t.path === path);
    if (!doc || !isDirty(doc) || doc.saving) return;

    const snapshot = doc.content;
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, saving: true, error: null } : t)),
    }));

    const out = doc.eol === "\r\n" ? snapshot.split("\n").join("\r\n") : snapshot;
    try {
      await writeFile(path, out);
      justSaved.add(path); // ignore the watcher event our own write will trigger
      setTimeout(() => justSaved.delete(path), 1500);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path
            ? { ...t, saving: false, savedContent: snapshot, conflict: false }
            : t,
        ),
      }));
      // Saving config.toml re-applies appearance live (e.g. font_size).
      if (path === get().configFile) void get().loadTheme();
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.path === path ? { ...t, saving: false, error: String(e) } : t)),
      }));
    }
  },

  saveActive: async () => {
    const a = get().activePath;
    if (a) await get().saveDoc(a);
  },

  // Autosave every dirty document (window blur, idle, app close — spec §12).
  saveAll: async () => {
    for (const t of get().tabs) {
      if (isDirty(t)) await get().saveDoc(t.path);
    }
  },

  // Load appearance: Sublime colour scheme (spec §11) + config editor settings. On any
  // failure the built-in theme / defaults stay. Re-run to pick up config.toml edits.
  loadTheme: async () => {
    try {
      const st = await loadSublimeTheme();
      const root = document.documentElement.style;
      // Selection + YAML front-matter colours go through CSS vars (global CSS reliably
      // overrides CodeMirror). Loudoun → orange keys, green values.
      root.setProperty("--cm-sel", st.selection);
      const pick = (...scopes: string[]) => {
        for (const s of scopes) {
          const r =
            st.rules.find((x) => x.scope === s) ??
            st.rules.find((x) => x.scope.split(/[ ,]+/).includes(s));
          if (r?.foreground) return r.foreground;
        }
        return undefined;
      };
      const key = pick("entity.name.tag.yaml", "keyword");
      const val = pick("string");
      const delim = pick("comment");
      if (key) root.setProperty("--wd-yaml-key", key);
      if (val) root.setProperty("--wd-yaml-val", val);
      if (delim) root.setProperty("--wd-yaml-delim", delim);
      set({ sublimeTheme: st });
    } catch {
      /* no Sublime install / unreadable — the built-in theme stays */
    }
    try {
      set({ editorSettings: await loadEditorSettings() });
    } catch {
      /* config unreadable — editor defaults stay */
    }
    try {
      set({ configFile: await configPath() });
    } catch {
      /* ignore */
    }
  },

  openPalette: (mode) => set({ palette: mode }),
  closePalette: () => set({ palette: null }),

  cycleView: () =>
    set((s) => ({
      viewMode:
        s.viewMode === "editor" ? "split" : s.viewMode === "split" ? "preview" : "editor",
    })),

  setCursorLine: (n) => {
    if (get().cursorLine !== n) set({ cursorLine: n });
  },

  setTreeWidth: (w) => set({ treeWidth: clamp(w) }),
  setOutlineWidth: (w) => set({ outlineWidth: clamp(w) }),
}));

/** The persistable slice of state (spec §24). */
export const sessionSnapshot = (s: AppState): Session => ({
  // Preview tabs are transient — persist only permanent tabs.
  open_tabs: s.tabs.filter((t) => !t.preview).map((t) => t.path),
  active_tab: s.activePath,
  tree_width: s.treeWidth,
  outline_width: s.outlineWidth,
});
