// "Diff: When Did This Line Change" (issue J.07): follow the caret's line back through
// history to the change that last touched it, then show that one change in the diff pane,
// scrolled to the line. Three sources, in order:
//
//   1. unsaved: the line differs from the saved file, so it changed since the last save;
//   2. git, for a tracked file: `git blame` of the line against the live buffer gives the
//      commit; a line not committed yet falls through to
//   3. saved versions: the file on disk, then each backup newest first, diffed pairwise
//      until a change touches the line.
//
// On command only; nothing here runs while typing.
import { diff } from "@codemirror/merge";
import { gitLineHistory, listBackups, readBackups, type BackupEntry } from "./api";
import { isScratch, useStore } from "./store";
import { getActiveView } from "./editor/editorView";

/** The newest versions per file that retention always keeps (backup.rs KEEP). Within
 *  them no version was ever thinned away, so a change found there is pinned to one save. */
const KEEP = 20;
/** Backups fetched per round trip while walking back; the walk usually stops early. */
const BATCH = 8;

/** Offsets where each line of `text` starts. */
function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) out.push(i + 1);
  return out;
}

/** Line `n` (1-based) of `older`'s counterpart in `newer`, traced backward in time.
 *
 *  Notes
 *  -----
 *  `diff(newer, older)` gives character changes, A being the newer text. The line changed
 *  between the two versions if any change overlaps its text, or if the older line found by
 *  mapping its start through the unchanged stretches reads differently (which catches an
 *  insertion at either edge of the line). Otherwise the result is that older line's number,
 *  the line to follow into the next older version. */
export function traceLine(
  newer: string,
  older: string,
  n: number,
): { changed: true } | { changed: false; line: number } {
  const startsA = lineStarts(newer);
  const k = Math.max(1, Math.min(n, startsA.length)) - 1;
  const ls = startsA[k];
  const le = k + 1 < startsA.length ? startsA[k + 1] - 1 : newer.length;
  let delta = 0;
  for (const c of diff(newer, older)) {
    if (c.fromA < le && c.toA > ls) return { changed: true }; // overlaps the line's text
    if (c.toA <= ls) delta += c.toB - c.fromB - (c.toA - c.fromA);
  }
  const posB = Math.max(0, Math.min(older.length, ls + delta));
  const startsB = lineStarts(older);
  let j = startsB.length - 1;
  while (j > 0 && startsB[j] > posB) j--;
  const lineB = older.slice(startsB[j], j + 1 < startsB.length ? startsB[j + 1] - 1 : older.length);
  if (lineB !== newer.slice(ls, le)) return { changed: true };
  return { changed: false, line: j + 1 };
}

/** A unix-millisecond stamp as local `YYYY-MM-DD HH:MM`. */
function when(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const lf = (s: string) => s.split("\r\n").join("\n");

/** The palette verb. Reports in the status bar and opens the pair diff. */
export async function whenDidThisLineChange(): Promise<void> {
  const st = useStore.getState();
  const say = (m: string) => st.showStatusMessage(m);
  const doc = st.tabs.find((t) => t.path === st.activePath);
  const view = getActiveView();
  if (!doc || !view || !view.dom.isConnected) return say("line history: no document open");
  if (isScratch(doc.path)) return say("line history: a temporary file has no history");
  const buffer = doc.content;
  const n = view.state.doc.lineAt(view.state.selection.main.head).number;
  try {
    // 1. Unsaved edits on the line.
    const t0 = traceLine(buffer, doc.savedContent, n);
    if (t0.changed) {
      say("line history: changed since the last save");
      await st.openDiff("disk");
      return;
    }
    // 2. Git, when the file is tracked. The buffer goes with the file's own line endings,
    //    so git compares it with the committed text as it would the working file.
    const blame = await gitLineHistory(doc.path, n, buffer.split("\n").join(doc.eol)).catch(() => null);
    if (blame?.committed) {
      const short = blame.commit.slice(0, 7);
      const date = when(blame.author_time * 1000).slice(0, 10);
      st.openPairDiff(lf(blame.base), lf(blame.other), `commit ${short}, ${blame.summary}`, blame.orig_line);
      say(`line last changed in ${short} on ${date}: ${blame.summary}`);
      return;
    }
    // 3. Saved versions: V0 is the saved file, then the backups newest first.
    const versions: BackupEntry[] = await listBackups(doc.path);
    if (versions.length === 0) return say("line history: no saved versions of this file yet");
    let newer = doc.savedContent;
    let line = t0.line;
    for (let i = 0; i < versions.length; i += BATCH) {
      const chunk = versions.slice(i, i + BATCH);
      const texts = await readBackups(doc.path, chunk.map((v) => v.millis));
      for (let j = 0; j < chunk.length; j++) {
        const k = i + j + 1; // this is V_k, superseded by the save at versions[k - 1]
        const older = lf(texts[j]);
        const t = traceLine(newer, older, line);
        if (t.changed) {
          const at = versions[k - 1].millis;
          // Beyond the newest KEEP, thinning may have dropped versions in between, so the
          // change is somewhere from this save to the next version that survives.
          const msg =
            k <= KEEP
              ? `line changed in the save at ${when(at)}`
              : `line changed between ${when(at)} and ${when(versions[k - 2].millis)}`;
          st.openPairDiff(older, newer, msg.replace(/^line changed /, ""), line);
          say(`line history: ${msg}`);
          return;
        }
        newer = older;
        line = t.line;
      }
    }
    say(`line history: unchanged across the saved history (since ${when(versions[versions.length - 1].millis)})`);
  } catch (e) {
    useStore.setState({ lastError: `line history — ${String(e)}` });
  }
}
