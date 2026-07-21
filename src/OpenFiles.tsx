import { useRef, useState } from "react";
import { isDirty, useStore } from "./store";

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** ST-style "Open Files" section at the top of the side panel (both Folder and Project
 *  tabs): one row per open EDITING tab. The transient preview tab is NOT listed (ST
 *  behaviour, issue Fr 2) — its italic tab is the only clue; it joins this list the
 *  moment an edit promotes it. Same semantics as the tab strip — click activates,
 *  × saves then closes, and pointer-drag reorders (rows and tab strip share the
 *  array, so both views stay in sync). */
export function OpenFiles() {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const setActive = useStore((s) => s.setActive);
  const closeTab = useStore((s) => s.closeTab);
  const saveDoc = useStore((s) => s.saveDoc);
  const moveTab = useStore((s) => s.moveTab);
  const rows = tabs.filter((t) => !t.preview);

  // Vertical transplant of the tab strip's pointer drag (Tabs.tsx): 5 px threshold
  // separates a drag from a click, then the list reorders live as the pointer crosses
  // sibling row midpoints. HTML5 drag-and-drop stays out — unreliable in webviews.
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ path: string; startY: number; active: boolean } | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);

  function onPointerDown(e: React.PointerEvent, path: string) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".tab-close")) return; // × stays a plain click
    drag.current = { path, startY: e.clientY, active: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < 5) return;
      d.active = true;
      setDraggingPath(d.path);
      setActive(d.path); // dragging selects the row, like ST
    }
    const list = listRef.current;
    if (!list) return;
    // Target = number of OTHER rows whose midpoint lies above the pointer…
    let to = 0;
    for (const el of list.querySelectorAll<HTMLElement>(".openfile")) {
      if (el.dataset.path === d.path) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) to++;
    }
    // …but that counts VISIBLE rows, and the hidden preview tab keeps its slot in the
    // full tabs array — translate to the index with `to` visible rows above it.
    const rest = useStore.getState().tabs.filter((t) => t.path !== d.path);
    let full = 0;
    for (let vis = 0; full < rest.length && vis < to; full++) {
      if (!rest[full].preview) vis++;
    }
    moveTab(d.path, full);
  }

  function onPointerEnd() {
    drag.current = null;
    setDraggingPath(null);
  }

  if (rows.length === 0) return null;

  return (
    <div className="openfiles">
      <div className="pane-header">Open Files</div>
      <div className="tree openfiles-list" role="list" ref={listRef}>
        {rows.map((t) => (
          <div
            key={t.path}
            data-path={t.path}
            className={
              "tree-row openfile" +
              (t.path === activePath ? " active" : "") +
              (t.path === draggingPath ? " dragging" : "")
            }
            title={t.path}
            role="listitem"
            onClick={() => setActive(t.path)}
            onPointerDown={(e) => onPointerDown(e, t.path)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <span className="openfile-dirty">{isDirty(t) ? "●" : ""}</span>
            <span className="tree-name">{basename(t.path)}</span>
            <span
              className="tab-close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                // Save-then-close, like the tab strip (autosave means nothing is lost).
                void saveDoc(t.path).finally(() => closeTab(t.path));
              }}
            >
              ×
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
