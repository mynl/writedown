// CSV/TSV preview: hosts Steve's CsvGrid (csv-viewer's embeddable library, consumed live
// from the sibling repo's dist via the Vite alias — see vite.config.ts). The grid brings its
// whole toolbar by default: fzf global search, per-column filters, sortable headers,
// Expand/Contract, Copy/Save export, status bar. TSV and markdown pipe tables are
// auto-detected by its parser.
import { useEffect, useRef } from "react";
import CsvGrid from "csv-grid";
import "csv-grid.css";

// Every setData is a full re-parse + type-inference (no incremental path), and content
// arrives per keystroke, so feed the grid on idle — same spirit as the ½s lint debounce.
const FEED_MS = 300;
// applyLayout re-solves column widths; cheap, but no need to run it per resize event.
const LAYOUT_MS = 100;

export function CsvPreview({ content, name }: { content: string; name?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<CsvGrid | null>(null);
  const firstFeed = useRef(true);

  // Mount once per component instance; destroy() is a verified clean teardown (drops the
  // grid's DOM and all its listeners, terminates any worker).
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    // worker:false — the parse worker only engages at ≥1 MB anyway, and skipping it means
    // the worker file never needs to be resolved/hosted by our bundle.
    const grid = new CsvGrid(el, null, { worker: false });
    gridRef.current = grid;
    return () => {
      gridRef.current = null;
      grid.destroy();
    };
  }, []);

  // Feed: immediate on first show (no empty-grid flash), debounced for keystrokes. The
  // library's internal load generation makes racing calls safe (a superseded parse never
  // settles), and setData pre-catches its own rejections.
  useEffect(() => {
    if (firstFeed.current) {
      firstFeed.current = false;
      void gridRef.current?.setData({ csv: content, name });
      return;
    }
    const t = setTimeout(() => {
      void gridRef.current?.setData({ csv: content, name });
    }, FEED_MS);
    return () => clearTimeout(t);
  }, [content, name]);

  // The library deliberately leaves resize handling to the host (no ResizeObserver of its
  // own): re-solve widths when the pane resizes — split-divider drags, window resizes,
  // pane show. applyLayout no-ops while the host is hidden (clientWidth 0).
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => gridRef.current?.applyLayout(), LAYOUT_MS);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  return <div className="csv-preview" ref={hostRef} />;
}
