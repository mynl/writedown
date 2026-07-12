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
import { frontmatterBlock } from "./frontmatter";
import { isCsv, isMarkdownDoc, languageForPath } from "./languages";
import { sublimeEditing } from "./keymap";
import { citationExtensions } from "./citations";
import { documentLint } from "./lint";
import { spellingExtensions } from "./spelling";
import { setActiveView } from "./editorView";
import { wrapCompartment, wrapExtension } from "./wrap";
import { cssFontWeight } from "../fontWeight";
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
  const zoom = useStore((s) => s.editorZoom);

  // Effective size = configured size (or 14 default) + zoom. Stay undefined only when
  // neither is set, so the imported Sublime font size still wins in that case.
  const fontSize =
    settings?.font_size != null || zoom !== 0 ? (settings?.font_size ?? 14) + zoom : undefined;
  const fontFamily = settings?.font_family ?? undefined;
  const fontWeight = cssFontWeight(settings?.font_weight);
  const spellEnabled = useStore((s) => s.spellOn); // session toggle; default from config



  const built = useMemo(
    () => (st ? buildSublimeTheme(st, { fontSize, fontFamily, fontWeight }) : null),
    [st, fontSize, fontFamily, fontWeight],
  );

  const extensions = useMemo(() => {
    const lang = languageForPath(path);
    const ext = [
      cmExceptionLogger,
      ...(lang ? [lang] : []),
      // Word wrap in a Compartment so the palette/footer toggle reconfigures it live (no
      // rebuild). Non-reactive read: a wrap toggle dispatches to the view and must not
      // re-run this useMemo; unrelated rebuilds re-read the current value and stay in sync.
      wrapCompartment.of(wrapExtension(useStore.getState().wordWrap)),
      search({ top: true }),
      ...sublimeEditing,
      built ? built.highlight : syntaxHighlighting(editorHighlight),
    ];
    // Prec.highest so math colouring wins over list/other syntax marks (e.g. in bullets).
    if (isMarkdownDoc(path)) {
      ext.push(frontmatterBlock); // visual block behind the `---` header
      ext.push(Prec.highest(mathHighlight));
      ext.push(...citationExtensions); // @-citation autocomplete + hover
      ext.push(...documentLint); // python cell syntax + duplicate labels
      if (spellEnabled) ext.push(...spellingExtensions); // prose spellcheck
    }
    if (isCsv(path)) ext.push(csvRainbow);
    if (!built && (fontSize || fontWeight)) {
      ext.push(
        EditorView.theme({
          "&": fontSize ? { fontSize: `${fontSize}px` } : {},
          ".cm-content": fontWeight ? { fontWeight } : {},
        }),
      );
    }
    return ext;
  }, [path, built, fontSize, fontWeight, spellEnabled]);

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
