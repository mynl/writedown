// Read-only diff pane (issue I.01): the active buffer against a static base — the file as
// saved on disk, a Previous Versions backup, or another open tab. Renders as a "Diff" TAB
// in the preview pane beside Preview/Rendered (author tweak 2026-09-24: the preview must
// stay one click away), with the usual split resizer. View-only by design: no merging, no
// per-hunk revert; restore stays in Previous Versions. Palette-only entry; Esc (pane
// focused) or the palette's "Diff: Close" closes it. It never calls setActiveView, so the
// editor singleton keeps meaning "the editable pane" (the G.07 invariant).
import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxHighlighting } from "@codemirror/language";
import { unifiedMergeView } from "@codemirror/merge";
import { useStore } from "../store";
import { editorHighlight, editorTheme } from "../editor/theme";
import { buildSublimeTheme } from "../editor/sublimeTheme";
import { useLanguageFor } from "../editor/languages";
import { useDebouncedValue } from "../useDebounced";

function baseLabel(diff: NonNullable<ReturnType<typeof useStore.getState>["diffAgainst"]>): string {
  if (diff.kind === "disk") return "saved file on disk";
  if (diff.kind === "backup")
    return "version of " + new Date(diff.millis ?? 0).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  return `open tab “${(diff.path ?? "").split(/[\\/]/).pop()}”`;
}

export function DiffPane() {
  const activePath = useStore((s) => s.activePath);
  const tabs = useStore((s) => s.tabs);
  const diff = useStore((s) => s.diffAgainst);
  const closeDiff = useStore((s) => s.closeDiff);
  const doc = tabs.find((t) => t.path === activePath) ?? null;

  // The buffer side follows edits debounced — never on the typing path. The base is the
  // static snapshot the store fetched at open.
  const content = useDebouncedValue(doc?.content ?? "", 300, doc?.path);
  const lang = useLanguageFor(activePath ?? "");

  // Same theme as the editor (author tweak, 2026-09-24): without it the pane rendered
  // CodeMirror's white default under dark-theme token colors — barely readable. The
  // Sublime theme's font-size/family CSS variables are global, so they apply here too.
  const st = useStore((s) => s.sublimeTheme);
  const built = useMemo(() => (st ? buildSublimeTheme(st, {}) : null), [st]);

  const extensions = useMemo(
    () => [
      ...(lang ? [lang] : []),
      unifiedMergeView({ original: diff?.base ?? "", mergeControls: false, gutter: true }),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
      built ? built.highlight : syntaxHighlighting(editorHighlight),
    ],
    [lang, diff?.base, built],
  );

  if (!diff) return null;
  return (
    <div
      className="diff-pane"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeDiff();
        }
      }}
    >
      <div className="pane-header diff-head" title="Read-only. Esc or palette “Diff: Close” closes.">
        Diff — buffer vs {baseLabel(diff)}
      </div>
      <div className="diff-body">
        <CodeMirror
          value={content}
          extensions={extensions}
          theme={built ? built.theme : editorTheme}
          readOnly
          height="100%"
        />
      </div>
    </div>
  );
}
