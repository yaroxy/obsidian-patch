/**
 * HTML tables in the form that renders well in Obsidian: no blank lines inside
 * the block, an explicit `align` on every new cell, `vertical-align:middle` on
 * cells that span rows, and column widths on the first header row. Existing
 * attributes are kept as written, so editing one cell leaves the rest alone.
 */

export type Attrs = [name: string, value: string][];

export interface Cell {
  header: boolean;
  rowspan: number;
  colspan: number;
  /** Every attribute but the spans, in source order. */
  attrs: Attrs;
  html: string;
}

export interface Table {
  attrs: Attrs;
  caption?: { attrs: Attrs; html: string };
  /** The cells that start in each row, left to right. */
  rows: Cell[][];
}

/** Inclusive slot bounds in the table grid. */
export interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface Placed {
  cell: Cell;
  row: number;
  col: number;
}

export interface Layout {
  width: number;
  height: number;
  placed: Placed[];
  /** The cell covering each slot. */
  grid: (Placed | undefined)[][];
}

export type Align = "left" | "center" | "right";

export const CAPTION_STYLE = "caption-side:top; text-align:center; font-weight:600; padding:0 0 4px";
const FIRST_COLUMN_WIDTH = 20;

export function createTable(rows: number, cols: number): Table {
  const table: Table = {
    attrs: [["style", "width:100%"]],
    rows: Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, () => ({
      header: row === 0, rowspan: 1, colspan: 1, attrs: [["align", "center"]] as Attrs, html: "",
    }))),
  };
  return fitWidths(table);
}

/** Reads the first table in `html`. Spans are clamped and missing slots filled. */
export function parseTable(html: string): Table | undefined {
  const table = new DOMParser().parseFromString(html, "text/html").querySelector("table");
  if (!table) return undefined;
  const attrs = (el: Element): Attrs => Array.from(el.attributes)
    .filter(({ name }) => name !== "rowspan" && name !== "colspan")
    .map(({ name, value }) => [name, value]);
  const rows = Array.from(table.rows, (row) => Array.from(row.cells, (cell): Cell => ({
    header: cell.tagName === "TH",
    rowspan: Math.max(1, cell.rowSpan),
    colspan: Math.max(1, cell.colSpan),
    attrs: attrs(cell),
    html: cell.innerHTML,
  })));
  const { width, height, placed, grid } = layout(rows);
  for (const { cell, row } of placed) cell.rowspan = Math.min(cell.rowspan, height - row);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!grid[row]?.[col]) placed.push({ cell: fresh(grid[row]?.[col - 1]?.cell), row, col });
    }
  }
  return {
    attrs: attrs(table),
    caption: table.caption ? { attrs: attrs(table.caption), html: table.caption.innerHTML } : undefined,
    rows: rebuild(placed, height),
  };
}

export function toHtml(table: Table): string {
  const out = [`<table${attrsHtml(table.attrs)}>`];
  if (table.caption) out.push(`  <caption${attrsHtml(table.caption.attrs)}>${inline(table.caption.html)}</caption>`);
  const head = headRows(table.rows);
  for (const [tag, rows] of [["thead", table.rows.slice(0, head)], ["tbody", table.rows.slice(head)]] as const) {
    if (rows.length === 0) continue;
    out.push(`  <${tag}>`);
    for (const row of rows) {
      out.push("    <tr>");
      for (const cell of row) {
        const name = cell.header ? "th" : "td";
        const spans = (cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : "") + (cell.colspan > 1 ? ` colspan="${cell.colspan}"` : "");
        out.push(`      <${name}${spans}${attrsHtml(cell.attrs)}>${inline(cell.html)}</${name}>`);
      }
      out.push("    </tr>");
    }
    out.push(`  </${tag}>`);
  }
  out.push("</table>");
  return out.join("\n");
}

/** Leading rows made only of header cells, none of which spans past them. */
export function headRows(rows: Cell[][]): number {
  let head = 0;
  while (head < rows.length && rows[head]!.every((cell) => cell.header)) head++;
  while (head > 0 && rows.slice(0, head).some((row, index) => row.some((cell) => index + cell.rowspan > head))) head--;
  return head;
}

/** Character ranges of the top-level `<table>` elements in Markdown source. */
export function tableRanges(text: string): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  let depth = 0;
  let from = 0;
  for (const match of text.matchAll(/<(\/?)table\b[^>]*>/gi)) {
    if (!match[1]) {
      if (depth++ === 0) from = match.index;
    } else if (depth > 0 && --depth === 0) {
      ranges.push({ from, to: match.index + match[0].length });
    }
  }
  return ranges;
}

