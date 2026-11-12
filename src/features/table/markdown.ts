import type { Align } from "./model";

export interface MarkdownTable {
  from: number;
  to: number;
  source: string;
  rows: string[][];
  align: Align[];
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

/**
 * Only standalone Markdown tables are candidates. Mask code, frontmatter,
 * comments and raw HTML first, so examples and nested tables aren't rewritten.
 * Rendering verifies the shape again before a candidate can be converted.
 */
function linesOf(text: string): { text: string; from: number; to: number; blocked: boolean }[] {
  const lines = Array.from(text.matchAll(/[^\n]*(?:\n|$)/g)).filter(m => m[0] !== "").map(m => ({
    text: m[0].replace(/\r?\n$/, ""), from: m.index, to: m.index + m[0].replace(/\r?\n$/, "").length, blocked: false,
  }));
  let fence: { char: string; length: number } | undefined;
  let end: RegExp | undefined;
  let html = false;
  let nested = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!, s = line.text;
    if (i === 0 && /^\uFEFF?---\s*$/.test(s)) { end = /^(?:---|\.\.\.)\s*$/; line.blocked = true; continue; }
    if (end) { line.blocked = true; if (end.test(s)) end = undefined; continue; }
    if (fence) {
      line.blocked = true;
      if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(s)) fence = undefined;
      continue;
    }
    const open = s.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) { fence = { char: open[1]![0]!, length: open[1]!.length }; line.blocked = true; continue; }
    if (s.includes("<!--") && !s.slice(s.indexOf("<!--") + 4).includes("-->")) { line.blocked = true; end = /-->/; continue; }
    if (/^\s*<!--/.test(s)) { line.blocked = true; continue; }
    if (s.includes("%%") && s.split("%%").length % 2 === 0) { line.blocked = true; end = /%%/; continue; }
    if (/^\s*%%/.test(s)) { line.blocked = true; continue; }
    if (/^ {0,3}\$\$/.test(s)) { line.blocked = true; if (!s.trim().slice(2).includes("$$")) end = /\$\$/; continue; }
    const raw = s.match(/^ {0,3}<(script|pre|style|textarea)(?:\s|>)/i);
    if (raw) { line.blocked = true; const close = new RegExp(`</${raw[1]}\\s*>`, "i"); if (!close.test(s)) end = close; continue; }
    if (/^ {0,3}<[/!?a-z]/i.test(s)) html = true;
    if (!s.trim()) html = false;
    const delimiter = s.includes("|") && cells(s).every(c => /^:?-+:?$/.test(c));
    if (!delimiter && /^ {0,3}(?:>|[-+*]\s|\d+[.)]\s)/.test(s)) nested = true;
    else if (/^\S/.test(s) && (!lines[i - 1]?.text.trim() || /^#{1,6}\s/.test(s))) nested = false;
    line.blocked = html || nested || /^(?: {4}|\t| {0,3}>)/.test(s);
  }
  return lines;
}

export function markdownTables(text: string): MarkdownTable[] {
  const lines = linesOf(text), tables: MarkdownTable[] = [];
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

/** Keep reference definitions in the render context without converting them. */
export function tableReferences(text: string): string {
  const lines = linesOf(text), definitions: string[] = [];
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

/** HTML blocks need blank lines on both sides; leave all surrounding text intact. */
export function tableReplacement(text: string, range: { from: number; to: number }, html: string): string {
  const before = text.slice(0, range.from), after = text.slice(range.to);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lead = !before || /\r?\n[ \t]*\r?\n$/.test(before) ? "" : newline;
  const trail = !after || /^\r?\n[ \t]*\r?\n/.test(after) ? "" : newline;
  return lead + html.replace(/\r?\n/g, newline) + trail;
}
