import { useCallback, useEffect, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { search } from "@codemirror/search";
import { useStore } from "../store";
import { editorHighlight, editorTheme } from "./theme";
import { buildSublimeTheme } from "./sublimeTheme";
import { csvRainbow } from "./csvRainbow";
import { mathHighlight } from "./math";
import { frontmatterBlock } from "./frontmatter";
import { isCsv, isMarkdownDoc, useLanguageFor } from "./languages";
import {
  buildEditingKeymap,
  editingExtras,
  keymapCompartment,
  keymapWarnings,
} from "./keymap";
import { citationExtensions } from "./citations";
import { documentLint } from "./lint";
import { spellingExtensions } from "./spelling";
import { getActiveView, setActiveView } from "./editorView";
import { wrapCompartment, wrapExtension } from "./wrap";
import { cssFontWeight } from "../fontWeight";
import { logError } from "../api";

// Log any exception thrown during a CodeMirror update (these can leave the view stale).
const cmExceptionLogger = EditorView.exceptionSink.of((err: unknown) => {
  const e = err as { stack?: string } | undefined;
  void logError("CodeMirror exception: " + (e?.stack ?? String(err)));
});

// Save when the editor itself loses focus — clicking the tree/project panel keeps the
// window focused, so the window-blur save in App.tsx never fires for same-window moves.
// saveDoc (not saveActive) so an untitled scratch buffer never pops a Save As dialog.
const saveOnBlur = EditorView.domEventHandlers({
  blur: () => {
    const s = useStore.getState();
    if (s.activePath) void s.saveDoc(s.activePath);
  },
});

// Module-level, NOT an inline literal: react-codemirror's reconfigure effect lists
// `basicSetup` (and `onChange`/`onUpdate`) in its deps, so a fresh identity per render
// made every keystroke dispatch a full StateEffect.reconfigure — tearing down and
// reinstalling the whole extension stack (language, linters, spellcheck, theme). The
// handlers below are useCallback'd for the same reason.
const BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  bracketMatching: true,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  autocompletion: false,
  closeBrackets: false, // no auto-inserted '' / () — annoying in prose, and broke @'
};

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
  const tabSize = settings?.tab_size ?? 4; // [editor] tab_size — indent width in spaces
  const spellEnabled = useStore((s) => s.spellOn); // session toggle; default from config



  const built = useMemo(
    () => (st ? buildSublimeTheme(st, { fontSize, fontFamily, fontWeight }) : null),
    [st, fontSize, fontFamily, fontWeight],
  );

  const lang = useLanguageFor(path);

  const extensions = useMemo(() => {
    const ext = [
      cmExceptionLogger,
      saveOnBlur,
      ...(lang ? [lang] : []),
      // Word wrap in a Compartment so the palette/footer toggle reconfigures it live (no
      // rebuild). Non-reactive read: a wrap toggle dispatches to the view and must not
      // re-run this useMemo; unrelated rebuilds re-read the current value and stay in sync.
      wrapCompartment.of(wrapExtension(useStore.getState().wordWrap)),
      // Indent width = [editor] tab_size spaces, spaces only (never a literal tab). Prec.highest
      // overrides basicSetup's default of 2; tabSize sets how wide any existing "\t" renders.
      Prec.highest(indentUnit.of(" ".repeat(tabSize))),
      EditorState.tabSize.of(tabSize),
      search({ top: true }),
      ...editingExtras,
      // Editing keymap in a Compartment so config [keys] changes reconfigure it live (see the
      // effect below). Non-reactive read, like word wrap, so a reconfigure never rebuilds here.
      keymapCompartment.of(buildEditingKeymap(useStore.getState().editorSettings?.keys)),
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
  }, [path, lang, built, fontSize, fontWeight, spellEnabled, tabSize]);

  // Live-apply keybinding changes when config.toml is saved (loadTheme replaces editorSettings,
  // so `userKeys` gets a new identity). Reconfigure the Compartment in place — no rebuild — and
  // surface any bad-action/bad-key warnings here (an effect, so state isn't set during render).
  const userKeys = settings?.keys;
  const onChange = useCallback((v: string) => editActive(v), [editActive]);
  const onUpdate = useCallback(
    (vu: ViewUpdate) => {
      if (vu.selectionSet || vu.docChanged) {
        const head = vu.state.selection.main.head;
        const line = vu.state.doc.lineAt(head);
        setCursorPos(line.number, head - line.from + 1);
      }
    },
    [setCursorPos],
  );
  useEffect(() => {
    getActiveView()?.dispatch({
      effects: keymapCompartment.reconfigure(buildEditingKeymap(userKeys)),
    });
    const w = keymapWarnings(userKeys);
    if (w.length) {
      void logError("keybindings: " + w.join("; "));
      useStore.setState({ configError: "keybindings — " + w.join("; ") });
    }
  }, [userKeys]);

  return (
    <CodeMirror
      className="cm-host"
      value={content}
      height="100%"
      theme={built ? built.theme : editorTheme}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={setActiveView}
      onUpdate={onUpdate}
      basicSetup={BASIC_SETUP}
    />
  );
}
