// Word Count (issue K.03): prose only. Pure and import-free, so it can be checked with node
// directly. Removed before counting: YAML front matter at the top, fenced code blocks (``` and
// ~~~, Python cells included), HTML comments and tags, display math ($$ … $$), and link and
// image targets (the (…) after a ]). Inline math ($…$) counts as one word, a citation (@key) as
// one. A word is a maximal run of letters and digits, kept together by an internal apostrophe
// or hyphen ("don't", "well-known").

/** Drop fenced code blocks, fences included. A fence opens with three or more backticks or
 *  tildes (up to three spaces of indent) and closes with a bare run of the same character at
 *  least as long; an unclosed fence runs to the end, as in CommonMark. */
function stripFences(text: string): string {
  const kept: string[] = [];
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m) fence = m[1];
      else kept.push(line);
    } else if (m && m[1][0] === fence[0] && m[1].length >= fence.length && /^ {0,3}[`~]+[ \t]*$/.test(line)) {
      fence = null;
    }
  }
  return kept.join("\n");
}

/** Count the words and characters of `text`, prose only (the rule is at the top of this
 *  file). Characters are the code points of the text kept after the removals, inline math,
 *  citations, markup and spaces included, line breaks excluded. Each removed region leaves a
 *  line break, so words on either side of it never run together. */
export function countWords(text: string): { words: number; characters: number } {
  let t = text.replace(/\r\n?/g, "\n");
  t = t.replace(/^---[ \t]*\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/, "\n"); // front matter
  t = stripFences(t);
  t = t.replace(/<!--[\s\S]*?(?:-->|$)/g, "\n"); // HTML comments
  t = t.replace(/\$\$[\s\S]*?(?:\$\$|$)/g, "\n"); // display math
  t = t.replace(/\]\([^)\n]*\)/g, "]"); // link and image targets
  t = t.replace(/<\/?[A-Za-z][^<>\n]*>/g, "\n"); // HTML tags (a bare "a < b" is prose)
  const characters = [...t.replace(/\n/g, "")].length;
  const prose = t
    // Inline math, Pandoc's rule: no space inside either dollar, no digit after the closing
    // one, so "$5 and $10" stays prose.
    .replace(/\$(?=\S)[^$\n]*?\S\$(?!\d)/g, "M")
    // A citation key, not an email address: nothing word-like before the @.
    .replace(/(?<![\p{L}\p{N}_])@[\p{L}\p{N}_]+(?:[:.#$%&+?<>~/-][\p{L}\p{N}_]+)*/gu, "C");
  const words = prose.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return { words, characters };
}
