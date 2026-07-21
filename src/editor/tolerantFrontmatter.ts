// Tolerant YAML front-matter wrapper (issue Sa 14) — a drop-in replacement for
// @codemirror/lang-yaml's yamlFrontmatter, whose grammar demands the `---` delimiters
// EXACTLY: one trailing space on the closing line left the block unclosable, and error
// recovery then parsed the entire rest of the document as YAML — killing all markdown
// highlighting below the block. This version accepts trailing blanks on both
// delimiters, and when no close exists it treats the document as having NO front
// matter instead of swallowing it. Node names, DashLine styling (tags.meta), and the
// mixed-parse nesting (YAML inside the block, the content language below) mirror the
// original exactly, so themes and name-based gates (prose.ts) see identical trees.
import {
  NodeSet,
  NodeType,
  Parser,
  Tree,
  parseMixed,
  type Input,
  type PartialParse,
  type ParseWrapper,
  type TreeFragment,
} from "@lezer/common";
import { styleTags, tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import {
  Language,
  LanguageSupport,
  defineLanguageFacet,
  languageDataProp,
} from "@codemirror/language";
import { yamlLanguage } from "@codemirror/lang-yaml";
import { FM_OPEN_RE, FM_CLOSE_RE } from "../frontmatterShared";

const fmData = defineLanguageFacet();

// Ids are indexes into the set. extend() re-instantiates the types with the style
// props attached — trees must be built from THESE types, not the raw definitions.
const nodeSet = new NodeSet([
  NodeType.define({ id: 0, name: "Document", top: true, props: [[languageDataProp, fmData]] }),
  NodeType.define({ id: 1, name: "Frontmatter" }),
  NodeType.define({ id: 2, name: "DashLine" }),
  NodeType.define({ id: 3, name: "FrontmatterContent" }),
  NodeType.define({ id: 4, name: "Body" }),
]).extend(styleTags({ DashLine: tags.meta }));

const [docType, fmType, dashType, contentType, bodyType] = nodeSet.types;

/** Text of the line starting at `pos` (no terminator). Handles both the editor's
 *  line-chunked DocInput (chunk = rest of line, or "\n" at a break) and plain-string
 *  inputs (chunk = arbitrary window). */
function lineAt(input: Input, pos: number): string {
  let text = "";
  for (let p = pos; p < input.length; ) {
    const chunk = input.chunk(p);
    if (input.lineChunks) return chunk === "\n" ? text : chunk;
    const eol = chunk.indexOf("\n");
    if (eol > -1) return text + chunk.slice(0, eol);
    text += chunk;
    p += chunk.length;
  }
  return text;
}

/** The outer split: Document[ Frontmatter[ DashLine, FrontmatterContent?, DashLine ],
 *  Body ] when line 1 opens a block that later closes; Document[ Body ] otherwise.
 *  Cheap — the scan stops at the closing delimiter (a handful of lines); only a doc
 *  that opens a block and never closes it costs one full line pass, a state that is
 *  transient while the block is being typed. */
function buildTree(input: Input): Tree {
  const len = input.length;
  const bodyOnly = () => new Tree(docType, [new Tree(bodyType, [], [], len)], [0], len);
  const open = len ? lineAt(input, 0) : "";
  if (!len || !FM_OPEN_RE.test(open)) return bodyOnly();
  const dash1To = Math.min(open.length + 1, len); // include the newline when present
  let pos = dash1To;
  while (pos < len || (pos === len && pos > dash1To)) {
    const line = lineAt(input, pos);
    if (FM_CLOSE_RE.test(line)) {
      const closeTo = Math.min(pos + line.length + 1, len);
      const children: Tree[] = [new Tree(dashType, [], [], dash1To)];
      const positions: number[] = [0];
      if (pos > dash1To) {
        children.push(new Tree(contentType, [], [], pos - dash1To));
        positions.push(dash1To);
      }
      children.push(new Tree(dashType, [], [], closeTo - pos));
      positions.push(pos);
      return new Tree(
        docType,
        [new Tree(fmType, children, positions, closeTo), new Tree(bodyType, [], [], len - closeTo)],
        [0, closeTo],
        len,
      );
    }
    if (pos >= len) break;
    pos += line.length + 1;
  }
  return bodyOnly(); // opened but never closed — ordinary markdown, nothing swallowed
}

/** One-shot partial parse: the outer tree is at most six nodes, so it is built in a
 *  single advance(). Ignoring stopAt is legal (the tree may extend past it); the
 *  nested markdown/yaml parses — where the real work is — stay incremental and
 *  time-sliced through parseMixed. */
class FMPartial implements PartialParse {
  parsedPos = 0;
  stoppedAt: number | null = null;
  constructor(private readonly input: Input) {}
  advance(): Tree | null {
    this.parsedPos = this.input.length;
    return buildTree(this.input);
  }
  stopAt(pos: number): void {
    this.stoppedAt = pos;
  }
}

class FMParser extends Parser {
  constructor(private readonly wrapper: ParseWrapper) {
    super();
  }
  createParse(
    input: Input,
    fragments: readonly TreeFragment[],
    ranges: readonly { from: number; to: number }[],
  ): PartialParse {
    return this.wrapper(new FMPartial(input), input, fragments, ranges);
  }
}

/** Language support for `config.content` documents with an optional tolerant YAML
 *  front-matter block — same shape as lang-yaml's yamlFrontmatter(). */
export function tolerantFrontmatter(config: { content: Language | LanguageSupport }): LanguageSupport {
  const { language, support } =
    config.content instanceof LanguageSupport
      ? { language: config.content.language, support: config.content.support as Extension }
      : { language: config.content, support: [] as Extension };
  const wrapper = parseMixed((node) =>
    node.name === "FrontmatterContent"
      ? { parser: yamlLanguage.parser }
      : node.name === "Body"
        ? { parser: language.parser }
        : null,
  );
  return new LanguageSupport(
    new Language(fmData, new FMParser(wrapper), [], "yaml-frontmatter"),
    support,
  );
}
