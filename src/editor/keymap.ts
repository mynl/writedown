// Sublime-style editing (spec §10), now DATA-DRIVEN: DEFAULT_KEYS below is the single source of
// truth, merged with the user's config [keys] table and resolved through commandRegistry.ts. The
// resulting keymap lives in a Compartment so a config save reconfigures it live — no rebuild, no
// restart, no code change (see Editor.tsx + wrap.ts for the Compartment pattern).
import { crosshairCursor, keymap, rectangularSelection, type Command } from "@codemirror/view";
import { Compartment, Prec } from "@codemirror/state";
import { COMMAND_REGISTRY } from "./commandRegistry";
import { toCmKey } from "./keyFormat";

/** Column selection (Alt+drag) + crosshair — always on, not part of the configurable keymap. */
export const editingExtras = [rectangularSelection(), crosshairCursor()];

/** The reconfigurable slot the editing keymap lives in. */
export const keymapCompartment = new Compartment();

/** Default editor bindings as friendly-key → action name. App-level keys (Save, Ctrl+W, palette,
 *  F5) live in App.tsx and are NOT configurable here. */
export const DEFAULT_KEYS: { key: string; action: string }[] = [
  { key: "Ctrl+D", action: "selectNextOccurrence" },
  { key: "Ctrl+L", action: "selectLine" },
  { key: "Ctrl+Shift+D", action: "duplicateLine" },
  { key: "Ctrl+Shift+Up", action: "moveLineUp" },
  { key: "Ctrl+Shift+Down", action: "moveLineDown" },
  { key: "Ctrl+/", action: "toggleComment" },
  { key: "Ctrl+Shift+J", action: "joinLines" },
  { key: "Ctrl+Alt+Shift+T", action: "reformatTable" },
  { key: "Ctrl+=", action: "zoomIn" },
  { key: "Ctrl+Shift+=", action: "zoomIn" },
  { key: "Ctrl+-", action: "zoomOut" },
  { key: "Ctrl+0", action: "zoomReset" },
  { key: "Ctrl+Alt+Up", action: "addCursorAbove" },
  { key: "Ctrl+Alt+Down", action: "addCursorBelow" },
  { key: "Ctrl+Shift+L", action: "togglePreview" },
  { key: "Ctrl+B", action: "bold" },
  { key: "Ctrl+I", action: "italic" },
  { key: "Ctrl+Shift+B", action: "build" },
  { key: "Ctrl+K", action: "killToLineEnd" },
  { key: "Ctrl+F", action: "find" },
  { key: "Ctrl+H", action: "replace" },
  { key: "Ctrl+G", action: "gotoLine" },
  { key: "Ctrl+Tab", action: "nextTab" },
  { key: "Ctrl+Shift+Tab", action: "prevTab" },
  { key: "Ctrl+P", action: "filePalette" },
  { key: "Ctrl+Shift+P", action: "commandPalette" },
  // Broadened Sublime coverage:
  { key: "Ctrl+Shift+K", action: "deleteLine" },
  { key: "Alt+Left", action: "subwordLeft" },
  { key: "Alt+Right", action: "subwordRight" },
  { key: "Ctrl+Shift+[", action: "foldCode" },
  { key: "Ctrl+Shift+]", action: "unfoldCode" },
];

/** Effective friendly-key → action map: defaults overlaid with the user's [keys] ("" / "none"
 *  unbinds a default). */
function mergedKeys(userKeys?: Record<string, string> | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const { key, action } of DEFAULT_KEYS) map.set(key, action);
  if (userKeys) {
    for (const [key, action] of Object.entries(userKeys)) {
      const a = String(action).trim();
      if (a === "" || a.toLowerCase() === "none") map.delete(key);
      else map.set(key, a);
    }
  }
  return map;
}

function resolve(userKeys?: Record<string, string> | null): {
  bindings: { key: string; run: Command; preventDefault: boolean }[];
  warnings: string[];
} {
  const bindings = [];
  const warnings: string[] = [];
  for (const [key, action] of mergedKeys(userKeys)) {
    const entry = COMMAND_REGISTRY[action];
    if (!entry) {
      warnings.push(`unknown action "${action}" (key ${key})`);
      continue;
    }
    const cmKey = toCmKey(key);
    if (!cmKey) {
      warnings.push(`invalid key "${key}"`);
      continue;
    }
    bindings.push({ key: cmKey, run: entry.run, preventDefault: true });
  }
  return { bindings, warnings };
}

/** The editing keymap extension (goes inside keymapCompartment). Highest precedence so it wins
 *  over language/default bindings. */
export function buildEditingKeymap(userKeys?: Record<string, string> | null) {
  return Prec.highest(keymap.of(resolve(userKeys).bindings));
}

/** Warnings from resolving the user's [keys] (unknown action / bad key) — surfaced by Editor.tsx
 *  (an effect, so it never sets state during render). */
export function keymapWarnings(userKeys?: Record<string, string> | null): string[] {
  return resolve(userKeys).warnings;
}

/** Effective bindings joined with their human labels, for the F1 help. */
export function editorShortcutRows(userKeys?: Record<string, string> | null): {
  keys: string;
  description: string;
  action: string;
  category: string;
}[] {
  const rows = [];
  for (const [key, action] of mergedKeys(userKeys)) {
    const entry = COMMAND_REGISTRY[action];
    if (!entry) continue;
    rows.push({ keys: key, description: entry.label, action, category: entry.category });
  }
  return rows;
}
