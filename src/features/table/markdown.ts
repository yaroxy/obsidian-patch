import { tableRanges, type Align } from "./model";

export interface MarkdownTable {
  from: number;
  to: number;
  source: string;
  rows: string[][];
  align: Align[];
}

export interface HtmlTableRange {
  from: number;
  to: number;
  source: string;
}

export interface ScannedLine {
  text: string;
  from: number;
  to: number;
  /** Outside standalone Markdown HTML/text context (frontmatter, code, comments, math, quotes, list items). */
  nonMarkdown: boolean;
  /** Additionally inside a raw HTML block, so Markdown pipe tables cannot start here. */
  blocked: boolean;
}

/** Split on unescaped pipes, including pipes inside code spans (as Obsidian does). */
function cells(line: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") { i++; continue; }
    if (line[i] === "|") { parts.push(line.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(line.slice(start).trim());
  if (parts.length > 1 && parts[0] === "") parts.shift();
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

const blockStart = (line: string): boolean => /^(?: {4}|\t| {0,3}(?:>|#{1,6}(?:\s|$)|[-+*]\s|\d+[.)]\s|`{3,}|~{3,}|<[/!?a-z]|\[.+\]:|%%|\$\$|(?:[-*_]\s*){3,}$))/i.test(line);

/** Replace inline code (when outside an open table) and inline comments with spaces of equal length. */
export function maskInline(line: string, maskCode: boolean): string {
  const chars = line.split("");
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) chars[k] = " ";
  };
  for (let i = 0; i < line.length; i++) {
    if (maskCode && line[i] === "\\") { i++; continue; }
    if (maskCode && line[i] === "`") {
      let ticks = 0;
      while (line[i + ticks] === "`") ticks++;
      const start = i;
      i += ticks - 1;
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "`") {
          let close = 0;
          while (line[j + close] === "`") close++;
          if (close === ticks) { blank(start, j + close); i = j + close - 1; break; }
          j += close - 1;
        }
        j++;
      }
      continue;
    }
    if (line.startsWith("<!--", i)) {
      const close = line.indexOf("-->", i + 4);
      if (close !== -1) { blank(i, close + 3); i = close + 2; continue; }
    }
    if (maskCode && line.startsWith("%%", i)) {
      const close = line.indexOf("%%", i + 2);
      if (close !== -1) { blank(i, close + 2); i = close + 1; }
    }
  }
  return chars.join("");
}

/**
 * Classifies lines of a note, masking YAML frontmatter, code, comments, math,
 * nested containers, and raw HTML blocks so both pipe-table and HTML-table
 * scanners agree on standalone blocks.
 */
export function scanLines(text: string): ScannedLine[] {
  const lines: ScannedLine[] = Array.from(text.matchAll(/[^\n]*(?:\n|$)/g)).filter(m => m[0] !== "").map(m => {
    const clean = m[0].replace(/\r?\n$/, "");
    return { text: clean, from: m.index, to: m.index + clean.length, nonMarkdown: false, blocked: false };
  });
  let fence: { char: string; length: number } | undefined;
  let end: RegExp | undefined;
  let html = false;
  let nested = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!, s = line.text;
    if (i === 0 && /^\uFEFF?---\s*$/.test(s)) {
      end = /^(?:---|\.\.\.)\s*$/;
      line.nonMarkdown = line.blocked = true;
      continue;
    }
    if (end) {
      line.nonMarkdown = line.blocked = true;
      if (end.test(s)) end = undefined;
      continue;
    }
    if (fence) {
      line.nonMarkdown = line.blocked = true;
      if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(s)) fence = undefined;
      continue;
    }
    const open = s.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) {
      fence = { char: open[1]![0]!, length: open[1]!.length };
      line.nonMarkdown = line.blocked = true;
      continue;
    }
    // Inline code can contain literal comment delimiters without opening a multiline comment.
    const commentText = !html && s.includes("`") && (s.includes("<!--") || s.includes("%%")) ? maskInline(s, true) : s;
    if (commentText.includes("<!--") && !commentText.slice(commentText.indexOf("<!--") + 4).includes("-->") && (!html || /^\s*<!--/.test(s))) {
      line.nonMarkdown = line.blocked = true;
      end = /-->/;
      continue;
    }
    if (/^\s*<!--.*-->\s*$/.test(s)) { line.nonMarkdown = line.blocked = true; continue; }
    if (/^\s*<!--/.test(s)) { line.blocked = true; continue; }
    if (!html && commentText.includes("%%") && commentText.split("%%").length % 2 === 0) {
      line.nonMarkdown = line.blocked = true;
      end = /%%/;
      continue;
    }
    if (/^\s*%%.*%%\s*$/.test(s)) { line.nonMarkdown = line.blocked = true; continue; }
    if (/^\s*%%/.test(s)) { line.blocked = true; continue; }
    if (/^ {0,3}\$\$/.test(s)) {
      line.nonMarkdown = line.blocked = true;
      if (!s.trim().slice(2).includes("$$")) end = /\$\$/;
      continue;
    }
    const raw = s.match(/^ {0,3}<(script|pre|style|textarea)(?:\s|>)/i);
    if (raw) {
      line.nonMarkdown = line.blocked = true;
      const close = new RegExp(`</${raw[1]}\\s*>`, "i");
      if (!close.test(s)) end = close;
      continue;
    }
    if (!s.trim()) html = false;
    const delimiter = s.includes("|") && cells(s).every(c => /^:?-+:?$/.test(c));
    if (!html && !delimiter && /^ {0,3}(?:>|[-+*]\s|\d+[.)]\s)/.test(s)) nested = true;
    else if (/^\S/.test(s) && (!lines[i - 1]?.text.trim() || /^#{1,6}\s/.test(s))) nested = false;
    const container = !html && (nested || /^(?: {4}|\t| {0,3}>)/.test(s));
    if (!container && /^ {0,3}<[/!?a-z]/i.test(s)) html = true;
    line.nonMarkdown = container;
    line.blocked = html || container;
  }
  return lines;
}

