// Prose spellcheck as a CodeMirror lint source. Reuses the existing @codemirror/lint pipeline
// (same gutter/overlay/½s-idle debounce as the python + citation checks). Only prose is checked
// (see prose.ts); misspellings get a low-key dotted underline with one-click suggestion fixes,
// an "Add to dictionary" action (permanent), and "Ignore this session". Fully offline — the
// dictionary lives in Rust.
import { EditorView } from "@codemirror/view";
import { linter, forceLinting, type Diagnostic } from "@codemirror/lint";
import { spellCheck, addToDictionary, logError } from "../api";
import { spellTokens } from "./prose";
import { useStore } from "../store";

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

    let results;
    try {
      results = await spellCheck(unique);
    } catch (e) {
      void logError("spell check failed: " + String(e)); // dictionary unavailable — never block editing
      return [];
    }
    if (results.length === 0) return [];

    const suggestions = new Map(results.map((r) => [r.word, r.suggestions]));
    const bad = new Set(results.map((r) => r.word));

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
        actions: [
          ...(suggestions.get(s.word) ?? []).map((sug) => ({
            name: sug,
            apply: (v: EditorView, from: number, to: number) =>
              v.dispatch({ changes: { from, to, insert: sug } }),
          })),
          {
            name: "Add to dictionary",
            apply: (v: EditorView) => {
              void addToDictionary(s.word)
                .then(() => forceLinting(v))
                .catch((e) => {
                  // Surface it — a silent failure is exactly why "add word" looked broken.
                  void logError("add to dictionary failed: " + String(e));
                  useStore.setState({ configError: String(e) });
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
