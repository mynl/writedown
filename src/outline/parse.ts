// Parse ATX headings for the document outline (spec §18). Skips YAML front matter and
// fenced code blocks; strips Quarto heading identifiers (`{#sec-x}`) and trailing `#`.

export type Heading = { level: number; text: string; line: number };

export function parseOutline(src: string): Heading[] {
  const lines = src.split("\n");
  const out: Heading[] = [];
  let i = 0;

  // Skip a leading YAML front-matter block (its `#` are comments, not headings).
  if (lines[0]?.trim() === "---") {
    let j = 1;
    while (j < lines.length && lines[j].trim() !== "---") j++;
    if (j < lines.length) i = j + 1;
  }

  let inFence = false;
  let fenceChar = "";
  for (; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const h = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (h) {
      const text = h[2]
        .replace(/\s*\{#[^}]*\}\s*$/, "") // {#sec-id}
        .replace(/\s*#+\s*$/, "") // closing ###
        .trim();
      out.push({ level: h[1].length, text, line: i + 1 });
    }
  }
  return out;
}
