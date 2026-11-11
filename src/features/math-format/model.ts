/**
 * Formats display math (`$$ … $$`) in Markdown. Environments are indented,
 * each row of an alignment environment gets its own line, and the `&` of
 * every row line up. Only whitespace outside braces changes, never the
 * tokens, so MathJax renders the result exactly as before. A block the
 * formatter cannot read with certainty is left as it is.
 */

export interface MathFormatOptions {
  /** Spaces per environment level. */
  indent: number;
  /** Pad cells so that the `&` of every row line up. */
  alignAmpersands: boolean;
  /** Pad rows so that their closing `\\` line up. */
  alignRowEnds: boolean;
}

export const DEFAULT_MATH_FORMAT: MathFormatOptions = { indent: 2, alignAmpersands: true, alignRowEnds: false };

export interface MathBlock {
  /** Offset of the line holding the opening `$$`. */
  from: number;
  /** Offset just past the closing `$$` line, before its line break. */
  to: number;
}

export type FormatStatus = "changed" | "unchanged" | "skipped";

/** Environments whose rows are split at `\\` and aligned at `&`. */
const ALIGNED = new Set([
  "aligned", "align", "align*", "alignat", "alignat*", "alignedat", "flalign", "flalign*", "split",
  "eqnarray", "eqnarray*", "xalignat", "xxalignat", "cases", "cases*", "dcases", "dcases*", "rcases", "rcases*",
  "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix", "array", "subarray", "darray",
]);
/** Environments whose rows are split at `\\` but have no columns. */
const ROWS = new Set(["gathered", "gather", "gather*", "multline", "multline*", "CD"]);

/** Arguments that follow `\begin{name}`: an optional `[…]` and required `{…}` groups. */
function environmentArguments(name: string): { optional: boolean; required: number } {
  if (name === "array" || name === "darray" || name === "alignedat") return { optional: true, required: 1 };
  if (name === "subarray" || /^x{0,2}alignat\*?$/.test(name)) return { optional: false, required: 1 };
  if (name === "aligned" || name === "gathered" || /matrix\*$/.test(name)) return { optional: true, required: 0 };
  return { optional: false, required: 0 };
}

function kindOf(name: string): "aligned" | "rows" | "other" {
  if (ALIGNED.has(name) || /matrix\*?$/.test(name)) return "aligned";
  return ROWS.has(name) ? "rows" : "other";
}

type TokenKind = "space" | "newline" | "comment" | "begin" | "end" | "row" | "amp" | "group" | "text";

interface Token {
  kind: TokenKind;
  text: string;
  from: number;
  to: number;
  /** Environment name, for `begin` and `end`. */
  name?: string;
}

interface Environment {
  kind: "env";
  name: string;
  head: string;
  tail: string;
  body: Node[];
  /** The source from `\begin` through `\end`, printed as is when inline. */
  source: string;
  /** Laid out over several lines; otherwise kept inline as written. */
  block: boolean;
}

type Node = Token | Environment;

interface Line {
  depth: number;
  text: string;
}

const skipSpace = (tex: string, i: number): number => {
  while (i < tex.length && /\s/.test(tex[i] ?? "")) i++;
  return i;
};

/** The index after the brace or bracket that closes the one at `start`, or -1. */
function closing(tex: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < tex.length; i++) {
    const c = tex[i];
    if (c === "\\") {
      i++;
    } else if (c === open) {
      depth++;
    } else if (c === close && --depth === 0) {
      return i + 1;
    }
  }
  return -1;
}

/**
 * Splits TeX into the tokens that layout depends on. Braced groups stay whole,
 * and `\\`, `\begin` and `\end` take their arguments exactly as MathJax 4
 * reads them, so that moving whitespace never changes how a row break or an
 * environment is read.
 */
