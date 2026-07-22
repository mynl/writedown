// Keyboard-shortcuts overlay (F1 / palette "Help: Keyboard Shortcuts"). The editor section is
// GENERATED from the live keymap (defaults + your config [keys]), so it always reflects reality;
// app-level keys come from the static shortcuts.ts. Esc or a backdrop click closes it.
import { useEffect } from "react";
import { useStore } from "./store";
import { APP_SHORTCUTS, CATEGORY_ORDER } from "./shortcuts";
import { editorShortcutRows } from "./editor/keymap";
import { COMMAND_REGISTRY } from "./editor/commandRegistry";

type Row = { keys: string; description: string; action?: string };

export function Help() {
  const open = useStore((s) => s.helpOpen);
  const toggleHelp = useStore((s) => s.toggleHelp);
  const openHelp = useStore((s) => s.openHelp);
  const userKeys = useStore((s) => s.editorSettings?.keys);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        toggleHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggleHelp]);

  if (!open) return null;

  // Group generated editor rows by category, then append the static app rows.
  const byCat = new Map<string, Row[]>();
  for (const r of editorShortcutRows(userKeys)) {
    const list = byCat.get(r.category) ?? [];
    list.push({ keys: r.keys, description: r.description, action: r.action });
    byCat.set(r.category, list);
  }
  for (const g of APP_SHORTCUTS) byCat.set(g.category, g.items.map((i) => ({ ...i })));

  const groups = CATEGORY_ORDER.filter((c) => byCat.has(c)).map((category) => ({
    category,
    items: byCat.get(category)!,
  }));

  // Actions that exist but aren't bound to any key — so you can discover and bind them.
  const bound = new Set(editorShortcutRows(userKeys).map((r) => r.action));
  const unbound: Row[] = Object.entries(COMMAND_REGISTRY)
    .filter(([action]) => !bound.has(action))
    .map(([action, e]) => ({ keys: "—", description: e.label, action }));
  if (unbound.length) groups.push({ category: "More actions (unbound)", items: unbound });

  return (
    <div className="palette-backdrop" onMouseDown={() => toggleHelp()}>
      <div className="help" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-header">
          <span>Keyboard shortcuts</span>
          <button className="help-close" title="Close (Esc)" onClick={() => toggleHelp()}>
            ×
          </button>
        </div>
        <div className="help-note">
          Editor keys are set in <code>config.toml</code> under <code>[keys]</code> — hover a row for
          its action name. App keys (Save, palette, F5) are fixed.
        </div>
        <div className="help-body">
          {groups.map((group) => (
            <div key={group.category} className="help-group">
              <div className="help-cat">{group.category}</div>
              {group.items.map((sc) => (
                <div
                  key={sc.keys + sc.description}
                  className="help-row"
                  title={sc.action ? `action name: ${sc.action}` : undefined}
                >
                  <span className="help-keys">{sc.keys}</span>
                  <span className="help-desc">{sc.description}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="help-note">
          Full user guide:{" "}
          <button
            className="help-link"
            onClick={() => {
              void openHelp();
              toggleHelp();
            }}
          >
            Open Help (help.md)
          </button>{" "}
          — also on the palette and the <code>?</code> button, top right.
        </div>
      </div>
    </div>
  );
}
