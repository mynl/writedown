// The error strips above the panes (issue G.06). The message comes FIRST and wraps —
// a TOML parse error is several lines (message, source line, caret, "at line N") and
// must be readable in full — and the whole text sits in the tooltip as well. Two strips
// can show at once: config.toml problems, and everything else; they never overwrite
// each other. × dismisses; the store keeps what was dismissed for "Show Last Error".
export function ErrorBar({
  kind,
  text,
  hint,
  onClick,
  onDismiss,
}: {
  kind: "config" | "general";
  text: string;
  hint: string;
  /** Clicking the message (config strip: opens config.toml). */
  onClick?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className={"error-bar " + kind} role="alert">
      <span className="error-icon" aria-hidden="true">
        ⚠
      </span>
      <span
        className={"error-text" + (onClick ? " clickable" : "")}
        title={text}
        onClick={onClick}
      >
        {text}
        <span className="error-hint">{hint}</span>
      </span>
      <button className="error-dismiss" title="Dismiss (palette: Show Last Error)" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
