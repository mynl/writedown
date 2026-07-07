import React from "react";
import ReactDOM from "react-dom/client";
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
