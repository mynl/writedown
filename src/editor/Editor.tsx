import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { search } from "@codemirror/search";
import { useStore } from "../store";
import { editorHighlight, editorTheme } from "./theme";
import { buildSublimeTheme } from "./sublimeTheme";
import { frontmatterHighlight } from "./frontmatter";
import { csvRainbow } from "./csvRainbow";
import { isCsv, languageForPath } from "./languages";
import { sublimeEditing } from "./keymap";

export function Editor({ path, content }: { path: string; content: string }) {
  const editActive = useStore((s) => s.editActive);
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
      ...(lang ? [lang] : []),
      frontmatterHighlight, // only activates when line 1 is `---`
      EditorView.lineWrapping,
      search({ top: true }),
      ...sublimeEditing,
      built ? built.highlight : syntaxHighlighting(editorHighlight),
    ];
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
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        bracketMatching: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        autocompletion: false,
      }}
    />
  );
}
