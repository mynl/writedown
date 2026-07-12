// Keyboard-shortcuts overlay (F1 / palette "Help: Keyboard Shortcuts"). Reuses the command
// palette's backdrop; the catalog is src/shortcuts.ts. Esc or a backdrop click closes it.
import { useEffect } from "react";
import { useStore } from "./store";
import { SHORTCUTS } from "./shortcuts";

export function Help() {
  const open = useStore((s) => s.helpOpen);
  const toggleHelp = useStore((s) => s.toggleHelp);

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

  return (
    <div className="palette-backdrop" onMouseDown={() => toggleHelp()}>
      <div className="help" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-header">
          <span>Keyboard shortcuts</span>
          <button className="help-close" title="Close (Esc)" onClick={() => toggleHelp()}>
            ×
          </button>
        </div>
        <div className="help-body">
          {SHORTCUTS.map((group) => (
            <div key={group.category} className="help-group">
              <div className="help-cat">{group.category}</div>
              {group.items.map((sc) => (
                <div key={sc.keys + sc.description} className="help-row">
                  <span className="help-keys">{sc.keys}</span>
                  <span className="help-desc">{sc.description}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
