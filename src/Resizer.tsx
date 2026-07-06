import { useCallback } from "react";

/** A draggable vertical divider. `onDrag` receives the pointer's clientX. */
export function Resizer({ onDrag }: { onDrag: (clientX: number) => void }) {
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const move = (ev: MouseEvent) => onDrag(ev.clientX);
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [onDrag],
  );

  return <div className="resizer" onMouseDown={onMouseDown} />;
}
