import { Component, type ReactNode } from "react";
import { logError } from "../api";

type Props = { children: ReactNode };
type State = { transient: Error | null; fatal: Error | null; gen: number };

// CodeMirror's tile-based view layer (@codemirror/view 6.43.x) can throw transient,
// self-healing errors during a measure/scroll after certain edits — e.g. "No tile at
// position N" when a stale measure targets a position past the shrunk document. Those
// throws reach React's commit phase (via @uiw/react-codemirror's dispatch) and would
// otherwise bubble to the app-level ErrorBoundary and show the fatal "Writedown hit an
// error" dialog. Catch them here instead and REMOUNT the editor: a fresh view rebuilds
// from the current in-memory content and re-measures cleanly, so nothing is lost but a
// transient scroll position. If it crashes repeatedly in quick succession, stop
// swallowing and rethrow so the real dialog appears rather than an invisible loop.
export class EditorBoundary extends Component<Props, State> {
  state: State = { transient: null, fatal: null, gen: 0 };
  private lastCrash = 0;
  private streak = 0;

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Mark the crash; componentDidCatch decides recover-vs-give-up so all the timing
    // logic lives in one place. Render a blank frame in the meantime (invisible — the
    // remount is scheduled synchronously right after).
    return { transient: error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    const now = Date.now();
    this.streak = now - this.lastCrash < 2000 ? this.streak + 1 : 1;
    this.lastCrash = now;
    const giveUp = this.streak > 4;
    void logError(
      `editor view crash (streak ${this.streak}), ${giveUp ? "giving up" : "remounting"}: ` +
        `${error.message}\n${error.stack ?? ""}\n${info.componentStack ?? ""}`,
    );
    if (giveUp) this.setState({ transient: null, fatal: error });
    else this.setState({ transient: null, gen: this.state.gen + 1 });
  }

  render() {
    if (this.state.fatal) throw this.state.fatal; // propagate to the app-level ErrorBoundary
    if (this.state.transient) return null; // one blank frame before the remount lands
    // display:contents so this wrapper adds no layout box; changing the key on it forces
    // a full remount of the editor subtree below.
    return (
      <div key={this.state.gen} style={{ display: "contents" }}>
        {this.props.children}
      </div>
    );
  }
}
