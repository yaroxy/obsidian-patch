import { markdownBlocks } from "../markdown-blocks";

export const DIAGRAM_LANGUAGE = "patch-mermaid";

export interface DiagramBlock {
  /** Zero-based line of the opening fence in the original note. */
  line: number;
  source: string;
}

/** The caller strips note properties using Obsidian's frontmatter parser. */
export function diagramBlocks(body: string, firstLine: number): DiagramBlock[] {
  const blocks: DiagramBlock[] = [];
  for (const token of markdownBlocks(body)) {
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
