import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Real (junction-resolved) project path. Used ONLY for `build`: when launched via the
// `C:\S` junction, vite resolves index.html to its real path but leaves root as the
// junction, producing a cross-path asset name rollup rejects. For `serve`, overriding root
// upsets vite's dep optimizer, so we leave the default (cwd) there.
//
// Use realpathSync.NATIVE: plain realpathSync preserves the cwd's casing (e.g. lowercase
// `c:\users` when launched from a lowercase-drive shell), but vite resolves index.html to its
// OS-canonical casing (`C:\Users`). The two must match, or the html-inline-proxy plugin can't
// find the inline-CSS module for the `<style>` in index.html — "No matching HTML proxy module".
const realRoot = (() => {
  try {
    // @ts-expect-error process is a nodejs global
    return realpathSync.native(process.cwd());
  } catch {
    // @ts-expect-error process is a nodejs global
    return process.cwd();
  }
})();

// CsvGrid (the CSV preview control) is consumed straight from the SIBLING repo's committed
// dist — a build-level link, never a copy: rebuilding csv-grid there flows into writedown on
// the next reload. Both repos ride the same synced tree, so the relative path holds on every
// machine. If the checkout is missing, the build fails loudly with this path.
const csvGridDist = resolve(realRoot, "../csv-viewer/dist");

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  ...(command === "build" ? { root: realRoot } : {}),
  plugins: [react()],
  resolve: {
    alias: {
      "csv-grid": resolve(csvGridDist, "csv-grid.es.js"),
      "csv-grid.css": resolve(csvGridDist, "csv-grid.css"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // The dev server refuses files outside the project root by default, and setting
    // `allow` REPLACES the default list — so it must contain the project root in BOTH
    // forms: the raw cwd (the C:\S junction path requests actually arrive under when dev
    // is launched from there) and the junction-resolved real path, plus the sibling
    // csv-grid dist (production build is unaffected — rollup just reads the file).
    fs: {
      // @ts-expect-error process is a nodejs global
      allow: [process.cwd(), realRoot, csvGridDist],
    },
  },
}));
