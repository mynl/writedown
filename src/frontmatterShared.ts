// Front-matter delimiter shapes shared by the editor parser (tolerantFrontmatter) and
// the preview's stripFrontmatter — the two sides MUST agree on what opens and closes a
// block, or the panes disagree about the same document (issue Sa 14: a trailing space
// on the closing --- broke the editor while the preview looked fine). Tolerant of
// trailing spaces/tabs, as Pandoc and Jekyll are. Zero imports — this module also
// loads inside the preview worker.
// U+FEFF (BOM) is built with fromCharCode so no invisible character hides in this
// source file.
const BOM = String.fromCharCode(0xfeff);
/** Opening delimiter: `---` alone on the first line; optional BOM, trailing blanks OK. */
export const FM_OPEN_RE = new RegExp("^" + BOM + "?---[ \\t]*\\r?$");
/** Closing delimiter: `---` alone on its line; trailing blanks OK. */
export const FM_CLOSE_RE = /^---[ \t]*\r?$/;

/** Read a top-level boolean key out of the front matter, e.g. Quarto's
 *  `number-sections: true` (issue A.18). Hand-scanned, like the Rust side's
 *  `parse_front_matter`: no YAML dependency, and the block is never rewritten — only read.
 *  Only top-level keys count, so a `number-sections:` nested under `format:` is ignored. */
export function frontMatterFlag(src: string, key: string): boolean | undefined {
  const lines = src.split("\n");
  if (lines.length === 0 || !FM_OPEN_RE.test(lines[0])) return undefined;
  for (let i = 1; i < lines.length; i++) {
    if (FM_CLOSE_RE.test(lines[i])) return undefined; // end of block, key absent
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(lines[i]);
    if (!m || m[1] !== key) continue;
    const v = m[2].replace(/^["']|["']$/g, "").toLowerCase();
    if (v === "true" || v === "yes") return true;
    if (v === "false" || v === "no") return false;
    return undefined;
  }
  return undefined;
}
