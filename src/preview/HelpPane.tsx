// The Help tab (issue J.18): what help() prints for the name at the caret, from the
// document's own Python kernel, in a scrollable monospace pane beside Preview, Rendered and
// Diff. Ctrl+K Ctrl+H fills it; the tab's ×, Esc in the pane, or a new request replace or
// close it. Held per document, never in the session.
import { useStore } from "../store";

export function HelpPane() {
  const activePath = useStore((s) => s.activePath);
  const help = useStore((s) => (activePath ? s.pyHelp[activePath] : undefined));
  const close = useStore((s) => s.closePythonHelp);
  if (!help) return null;
  return (
    <div
      className="help-pane"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      <div className="pane-header diff-head" title="Esc or the tab's × closes">
        Help: {help.name || "?"} ({help.source})
      </div>
      <pre className="help-body">{help.text}</pre>
    </div>
  );
}
