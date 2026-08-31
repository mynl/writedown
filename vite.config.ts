import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// The project root is wherever the dev server was launched — always the real checkout
// (`V:\dev\writedown` on the author's machine). There used to be junction-resolution code here
// for a launch through a `C:\S\dev` symlink; that launch path is not supported (decision
// 2026-08-31), so the root is simply the cwd and Vite's own resolution is left alone.
// @ts-expect-error process is a nodejs global
const root: string = process.cwd();

// CsvGrid (the CSV preview control) is consumed straight from the SIBLING repo's committed
// dist — a build-level link, never a copy: rebuilding csv-grid there flows into writedown on
// the next reload. The sibling checkout is expected beside this one (`../csv-viewer`), so the
// relative path holds on every machine. If it is missing, the build fails loudly with this path.
const csvGridDist = resolve(root, "../csv-viewer/dist");

// CsvGrid's version, baked in at config time for the About dialog (the dist build exports
// no version marker; the sibling repo's package.json is its authoritative statement).
// Picked up on dev-server (re)start — version changes there are rare and low-stakes.
const csvGridVersion = (() => {
  try {
    const pkg = readFileSync(resolve(root, "../csv-viewer/package.json"), "utf-8");
    return String(JSON.parse(pkg).version ?? "?");
  } catch {
    return "?";
  }
})();

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    __CSVGRID_VERSION__: JSON.stringify(csvGridVersion),
  },
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
      // 3. tell Vite to ignore watching `src-tauri` and the cargo build output.
      // target/ sits beside src-tauri/ inside the project root, so chokidar walks it
      // unless told not to. It cannot: cargo is concurrently writing and EXECUTING
      // build-script .exe files there, and Windows holds an exclusive lock on a running
      // exe, so fs.watch() throws EBUSY. Chokidar re-emits that as an unhandled 'error'
      // and the dev server dies mid-startup ("beforeDevCommand terminated with a
      // non-zero status code"). Watching 1000+ churning build artifacts would be a bad
      // idea regardless.
      ignored: ["**/src-tauri/**", "**/target/**"],
    },
    // The dev server refuses files outside the project root by default, and setting
    // `allow` REPLACES the default list — so it must name the project root itself plus the
    // sibling csv-grid dist (production build is unaffected — rollup just reads the file).
    fs: {
      allow: [root, csvGridDist],
    },
  },
}));
