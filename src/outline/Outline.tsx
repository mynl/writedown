import { useMemo, type CSSProperties } from "react";
import { useStore } from "../store";
import { parseOutline } from "./parse";
import { jumpToLine } from "../editor/editorView";
import { scrollPreviewToLine } from "../preview/Preview";
import { useDebouncedValue } from "../useDebounced";

// In preview-only view there is no live editor — jumpToLine hits a destroyed view and
// nothing happens (the "TOC links don't work" bug). Drive the preview directly there;
// everywhere else the editor jump is authoritative and sync-scroll drags the preview.
function jumpTo(line: number) {
  if (useStore.getState().viewMode === "preview") scrollPreviewToLine(line);
  else jumpToLine(line);
}

export function Outline() {
  const activePath = useStore((s) => s.activePath);
  const tabs = useStore((s) => s.tabs);
  const cursorLine = useStore((s) => s.cursorLine);
  const doc = tabs.find((t) => t.path === activePath) ?? null;

  // Debounced source: parseOutline scans every line of the doc, far too heavy to run per
  // keystroke (the Outline is mounted in every layout, even with the preview hidden). The
  // path resetKey keeps tab switches instant.
  const src = useDebouncedValue(doc?.content ?? "", 300, doc?.path);
  // Python member filters from config [outline]; read reactively so a config save reflows
  // the outline without a restart, like the font settings do.
  const showPrivate = useStore((s) => s.editorSettings?.outline_python_show_private);
  const showDunder = useStore((s) => s.editorSettings?.outline_python_show_dunder);
  const headings = useMemo(
    () =>
      doc
        ? parseOutline(src, doc.path, {
            pythonShowPrivate: showPrivate ?? undefined,
            pythonShowDunder: showDunder ?? undefined,
          })
        : [],
    [src, doc?.path, showPrivate, showDunder],
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
          onClick={() => jumpTo(h.line)}
          title={h.text}
        >
          {h.text}
        </div>
      ))}
    </div>
  );
}
