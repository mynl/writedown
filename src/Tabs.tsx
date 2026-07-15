import { useRef, useState } from "react";
import { isDirty, useStore } from "./store";

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function Tabs() {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const setActive = useStore((s) => s.setActive);
  const promoteTab = useStore((s) => s.promoteTab);
  const closeTab = useStore((s) => s.closeTab);
  const saveDoc = useStore((s) => s.saveDoc);
  const moveTab = useStore((s) => s.moveTab);

  // Drag-to-reorder (pointer events — HTML5 drag-and-drop is unreliable in webviews).
  // A ~5 px threshold separates a drag from a click; past it, the strip reorders live
  // as the pointer crosses sibling midpoints. Session tab order follows the array.
  const stripRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ path: string; startX: number; active: boolean } | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);

  function onPointerDown(e: React.PointerEvent, path: string) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".tab-close")) return; // × stays a plain click
    drag.current = { path, startX: e.clientX, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      if (Math.abs(e.clientX - d.startX) < 5) return;
      d.active = true;
      setDraggingPath(d.path);
      setActive(d.path); // dragging selects the tab, like ST
    }
    const strip = stripRef.current;
    if (!strip) return;
    // Final index = number of OTHER tabs whose midpoint lies left of the pointer.
    let to = 0;
    for (const el of strip.querySelectorAll<HTMLElement>(".tab")) {
      if (el.dataset.path === d.path) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX > r.left + r.width / 2) to++;
    }
    moveTab(d.path, to);
  }

  function onPointerEnd() {
    drag.current = null;
    setDraggingPath(null);
  }

  if (tabs.length === 0) return null;

  function onClose(e: React.MouseEvent, path: string) {
    e.stopPropagation();
    // Save-then-close (no confirm dialog — autosave means edits are never lost).
    void saveDoc(path).finally(() => closeTab(path));
  }

  return (
    <div className="tabs" role="tablist" ref={stripRef}>
      {tabs.map((t) => {
        const dirty = isDirty(t);
        return (
          <div
            key={t.path}
            data-path={t.path}
            className={
              "tab" +
              (t.path === activePath ? " active" : "") +
              (t.preview ? " preview" : "") +
              (t.path === draggingPath ? " dragging" : "")
            }
            onClick={() => setActive(t.path)}
            onDoubleClick={() => promoteTab(t.path)}
            onPointerDown={(e) => onPointerDown(e, t.path)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            title={t.path}
            role="tab"
            aria-selected={t.path === activePath}
          >
            {dirty && <span className="tab-dirty">●</span>}
            <span className="tab-name">{basename(t.path)}</span>
            <span className="tab-close" onClick={(e) => onClose(e, t.path)} title="Close tab">
              ×
            </span>
          </div>
        );
      })}
    </div>
  );
}
