import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { realpathSync } from "node:fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Use the REAL project path as root. When launched via the `C:\S` junction, vite resolves
// index.html to its real path but leaves root as the junction, producing a cross-path
// asset name rollup rejects (breaks `tauri build`). Resolving root fixes the mismatch.
const root = (() => {
  try {
    // @ts-expect-error process is a nodejs global
    return realpathSync(process.cwd());
  } catch {
    // @ts-expect-error process is a nodejs global
    return process.cwd();
  }
})();

// https://vite.dev/config/
export default defineConfig(async () => ({
  root,
  plugins: [react()],

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
  },
}));
