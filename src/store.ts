import { create } from "zustand";
import { listDirectory, pickFolder, readFile, type Entry } from "./api";

const MIN_PANE = 140;
const MAX_PANE = 600;

type AppState = {
  root: string | null;
  rootEntries: Entry[];

  // Single open document (tabs arrive in 1.2.0).
  activePath: string | null;
  activeContent: string;

  // Resizable sidebar widths (restored between sessions in 1.3.0).
  treeWidth: number;
  outlineWidth: number;

  openFolder: () => Promise<void>;
  setRoot: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  setTreeWidth: (w: number) => void;
  setOutlineWidth: (w: number) => void;
};

const clamp = (w: number) => Math.max(MIN_PANE, Math.min(MAX_PANE, w));

export const useStore = create<AppState>((set) => ({
  root: null,
  rootEntries: [],
  activePath: null,
  activeContent: "",
  treeWidth: 240,
  outlineWidth: 220,

  openFolder: async () => {
    const picked = await pickFolder();
    if (picked) await useStore.getState().setRoot(picked);
  },

  setRoot: async (path: string) => {
    const rootEntries = await listDirectory(path);
    set({ root: path, rootEntries });
  },

  openFile: async (path: string) => {
    const content = await readFile(path);
    set({ activePath: path, activeContent: content });
  },

  setTreeWidth: (w) => set({ treeWidth: clamp(w) }),
  setOutlineWidth: (w) => set({ outlineWidth: clamp(w) }),
}));