function tokenize(tex: string): Token[] | undefined {
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, text: string, to: number, name?: string): void => {
    tokens.push({ kind, text, from: i, to, name });
    i = to;
  };
  while (i < tex.length) {
    const c = tex[i] ?? "";
    if (c === "\n") {
      push("newline", "\n", i + 1);
    } else if (/\s/.test(c)) {
      let j = i;
      while (j < tex.length && tex[j] !== "\n" && /\s/.test(tex[j] ?? "")) j++;
      push("space", tex.slice(i, j), j);
    } else if (c === "%") {
      const j = tex.indexOf("\n", i);
      push("comment", tex.slice(i, j < 0 ? tex.length : j), j < 0 ? tex.length : j);
    } else if (c === "{") {
      const j = closing(tex, i, "{", "}");
      if (j < 0) return undefined;
      push("group", tex.slice(i, j), j);
    } else if (c === "}" || c === "$") {
      // An unmatched brace, or a dollar that would end the math early.
      return undefined;
    } else if (c === "&") {
      push("amp", "&", i + 1);
    } else if (c === "\\") {
      const next = tex[i + 1];
      if (next === "\\") {
        // MathJax takes the star and the spacing only when they follow at once:
        // after whitespace, `[…]` is the next row's text.
        let end = i + 2;
        if (tex[end] === "*") end++;
        if (tex[end] === "[") {
          end = closing(tex, end, "[", "]");
          if (end < 0) return undefined;
        }
        push("row", tex.slice(i, end), end);
      } else if (next !== undefined && /[A-Za-z]/.test(next)) {
        let j = i + 1;
        while (j < tex.length && /[A-Za-z]/.test(tex[j] ?? "")) j++;
        const word = tex.slice(i, j);
        if (word !== "\\begin" && word !== "\\end") {
          push("text", word, j);
          continue;
        }
        const k = skipSpace(tex, j);
        if (tex[k] !== "{") return undefined;
        const e = closing(tex, k, "{", "}");
        if (e < 0) return undefined;
        const name = tex.slice(k + 1, e - 1);
        if (word === "\\end") {
          push("end", `\\end{${name}}`, e, name);
          continue;
        }
        let text = `\\begin{${name}}`;
        let end = e;
        let { optional, required } = environmentArguments(name);
        for (;;) {
          const p = skipSpace(tex, end);
          const q = optional && tex[p] === "[" ? closing(tex, p, "[", "]")
            : required > 0 && tex[p] === "{" ? closing(tex, p, "{", "}") : 0;
          if (q < 0) return undefined;
          if (q === 0) break;
          if (tex[p] === "[") optional = false;
          else required--;
          text += tex.slice(p, q);
          end = q;
        }
        push("begin", text, end, name);
      } else {
        // A control symbol such as \, \{ \& or "\ ", or a lone trailing backslash.
        push("text", tex.slice(i, i + 2), Math.min(i + 2, tex.length));
      }
    } else {
      let j = i + 1;
      while (j < tex.length && !/[\s%{}&\\$]/.test(tex[j] ?? "")) j++;
      push("text", tex.slice(i, j), j);
    }
  }
  return tokens;
}

/** True when only whitespace precedes token `index` on its line. */
function startsLine(tokens: Token[], index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const kind = tokens[i]?.kind;
    if (kind === "newline") return true;
    if (kind !== "space") return false;
  }
  return true;
}

function parse(tokens: Token[], tex: string): Node[] | undefined {
  const root: Node[] = [];
  const stack: { env: Environment; outer: Node[]; from: number; startsLine: boolean }[] = [];
  let nodes = root;
  for (const [index, token] of tokens.entries()) {
    if (token.kind === "begin") {
      const env: Environment = { kind: "env", name: token.name ?? "", head: token.text, tail: "", body: [], source: "", block: false };
      nodes.push(env);
      stack.push({ env, outer: nodes, from: token.from, startsLine: startsLine(tokens, index) });
      nodes = env.body;
    } else if (token.kind === "end") {
      const top = stack.pop();
      if (!top || top.env.name !== token.name) return undefined;
      top.env.tail = token.text;
      top.env.source = tex.slice(top.from, token.to);
      top.env.block = top.startsLine || top.env.source.includes("\n");
      nodes = top.outer;
    } else {
      nodes.push(token);
    }
  }
  return stack.length === 0 ? root : undefined;
}

