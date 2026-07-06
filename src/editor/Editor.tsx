import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { search } from "@codemirror/search";
import { useStore } from "../store";
import { editorHighlight, editorTheme } from "./theme";
import { buildSublimeTheme } from "./sublimeTheme";
import { frontmatterHighlight } from "./frontmatter";
import { sublimeEditing } from "./keymap";

// Language + editing behaviour is constant; the theme/highlight swap in when the
// user's Sublime scheme is imported (spec §11). `.qmd` is treated as Markdown.
const languageExtensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  frontmatterHighlight,
  EditorView.lineWrapping,
  search({ top: true }),
  ...sublimeEditing,
];

export function Editor({ content }: { path: string; content: string }) {
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
    const ext = [
      ...languageExtensions,
      built ? built.highlight : syntaxHighlighting(editorHighlight),
    ];
    // Config font size also applies when there's no imported Sublime theme.
    if (!built && fontSize) ext.push(EditorView.theme({ "&": { fontSize: `${fontSize}px` } }));
    return ext;
  }, [built, fontSize]);

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
