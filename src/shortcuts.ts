// Single source of truth for the keyboard-shortcuts help overlay (Help.tsx / F1). Hand-
// maintained: the real bindings live in editor/keymap.ts and App.tsx — keep this in sync when
// they change. Grouped for display; keys are shown verbatim.
export type Shortcut = { keys: string; description: string };
export type ShortcutGroup = { category: string; items: Shortcut[] };

export const SHORTCUTS: ShortcutGroup[] = [
  {
    category: "Files & tabs",
    items: [
      { keys: "Ctrl+S", description: "Save" },
      { keys: "Ctrl+W", description: "Save and close tab" },
      { keys: "Ctrl+Shift+T", description: "Reopen closed tab" },
      { keys: "Ctrl+Tab", description: "Next tab" },
      { keys: "Ctrl+Shift+Tab", description: "Previous tab" },
      { keys: "F5  ·  Ctrl+Shift+R", description: "Refresh file tree" },
    ],
  },
  {
    category: "Selection & cursors",
    items: [
      { keys: "Ctrl+D", description: "Select next occurrence" },
      { keys: "Ctrl+L", description: "Select line" },
      { keys: "Ctrl+Alt+Up  ·  Ctrl+Alt+Down", description: "Add cursor above · below" },
      { keys: "Alt+drag", description: "Column (rectangular) selection" },
    ],
  },
  {
    category: "Editing",
    items: [
      { keys: "Ctrl+Shift+D", description: "Duplicate line down" },
      { keys: "Ctrl+Shift+Up  ·  Ctrl+Shift+Down", description: "Move line up · down" },
      { keys: "Ctrl+Shift+J", description: "Join lines" },
      { keys: "Ctrl+/", description: "Toggle comment" },
      { keys: "Ctrl+K", description: "Delete to end of line" },
      { keys: "Ctrl+Z  ·  Ctrl+Y", description: "Undo · redo" },
    ],
  },
  {
    category: "Markdown",
    items: [
      { keys: "Ctrl+B", description: "Bold (**…**)" },
      { keys: "Ctrl+I", description: "Italic (*…*)" },
      { keys: "Ctrl+Alt+Shift+T", description: "Reformat table(s)" },
      { keys: "Ctrl+Shift+B", description: "Build (render document)" },
    ],
  },
  {
    category: "View",
    items: [
      { keys: "Ctrl+Shift+L", description: "Toggle preview (editor / split / preview)" },
      { keys: "Ctrl+=  ·  Ctrl+-  ·  Ctrl+0", description: "Editor zoom in · out · reset" },
    ],
  },
  {
    category: "Search",
    items: [
      { keys: "Ctrl+F", description: "Find" },
      { keys: "Ctrl+H", description: "Replace" },
      { keys: "Ctrl+G", description: "Go to line" },
    ],
  },
  {
    category: "Palette & help",
    items: [
      { keys: "Ctrl+P", description: "Quick open file" },
      { keys: "Ctrl+Shift+P", description: "Command palette (all commands)" },
      { keys: "F1", description: "Keyboard shortcuts (this list)" },
    ],
  },
];