/** Columns a monospace editor gives the text: East Asian wide characters take two. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x300 && code <= 0x36f) continue;
    width += (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0x303e) || (code >= 0x3041 && code <= 0x33ff)
      || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0xa000 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f)
      || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x20000 && code <= 0x3fffd) ? 2 : 1;
  }
  return width;
}

const pad = (text: string, width: number): string => text + " ".repeat(Math.max(0, width - displayWidth(text)));

/** A cell that starts with a relation is written right after its `&`, as in `&= b`. */
const RELATION = /^(?:=|<|>|:=|\\(?:le|leq|leqslant|ge|geq|geqslant|ne|neq|approx|equiv|sim|simeq|cong|propto|to|mapsto|Rightarrow|Leftarrow|Leftrightarrow|iff|implies|impliedby|ll|gg|subset|subseteq|supset|supseteq|in|ni|coloneqq|triangleq|doteq)(?![A-Za-z]))/;

function printSequence(nodes: Node[], depth: number, options: MathFormatOptions): Line[] {
  const lines: Line[] = [];
  let text = "";
  const flush = (): void => {
    if (text.trim() !== "") lines.push({ depth, text: text.trim() });
    text = "";
  };
  for (const node of nodes) {
    if (node.kind === "env") {
      if (!node.block) {
        text += node.source;
        continue;
      }
      text += node.head;
      flush();
      lines.push(...printBody(node, depth + 1, options));
      text = node.tail;
    } else if (node.kind === "newline") {
      flush();
    } else {
      text += node.text;
    }
  }
  flush();
  return lines;
}

/** One cell's text: whitespace outside groups collapses to single spaces. */
function cellText(nodes: Node[]): string {
  let text = "";
  for (const node of nodes) {
    if (node.kind === "env") text += node.source;
    else if (node.kind === "space" || node.kind === "newline") text += text.endsWith(" ") ? "" : " ";
    else text += node.text;
  }
  return text.trim();
}

const isRule = (node: Node): boolean => node.kind === "text" && (node.text === "\\hline" || node.text === "\\hdashline");

interface Row {
  /** Rule lines such as `\hline` that open the row. */
  rules: string[];
  /** Cells for a row that fits on one line, otherwise its own laid out lines. */
  cells?: string[];
  lines?: Line[];
  end?: string;
}

