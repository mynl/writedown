// Prose spellcheck as a CodeMirror lint source. Reuses the existing @codemirror/lint pipeline
// (same gutter/overlay/½s-idle debounce as the python + citation checks). Only prose is checked
// (see prose.ts); misspellings get a low-key dotted underline with one-click suggestion fixes
// and an "Add to dictionary" action. Fully offline — the dictionary lives in Rust.
import { EditorView } from "@codemirror/view";
import { linter, forceLinting, type Diagnostic } from "@codemirror/lint";
import { spellCheck, addToDictionary } from "../api";
import { spellTokens } from "./prose";

const spellLint = linter(
  async (view): Promise<Diagnostic[]> => {
    const spans = spellTokens(view.state);
    if (spans.length === 0) return [];
    const unique = [...new Set(spans.map((s) => s.word))];

    let results;
    try {
      results = await spellCheck(unique);
    } catch {
      return []; // dictionary unavailable — never block editing
    }
    if (results.length === 0) return [];

    const suggestions = new Map(results.map((r) => [r.word, r.suggestions]));
    const bad = new Set(results.map((r) => r.word));

    return spans
      .filter((s) => bad.has(s.word))
      .map((s): Diagnostic => ({
        from: s.from,
        to: s.to,
        severity: "warning",
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
                .catch(() => {});
            },
          },
        ],
      }));
  },
  { delay: 500 },
);

export const spellingExtensions = [spellLint];
