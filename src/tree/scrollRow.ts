/** Scroll a tree row into view — moving the tree pane, and NOTHING else.
 *
 *  Deliberately not `Element.scrollIntoView()`: that walks up and scrolls EVERY scroll
 *  container on the way to the root, and `overflow: hidden` does not opt an element out —
 *  hidden means "no scrollbar", not "cannot scroll programmatically". Our layout is a stack
 *  of `overflow: hidden` panes (`.app`, `.panes`, `.pane-tree`, `body`), so one arrow key
 *  could shift the whole window a few pixels with no scrollbar to put it back: the entire UI
 *  drifts and stays drifted, which is exactly the "arrows move the whole tree / feels like
 *  scroll lock" report. Reading rects and writing one `scrollTop` cannot do that.
 */
export function revealTreeRow(
  row: HTMLElement | null | undefined,
  mode: "nearest" | "center" = "nearest",
): void {
  const box = row?.closest<HTMLElement>(".tree-body");
  if (!row || !box) return;
  const r = row.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (mode === "center") {
    box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
  } else if (r.top < b.top) {
    box.scrollTop += r.top - b.top; // above the viewport — bring it to the top edge
  } else if (r.bottom > b.bottom) {
    box.scrollTop += r.bottom - b.bottom; // below it — bring it to the bottom edge
  }
  // Fully visible: no write at all, so arrowing around inside the pane never scrolls it.
}

/** The selected row, if the tree is showing one. */
export const selectedTreeRow = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(".tree-body .tree-row.selected");