function printBody(env: Environment, depth: number, options: MathFormatOptions): Line[] {
  const kind = kindOf(env.name);
  if (kind === "other" || env.body.some((node) => node.kind === "comment")) return printSequence(env.body, depth, options);

  const groups: Node[][] = [[]];
  for (const node of env.body) {
    groups[groups.length - 1]?.push(node);
    if (node.kind === "row") groups.push([]);
  }
  const rows: Row[] = [];
  for (const group of groups) {
    const last = group[group.length - 1];
    const end = last?.kind === "row" ? last.text : undefined;
    let content = end === undefined ? group : group.slice(0, -1);
    const rules: string[] = [];
    for (;;) {
      const first = content.findIndex((node) => node.kind !== "space" && node.kind !== "newline");
      const node = content[first];
      if (first < 0 || !node || !isRule(node)) break;
      rules.push((node as Token).text);
      content = content.slice(first + 1);
    }
    if (content.some((node) => node.kind === "env" && node.block)) {
      rows.push({ rules, lines: printSequence(content, depth, options), end });
      continue;
    }
    const cells: Node[][] = [[]];
    for (const node of content) {
      if (node.kind === "amp" && kind === "aligned") cells.push([]);
      else cells[cells.length - 1]?.push(node);
    }
    const texts = cells.map(cellText);
    if (texts.length === 1 && texts[0] === "" && end === undefined) {
      if (rules.length > 0) rows.push({ rules });
      continue;
    }
    rows.push({ rules, cells: texts, end });
  }

  // Widths per column, from rows where that column is followed by another.
  const segment = (cells: string[], j: number): string => {
    const cell = cells[j] ?? "";
    return j === 0 || cell === "" || RELATION.test(cell) ? cell : ` ${cell}`;
  };
  const widths: number[] = [];
  if (options.alignAmpersands) {
    for (const { cells } of rows) {
      cells?.slice(0, -1).forEach((_, j) => {
        widths[j] = Math.max(widths[j] ?? 0, displayWidth(segment(cells, j)));
      });
    }
  }
  const joined = new Map<Row, string>();
  for (const row of rows) {
    if (!row.cells) continue;
    const cells = row.cells;
    let text = cells.map((_, j) => {
      const part = segment(cells, j);
      return j < cells.length - 1 && options.alignAmpersands ? pad(part, widths[j] ?? 0) : part;
    }).join(" &");
    // Every first cell is empty, so no row needs room before its first `&`.
    if (options.alignAmpersands && (widths[0] ?? 0) === 0) text = text.trimStart();
    joined.set(row, text.trim() === "" ? "" : text.trimEnd());
  }
  const endColumn = options.alignRowEnds
    ? Math.max(0, ...rows.filter((row) => row.end !== undefined && joined.has(row)).map((row) => displayWidth(joined.get(row) ?? "")))
    : 0;

  const lines: Line[] = [];
  for (const row of rows) {
    for (const rule of row.rules) lines.push({ depth, text: rule });
    if (row.lines) {
      const last = row.lines[row.lines.length - 1];
      if (last && row.end) last.text += ` ${row.end}`;
      else if (row.end) row.lines.push({ depth, text: row.end });
      lines.push(...row.lines);
      continue;
    }
    const text = joined.get(row) ?? "";
    if (row.end === undefined) {
      if (text !== "") lines.push({ depth, text });
    } else {
      lines.push({ depth, text: text === "" ? row.end : `${options.alignRowEnds ? pad(text, endColumn) : text} ${row.end}` });
    }
  }
  return lines;
}

/**
 * Formats the TeX inside a display math block. Returns undefined when the
 * source has something the formatter does not read with certainty: a blank
 * line, unbalanced braces or environments, or a stray `$`.
 */