export function markdownTables(text: string): MarkdownTable[] {
  const lines = scanLines(text), tables: MarkdownTable[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i]!, delimiter = lines[i + 1]!;
    // Obsidian does not start a table in the middle of a paragraph.
    const previous = lines[i - 1]?.text ?? "";
    if (previous.trim() && !/^ {0,3}#{1,6}(?:\s|$)/.test(previous)) continue;
    if (header.blocked || delimiter.blocked || blockStart(header.text) || !header.text.includes("|")) continue;
    const row = cells(header.text), separators = cells(delimiter.text);
    if (!row.length || separators.length !== row.length || !separators.every(c => /^:?-+:?$/.test(c))) continue;
    const rows = [row];
    let last = i + 1;
    while (last + 1 < lines.length) {
      const next = lines[last + 1]!;
      if (next.blocked || !next.text.includes("|") || !next.text.trim() || blockStart(next.text)) break;
      rows.push(cells(next.text));
      last++;
    }
    const to = lines[last]!.to;
    tables.push({ from: header.from, to, source: text.slice(header.from, to), rows,
      align: separators.map(s => s.endsWith(":") ? s.startsWith(":") ? "center" : "right" : "left") });
    i = last;
  }
  return tables;
}

/** A nonempty selection must contain each touched table in full. */
export function selectMarkdownTables(text: string, from: number, to = from): MarkdownTable[] {
  const tables = markdownTables(text);
  if (from === to) return tables.filter(t => t.from <= from && from <= t.to);
  const touched = tables.filter(t => t.from < to && from < t.to);
  if (touched.some(t => text.slice(t.from, Math.max(t.from, from)).trim() || text.slice(Math.min(t.to, to), t.to).trim())) {
    throw new Error("Select complete Markdown tables, or place the cursor inside one table.");
  }
  return touched;
}

/** Standalone top-level HTML table blocks targeted by a cursor or complete selection. */
export function selectHtmlTables(text: string, from: number, to = from): HtmlTableRange[] {
  const tables = tableRanges(text)
    .filter(({ from: start, to: end }) => isStandaloneHtmlRange(text, start, end))
    .map(range => ({ ...range, source: text.slice(range.from, range.to) }));
  if (from === to) return tables.filter(t => t.from <= from && from <= t.to);
  const touched = tables.filter(t => t.from < to && from < t.to);
  if (touched.some(t => text.slice(t.from, Math.max(t.from, from)).trim() || text.slice(Math.min(t.to, to), t.to).trim())) {
    throw new Error("Select complete HTML tables, or place the cursor inside one table.");
  }
  return touched;
}

function isStandaloneHtmlRange(text: string, from: number, to: number): boolean {
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  const lineEndIndex = text.indexOf("\n", to);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const beforeOnLine = text.slice(lineStart, from);
  const afterOnLine = text.slice(to, lineEnd).replace(/\r$/, "");
  return /^[ \t]*$/.test(beforeOnLine) && /^[ \t]*$/.test(afterOnLine);
}

/** Keep reference definitions in the render context without converting them. */
export function tableReferences(text: string): string {
  const lines = scanLines(text), definitions: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.blocked || !/^ {0,3}\[(?!\^)[^\]]+\]:/.test(line.text)) continue;
    definitions.push(line.text);
    // Markdown permits the destination and title on following indented lines.
    while (lines[i + 1] && !lines[i + 1]!.blocked && /^ {1,3}\S/.test(lines[i + 1]!.text)) definitions.push(lines[++i]!.text);
    definitions.push("");
  }
  return definitions.join("\n");
}

/** Table blocks need blank lines beside surrounding blocks; leave existing EOF newlines alone. */
export function tableReplacement(text: string, range: { from: number; to: number }, replacement: string): string {
  const before = text.slice(0, range.from), after = text.slice(range.to);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lead = !before || /\r?\n[ \t]*\r?\n$/.test(before) ? "" : newline;
  const trail = !after || /^\r?\n(?:[ \t]*\r?\n|$)/.test(after) ? "" : newline;
  return lead + replacement.replace(/\r?\n/g, newline) + trail;
}

/** Apply a Reading View edit to raw vault text using offsets from the LF-normalized rendered section. */
export function replaceSavedTable(text: string, found: { lineStart: number; section: string; from: number; to: number }, html: string): string | undefined {
  const parts = text.split(/(\r\n|[\r\n])/);
  const first = found.lineStart * 2;
  if (!found.section.split("\n").every((line, index) => parts[first + 2 * index] === line)) return undefined;
  function position(offset: number) {
    const lines = found.section.slice(0, offset).split("\n");
    return { part: first + (lines.length - 1) * 2, ch: lines[lines.length - 1]!.length };
  }
  const start = position(found.from), end = position(found.to);
  const fallback = parts[start.part + 1] ?? parts[start.part - 1] ?? "\n";
  let delimiter = start.part + 1;
  const replacement = html.replace(/\n/g, () => {
    const newline = delimiter < end.part ? parts[delimiter]! : fallback;
    delimiter += 2;
    return newline;
  });
  const block = parts[start.part]!.slice(0, start.ch) + replacement + parts[end.part]!.slice(end.ch);
  parts.splice(start.part, end.part - start.part + 1, block);
  return parts.join("");
}
