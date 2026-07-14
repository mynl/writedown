// App-level / global shortcuts for the F1 help. The EDITOR bindings are GENERATED from the keymap
// source (editorShortcutRows in editor/keymap.ts) so the help always reflects your config [keys];
// only the app-level keys — which live in App.tsx, not the editor keymap, and aren't remappable —
// are listed statically here.
export type Shortcut = { keys: string; description: string };
export type ShortcutGroup = { category: string; items: Shortcut[] };

export const APP_SHORTCUTS: ShortcutGroup[] = [
  {
    category: "Files & app",
    items: [
      { keys: "Ctrl+S", description: "Save" },
      { keys: "Ctrl+W", description: "Save and close tab" },
      { keys: "Ctrl+Shift+T", description: "Reopen closed tab" },
      { keys: "Ctrl+Shift+Q", description: "Open quick file ([files] quick_file)" },
      { keys: "F5  ·  Ctrl+Shift+R", description: "Refresh file tree" },
      { keys: "F1", description: "Keyboard shortcuts (this list)" },
    ],
  },
];

// Order the categories appear in the help (editor categories first, then app-level).
export const CATEGORY_ORDER = [
  "Selection & cursors",
  "Editing",
  "Markdown",
  "View",
  "Search",
  "Tabs & palette",
  "Files & app",
];
