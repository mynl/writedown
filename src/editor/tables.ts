// Reformat GFM pipe tables (Ctrl+Alt+Shift+T, or palette). An explicit user command that
// rewrites the table text as a single undo step — never automatic. v1 scope: pipe tables
// only; alignment markers (:--, :-:, --:) are preserved; tables inside fenced code blocks
// are skipped; column widths use plain string length (no CJK double-width accounting).
//
// Two styles, toggled without stored state (issue J.09): a table already in its WIDE form
// becomes NARROW, anything else becomes WIDE, so repeated presses go wide, narrow, wide.
// With no selection only the table at the caret is touched.
import { type ChangeSpec, type StateCommand, type Text } from "@codemirror/state";
import { useStore } from "../store";

type Align = "l" | "r" | "c" | "n";

// A delimiter row: cells of dashes with optional leading/trailing colons and pipes.
const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Split a table row into trimmed cell strings, honouring `\|` escapes and `` `code` ``
 *  spans, and dropping the empty cells produced by optional outer pipes. */
function splitCells(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let code = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      cur += ch + line[++i];
    } else if (ch === "`") {
      code = !code;
      cur += ch;
    } else if (ch === "|" && !code) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  const t = line.trim();
  if (t.startsWith("|")) cells.shift();
  if (t.endsWith("|") && cells.length) cells.pop();
  return cells.map((c) => c.trim());
}

function alignOf(spec: string): Align {
  const s = spec.trim();
  const l = s.startsWith(":");
  const r = s.endsWith(":");
  return l && r ? "c" : r ? "r" : l ? "l" : "n";
}

function pad(s: string, w: number, a: Align): string {
  const gap = w - s.length;
  if (gap <= 0) return s;
  if (a === "r") return " ".repeat(gap) + s;
  if (a === "c") {
    const left = gap >> 1;
    return " ".repeat(left) + s + " ".repeat(gap - left);
  }
  return s + " ".repeat(gap); // left / none
}

/** A delimiter cell of `w` characters in all, colons included. Unpadded (issue J.09b): it
 *  fills the space between its pipes, so in the wide form, `w` = column width + 2, it
 *  lines up with the `| cell |` rows above and below. */
function delimCell(a: Align, w: number): string {
  const dash = (n: number) => "-".repeat(Math.max(1, n));
  if (a === "c") return ":" + dash(w - 2) + ":";
  if (a === "r") return dash(w - 1) + ":";
  if (a === "l") return ":" + dash(w - 1);
  return dash(w);
}

/** The narrow form's delimiter cell: the shortest marker per alignment, as ruled
 *  (`--`, `:--`, `--:`, `:-:`). This discards the dash counts Pandoc reads as relative
 *  column widths when a row exceeds its column limit; narrow is for a table that has grown
 *  far too wide, after which widths are set by hand. */
const NARROW_DELIM: Record<Align, string> = { n: "--", l: ":--", r: "--:", c: ":-:" };

type TableStyle = "wide" | "narrow";

/** Rebuild one table (raw lines, header first). Wide: every cell padded to its column's
 *  width, one space inside each pipe, delimiter cells spanning width + 2 so the pipes align.
 *  Narrow: one space each side, no padding, minimal delimiter cells. */
function formatTable(lines: string[], indent: string, style: TableStyle): string {
  const rows = lines.map(splitCells);
  const ncol = Math.max(...rows.map((r) => r.length));
  const aligns: Align[] = [];
  const widths: number[] = [];
  for (let c = 0; c < ncol; c++) {
    aligns[c] = alignOf(rows[1][c] ?? "");
    let w = 3; // keeps narrow headers from making needle-thin columns, as before J.09
    rows.forEach((r, ri) => {
      if (ri !== 1) w = Math.max(w, (r[c] ?? "").length);
    });
    widths[c] = w;
  }
  const line = (cells: string[]) => indent + "| " + cells.join(" | ") + " |";
  const delim = (cells: string[]) => indent + "|" + cells.join("|") + "|";
  return rows
    .map((r, ri) => {
      if (style === "narrow") {
        return ri === 1
          ? delim(aligns.map((a) => NARROW_DELIM[a]))
          : line(aligns.map((_, c) => r[c] ?? ""));
      }
      return ri === 1
        ? delim(widths.map((w, c) => delimCell(aligns[c], w + 2)))
        : line(widths.map((w, c) => pad(r[c] ?? "", w, aligns[c])));
    })
    .join("\n");
}

/** Find pipe-table blocks (header + delimiter + body), skipping fenced code. */
function findTables(doc: Text): Array<{ start: number; end: number }> {
  const blocks: Array<{ start: number; end: number }> = [];
  let fence: string | null = null;
  const n = doc.lines;
  for (let i = 1; i <= n; i++) {
    const text = doc.line(i).text;
    const fm = /^\s*(`{3,}|~{3,})/.exec(text);
    if (fence) {
      if (fm && text.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fm) {
      fence = fm[1][0].repeat(3);
      continue;
    }
    if (
      i + 1 <= n &&
      text.includes("|") &&
      text.trim() !== "" &&
      doc.line(i + 1).text.includes("-") &&
      DELIM.test(doc.line(i + 1).text)
    ) {
      let end = i + 1;
      while (end + 1 <= n && doc.line(end + 1).text.includes("|") && doc.line(end + 1).text.trim() !== "") end++;
      blocks.push({ start: i, end });
      i = end;
    }
  }
  return blocks;
}

/** Ctrl+Alt+Shift+T. A selection formats every table it touches; with none, only the table
 *  containing the caret's line (issue J.09a), and outside any table a status note and no
 *  change. Always returns true, so the key never falls through to another binding. Each
 *  target toggles on its own: wide unless it is already wide, then narrow. */
export const reformatTables: StateCommand = ({ state, dispatch }) => {
  const doc = state.doc;
  const sel = state.selection.main;
  const all = findTables(doc);
  const fromLine = doc.lineAt(sel.from).number;
  const toLine = doc.lineAt(sel.to).number;
  const targets = all.filter((t) => t.start <= toLine && t.end >= fromLine);
  if (!targets.length) {
    useStore.getState().showStatusMessage("not in a table");
    return true;
  }

  const changes: ChangeSpec[] = targets.map((t) => {
    const lines: string[] = [];
    for (let n = t.start; n <= t.end; n++) lines.push(doc.line(n).text);
    const indent = /^\s*/.exec(lines[0])![0];
    const current = lines.join("\n");
    const wide = formatTable(lines, indent, "wide");
    const insert = current === wide ? formatTable(lines, indent, "narrow") : wide;
    return { from: doc.line(t.start).from, to: doc.line(t.end).to, insert };
  });
  dispatch(state.update({ changes, userEvent: "format.table" }));
  return true;
};
