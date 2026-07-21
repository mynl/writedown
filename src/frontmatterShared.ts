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
