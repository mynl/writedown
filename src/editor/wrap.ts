// Word wrap as a reconfigurable CodeMirror Compartment, so it can be toggled live (command
// palette / footer status) without rebuilding the whole extension set — a rebuild would drop
// the selection, undo history, and scroll position. The [editor] word_wrap config sets the
// launch default; the toggle is session-only from there (see CLAUDE.md).
import { Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useStore } from "../store";
import { getActiveView } from "./editorView";

export const wrapCompartment = new Compartment();

/** The wrapping extension for a given on/off state (empty array = no wrapping). */
export function wrapExtension(on: boolean) {
  return on ? EditorView.lineWrapping : [];
}

/** Flip word wrap for the session and reconfigure the live editor in place. */
export function toggleWordWrap() {
  const next = !useStore.getState().wordWrap;
  useStore.setState({ wordWrap: next });
  getActiveView()?.dispatch({ effects: wrapCompartment.reconfigure(wrapExtension(next)) });
}
