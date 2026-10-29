import ReactDOM from "react-dom/client";
// The preview's text face (issue K.05), bundled so it works offline on any machine: Vite
// copies the woff2 files into dist/, and the unicode-range subsets load only the scripts a
// document uses. Regular, italic, semibold, bold and bold italic.
import "@fontsource/stix-two-text/400.css";
import "@fontsource/stix-two-text/400-italic.css";
import "@fontsource/stix-two-text/600.css";
import "@fontsource/stix-two-text/700.css";
import "@fontsource/stix-two-text/700-italic.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { logError } from "./api";

// Record uncaught errors + promise rejections to ~/.writedown/logs/ (telemetry).
window.addEventListener("error", (e) => {
  void logError(`window error: ${e.message} @ ${e.filename}:${e.lineno}\n${e.error?.stack ?? ""}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason as { stack?: string } | undefined;
  void logError(`unhandled rejection: ${String(e.reason)}\n${r?.stack ?? ""}`);
});

// No StrictMode: its dev-only double-mounting of effects desyncs imperative libraries
// (CodeMirror via @uiw). The error boundary + logging above are the safety net.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