export function formatTex(tex: string, options: MathFormatOptions = DEFAULT_MATH_FORMAT): string | undefined {
  if (/\n[ \t]*\n/.test(tex.trim())) return undefined;
  const tokens = tokenize(tex);
  const root = tokens && parse(tokens, tex);
  if (!root) return undefined;
  return printSequence(root, 0, options)
    .map(({ depth, text }) => " ".repeat(options.indent * depth) + text)
    .join("\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/** Leading whitespace and blockquote markers, the part every line of a block repeats. */
const PREFIX = /^(?:[ \t]*>[ \t]?)*[ \t]*/;
const quoteDepth = (prefix: string): number => (prefix.match(/>/g) ?? []).length;

/** The line without its first `depth` blockquote markers, each with one optional space. */
function unquote(line: string, depth: number): string | undefined {
  let rest = line;
  for (let i = 0; i < depth; i++) {
    const match = /^[ \t]*>[ \t]?/.exec(rest);
    if (!match) return undefined;
    rest = rest.slice(match[0].length);
  }
  return rest;
}

/**
 * Display math blocks whose opening `$$` starts a line and whose closing `$$`
 * ends one, outside frontmatter and fenced code. Inside blockquotes and
 * callouts every line must carry the opening line's markers.
 */
export function findMathBlocks(markdown: string): MathBlock[] {
  const lines = markdown.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const blocks: MathBlock[] = [];
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.findIndex((line, index) => index > 0 && (line === "---" || line === "..."));
    i = close < 0 ? lines.length : close + 1;
  }
  let fence: string | undefined;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const prefix = PREFIX.exec(line)?.[0] ?? "";
    const rest = line.slice(prefix.length);
    if (fence !== undefined) {
      if (rest.startsWith(fence) && rest.slice(fence.length).trim() === "" && /^[`~]+$/.test(rest.trim())) fence = undefined;
      continue;
    }
    const opening = /^(`{3,}|~{3,})/.exec(rest);
    if (opening) {
      fence = opening[1];
      continue;
    }
    if (!rest.startsWith("$$")) continue;
    const sameLine = rest.indexOf("$$", 2);
    if (sameLine >= 0) {
      if (rest.slice(sameLine + 2).trim() === "") blocks.push({ from: offsets[i] ?? 0, to: (offsets[i] ?? 0) + line.length });
      continue;
    }
    // The block runs to the next `$$`, so a block that is not formatted is still skipped whole.
    let close = i + 1;
    while (close < lines.length && !(lines[close] ?? "").includes("$$")) close++;
    if (close >= lines.length) break;
    const depth = quoteDepth(prefix);
    const inner = lines.slice(i + 1, close + 1);
    const consistent = inner.every((line) => quoteDepth(PREFIX.exec(line)?.[0] ?? "") === depth && unquote(line, depth) !== undefined);
    const last = unquote(lines[close] ?? "", depth) ?? "";
    if (consistent && last.slice(last.indexOf("$$") + 2).trim() === "") {
      blocks.push({ from: offsets[i] ?? 0, to: (offsets[close] ?? 0) + (lines[close] ?? "").length });
    }
    i = close;
  }
  return blocks;
}

/** Formats one block found by findMathBlocks, keeping its blockquote markers or list indent. */
export function formatMathBlock(source: string, options: MathFormatOptions = DEFAULT_MATH_FORMAT): { text: string; status: FormatStatus } {
  const lines = source.split("\n");
  const prefix = PREFIX.exec(lines[0] ?? "")?.[0] ?? "";
  const depth = quoteDepth(prefix);
  const indent = depth > 0 ? "" : prefix;
  const stripped = lines.map((line, index) => {
    if (index === 0) return line.slice(prefix.length);
    if (depth > 0) return unquote(line, depth) ?? line;
    const lead = /^[ \t]*/.exec(line)?.[0].length ?? 0;
    return line.slice(Math.min(lead, indent.length));
  });
  const body = stripped.join("\n");
  const open = body.indexOf("$$");
  const close = body.lastIndexOf("$$");
  if (open !== 0 || close <= open) return { text: source, status: "skipped" };
  const formatted = formatTex(body.slice(2, close), options);
  if (formatted === undefined) return { text: source, status: "skipped" };
  if (formatted === "" || (lines.length === 1 && !formatted.includes("\n"))) return { text: source, status: "unchanged" };

  // Every line repeats the opening line's markers, normalized to one space after them.
  const lead = depth > 0 ? `${prefix.trimEnd()} ` : indent;
  const text = ["$$", ...formatted.split("\n"), "$$"].map((line) => (line === "" ? lead.trimEnd() : lead + line)).join("\n");
  return { text, status: text === source ? "unchanged" : "changed" };
}

/** Formats every display math block in a note. */
export function formatMarkdown(markdown: string, options: MathFormatOptions = DEFAULT_MATH_FORMAT): { text: string; changed: number; skipped: number } {
  let text = "";
  let last = 0;
  let changed = 0;
  let skipped = 0;
  for (const { from, to } of findMathBlocks(markdown)) {
    const result = formatMathBlock(markdown.slice(from, to), options);
    if (result.status === "changed") changed++;
    if (result.status === "skipped") skipped++;
    text += markdown.slice(last, from) + result.text;
    last = to;
  }
  return { text: text + markdown.slice(last), changed, skipped };
}
