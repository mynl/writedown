import { openPath } from "@tauri-apps/plugin-opener";
import { useStore } from "./store";

export function QuartoPanel() {
  const status = useStore((s) => s.quartoStatus);
  const result = useStore((s) => s.quartoResult);
  const close = useStore((s) => s.closeQuarto);

  if (status !== "running" && !result) return null;

  const heading =
    status === "running"
      ? "Rendering with Quarto…"
      : result?.success
        ? "✓ Quarto render succeeded"
        : "✗ Quarto render failed";

  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div className="quarto-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className={"quarto-head" + (result && !result.success ? " status-error" : "")}>
          <span>{heading}</span>
          <span className="quarto-actions">
            {result?.success && result.output_file && (
              <button className="hdr-btn" onClick={() => void openPath(result.output_file!)}>
                Open output
              </button>
            )}
            <button className="hdr-btn" onClick={close}>
              Close
            </button>
          </span>
        </div>
        <pre className="quarto-log">
          {status === "running" ? "quarto render …" : result?.log || "(no output)"}
        </pre>
      </div>
    </div>
  );
}