/** Places cells on the grid with the HTML table algorithm. */
export function layout(rows: Cell[][]): Layout {
  const height = rows.length;
  const grid: (Placed | undefined)[][] = rows.map(() => []);
  const placed: Placed[] = [];
  let width = 0;
  rows.forEach((cells, row) => {
    let col = 0;
    for (const cell of cells) {
      while (grid[row]![col]) col++;
      const at: Placed = { cell, row, col };
      placed.push(at);
      for (let y = row; y < Math.min(row + cell.rowspan, height); y++) {
        for (let x = col; x < col + cell.colspan; x++) grid[y]![x] ??= at;
      }
      col += cell.colspan;
      width = Math.max(width, col);
    }
  });
  return { width, height, placed, grid };
}

/** Grows a selection until no cell crosses its edge. */
export function expand(grid: Layout["grid"], rect: Rect): Rect {
  let next = { ...rect };
  for (let changed = true; changed;) {
    changed = false;
    for (let y = next.top; y <= next.bottom; y++) {
      for (let x = next.left; x <= next.right; x++) {
        const at = grid[y]?.[x];
        if (!at) continue;
        const bottom = at.row + at.cell.rowspan - 1;
        const right = at.col + at.cell.colspan - 1;
        if (at.row < next.top || at.col < next.left || bottom > next.bottom || right > next.right) {
          next = {
            top: Math.min(next.top, at.row), left: Math.min(next.left, at.col),
            bottom: Math.max(next.bottom, bottom), right: Math.max(next.right, right),
          };
          changed = true;
        }
      }
    }
  }
  return next;
}

export function inside(at: Placed, rect: Rect): boolean {
  return at.row >= rect.top && at.row <= rect.bottom && at.col >= rect.left && at.col <= rect.right;
}

export function insertRow(table: Table, at: number): Table {
  const next = clone(table);
  const { width, height, placed, grid } = layout(next.rows);
  const spanned = new Set<number>();
  for (const cell of placed) {
    if (cell.row >= at) cell.row++;
    else if (cell.row + cell.cell.rowspan > at) {
      cell.cell.rowspan++;
      for (let x = cell.col; x < cell.col + cell.cell.colspan; x++) spanned.add(x);
    }
  }
  for (let col = 0; col < width; col++) {
    if (!spanned.has(col)) placed.push({ cell: fresh(grid[at - 1]?.[col]?.cell, grid[at]?.[col]?.cell), row: at, col });
  }
  return { ...next, rows: rebuild(placed, height + 1) };
}

export function insertColumn(table: Table, at: number): Table {
  const next = clone(table);
  const { height, placed, grid } = layout(next.rows);
  const spanned = new Set<number>();
  for (const cell of placed) {
    if (cell.col >= at) cell.col++;
    else if (cell.col + cell.cell.colspan > at) {
      cell.cell.colspan++;
      for (let y = cell.row; y < cell.row + cell.cell.rowspan; y++) spanned.add(y);
    }
  }
  for (let row = 0; row < height; row++) {
    if (!spanned.has(row)) placed.push({ cell: fresh(grid[row]?.[at - 1]?.cell, grid[row]?.[at]?.cell), row, col: at });
  }
  return fitWidths({ ...next, rows: rebuild(placed, height) }, table);
}

export function deleteRows(table: Table, top: number, bottom: number): Table {
  const next = clone(table);
  const { height, placed } = layout(next.rows);
  const count = bottom - top + 1;
  const kept = placed.filter((at) => {
    const overlap = Math.min(at.row + at.cell.rowspan - 1, bottom) - Math.max(at.row, top) + 1;
    if (overlap === at.cell.rowspan) return false;
    if (overlap > 0) at.cell.rowspan -= overlap;
    if (at.row > bottom) at.row -= count;
    else if (at.row >= top) at.row = top;
    return true;
  });
  return { ...next, rows: rebuild(kept, height - count) };
}

export function deleteColumns(table: Table, left: number, right: number): Table {
  const next = clone(table);
  const { height, placed } = layout(next.rows);
  const count = right - left + 1;
  const kept = placed.filter((at) => {
    const overlap = Math.min(at.col + at.cell.colspan - 1, right) - Math.max(at.col, left) + 1;
    if (overlap === at.cell.colspan) return false;
    if (overlap > 0) at.cell.colspan -= overlap;
    if (at.col > right) at.col -= count;
    else if (at.col >= left) at.col = left;
    return true;
  });
  return fitWidths({ ...next, rows: rebuild(kept, height) }, table);
}

/** Joins the selected cells into the top-left one, keeping every cell's text. */
export function merge(table: Table, rect: Rect): Table {
  const next = clone(table);
  const { height, placed, grid } = layout(next.rows);
  const area = expand(grid, rect);
  const merged = placed.filter((at) => inside(at, area));
  const anchor = grid[area.top]?.[area.left];
  if (!anchor || merged.length < 2) return table;
  anchor.cell.rowspan = area.bottom - area.top + 1;
  anchor.cell.colspan = area.right - area.left + 1;
  anchor.cell.html = merged.map(({ cell }) => cell.html.trim()).filter(Boolean).join("<br>");
  if (anchor.cell.rowspan > 1) setStyle(anchor.cell, "vertical-align", "middle");
  const kept = placed.filter((at) => at === anchor || !merged.includes(at));
  return fitWidths({ ...next, rows: rebuild(kept, height) }, table);
}

