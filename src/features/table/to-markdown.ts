import { cellSpans, headRows, layout, TableSizeError, type Align } from "./model";

export type MergedCellMode = "blank" | "repeat";
export type HeaderlessMode = "empty-header" | "promote-first";
export type CaptionMode = "bold" | "drop";

export interface HtmlToMarkdownOptions {
  mergedCells: MergedCellMode;
  headerless: HeaderlessMode;
  caption: CaptionMode;
}

export const DEFAULT_HTML_TO_MARKDOWN_OPTIONS: HtmlToMarkdownOptions = {
  mergedCells: "blank",
  headerless: "empty-header",
  caption: "bold",
};

export type ConversionIssueKind =
  | "merged"
  | "headerless"
  | "multi-header"
  | "body-header"
  | "caption"
  | "alignment"
  | "attribute"
  | "structure"
  | "broken-link"
  | "math";

export interface ConversionIssue {
  kind: ConversionIssueKind;
  message: string;
}

/** Structural DOM subset so pure unit tests can exercise real converters without jsdom. */
export interface HtmlAttr {
  name: string;
  value: string;
}

export interface HtmlNode {
  nodeType: number;
  textContent: string | null;
}

export interface HtmlElement extends HtmlNode {
  tagName: string;
  childNodes: Iterable<HtmlNode>;
  attributes: Iterable<HtmlAttr>;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

export interface ExpectedCell {
  /** Normalized prose with placeholders for inline math and code. */
  text: string;
  internalLinks: string[];
  externalLinks: string[];
  math: string[];
  code: string[];
}

export interface HtmlTableAudit {
  blocking: string[];
  losses: ConversionIssue[];
  hasMerged: boolean;
  isHeaderless: boolean;
  hasCaption: boolean;
  internalLinks: string[];
}

export interface ConvertedMarkdownTable {
  markdown: string;
  expectedRows: number;
  expectedCols: number;
  alignments: Align[];
  cells: ExpectedCell[][];
  captionContent?: ExpectedCell;
  issues: ConversionIssue[];
  blocking: string[];
  internalLinks: string[];
}

interface ParsedCell {
  el: HtmlElement;
  header: boolean;
  rowspan: number;
  colspan: number;
  align?: Align;
}

type HtmlCell = HtmlElement & Pick<HTMLTableCellElement, "rowSpan" | "colSpan">;

interface RowGroup {
  tag: "thead" | "tbody" | "tfoot";
  rows: { tr: HtmlElement; cells: HtmlCell[] }[];
}

const BLOCK_TAGS = new Set([
  "P", "DIV", "UL", "OL", "LI", "BLOCKQUOTE", "PRE",
  "H1", "H2", "H3", "H4", "H5", "H6", "HR",
  "DL", "DT", "DD", "FIGURE", "FIGCAPTION", "DETAILS", "SUMMARY",
  "SECTION", "ARTICLE", "HEADER", "FOOTER", "NAV", "ASIDE", "MAIN",
  "FORM", "FIELDSET",
]);

const UNSUPPORTED_TAGS = new Set([
  "IMG", "PICTURE", "VIDEO", "AUDIO", "SVG", "IFRAME", "CANVAS",
  "OBJECT", "EMBED", "SCRIPT", "STYLE", "INPUT", "BUTTON", "SELECT", "TEXTAREA",
]);

const SUPPORTED_INLINE_TAGS = new Set([
  "A", "ABBR", "B", "BR", "CODE", "DEL", "EM", "I", "KBD", "MARK",
  "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U", "VAR", "WBR",
]);

const PRESERVED_INLINE_HTML = new Set(["ABBR", "KBD", "SAMP", "SMALL", "SUB", "SUP", "U", "VAR"]);
const ALIGNED_VALUES = new Set<string>(["left", "center", "right"]);
const SAFE_INLINE_ATTRS = new Set(["title", "style", "class", "lang", "dir"]);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const MATH_MARKER = "\uE000";
const CODE_MARKER = "\uE001";

const isElement = (node: HtmlNode): node is HtmlElement => node.nodeType === ELEMENT_NODE;
const tag = (el: HtmlElement): string => el.tagName.toUpperCase();
const classesOf = (el: HtmlElement): Set<string> =>
  new Set((el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean));
const childrenOf = (el: HtmlNode): HtmlNode[] => "childNodes" in el ? Array.from((el as HtmlElement).childNodes) : [];
const elementsOf = (el: HtmlNode): HtmlElement[] => childrenOf(el).filter(isElement);

function* descendants(root: HtmlElement): Generator<HtmlElement> {
  for (const child of childrenOf(root)) {
    if (!isElement(child)) continue;
    yield child;
    yield* descendants(child);
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function collectIds(table: HtmlElement): string[] {
  const ids: string[] = [];
  if (table.getAttribute("id")?.trim()) ids.push(table.getAttribute("id")!.trim());
  for (const el of descendants(table)) {
    const id = el.getAttribute("id")?.trim();
    if (id) ids.push(id);
  }
  return ids;
}

function isIdReferenced(id: string, noteText: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:\\[\\[[^\\]\\n]*#${escaped}(?:\\||\\]\\])|\\]\\([^)\\n]*#${escaped}\\))`).test(noteText);
}

function findMathTex(el: HtmlElement): string | undefined {
  for (const child of descendants(el)) {
    if (tag(child) === "MJX-MATH") {
      const latex = child.getAttribute("data-latex");
      if (latex !== null && latex.trim() !== "") return latex.trim();
    }
  }
  const hasMjx = Array.from(descendants(el)).some((child) => tag(child) === "MJX-CONTAINER" || tag(child) === "MJX-MATH");
  if (hasMjx) return undefined;
  const raw = (el.textContent ?? "").trim();
  return raw !== "" ? raw : undefined;
}

/** Collects row groups in visual table order (`thead`, `tbody`/direct `tr`, `tfoot`). */
function readTableStructure(table: HtmlElement): {
  caption?: HtmlElement;
  colgroups: HtmlElement[];
  theadGroups: RowGroup[];
  tbodyGroups: RowGroup[];
  tfootGroups: RowGroup[];
  directBodyRows: RowGroup["rows"];
  sectionEls: HtmlElement[];
} {
  let caption: HtmlElement | undefined;
  const colgroups: HtmlElement[] = [];
  const theadGroups: RowGroup[] = [];
  const tbodyGroups: RowGroup[] = [];
  const tfootGroups: RowGroup[] = [];
  const directBodyRows: RowGroup["rows"] = [];
  const sectionEls: HtmlElement[] = [];

  const rowEntry = (tr: HtmlElement) => ({
    tr,
    cells: elementsOf(tr).filter((el): el is HtmlCell => tag(el) === "TH" || tag(el) === "TD"),
  });

  for (const child of elementsOf(table)) {
    const t = tag(child);
    if (t === "CAPTION" && !caption) { caption = child; continue; }
    if (t === "COLGROUP" || t === "COL") { colgroups.push(child); continue; }
    if (t === "THEAD" || t === "TBODY" || t === "TFOOT") {
      sectionEls.push(child);
      const group: RowGroup = {
        tag: t.toLowerCase() as RowGroup["tag"],
        rows: elementsOf(child).filter((el) => tag(el) === "TR").map(rowEntry),
      };
      if (group.tag === "thead") theadGroups.push(group);
      else if (group.tag === "tfoot") tfootGroups.push(group);
      else tbodyGroups.push(group);
    } else if (t === "TR") {
      directBodyRows.push(rowEntry(child));
    }
  }

  return { caption, colgroups, theadGroups, tbodyGroups, tfootGroups, directBodyRows, sectionEls };
}

function orderedGroups(table: HtmlElement): {
  caption?: HtmlElement;
  colgroups: HtmlElement[];
  groups: RowGroup[];
  sectionEls: HtmlElement[];
} {
  const { caption, colgroups, theadGroups, tbodyGroups, tfootGroups, directBodyRows, sectionEls } = readTableStructure(table);
  const groups: RowGroup[] = [...theadGroups, ...tbodyGroups];
  if (directBodyRows.length > 0) groups.push({ tag: "tbody", rows: directBodyRows });
  groups.push(...tfootGroups);
  return { caption, colgroups, groups, sectionEls };
}

function parseCellAlign(cell: HtmlElement): { align?: Align; conflictStyle?: boolean } {
  const alignAttr = cell.getAttribute("align")?.trim().toLowerCase();
  const attrAlign = alignAttr && ALIGNED_VALUES.has(alignAttr) ? (alignAttr as Align) : undefined;
  const styleTextAlign = styleDeclarations(cell).find(([k]) => k === "text-align")?.[1]?.trim().toLowerCase();
  const styleAlign = styleTextAlign && ALIGNED_VALUES.has(styleTextAlign) ? (styleTextAlign as Align) : undefined;
  return {
    align: styleAlign ?? attrAlign,
    conflictStyle: Boolean(attrAlign && styleAlign && attrAlign !== styleAlign),
  };
}

function styleDeclarations(el: HtmlElement): [string, string][] {
  const style = el.getAttribute("style") ?? "";
  return style.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const colon = part.indexOf(":");
    if (colon === -1) return [part.toLowerCase(), ""];
    return [part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim()];
  });
}

function unknownAttrs(el: HtmlElement, kind: "table" | "cell" | "caption" | "row" | "section", isHeaderRow0: boolean, hasRowspan: boolean): string[] {
  const dropped: string[] = [];
  for (const { name } of el.attributes) {
    const lower = name.toLowerCase();
    if (kind === "cell" && (lower === "rowspan" || lower === "colspan" || lower === "align")) continue;
    if (lower === "style") {
      for (const [prop, val] of styleDeclarations(el)) {
        if (kind === "table" && prop === "width" && val.replace(/\s+/g, "") === "100%") continue;
        if (kind === "cell") {
          if (prop === "text-align" && ALIGNED_VALUES.has(val.toLowerCase())) continue;
          if (isHeaderRow0 && prop === "width" && /^\d+(?:\.\d+)?%$/.test(val.trim())) continue;
          if (hasRowspan && prop === "vertical-align" && val.toLowerCase() === "middle") continue;
        }
        if (kind === "caption") {
          if (prop === "caption-side" && val.toLowerCase() === "top") continue;
          if (prop === "text-align" && val.toLowerCase() === "center") continue;
          if (prop === "font-weight" && val === "600") continue;
          if (prop === "padding" && val.replace(/\s+/g, " ") === "0 0 4px") continue;
        }
        dropped.push(`style:${prop}`);
      }
      continue;
    }
    dropped.push(lower);
  }
  return dropped;
}

function expandHtmlGrid(groups: RowGroup[]) {
  const rows: ParsedCell[][] = [];
  for (const group of groups) {
    for (const [index, row] of group.rows.entries()) {
      rows.push(row.cells.map(el => ({
        el, header: tag(el) === "TH", align: parseCellAlign(el).align,
        ...cellSpans(el, group.rows.length - index),
      })));
    }
  }
  return { ...layout(rows), head: headRows(rows) };
}

/**
 * Inspects a source HTML `<table>` DOM before lossy normalization: detects blocking
 * content (nested tables, blocks, images/embeds, referenced IDs) and records
 * structural, header, merge, alignment, and attribute losses.
 */
export function auditHtmlTable(table: HtmlElement, noteText = ""): HtmlTableAudit {
  const blocking: string[] = [];
  const losses: ConversionIssue[] = [];
  const internalLinks: string[] = [];

  if (tag(table) !== "TABLE") return { blocking: ["No <table> element was found."], losses, hasMerged: false, isHeaderless: false, hasCaption: false, internalLinks };

  if (noteText) {
    for (const id of collectIds(table)) {
      if (isIdReferenced(id, noteText)) blocking.push(`Element id="${id}" is referenced elsewhere in this note.`);
    }
  }

  const { caption, colgroups, groups, sectionEls } = orderedGroups(table);
  let expanded: ReturnType<typeof expandHtmlGrid>;
  try { expanded = expandHtmlGrid(groups); }
  catch (error) {
    if (!(error instanceof TableSizeError)) throw error;
    blocking.push(error.message);
    return { blocking, losses, hasMerged: false, isHeaderless: false, hasCaption: false, internalLinks };
  }
  const { placed, width, height, head } = expanded;
  if (height === 0 || width === 0) {
    blocking.push("Table has no rows or columns.");
    return { blocking, losses, hasMerged: false, isHeaderless: false, hasCaption: false, internalLinks };
  }

  const hasComment = (root: HtmlElement): boolean => childrenOf(root).some(child =>
    child.nodeType === 8 || (isElement(child) && hasComment(child)));
  if (hasComment(table)) losses.push({ kind: "structure", message: "HTML comments inside the table will be dropped." });

  const droppedInlineAttrs = new Set<string>();
  const auditInlineSubtree = (root: HtmlElement, where: string): void => {
    for (const el of descendants(root)) {
      const t = tag(el);
      const cls = classesOf(el);
      if (t === "MJX-CONTAINER" || t.startsWith("MJX-")) continue;
      if (t === "TABLE") { blocking.push(`${where} contains a nested <table>.`); continue; }
      if (cls.has("internal-embed") || cls.has("footnote-ref")) {
        blocking.push(`${where} contains unsupported embed or footnote content.`);
        continue;
      }
      if (cls.has("math")) {
        if (t !== "SPAN" || !cls.has("math-inline")) {
          blocking.push(`${where} contains non-inline math.`);
        } else if (findMathTex(el) === undefined) {
          blocking.push(`${where} contains a math formula whose source could not be recovered.`);
        }
        continue;
      }
      if (UNSUPPORTED_TAGS.has(t)) { blocking.push(`${where} contains unsupported <${t.toLowerCase()}> content.`); continue; }
      if (BLOCK_TAGS.has(t)) { blocking.push(`${where} contains block-level <${t.toLowerCase()}> content.`); continue; }
      if (!SUPPORTED_INLINE_TAGS.has(t)) { blocking.push(`${where} contains unsupported <${t.toLowerCase()}> markup.`); continue; }
      if (!PRESERVED_INLINE_HTML.has(t) && t !== "SPAN") {
        const wikiLink = t === "A" && (cls.has("internal-link") || el.hasAttribute("data-href"));
        for (const { name, value } of el.attributes) {
          // Obsidian recreates these exact values when it renders highlights and links.
          if (t === "MARK" && name === "data-highlight" && value === "") continue;
          if (t === "A") {
            if (name === "href" && (!wikiLink || !el.hasAttribute("data-href") || value === el.getAttribute("data-href"))) continue;
            if (wikiLink ? name === "data-href" : name === "title") continue;
            if (name === "class" && value === (wikiLink ? "internal-link" : "external-link")) continue;
            if (name === "target" && value === "_blank") continue;
            if (name === "rel" && value.trim().split(/\s+/).sort().join(" ") === "nofollow noopener") continue;
          }
          droppedInlineAttrs.add(`${t.toLowerCase()}[${name}]`);
        }
      }
      if (t === "A" && (cls.has("internal-link") || el.hasAttribute("data-href"))) {
        const href = (el.getAttribute("data-href") ?? el.getAttribute("href") ?? "").trim();
        if (href) internalLinks.push(href);
      }
    }
  };

  const hasCaption = Boolean(caption && extractExpectedCell(caption).text);
  if (caption) {
    auditInlineSubtree(caption, "Table caption");
    if (hasCaption) losses.push({ kind: "caption", message: "Table caption will become bold text above the table (or be dropped)." });
    const droppedCap = unknownAttrs(caption, "caption", false, false);
    if (droppedCap.length) losses.push({ kind: "attribute", message: `Caption attributes dropped (${droppedCap.join(", ")}).` });
  }

  if (colgroups.length > 0) losses.push({ kind: "structure", message: "<colgroup>/<col> column definitions cannot be represented in Markdown." });
  if (groups.some((g) => g.tag === "tfoot")) losses.push({ kind: "structure", message: "<tfoot> rows become normal trailing body rows in Markdown." });

  const droppedContainerAttrs = new Set<string>();
  for (const attr of unknownAttrs(table, "table", false, false)) droppedContainerAttrs.add(`table[${attr}]`);
  for (const sec of sectionEls) for (const attr of unknownAttrs(sec, "section", false, false)) droppedContainerAttrs.add(`${tag(sec).toLowerCase()}[${attr}]`);
  for (const g of groups) {
    for (const { tr } of g.rows) for (const attr of unknownAttrs(tr, "row", false, false)) droppedContainerAttrs.add(`tr[${attr}]`);
  }

  const isHeaderless = head === 0;
  if (isHeaderless) {
    losses.push({ kind: "headerless", message: "Table has no header row; default adds an empty header row to preserve Row 1 data." });
  } else if (head > 1) {
    losses.push({ kind: "multi-header", message: `Table has ${head} header rows; Rows 2–${head} become normal body rows in Markdown.` });
  }

  let bodyHeaderCells = 0;
  let mergedCount = 0;
  const mergedPositions: string[] = [];
  const droppedCellAttrs = new Set<string>();
  for (const at of placed) {
    const where = `Row ${at.row + 1}, Col ${at.col + 1}`;
    if (at.cell.rowspan > 1 || at.cell.colspan > 1) {
      mergedCount++;
      if (mergedPositions.length < 4) mergedPositions.push(where);
    }
    auditInlineSubtree(at.cell.el, where);
    if (at.cell.header && at.row >= head) bodyHeaderCells++;
    const isRow0Header = at.row === 0 && at.cell.header && at.row < head;
    for (const attr of unknownAttrs(at.cell.el, "cell", isRow0Header, at.cell.rowspan > 1)) {
      droppedCellAttrs.add(attr);
    }
  }
  if (droppedInlineAttrs.size) {
    losses.push({ kind: "attribute", message: `Inline attributes dropped (${Array.from(droppedInlineAttrs).join(", ")}).` });
  }
  if (bodyHeaderCells > 0) {
    losses.push({ kind: "body-header", message: `${bodyHeaderCells} header cell(s) outside Row 1 become normal body cells.` });
  }
  if (mergedCount > 0) {
    const suffix = mergedCount > mergedPositions.length ? ", …" : "";
    losses.push({
      kind: "merged",
      message: `${mergedCount} merged cell(s) (${mergedPositions.join("; ")}${suffix}) will split into a uniform grid.`,
    });
  }
  const allDropped = [...droppedContainerAttrs, ...droppedCellAttrs];
  if (allDropped.length > 0) {
    const preview = allDropped.slice(0, 5).join(", ");
    losses.push({ kind: "attribute", message: `HTML attributes dropped: ${preview}${allDropped.length > 5 ? `, +${allDropped.length - 5} more` : ""}.` });
  }

  return {
    blocking: Array.from(new Set(blocking)),
    losses,
    hasMerged: mergedCount > 0,
    isHeaderless,
    hasCaption,
    internalLinks: Array.from(new Set(internalLinks)),
  };
}

/** Normalizes inline TeX for Markdown pipe tables; keeps `\|` intact and rewrites unescaped `|` to `\vert`. */
export function normalizeTexForTable(rawTex: string): { tex: string; rewrotePipe: boolean } {
  const compact = rawTex.trim().replace(/\r?\n+/g, " ");
  let out = "";
  let rewrotePipe = false;
  let slashes = 0;
  for (let i = 0; i < compact.length; i++) {
    const ch = compact[i]!;
    if (ch === "\\") {
      slashes++;
      out += ch;
      continue;
    }
    if (ch === "|" && slashes % 2 === 0) {
      out += /[A-Za-z]/.test(compact[i + 1] ?? "") ? "\\vert " : "\\vert";
      rewrotePipe = true;
    } else {
      out += ch;
    }
    slashes = 0;
  }
  return { tex: out, rewrotePipe };
}

/** Escapes Markdown inline triggers in plain cell text without emitting redundant HTML entities for normal punctuation. */
export function escapeCellText(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ");
  let out = "";
  for (let i = 0; i < collapsed.length; i++) {
    const ch = collapsed[i]!;
    const prev = i > 0 ? collapsed[i - 1]! : "";
    const next = collapsed[i + 1] ?? "";
    if (ch === "\\") { out += "\\\\"; continue; }
    if (ch === "|") { out += "\\|"; continue; }
    if (ch === "`") { out += "\\`"; continue; }
    if (ch === "*") { out += "\\*"; continue; }
    if (ch === "_") { out += "\\_"; continue; }
    if (ch === "$") { out += "\\$"; continue; }
    if (ch === "<") { out += "&lt;"; continue; }
    if (ch === "[") { out += "\\["; continue; }
    if (ch === "]") { out += "\\]"; continue; }
    if (ch === "~" && (prev === "~" || next === "~")) { out += "\\~"; continue; }
    if (ch === "=" && (prev === "=" || next === "=")) { out += "\\="; continue; }
    if (ch === "%" && (prev === "%" || next === "%")) { out += "\\%"; continue; }
    if (ch === "#" && (i === 0 || /\s/.test(prev)) && /\S/.test(next)) { out += "\\#"; continue; }
    if (ch === "^" && (i === 0 || /\s/.test(prev))) { out += "\\^"; continue; }
    out += ch;
  }
  return out;
}

const escapeWikiPart = (value: string): string => value.replace(/\|/g, "\\|").replace(/\]/g, "\\]");
const escapeAttrValue = (value: string): string => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function allPipesOddEscaped(text: string): boolean {
  let slashes = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") { slashes++; continue; }
    if (text[i] === "|" && slashes % 2 === 0) return false;
    slashes = 0;
  }
  return true;
}

