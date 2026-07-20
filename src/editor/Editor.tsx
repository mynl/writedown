import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { Annotation, EditorState, Prec, Transaction } from "@codemirror/state";
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
import { wordCompleteKeymap, wordCompleteAutocomplete } from "./wordComplete";
import { documentLint } from "./lint";
import { spellingExtensions } from "./spelling";
import {
  docPosition,
  getActiveView,
  recordDocScroll,
  recordDocSelection,
  setActiveView,
} from "./editorView";
import { wrapCompartment, wrapExtension } from "./wrap";
import { cssFontWeight } from "../fontWeight";
import { logError } from "../api";

// Marks our own synchronous doc-swap dispatches (tab switch / external reload) so
// onChange can tell them apart from user edits. Value = the path being swapped in.
const docSwap = Annotation.define<string>();

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
  const editTab = useStore((s) => s.editTab);
  const setCursorPos = useStore((s) => s.setCursorPos);
  const st = useStore((s) => s.sublimeTheme);
  const settings = useStore((s) => s.editorSettings);
  const zoom = useStore((s) => s.editorZoom);

  // Effective size = configured size (or 14 default) + zoom. Stay undefined only when
  // neither is set, so the imported Sublime font size still wins in that case.
  // Clamp the effective size to a config floor/cap (issue 11) so wheel/key zoom can't shrink
  // it to nothing or blow it up — unlike editors that leave it unbounded. [editor]
  // font_size_min / font_size_max (defaults 6 / 24) apply live on config save.
  const fsMin = settings?.font_size_min ?? 6;
  const fsMax = settings?.font_size_max ?? 24;
  const fontSize =
    settings?.font_size != null || zoom !== 0
      ? Math.max(fsMin, Math.min(fsMax, (settings?.font_size ?? 14) + zoom))
      : undefined;
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
      // Tab word-completion Tab keymap for every language (declines to indent when not after
      // a word). The completion popup itself is markdown's citation autocompletion (below)
      // or a word-only autocompletion for other languages.
      ...wordCompleteKeymap,
      built ? built.highlight : syntaxHighlighting(editorHighlight),
    ];
    // Prec.highest so math colouring wins over list/other syntax marks (e.g. in bullets).
    if (isMarkdownDoc(path)) {
      ext.push(frontmatterBlock); // visual block behind the `---` header
      ext.push(Prec.highest(mathHighlight));
      ext.push(...citationExtensions); // @-citation + word-completion autocomplete + hover
      ext.push(...documentLint); // python cell syntax + duplicate labels
      if (spellEnabled) ext.push(...spellingExtensions); // prose spellcheck
    } else {
      ext.push(wordCompleteAutocomplete); // word-completion popup for non-markdown languages
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
  // The last text we reported to the store. The store hands the same string object
  // back as the `content` prop, so reference equality is an O(1) "own echo" test.
  const lastEmitted = useRef<string | null>(null);
  // Attribute edits to the path THIS component was rendered for, never to whatever
  // activePath is by the time the event fires, and ignore our own swap dispatches.
  // Together with the synchronous swap below this closes the cross-tab window that
  // let one document's buffer be saved under another document's path (issue 12).
  const onChange = useCallback(
    (v: string, vu: ViewUpdate) => {
      if (vu.transactions.some((tr) => tr.annotation(docSwap) !== undefined)) return;
      lastEmitted.current = v;
      editTab(path, v);
    },
    [editTab, path],
  );
  // Apply the controlled value to the view SYNCHRONOUSLY whenever it diverges (tab
  // switch, external reload). The wrapper defers this behind a ~200 ms typing latch
  // (wider in practice — WebView2 clamps its 1 ms countdown timer), leaving the view
  // showing the previous document; edits landing in that window were misattributed.
  // Applying here, in a layout effect, means the view is correct before paint and the
  // wrapper's own value-sync effect sees value === doc and does nothing — its deferred
  // whole-doc replace (a scroll-to-top) never fires. addToHistory:false keeps undo
  // from ever crossing a document boundary.
  useLayoutEffect(() => {
    const view = getActiveView();
    if (!view || content === lastEmitted.current) return;
    lastEmitted.current = content; // mark synced — repeat renders skip in O(1)
    const cur = view.state.doc;
    if (cur.length === content.length && cur.toString() === content) return;
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: content },
      selection: { anchor: Math.min(view.state.selection.main.head, content.length) },
      annotations: [docSwap.of(path), Transaction.addToHistory.of(false)],
    });
  }, [path, content]);
  const onUpdate = useCallback(
    (vu: ViewUpdate) => {
      if (vu.selectionSet || vu.docChanged) {
        const head = vu.state.selection.main.head;
        const line = vu.state.doc.lineAt(head);
        setCursorPos(line.number, head - line.from + 1);
      }
      // Per-doc cursor memory. Skip our own doc-swap dispatch (it sets a placeholder
      // selection) — recording it would clobber the incoming doc's remembered spot
      // before the restore effect reads it. Same reason as the selectionSet-only rule.
      if (
        vu.selectionSet &&
        !vu.transactions.some((tr) => tr.annotation(docSwap) !== undefined)
      ) {
        const m = vu.state.selection.main;
        recordDocSelection(path, m.anchor, m.head);
      }
    },
    [setCursorPos, path],
  );
  // Restore this doc's remembered cursor/scroll after the doc swap (the CodeMirror child's
  // effects have already run), and record scrolls while it is active.
  useEffect(() => {
    const view = getActiveView();
    if (!view) return;
    const pos = docPosition(path);
    let raf = 0;
    if (pos) {
      const len = view.state.doc.length;
      view.dispatch({
        selection: { anchor: Math.min(pos.anchor, len), head: Math.min(pos.head, len) },
      });
      view.scrollDOM.scrollTop = pos.scroll;
      // Re-assert once after layout — a big doc may not have its height yet.
      raf = requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = pos.scroll;
      });
    }
    const sc = view.scrollDOM;
    const mountedAt = performance.now();
    const onScroll = () => {
      // A programmatic reset right after a doc swap reports scrollTop 0; recording it
      // would overwrite this doc's remembered spot and replay the jump on every
      // revisit. Real user scrolls to non-zero positions always record.
      if (sc.scrollTop === 0 && performance.now() - mountedAt < 300) return;
      recordDocScroll(path, sc.scrollTop);
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      sc.removeEventListener("scroll", onScroll);
    };
  }, [path]);
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

  // Ctrl+wheel font-size zoom (issue 11): attached to the CM scroller as a NON-passive
  // listener so we can preventDefault WebView2's page-zoom (the default domEventHandlers
  // path can't). Deltas accumulate so one physical notch steps once on any device; it
  // drives the transient, clamped editorZoom (session-only, never written to config).
  const onCreateEditor = (view: EditorView) => {
    setActiveView(view);
    let acc = 0;
    view.scrollDOM.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        acc += e.deltaY;
        while (Math.abs(acc) >= 100) {
          if (acc < 0) {
            useStore.getState().setEditorZoom(1);
            acc += 100;
          } else {
            useStore.getState().setEditorZoom(-1);
            acc -= 100;
          }
        }
      },
      { passive: false },
    );
  };

  return (
    <CodeMirror
      className="cm-host"
      value={content}
      height="100%"
      theme={built ? built.theme : editorTheme}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={onCreateEditor}
      onUpdate={onUpdate}
      basicSetup={BASIC_SETUP}
    />
  );
}
