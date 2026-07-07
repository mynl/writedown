import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { search } from "@codemirror/search";
import { useStore } from "../store";
import { editorHighlight, editorTheme } from "./theme";
import { buildSublimeTheme } from "./sublimeTheme";
import { csvRainbow } from "./csvRainbow";
import { mathHighlight } from "./math";
import { isCsv, isMarkdownDoc, languageForPath } from "./languages";
import { sublimeEditing } from "./keymap";
import { citationExtensions } from "./citations";
import { documentLint } from "./lint";
import { setActiveView } from "./editorView";
import { logError } from "../api";

// Log any exception thrown during a CodeMirror update (these can leave the view stale).
const cmExceptionLogger = EditorView.exceptionSink.of((err: unknown) => {
  const e = err as { stack?: string } | undefined;
  void logError("CodeMirror exception: " + (e?.stack ?? String(err)));
});

export function Editor({ path, content }: { path: string; content: string }) {
  const editActive = useStore((s) => s.editActive);
  const setCursorPos = useStore((s) => s.setCursorPos);
  const st = useStore((s) => s.sublimeTheme);
  const settings = useStore((s) => s.editorSettings);

  const fontSize = settings?.font_size ?? undefined;
  const fontFamily = settings?.font_family ?? undefined;

  const built = useMemo(
    () => (st ? buildSublimeTheme(st, { fontSize, fontFamily }) : null),
    [st, fontSize, fontFamily],
  );

  const extensions = useMemo(() => {
    const lang = languageForPath(path);
    const ext = [
      cmExceptionLogger,
      ...(lang ? [lang] : []),
      EditorView.lineWrapping,
      search({ top: true }),
      ...sublimeEditing,
      built ? built.highlight : syntaxHighlighting(editorHighlight),
    ];
    // Prec.highest so math colouring wins over list/other syntax marks (e.g. in bullets).
    if (isMarkdownDoc(path)) {
      ext.push(Prec.highest(mathHighlight));
      ext.push(...citationExtensions); // @-citation autocomplete + hover
      ext.push(...documentLint); // python cell syntax + duplicate labels
    }
    if (isCsv(path)) ext.push(csvRainbow);
    if (!built && fontSize) ext.push(EditorView.theme({ "&": { fontSize: `${fontSize}px` } }));
    return ext;
  }, [path, built, fontSize]);

  return (
    <CodeMirror
      className="cm-host"
      value={content}
      height="100%"
      theme={built ? built.theme : editorTheme}
      extensions={extensions}
      onChange={(v) => editActive(v)}
      onCreateEditor={(view) => setActiveView(view)}
      onUpdate={(vu) => {
        if (vu.selectionSet || vu.docChanged) {
          const head = vu.state.selection.main.head;
          const line = vu.state.doc.lineAt(head);
          setCursorPos(line.number, head - line.from + 1);
        }
      }}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        bracketMatching: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        autocompletion: false,
        closeBrackets: false, // no auto-inserted '' / () — annoying in prose, and broke @'
      }}
    />
  );
}