/** Turns every merged cell in the selection back into single cells. */
export function split(table: Table, rect: Rect): Table {
  const next = clone(table);
  const { height, placed, grid } = layout(next.rows);
  const area = expand(grid, rect);
  const added: Placed[] = [];
  for (const at of placed) {
    if (!inside(at, area)) continue;
    for (let y = at.row; y < at.row + at.cell.rowspan; y++) {
      for (let x = at.col; x < at.col + at.cell.colspan; x++) {
        if (y !== at.row || x !== at.col) added.push({ cell: fresh(at.cell), row: y, col: x });
      }
    }
    at.cell.rowspan = 1;
    at.cell.colspan = 1;
  }
  if (added.length === 0) return table;
  return fitWidths({ ...next, rows: rebuild([...placed, ...added], height) }, table);
}

export function setHeader(table: Table, rect: Rect, header: boolean): Table {
  return update(table, rect, (cell) => { cell.header = header; });
}

export function setAlign(table: Table, rect: Rect, align: Align): Table {
  return update(table, rect, (cell) => setAttr(cell.attrs, "align", align));
}

/** Keeps the cell objects, so an open editor's references stay valid. */
export function setCaption(table: Table, html: string): Table {
  return { ...table, caption: html ? { attrs: table.caption?.attrs ?? [["style", CAPTION_STYLE]], html } : undefined };
}

function update(table: Table, rect: Rect, change: (cell: Cell) => void): Table {
  const next = clone(table);
  const { placed, grid } = layout(next.rows);
  const area = expand(grid, rect);
  for (const at of placed) if (inside(at, area)) change(at.cell);
  return next;
}

/**
 * The first header row carries the column widths. When its cell count changes,
 * the first cell keeps its width and the others share the rest evenly: a
 * colspan usually holds sub-cells rather than making a group wider.
 */
function fitWidths(table: Table, before?: Table): Table {
  const row = table.rows[0];
  const old = before?.rows[0];
  if (!row || !row.every((cell) => cell.header)) return table;
  if (old && (old.length === row.length || !old.some((cell) => styleOf(cell, "width")))) return table;
  if (row.length < 2) {
    for (const cell of row) setStyle(cell, "width", undefined);
    return table;
  }
  const first = styleOf(row[0]!, "width");
  const lead = first?.endsWith("%") ? parseFloat(first) : FIRST_COLUMN_WIDTH;
  row.forEach((cell, index) => setStyle(cell, "width", percent(index === 0 ? lead : (100 - lead) / (row.length - 1))));
  return table;
}

/** A blank cell that takes after its neighbors: a header only between headers. */
function fresh(...neighbors: (Cell | undefined)[]): Cell {
  const near = neighbors.filter((cell): cell is Cell => cell !== undefined);
  const align = near[0]?.attrs.find(([name]) => name === "align");
  return {
    header: near.length > 0 && near.every((cell) => cell.header),
    rowspan: 1, colspan: 1, attrs: align ? [[...align]] : [], html: "",
  };
}

function rebuild(placed: Placed[], height: number): Cell[][] {
  const rows: Cell[][] = Array.from({ length: height }, () => []);
  for (const at of [...placed].sort((a, b) => a.row - b.row || a.col - b.col)) rows[at.row]!.push(at.cell);
  return rows;
}

function clone(table: Table): Table {
  return structuredClone(table);
}

function styleOf(cell: Cell, property: string): string | undefined {
  return declarations(cell.attrs).find(([name]) => name === property)?.[1];
}

function setStyle(cell: Cell, property: string, value: string | undefined): void {
  const style = declarations(cell.attrs);
  const index = style.findIndex(([name]) => name === property);
  if (value === undefined) {
    if (index >= 0) style.splice(index, 1);
  } else if (index >= 0) {
    style[index] = [property, value];
  } else {
    style.push([property, value]);
  }
  setAttr(cell.attrs, "style", style.length > 0 ? style.map(([name, val]) => `${name}:${val}`).join("; ") : undefined);
}

function declarations(attrs: Attrs): [string, string][] {
  const style = attrs.find(([name]) => name === "style")?.[1] ?? "";
  return style.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const colon = part.indexOf(":");
    return [part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim()];
  });
}

function setAttr(attrs: Attrs, name: string, value: string | undefined): void {
  const index = attrs.findIndex(([key]) => key === name);
  if (value === undefined) {
    if (index >= 0) attrs.splice(index, 1);
  } else if (index >= 0) {
    attrs[index] = [name, value];
  } else {
    attrs.push([name, value]);
  }
}

function percent(value: number): string {
  return `${Number(value.toPrecision(6))}%`;
}

function attrsHtml(attrs: Attrs): string {
  return attrs.map(([name, value]) => ` ${name}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`).join("");
}

/** A blank line would end the HTML block, so cell content stays on one line. */
function inline(html: string): string {
  return html.trim().replace(/\s*\n\s*/g, " ");
}
