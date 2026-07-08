import { useMemo, type CSSProperties } from "react";
import { useStore } from "../store";
import { parseOutline } from "./parse";
import { jumpToLine } from "../editor/editorView";

export function Outline() {
  const activePath = useStore((s) => s.activePath);
  const tabs = useStore((s) => s.tabs);
  const cursorLine = useStore((s) => s.cursorLine);
  const doc = tabs.find((t) => t.path === activePath) ?? null;

  const headings = useMemo(
    () => (doc ? parseOutline(doc.content, doc.path) : []),
    [doc?.content, doc?.path],
  );

  // Active heading = the last one at or before the cursor line (spec §18).
  let active = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].line <= cursorLine) active = i;
    else break;
  }

  if (!doc) return <div className="placeholder">&mdash;</div>;
  if (headings.length === 0) return <div className="placeholder">No outline</div>;

  return (
    <div className="outline">
      {headings.map((h, i) => (
        <div
          key={`${h.line}-${i}`}
          className={"outline-item" + (i === active ? " active" : "")}
          style={
            {
              paddingLeft: 8 + (h.level - 1) * 12,
              // Width of the indent region — drives the tree guide lines (see App.css).
              "--indent": `${(h.level - 1) * 12}px`,
            } as CSSProperties
          }
          onClick={() => jumpToLine(h.line)}
          title={h.text}
        >
          {h.text}
        </div>
      ))}
    </div>
  );
}
