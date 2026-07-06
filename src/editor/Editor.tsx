import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { useStore } from "../store";
import { editorHighlight, editorTheme } from "./theme";
import { sublimeEditing } from "./keymap";

// `.qmd` is treated as Markdown; fenced code blocks pick up nested language
// highlighting from @codemirror/language-data (spec §9, §16).
const baseExtensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  syntaxHighlighting(editorHighlight),
  EditorView.lineWrapping,
  ...sublimeEditing,
];

export function Editor({ content }: { path: string; content: string }) {
  const editActive = useStore((s) => s.editActive);
  const extensions = useMemo(() => baseExtensions, []);

  return (
    <CodeMirror
      className="cm-host"
      value={content}
      height="100%"
      theme={editorTheme}
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
