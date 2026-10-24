// The app's right-click menus (issue J.20): one generic menu, its markup and backdrop
// taken from the file tree's, used by the tree and by the editor's citation menu. Each
// menu's open state lives in the store; this draws it, closes it on a click outside, a
// right-click outside, or Escape, and runs the chosen entry after closing.
import { useEffect } from "react";
import { useStore } from "./store";
import { citationDocumentUrl, openCitationDocument } from "./editor/citations";
import { copyText } from "./clipboardOps";

/** One row of a menu, or a separator line. */
export type MenuEntry = { label: string; run: () => void; disabled?: boolean } | "separator";

/** A menu at the pointer. `estWidth` / `estHeight` keep it on screen near the right and
 *  bottom edges: an estimate of its size, as the tree menu has always used, rather than a
 *  measurement, so the tree's menu lands exactly where it did. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
  estWidth = 176,
  estHeight = 210,
}: {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose: () => void;
  estWidth?: number;
  estHeight?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="ctx-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="context-menu"
        style={{
          left: Math.min(x, window.innerWidth - estWidth),
          top: Math.min(y, window.innerHeight - estHeight),
        }}
      >
        {items.map((it, i) =>
          it === "separator" ? (
            <div key={i} className="ctx-sep" />
          ) : (
            <div
              key={i}
              className={"ctx-item" + (it.disabled ? " disabled" : "")}
              onClick={() => {
                if (it.disabled) return;
                onClose();
                it.run();
              }}
            >
              {it.label}
            </div>
          ),
        )}
      </div>
    </>
  );
}

/** Right-click over a citation key in the editor (issue J.20): open the reference's
 *  document through `[bibliography] viewer_url`, or copy the key. Mounted once at the app
 *  root; the editor's contextmenu handler opens it only when viewer_url is set. */
export function CiteContextMenu() {
  const menu = useStore((s) => s.citeMenu);
  const close = useStore((s) => s.closeCiteMenu);
  if (!menu) return null;
  const { key } = menu;
  const items: MenuEntry[] = [
    {
      label: `Open Document for @${key}`,
      run: () => openCitationDocument(key),
      disabled: citationDocumentUrl(key) === null,
    },
    { label: `Copy @${key}`, run: () => copyText("@" + key, "citation key") },
  ];
  return <ContextMenu x={menu.x} y={menu.y} items={items} onClose={close} estWidth={260} estHeight={70} />;
}
