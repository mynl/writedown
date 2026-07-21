// Persistent frequency-weighted word dictionary for Tab completion (issue Sa 5b).
// Opened/saved docs are scanned in the background for words of >= minLen letters;
// counts are stored PER FILE — re-opening a file REPLACES its entry, so nothing is
// ever double-counted — in ~/.writedown/word-frequency.json (derived, disposable
// data). An in-memory aggregate (lowercase word → total count + majority casing)
// answers stem queries at Tab time. Scans and saves are debounced background work:
// nothing here runs on the keystroke path, and a missing/corrupt file (or an old
// backend without the commands) just leaves the dictionary empty — never an error
// the user has to deal with.
// No store import (store.ts imports this module): callers pass the config knobs in.
import { logError, wordFreqLoad, wordFreqSave } from "../api";

type FileEntry = { scanned: number; words: Record<string, number> }; // original form → count
type FreqStore = { version: 1; files: Record<string, FileEntry> };

const MAX_FILES = 50; // most-recently-scanned files kept
const MAX_WORDS_PER_FILE = 250; // top words by in-file count
const SCAN_DELAY_MS = 1000;
const SAVE_DEBOUNCE_MS = 5000;

let store: FreqStore = { version: 1, files: {} };
let aggregate: Map<string, { count: number; form: string }> | null = null;
let loadStarted = false;

function ensureLoaded(): void {
  if (loadStarted) return;
  loadStarted = true;
  void wordFreqLoad()
    .then((json) => {
      if (!json) return;
      const parsed = JSON.parse(json) as FreqStore;
      if (parsed && parsed.version === 1 && parsed.files) {
        // Live entries win — a scan may have landed before the load resolved.
        store = { version: 1, files: { ...parsed.files, ...store.files } };
        aggregate = null;
      }
    })
    .catch((e) => void logError("word-frequency load: " + String(e)));
}

let saveTimer: number | undefined;
function scheduleSave(): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    void wordFreqSave(JSON.stringify(store)).catch(
      (e) => void logError("word-frequency save: " + String(e)),
    );
  }, SAVE_DEBOUNCE_MS);
}

function pruneFiles(): void {
  const paths = Object.keys(store.files);
  if (paths.length <= MAX_FILES) return;
  paths
    .sort((a, b) => store.files[a].scanned - store.files[b].scanned)
    .slice(0, paths.length - MAX_FILES)
    .forEach((p) => delete store.files[p]);
}

/** Count the >=`minLen`-letter words in `text` and replace `path`'s entry. */
function scanDoc(path: string, text: string, minLen: number): void {
  const re = new RegExp("\\p{L}{" + minLen + ",}", "gu");
  const counts = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  const words: Record<string, number> = {};
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_WORDS_PER_FILE)
    .forEach(([w, n]) => (words[w] = n));
  store.files[path] = { scanned: Date.now(), words };
  pruneFiles();
  aggregate = null;
  scheduleSave();
}

const pendingScans = new Map<string, number>();
/** Debounced background scan — called on open and on save. `getText` is read at fire
 *  time (returning undefined — tab since closed — skips the scan). */
export function scheduleScan(
  path: string,
  minLen: number,
  getText: () => string | undefined,
): void {
  ensureLoaded();
  if (/\.(csv|tsv)$/i.test(path)) return; // data files are noise, not vocabulary
  const t = pendingScans.get(path);
  if (t !== undefined) clearTimeout(t);
  pendingScans.set(
    path,
    window.setTimeout(() => {
      pendingScans.delete(path);
      const text = getText();
      if (text !== undefined) scanDoc(path, text, minLen);
    }, SCAN_DELAY_MS),
  );
}

function buildAggregate(): Map<string, { count: number; form: string }> {
  const totals = new Map<string, { count: number; forms: Map<string, number> }>();
  for (const entry of Object.values(store.files)) {
    for (const [form, n] of Object.entries(entry.words)) {
      const key = form.toLowerCase();
      let t = totals.get(key);
      if (!t) totals.set(key, (t = { count: 0, forms: new Map() }));
      t.count += n;
      t.forms.set(form, (t.forms.get(form) ?? 0) + n);
    }
  }
  const out = new Map<string, { count: number; form: string }>();
  for (const [key, t] of totals) {
    let bestForm = key;
    let bestN = -1;
    for (const [form, n] of t.forms) {
      if (n > bestN) {
        bestN = n;
        bestForm = form;
      }
    }
    out.set(key, { count: t.count, form: bestForm });
  }
  return out;
}

/** Dictionary words starting with `stemLower`, at least `minLen` long, not in
 *  `exclude` (lowercase keys), ranked by total frequency — the "used frequently" half
 *  of the completion algo, covering words that are NOT nearby in the current doc.
 *  Returns each word in its majority casing. */
export function freqMatches(
  stemLower: string,
  minLen: number,
  exclude: ReadonlySet<string>,
  cap: number,
): string[] {
  ensureLoaded();
  if (!aggregate) aggregate = buildAggregate();
  const hits: { form: string; count: number }[] = [];
  for (const [key, v] of aggregate) {
    if (key.length < minLen || key === stemLower) continue;
    if (!key.startsWith(stemLower) || exclude.has(key)) continue;
    hits.push({ form: v.form, count: v.count });
  }
  return hits
    .sort((a, b) => b.count - a.count)
    .slice(0, cap)
    .map((h) => h.form);
}
