import MarkdownIt from "markdown-it";

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

// Consume wikilinks as one inline token so code spans and escaped brackets stay literal.
markdown.inline.ruler.before("link", "obsidian-wikilink", (state, silent) => {
  const start = state.pos;
  if (!state.src.startsWith("[[", start)) return false;
  const end = state.src.indexOf("]]", start + 2);
  if (end < 0 || end + 2 > state.posMax) return false;
  const link = state.src.slice(start + 2, end);
  if (!link || /[\n[\]]/.test(link)) return false;
  const separator = link.indexOf("|");
  if (!silent) state.pending += separator < 0 ? link.split("/").pop()! : link.slice(separator + 1);
  state.pos = end + 2;
  return true;
});

/** Top-level and nested block tokens with source line ranges, without rendering HTML. */
export function markdownBlocks(body: string, env = {}) {
  return markdown.parse(body, env);
}

/** Text used to recognize a handwritten number even when the heading starts with emphasis or a link. */
export function headingText(source: string, env: Parameters<typeof markdown.inline.parse>[2]): string {
  const tokens: ReturnType<typeof markdown.parse> = [];
  markdown.inline.parse(source, markdown, env, tokens);
  return tokens.map(token => token.type === "softbreak" || token.type === "hardbreak" ? " "
    : token.type === "text" || token.type === "code_inline" ? token.content : "").join("");
}
