import { create } from "zustand";
import {
  listDirectory,
  pickFolder,
  readFile,
  writeFile,
  type Entry,
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
  saving: boolean;
  error: string | null;
};

export const isDirty = (d: Doc) => d.content !== d.savedContent;

type AppState = {
  root: string | null;
  rootEntries: Entry[];

  tabs: Doc[];
  activePath: string | null;

  treeWidth: number;
  outlineWidth: number;

  openFolder: () => Promise<void>;
  setRoot: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  setActive: (path: string) => void;
  closeTab: (path: string) => void;
  editActive: (content: string) => void;
  saveActive: () => Promise<void>;
  setTreeWidth: (w: number) => void;
  setOutlineWidth: (w: number) => void;
};

export const useStore = create<AppState>((set, get) => ({
  root: null,
  rootEntries: [],
  tabs: [],
  activePath: null,
  treeWidth: 240,
  outlineWidth: 220,

  openFolder: async () => {
    const picked = await pickFolder();
    if (picked) await get().setRoot(picked);
  },

  setRoot: async (path: string) => {
    const rootEntries = await listDirectory(path);
    set({ root: path, rootEntries });
  },

  openFile: async (path: string) => {
    if (get().tabs.some((t) => t.path === path)) {
      set({ activePath: path });
      return;
    }
    const raw = await readFile(path);
    const eol: Doc["eol"] = raw.includes("\r\n") ? "\r\n" : "\n";
    const content = raw.split("\r\n").join("\n");
    const doc: Doc = { path, content, savedContent: content, eol, saving: false, error: null };
    set((s) => ({ tabs: [...s.tabs, doc], activePath: path }));
  },

  setActive: (path) => set({ activePath: path }),

  closeTab: (path) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path);
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activePath = s.activePath;
      if (s.activePath === path) {
        activePath = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].path : null;
      }
      return { tabs, activePath };
    }),

  editActive: (content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === s.activePath ? { ...t, content } : t)),
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

  setTreeWidth: (w) => set({ treeWidth: clamp(w) }),
  setOutlineWidth: (w) => set({ outlineWidth: clamp(w) }),
}));
