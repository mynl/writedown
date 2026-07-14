// Ambient types for the CsvGrid ES module, resolved by the Vite alias in vite.config.ts
// to ../csv-viewer/dist/csv-grid.es.js (the sibling repo's committed build). Only the
// surface writedown uses is typed; see csv-viewer/src/grid/grid.js for the full API.
declare module "csv-grid" {
  export type CsvGridData =
    | { csv: string; name?: string; headerMode?: "auto" | "first-row" | "headerless" }
    | { records: unknown[]; columns?: string[]; name?: string }
    | { url: string; name?: string };

  export interface CsvGridOptions {
    globalSearch?: boolean;
    columnFilters?: boolean;
    sortable?: boolean;
    statusBar?: boolean | HTMLElement;
    expandButtons?: boolean;
    exportButtons?: boolean;
    widthMode?: "equal-risk" | "coverage";
    displayMode?: "auto" | "raw";
    maxRows?: number | null;
    height?: string | null;
    worker?: boolean | string;
    name?: string;
  }

  export default class CsvGrid {
    constructor(el: HTMLElement | string, data: CsvGridData | null, opts?: CsvGridOptions);
    setData(data: CsvGridData): Promise<void>;
    destroy(): void;
    applyLayout(): void;
    setWidthMode(mode: "equal-risk" | "coverage"): void;
    setDisplayMode(mode: "auto" | "raw"): void;
    export(opts?: {
      scope?: "view" | "all";
      format?: "csv" | "md";
      values?: "raw" | "formatted";
      visibleOnly?: boolean;
    }): string;
  }
}

declare module "csv-grid.css";
