import MarkdownIt from "markdown-it";

export const DIAGRAM_LANGUAGE = "patch-mermaid";

export interface DiagramBlock {
  /** Zero-based line of the opening fence in the original note. */
  line: number;
  source: string;
}

const markdown = new MarkdownIt("commonmark");
markdown.core.ruler.enableOnly(["normalize", "block"]);

function opensBlockComment(text: string): boolean {
  return text.startsWith("%%") && text[2] !== "%" && !text.includes("%%", 2);
}

// Obsidian also treats display math and block comments as literal content.
// Consume them at block level, where list and blockquote markers have already
// been accounted for and ordinary fences own their entire contents.
markdown.block.ruler.before("fence", "obsidian-literal", (state, start, end, silent) => {
  const first = state.getLines(start, start + 1, state.blkIndent, false).trimStart();
  const math = /^\${2,}/.exec(first)?.[0];
  if (math ? first.includes("$$", math.length) : !opensBlockComment(first)) return false;
  if (silent) return true;

  let line = start + 1;
  while (line < end) {
    if (!state.isEmpty(line) && state.sCount[line]! < state.blkIndent) break;
    const text = state.getLines(line, line + 1, state.blkIndent, false);
    line++;
    if (math) {
      if (text.trimEnd().endsWith(math)) break;
    } else {
      const close = text.indexOf("%%");
      if (close >= 0 && !opensBlockComment(text.slice(close + 2).trimStart())) break;
    }
  }
  state.line = line;
  return true;
}, { alt: ["paragraph", "reference", "blockquote", "list"] });

/** The caller strips note properties using Obsidian's frontmatter parser. */
export function diagramBlocks(body: string, firstLine: number): DiagramBlock[] {
  const blocks: DiagramBlock[] = [];
  for (const token of markdown.parse(body, {})) {
    if (token.type === "fence" && token.map && token.info.trim().split(/\s+/, 1)[0] === DIAGRAM_LANGUAGE) {
      blocks.push({ line: firstLine + token.map[0], source: token.content.replace(/\n$/, "") });
    }
  }
  return blocks;
}

export interface DiagramLocation {
  line: number;
  /** Zero-based column in the diagram text, before Markdown container prefixes. */
  column?: number;
}

/** Some parsers report positions after stripping Mermaid frontmatter, directives
 * and comments. Use the opening fence whenever a note location is ambiguous. */
export function errorLocation(block: DiagramBlock, message: string): DiagramLocation {
  const fence = { line: block.line };
  const firstError = /^(?:Parsing failed:\s*)?(?:Parse|Lexer|Lexical) error on line (\d+)(?:, column (\d+))?\b/i.exec(message);
  if (!firstError || /^\s*---\s*$/m.test(block.source) || block.source.includes("%%") || /^\s*\n/.test(block.source)) return fence;
  const line = Number(firstError[1]);
  const lines = block.source.split("\n");
  if (line < 1 || line > lines.length) return fence;
  const column = Number(firstError[2]) - 1;
  const exactColumn = Number.isInteger(column) && column >= 0 && column <= lines[line - 1]!.length
    && !(line === 1 && /^\s/.test(block.source));
  return { line: block.line + line, column: exactColumn ? column : undefined };
}