function codeMarkdown(codeText: string): string {
  if (!codeText || /[\t\r\n]/.test(codeText) || !allPipesOddEscaped(codeText)) {
    const html = codeText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/[\\|`*_~$=[\]\t\r\n]/g, (char) => `&#${char.charCodeAt(0)};`);
    return `<code>${html}</code>`;
  }
  let maxRun = 0;
  for (const m of codeText.matchAll(/`+/g)) if (m[0].length > maxRun) maxRun = m[0].length;
  const fence = "`".repeat(maxRun + 1);
  // CommonMark removes one space at each end unless the entire code span is spaces.
  const needsPad = /^`|`$/.test(codeText) || (codeText.startsWith(" ") && codeText.endsWith(" ") && !/^ +$/.test(codeText));
  return needsPad ? `${fence} ${codeText} ${fence}` : `${fence}${codeText}${fence}`;
}

function wrapDelimiter(delimiter: string, content: string): string {
  if (!content.trim()) return content;
  const lead = /^\s+/.exec(content)?.[0] ?? "";
  const trail = /\s+$/.exec(content)?.[0] ?? "";
  const inner = content.slice(lead.length, content.length - trail.length);
  return `${lead}${delimiter}${inner}${delimiter}${trail}`;
}

function convertChildren(nodes: HtmlNode[], context: {
  insideStrong: boolean;
  avoidStarEm?: boolean;
  mathNote: { rewrotePipe: boolean; multiDollar: boolean };
  attrDropped: Set<string>;
}): string {
  let out = "";
  for (const node of nodes) {
    out += convertNode(node, { ...context, avoidStarEm: context.insideStrong || out.endsWith("*") });
  }
  return out;
}

function convertNode(node: HtmlNode, context: {
  insideStrong: boolean;
  avoidStarEm?: boolean;
  mathNote: { rewrotePipe: boolean; multiDollar: boolean };
  attrDropped: Set<string>;
}): string {
  if (node.nodeType === TEXT_NODE) return escapeCellText(node.textContent ?? "");
  if (!isElement(node)) return "";
  const t = tag(node);
  const cls = classesOf(node);
  const children = childrenOf(node);

  if (t === "BR") return "<br>";
  if (t === "WBR") return "";
  if (t === "SPAN" && cls.has("math")) {
    const raw = findMathTex(node);
    if (raw === undefined) return "";
    const { tex, rewrotePipe } = normalizeTexForTable(raw);
    if (rewrotePipe) context.mathNote.rewrotePipe = true;
    return `$${tex}$`;
  }
  if (t === "CODE") return codeMarkdown(node.textContent ?? "");
  if (t === "STRONG" || t === "B") return wrapDelimiter("**", convertChildren(children, { ...context, insideStrong: true }));
  if (t === "EM" || t === "I") return wrapDelimiter(context.avoidStarEm ? "_" : "*", convertChildren(children, context));
  if (t === "DEL" || t === "S") return wrapDelimiter("~~", convertChildren(children, context));
  if (t === "MARK") return wrapDelimiter("==", convertChildren(children, context));
  if (t === "A") {
    if (cls.has("internal-link") || node.hasAttribute("data-href")) {
      const target = (node.getAttribute("data-href") ?? node.getAttribute("href") ?? "").trim();
      const label = normalizeText(node.textContent ?? "");
      if (!target) return escapeCellText(label);
      return !label || label === target
        ? `[[${escapeWikiPart(target)}]]`
        : `[[${escapeWikiPart(target)}\\|${escapeWikiPart(label)}]]`;
    }
    const rawHref = (node.getAttribute("href") ?? "").trim();
    const label = convertChildren(children, context).trim() || escapeCellText(rawHref);
    if (!rawHref) return label;
    const safeHref = rawHref.replace(/\|/g, "%7C");
    const dest = /[\s()<>]/.test(safeHref) ? `<${safeHref.replace(/</g, "%3C").replace(/>/g, "%3E")}>` : safeHref;
    const title = node.getAttribute("title")?.trim();
    const titlePart = title ? ` "${title.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\|/g, "\\|")}"` : "";
    return `[${label}](${dest}${titlePart})`;
  }
  if (PRESERVED_INLINE_HTML.has(t) || t === "SPAN") {
    const kept: string[] = [];
    for (const { name, value } of node.attributes) {
      const lower = name.toLowerCase();
      if (SAFE_INLINE_ATTRS.has(lower) && !value.includes("|") && !/[\r\n]/.test(value)) {
        kept.push(`${lower}="${escapeAttrValue(value)}"`);
      } else if (lower !== "class" || value.trim() !== "") {
        context.attrDropped.add(`${t.toLowerCase()}[${lower}]`);
      }
    }
    const inner = convertChildren(children, context);
    if (t === "SPAN" && kept.length === 0) return inner;
    const open = kept.length ? `<${t.toLowerCase()} ${kept.join(" ")}>` : `<${t.toLowerCase()}>`;
    return `${open}${inner}</${t.toLowerCase()}>`;
  }
  return convertChildren(children, context);
}

/** Captures normalized prose, link targets, TeX and literal code for round-trip verification. */
export function extractExpectedCell(root: HtmlElement): ExpectedCell {
  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  const math: string[] = [];
  const code: string[] = [];
  const collectText = (node: HtmlNode): string => {
    if (node.nodeType === TEXT_NODE) return node.textContent ?? "";
    if (!isElement(node)) return "";
    const t = tag(node);
    const cls = classesOf(node);
    if (t === "MJX-CONTAINER" || t.startsWith("MJX-")) return "";
    if (t === "SPAN" && cls.has("math")) {
      const raw = findMathTex(node);
      if (raw !== undefined) math.push(normalizeTexForTable(raw).tex);
      return MATH_MARKER;
    }
    if (t === "CODE") {
      code.push(node.textContent ?? "");
      return CODE_MARKER;
    }
    if (t === "BR") return " ";
    if (t === "A") {
      if (cls.has("internal-link") || node.hasAttribute("data-href")) {
        const href = (node.getAttribute("data-href") ?? node.getAttribute("href") ?? "").trim();
        if (href) internalLinks.push(href);
      } else {
        const href = (node.getAttribute("href") ?? "").trim();
        if (href) externalLinks.push(href);
      }
    }
    return childrenOf(node).map(collectText).join("");
  };
  return {
    text: normalizeText(collectText(root)),
    internalLinks,
    externalLinks,
    math,
    code,
  };
}

/** Converts an audited HTML `<table>` DOM into Markdown pipe-table source plus exact round-trip expectations. */
export function convertHtmlTableToMarkdown(
  table: HtmlElement,
  options: HtmlToMarkdownOptions = DEFAULT_HTML_TO_MARKDOWN_OPTIONS,
  noteText = "",
  extraAudit?: HtmlTableAudit,
): ConvertedMarkdownTable {
  const audit = auditHtmlTable(table, noteText);
  const blocking = extraAudit ? Array.from(new Set([...extraAudit.blocking, ...audit.blocking])) : audit.blocking;
  const mergedIssues: ConversionIssue[] = [...audit.losses];
  if (extraAudit) {
    for (const loss of extraAudit.losses) {
      if ((loss.kind === "structure" || loss.kind === "attribute") && !mergedIssues.some((x) => x.message === loss.message)) {
        mergedIssues.push(loss);
      }
    }
  }
  if (blocking.length > 0) {
    return {
      markdown: "", expectedRows: 0, expectedCols: 0, alignments: [], cells: [],
      issues: mergedIssues, blocking, internalLinks: audit.internalLinks,
    };
  }

  const { caption, groups } = orderedGroups(table);
  const { grid, width, height, head } = expandHtmlGrid(groups);

  const mathNote = { rewrotePipe: false, multiDollar: false };
  const attrDropped = new Set<string>();
  const ctx = { insideStrong: false, mathNote, attrDropped };

  const mdRows: string[][] = [];
  const expectedRows: ExpectedCell[][] = [];
  for (let r = 0; r < height; r++) {
    const mdRow: string[] = [];
    const expRow: ExpectedCell[] = [];
    for (let c = 0; c < width; c++) {
      const at = grid[r]?.[c];
      const isAnchor = Boolean(at && at.row === r && at.col === c);
      if (!at || (!isAnchor && options.mergedCells === "blank")) {
        mdRow.push("");
        expRow.push({ text: "", internalLinks: [], externalLinks: [], math: [], code: [] });
      } else {
        const md = convertChildren(childrenOf(at.cell.el), ctx).trim();
        mdRow.push(md);
        expRow.push(extractExpectedCell(at.cell.el));
      }
    }
    mdRows.push(mdRow);
    expectedRows.push(expRow);
  }

  const alignments: Align[] = [];
  const delimiters: string[] = [];
  for (let c = 0; c < width; c++) {
    const explicitBody = new Map<Align, number>();
    const explicitAll = new Map<Align, number>();
    for (let r = 0; r < height; r++) {
      const at = grid[r]?.[c];
      if (!at || !at.cell.align) continue;
      explicitAll.set(at.cell.align, (explicitAll.get(at.cell.align) ?? 0) + 1);
      if (r >= head) explicitBody.set(at.cell.align, (explicitBody.get(at.cell.align) ?? 0) + 1);
    }
    if (explicitAll.size > 1) {
      mergedIssues.push({ kind: "alignment", message: `Column ${c + 1} mixes multiple cell alignments; Markdown uses one alignment per column.` });
    }
    const pool = explicitBody.size > 0 ? explicitBody : explicitAll;
    let chosen: Align = "left";
    let explicit = false;
    let bestCount = 0;
    for (const [align, count] of pool) {
      if (count > bestCount) { chosen = align; bestCount = count; explicit = true; }
    }
    alignments.push(chosen);
    delimiters.push(!explicit ? "---" : chosen === "center" ? ":---:" : chosen === "right" ? "---:" : ":---");
  }

  if (head === 0 && options.headerless === "empty-header") {
    mdRows.unshift(Array<string>(width).fill(""));
    expectedRows.unshift(Array.from({ length: width }, () => ({ text: "", internalLinks: [], externalLinks: [], math: [], code: [] })));
  }

  const headerLine = `| ${mdRows[0]!.join(" | ")} |`;
  const sepLine = `| ${delimiters.join(" | ")} |`;
  const bodyLines = mdRows.slice(1).map((row) => `| ${row.join(" | ")} |`);
  const parts: string[] = [];
  let captionContent: ExpectedCell | undefined;

  if (caption && audit.hasCaption && options.caption === "bold") {
    const captionChildren = elementsOf(caption);
    const singleStrong = captionChildren.length === 1 && childrenOf(caption).every((n) => n === captionChildren[0] || (n.nodeType === TEXT_NODE && !(n.textContent ?? "").trim()))
      && (tag(captionChildren[0]!) === "STRONG" || tag(captionChildren[0]!) === "B");
    const capContent = singleStrong
      ? convertChildren(childrenOf(captionChildren[0]!), { ...ctx, insideStrong: true }).trim()
      : convertChildren(childrenOf(caption), { ...ctx, insideStrong: true }).trim();
    if (capContent) {
      parts.push(`**${capContent}**`, "");
      captionContent = extractExpectedCell(caption);
    }
  }

  parts.push(headerLine, sepLine, ...bodyLines);

  if (mathNote.rewrotePipe) {
    mergedIssues.push({ kind: "math", message: "Unescaped `|` inside inline math was rewritten as \\vert to preserve pipe-table columns." });
  }
  if (attrDropped.size > 0) {
    mergedIssues.push({ kind: "attribute", message: `Unsupported inline attributes dropped (${Array.from(attrDropped).join(", ")}).` });
  }

  return {
    markdown: parts.join("\n"),
    expectedRows: expectedRows.length,
    expectedCols: width,
    alignments,
    cells: expectedRows,
    captionContent,
    issues: mergedIssues,
    blocking: [],
    internalLinks: audit.internalLinks,
  };
}

const sameList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

const normalizeHref = (value: string): string => {
  const trimmed = value.trim();
  try { return decodeURIComponent(trimmed); } catch { return trimmed; }
};

/** Checks Obsidian's rendered DOM of the converted Markdown against expected cell text, links, TeX, alignment, and caption. */
export function verifyRenderedMarkdownTable(renderedContainer: Element, expected: ConvertedMarkdownTable): { ok: true } | { ok: false; reason: string } {
  const tables = renderedContainer.querySelectorAll("table");
  if (tables.length !== 1) return { ok: false, reason: `Expected 1 rendered table, found ${tables.length}.` };
  const table = tables[0]!;
  if (table.rows.length !== expected.expectedRows) {
    return { ok: false, reason: `Row count changed (${table.rows.length} vs ${expected.expectedRows}).` };
  }
  if (expected.captionContent) {
    const firstP = renderedContainer.querySelector(":scope > p");
    const renderedCap = firstP && extractExpectedCell(firstP);
    if (!renderedCap || renderedCap.text !== expected.captionContent.text || !sameList(renderedCap.code, expected.captionContent.code)) {
      return { ok: false, reason: "Caption paragraph did not survive rendering." };
    }
  }
  for (let r = 0; r < table.rows.length; r++) {
    const row = table.rows[r]!;
    if (row.cells.length !== expected.expectedCols) {
      return { ok: false, reason: `Row ${r + 1} column count changed (${row.cells.length} vs ${expected.expectedCols}).` };
    }
    for (let c = 0; c < row.cells.length; c++) {
      const domCell = row.cells[c]!;
      const exp = expected.cells[r]![c]!;
      const actual = extractExpectedCell(domCell);
      if (actual.text !== exp.text) {
        return { ok: false, reason: `Row ${r + 1}, Col ${c + 1} text changed after round-trip.` };
      }
      if (!sameList(actual.internalLinks.map(normalizeHref), exp.internalLinks.map(normalizeHref))) {
        return { ok: false, reason: `Row ${r + 1}, Col ${c + 1} internal link target changed.` };
      }
      if (!sameList(actual.externalLinks.map(normalizeHref), exp.externalLinks.map(normalizeHref))) {
        return { ok: false, reason: `Row ${r + 1}, Col ${c + 1} external URL changed.` };
      }
      if (!sameList(actual.code, exp.code)) {
        return { ok: false, reason: `Row ${r + 1}, Col ${c + 1} inline code changed.` };
      }
      if (!sameList(actual.math, exp.math)) {
        return { ok: false, reason: `Row ${r + 1}, Col ${c + 1} math source changed.` };
      }
      const align = (domCell.getAttribute("align") || domCell.style.textAlign || "left").toLowerCase();
      if (align !== expected.alignments[c]) {
        return { ok: false, reason: `Row ${r + 1}, Col ${c + 1} alignment changed (${align} vs ${expected.alignments[c]}).` };
      }
    }
  }
  return { ok: true };
}
