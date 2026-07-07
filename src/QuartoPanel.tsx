import { useEffect, useRef } from "react";
import { openOutput } from "./api";
import { useStore } from "./store";

// Lines worth pulling to the top when a render fails.
const ERROR_RE = /\b(error|fatal|unable to open|cannot|no such file|not found|traceback)\b/i;

export function QuartoPanel() {
  const status = useStore((s) => s.quartoStatus);
  const result = useStore((s) => s.quartoResult);
  const log = useStore((s) => s.quartoLog);
  const close = useStore((s) => s.closeQuarto);
  const logRef = useRef<HTMLPreElement>(null);

  // Keep the newest line in view as the render streams.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  if (status !== "running" && !result) return null;

  const failed = !!result && !result.success;
  const heading =
    status === "running"
      ? "Rendering with Quarto…"
      : result?.success
        ? "✓ Quarto render succeeded"
        : "✗ Quarto render failed";

  // On failure, hoist the salient error lines above the full log so they aren't buried.
  const errorLines = failed
    ? log
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && ERROR_RE.test(l))
        .slice(0, 6)
    : [];

  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div className="quarto-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className={"quarto-head" + (failed ? " status-error" : "")}>
          <span>{heading}</span>
          <span className="quarto-actions">
            {result?.success && result.output_file && (
              <button className="hdr-btn" onClick={() => void openOutput(result.output_file!)}>
                Open in browser
              </button>
            )}
            <button className="hdr-btn" onClick={close}>
              Close
            </button>
          </span>
        </div>
        {errorLines.length > 0 && (
          <div className="quarto-error">
            {errorLines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
        <pre className="quarto-log" ref={logRef}>
          {log || (status === "running" ? "starting quarto render …" : "(no output)")}
        </pre>
      </div>
    </div>
  );
}
