import { Component, type ReactNode } from "react";
import { logError } from "./api";

type Props = { children: ReactNode };
type State = { error: Error | null };

// Catches render/runtime errors so a crash shows a message (and is logged to
// ~/.writedown/logs/) instead of leaving a blank window.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    void logError(
      `render error: ${error.message}\n${error.stack ?? ""}\n${info.componentStack ?? ""}`,
    );
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="crash">
          <h2>Writedown hit an error</h2>
          <p>Your files on disk are safe. This has been logged to ~/.writedown/logs/.</p>
          <pre>{`${error.message}\n\n${error.stack ?? ""}`}</pre>
          <div className="crash-actions">
            <button onClick={() => this.setState({ error: null })}>Try to continue</button>
            <button onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
