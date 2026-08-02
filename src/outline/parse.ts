import { AGG_DECL_RE } from "../editor/decl";

// Document outlines (spec §18). Markdown ATX headings (skipping YAML front matter,
// fences, comments); plus structural outlines for Python (class/def), TOML ([section]),
// and YAML (mapping keys). A parent with an absurd number of children has them dropped —
// the outline is a summary, not a mirror.

export type Heading = { level: number; text: string; line: number };

/** Options for the structural (non-Markdown) outlines, from config `[outline]`. */
export type OutlineOpts = {
  /** Show `_private` members in the Python outline (default true). */
  pythonShowPrivate?: boolean;
  /** Show `__dunder__` members in the Python outline (default false). `__init__` is
   *  always kept — it is the one dunder worth navigating to. */
  pythonShowDunder?: boolean;
};

/** Max direct children per outline node before we drop its descendants entirely. Guards
 *  against pathological documents where the outline would mirror rather than summarise. */
const MAX_CHILDREN = 30;
/** Python is different: a class with 200 methods is exactly when the outline matters most.
 *  The old blanket cap of 30 silently discarded EVERY member of any class with more than
 *  30 methods, which read as "methods aren't in the outline at all" (issue A.11). */
const MAX_CHILDREN_PY = 500;

export function parseOutline(src: string, path?: string, opts?: OutlineOpts): Heading[] {
  const ext = path?.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "py":
      return capChildren(parsePython(src, opts), MAX_CHILDREN_PY);
    case "agg":
    case "dec":
    case "decl":
      // Flat list of top-level declarations — same cap rationale as Python: a program
      // with 200 aggregates is exactly when you need to navigate it.
      return capChildren(parseAgg(src), MAX_CHILDREN_PY);
    case "toml":
      return capChildren(parseToml(src));
    case "yaml":
    case "yml":
      return capChildren(parseYaml(src));
    default:
      return capChildren(parseMarkdown(src));
  }
}

/** Drop all descendants of any node with more than `max` direct children. */
function capChildren(items: Heading[], max = MAX_CHILDREN): Heading[] {
  const drop = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    const lvl = items[i].level;
    let direct = 0;
    const desc: number[] = [];
    for (let j = i + 1; j < items.length && items[j].level > lvl; j++) {
      desc.push(j);
      if (items[j].level === lvl + 1) direct++;
    }
    if (direct > max) desc.forEach((j) => drop.add(j));
  }
  return items.filter((_, i) => !drop.has(i));
}

function parseMarkdown(src: string): Heading[] {
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
  let inComment = false;
  for (; i < lines.length; i++) {
    let line = lines[i];

    // Strip HTML comments so commented-out headings don't appear in the outline,
    // tracking multi-line comments while preserving original line numbers.
    if (inComment) {
      const close = line.indexOf("-->");
      if (close === -1) continue;
      line = line.slice(close + 3);
      inComment = false;
    }
    line = line.replace(/<!--[\s\S]*?-->/g, "");
    const open = line.indexOf("<!--");
    if (open !== -1) {
      line = line.slice(0, open);
      inComment = true;
    }

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

// Python: classes and defs. Top-level class/def = level 1; one level of nesting
// (methods, inner defs) = level 2; anything deeper is noise, not summary — skipped.
function parsePython(src: string, opts?: OutlineOpts): Heading[] {
  const lines = src.split("\n");
  const out: Heading[] = [];
  let classIndent = -1; // indent of the innermost class we're inside, -1 if none
  const showPrivate = opts?.pythonShowPrivate ?? true;
  const showDunder = opts?.pythonShowDunder ?? false;

  // `__init__` survives a dunder filter — it is the one dunder worth navigating to.
  const hidden = (name: string): boolean => {
    if (/^__.*__$/.test(name)) return !showDunder && name !== "__init__";
    return !showPrivate && name.startsWith("_");
  };

  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].replace(/\t/g, "    ").length;
    const kind = m[2];
    const name = m[3];
    // A hidden top-level class still updates classIndent below, so its members are
    // scoped correctly; only the row itself is suppressed.
    const skip = hidden(name);

    if (indent === 0) {
      classIndent = kind === "class" ? 0 : -1;
      if (!skip) out.push({ level: 1, text: kind === "class" ? name : `${name}()`, line: i + 1 });
    } else if (classIndent >= 0 && indent > classIndent && indent <= classIndent + 8) {
      // Direct members of the current class (methods / nested classes).
      if (!skip) out.push({ level: 2, text: kind === "class" ? name : `${name}()`, line: i + 1 });
    }
    // Deeper nesting (defs inside defs inside methods…) intentionally omitted.
  }
  return out;
}

// DecL (.agg/.dec/.decl): one entry per top-level declaration, "keyword name" (issue
// A.21). AGG_DECL_RE is shared with the fold service in editor/decl.ts, so the outline and
// the fold ranges always agree on what a top-level statement is.
function parseAgg(src: string): Heading[] {
  const lines = src.split("\n");
  const out: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = AGG_DECL_RE.exec(lines[i]);
    if (m) out.push({ level: 1, text: `${m[1]} ${m[2]}`, line: i + 1 });
  }
  return out;
}

// TOML: [section], [a.b.c], [[array.of.tables]]. Level = dotted depth (capped at 3);
// text shows the last segment, indented under its parents.
function parseToml(src: string): Heading[] {
  const lines = src.split("\n");
  const out: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\[\[?\s*([^\]\s]+)\s*\]\]?/.exec(lines[i]);
    if (!m) continue;
    const parts = m[1].split(".");
    const level = Math.min(parts.length, 3);
    out.push({ level, text: parts[parts.length - 1], line: i + 1 });
  }
  return out;
}

// YAML: mapping keys by indentation. Top-level keys = level 1, one nesting = level 2;
// deeper structure is detail, not summary. List items are skipped.
function parseYaml(src: string): Heading[] {
  const lines = src.split("\n");
  const out: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(#|-)/.test(line)) continue; // comments, list items
    const m = /^( *)([^\s:#][^:]*):(\s|$)/.exec(line);
    if (!m) continue;
    const level = m[1].length === 0 ? 1 : m[1].length <= 4 ? 2 : 0;
    if (level === 0) continue;
    out.push({ level, text: m[2].trim(), line: i + 1 });
  }
  return out;
}
