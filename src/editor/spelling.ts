// Prose spellcheck as a CodeMirror lint source. Reuses the existing @codemirror/lint pipeline
// (same gutter/overlay/½s-idle debounce as the python + citation checks). Only prose is checked
// (see prose.ts); misspellings get a low-key dotted underline, suggestion buttons fetched when
// the misspelling is opened, an "Add to dictionary" action (permanent), and "Ignore this
// session". Fully offline — the dictionary lives in Rust.
import { EditorView } from "@codemirror/view";
import { linter, forceLinting, forEachDiagnostic, type Diagnostic } from "@codemirror/lint";
import { spellCheck, spellSuggest, addToDictionary, logError } from "../api";
import { spellTokens } from "./prose";
import { useStore } from "../store";

/** Where `word` is NOW: the range the diagnostic was made with, if it still holds that
 *  word, else the nearest current spell diagnostic on the same word. Suggestion buttons
 *  are built when the tooltip renders and clicked later; edits in between move things. */
function currentRange(
  view: EditorView,
  word: string,
  from: number,
  to: number,
): { from: number; to: number } | null {
  const doc = view.state.doc;
  if (to <= doc.length && doc.sliceString(from, to) === word) return { from, to };
  let best: { from: number; to: number } | null = null;
  forEachDiagnostic(view.state, (d, f, t) => {
    if (d.source !== "spell" || doc.sliceString(f, t) !== word) return;
    if (!best || Math.abs(f - from) < Math.abs(best.from - from)) best = { from: f, to: t };
  });
  return best;
}

/** The diagnostic's message plus suggestion buttons, fetched when the tooltip (or the lint
 *  panel) renders it — not when the document is checked. A suggestion costs ~11 ms in Rust;
 *  computing them for every misspelling in a fresh document up front was the freeze after
 *  the first edit (issue G.04). The buttons reuse the lint tooltip's own action class, so
 *  they look like the native actions beside them. */
function renderSpellMessage(view: EditorView, word: string, from: number, to: number): Node {
  const wrap = document.createElement("span");
  wrap.textContent = `“${word}” may be misspelled`;
  const slot = document.createElement("span");
  slot.className = "wd-spell-suggest";
  slot.textContent = " …";
  wrap.appendChild(slot);
  void spellSuggest(word).then(
    (sugs) => {
      slot.textContent = sugs.length ? "" : " — no suggestions";
      for (const sug of sugs) {
        const b = document.createElement("button");
        b.className = "cm-diagnosticAction";
        b.textContent = sug;
        b.onclick = (e) => {
          e.preventDefault();
          const r = currentRange(view, word, from, to);
          if (r) view.dispatch({ changes: { from: r.from, to: r.to, insert: sug } });
          view.focus();
        };
        slot.appendChild(b);
      }
    },
    (e) => {
      slot.textContent = "";
      void logError("spell suggest failed: " + String(e));
    },
  );
  return wrap;
}

const spellLint = linter(
  async (view): Promise<Diagnostic[]> => {
    // Session ignore list wins before we even ask Rust (cheaper, and re-checked each lint run).
    const { spellIgnore: ignore, editorSettings: es } = useStore.getState();
    const spans = spellTokens(
      view.state,
      es?.spelling_min_length ?? 4,
      es?.spelling_skip_proper_nouns ?? true,
    ).filter((s) => !ignore.has(s.word.toLowerCase()));
    if (spans.length === 0) return [];
    const unique = [...new Set(spans.map((s) => s.word))];

    let bad: Set<string>;
    try {
      bad = new Set(await spellCheck(unique));
    } catch (e) {
      void logError("spell check failed: " + String(e)); // dictionary unavailable — never block editing
      return [];
    }
    if (bad.size === 0) return [];

    return spans
      .filter((s) => bad.has(s.word))
      .map((s): Diagnostic => ({
        from: s.from,
        to: s.to,
        // "info" (lowest severity) → a quiet hollow-grey-ring gutter marker, not a loud triangle.
        // Nothing else in the app uses "info", so the marker restyle is spelling-only.
        severity: "info",
        source: "spell",
        markClass: "wd-spell-error",
        message: `“${s.word}” may be misspelled`,
        renderMessage: (v) => renderSpellMessage(v, s.word, s.from, s.to),
        actions: [
          {
            name: "Add to dictionary",
            apply: (v: EditorView) => {
              void addToDictionary(s.word)
                .then(() => forceLinting(v))
                .catch((e) => {
                  // Surface it — a silent failure is exactly why "add word" looked broken.
                  void logError("add to dictionary failed: " + String(e));
                  useStore.setState({ lastError: String(e) });
                });
            },
          },
          {
            name: "Ignore this session",
            apply: (v: EditorView) => {
              useStore.getState().ignoreWord(s.word);
              forceLinting(v);
            },
          },
        ],
      }));
  },
  { delay: 500 },
);

export const spellingExtensions = [spellLint];
