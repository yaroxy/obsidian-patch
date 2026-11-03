import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/table/model.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const {
  createTable, deleteColumns, deleteRows, headRows, insertColumn, insertRow, layout, merge,
  setAlign, setCaption, setHeader, split, tableRanges, toHtml,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const cell = (html, more = {}) => ({ header: false, rowspan: 1, colspan: 1, attrs: [["align", "center"]], html, ...more });
const th = (html, more = {}) => cell(html, { header: true, ...more });
const texts = (table) => table.rows.map((row) => row.map((c) => c.html));

// A trimmed-down 五十音 table: a header row, row headers spanning two rows, and a split romanization.
const kana = () => ({
  attrs: [["style", "width:100%"]],
  rows: [
    [th("假名", { attrs: [["align", "center"], ["style", "width:20%"]] }),
      th("い段", { colspan: 2, attrs: [["align", "center"], ["style", "width:40%"]] }),
      th("う段", { attrs: [["align", "center"], ["style", "width:40%"]] })],
    [th("さ行", { rowspan: 2, attrs: [["align", "center"], ["style", "vertical-align:middle"]] }),
      cell("し シ", { colspan: 2 }), cell("す ス")],
    [cell("si"), cell("shi"), cell("su")],
  ],
});

test("new tables follow the Obsidian conventions", () => {
  assert.equal(toHtml(createTable(2, 3)), [
    '<table style="width:100%">',
    "  <thead>",
    "    <tr>",
    '      <th align="center" style="width:20%"></th>',
    '      <th align="center" style="width:40%"></th>',
    '      <th align="center" style="width:40%"></th>',
    "    </tr>",
    "  </thead>",
    "  <tbody>",
    "    <tr>",
    '      <td align="center"></td>',
    '      <td align="center"></td>',
    '      <td align="center"></td>',
    "    </tr>",
    "  </tbody>",
    "</table>",
  ].join("\n"));
});

test("serialization keeps attributes, writes spans first, and never leaves a blank line", () => {
  const table = setCaption(kana(), "五十音");
  table.rows[2][0].html = "s\n\n<i>i</i>";
  const html = toHtml(table);
  assert.ok(html.includes('  <caption style="caption-side:top; text-align:center; font-weight:600; padding:0 0 4px">五十音</caption>'));
  assert.ok(html.includes('      <th rowspan="2" align="center" style="vertical-align:middle">さ行</th>'));
  assert.ok(html.includes('      <td colspan="2" align="center">し シ</td>'));
  assert.ok(html.includes('      <td align="center">s <i>i</i></td>'));
  assert.ok(!/\n\s*\n/.test(html));
  assert.equal(setCaption(table, "").caption, undefined);
});

test("only leading all-header rows that do not span into the body form thead", () => {
  assert.equal(headRows(kana().rows), 1);
  assert.equal(headRows([[th("a", { rowspan: 2 }), th("b")], [cell("c")]]), 0);
  assert.equal(headRows([[th("a")], [th("b")], [cell("c")]]), 2);
});

test("rows inserted inside a row span extend it, and new cells take after their neighbors", () => {
  const inner = insertRow(kana(), 2);
  assert.equal(inner.rows[1][0].rowspan, 3);
  assert.equal(layout(inner.rows).width, 4);
  assert.deepEqual(inner.rows[2].map((c) => c.header), [false, false, false]);
  const below = insertRow(kana(), 3);
  assert.equal(below.rows[1][0].rowspan, 2);
  assert.deepEqual(below.rows[3].map((c) => c.header), [true, false, false, false]);
  const above = insertRow(kana(), 0);
  assert.equal(headRows(above.rows), 2);
});

test("columns inserted inside a column span extend it and refit the header widths", () => {
  const table = insertColumn(kana(), 2);
  assert.equal(table.rows[0][1].colspan, 3);
  assert.equal(table.rows[0][1].attrs[1][1], "width:40%");
  const edge = insertColumn(kana(), 4);
  assert.deepEqual(edge.rows[0].map((c) => c.attrs.find(([n]) => n === "style")[1]), ["width:20%", "width:26.6667%", "width:26.6667%", "width:26.6667%"]);
  assert.deepEqual(texts(edge)[2], ["si", "shi", "su", ""]);
  const plain = insertColumn({ attrs: [], rows: [[th("a"), th("b")], [cell("c"), cell("d")]] }, 1);
  assert.ok(plain.rows[0].every((c) => !c.attrs.some(([n]) => n === "style")));
});

test("deleting rows keeps the rest of a span, and deleting columns narrows spans", () => {
  const rows = deleteRows(kana(), 1, 1);
  assert.deepEqual(texts(rows), [["假名", "い段", "う段"], ["さ行", "si", "shi", "su"]]);
  assert.equal(rows.rows[1][0].rowspan, 1);
  const cols = deleteColumns(kana(), 1, 1);
  assert.equal(cols.rows[0][1].colspan, 1);
  assert.deepEqual(texts(cols)[2], ["shi", "su"]);
});

test("merging grows to whole cells, joins their text, and centers row spans", () => {
  const pair = merge(kana(), { top: 2, left: 1, bottom: 2, right: 2 });
  assert.deepEqual(texts(pair)[2], ["si<br>shi", "su"]);
  assert.deepEqual([pair.rows[2][0].colspan, pair.rows[2][0].attrs], [2, [["align", "center"]]]);
  // The selection starts inside し シ, so it grows to the cell's left edge and takes si too.
  const block = merge(kana(), { top: 1, left: 2, bottom: 2, right: 3 });
  const merged = block.rows[1][1];
  assert.equal(merged.html, "し シ<br>す ス<br>si<br>shi<br>su");
  assert.deepEqual([merged.rowspan, merged.colspan], [2, 3]);
  assert.ok(merged.attrs.some(([n, v]) => n === "style" && v === "vertical-align:middle"));
  assert.deepEqual(texts(block), [["假名", "い段", "う段"], ["さ行", merged.html], []]);
  const single = kana();
  assert.equal(merge(single, { top: 2, left: 1, bottom: 2, right: 1 }), single);
});

test("splitting restores single cells with the merged cell's header state and alignment", () => {
  const table = split(kana(), { top: 0, left: 0, bottom: 2, right: 3 });
  assert.equal(layout(table.rows).placed.length, 12);
  assert.deepEqual(table.rows[0].map((c) => c.header), [true, true, true, true]);
  assert.deepEqual(table.rows[2].map((c) => c.header), [true, false, false, false]);
  assert.ok(table.rows.flat().every((c) => c.attrs.some(([n, v]) => n === "align" && v === "center")));
  assert.equal(table.rows[0].length, 4);
  assert.deepEqual(table.rows[0].map((c) => c.attrs.find(([n]) => n === "style")[1]), ["width:20%", "width:26.6667%", "width:26.6667%", "width:26.6667%"]);
});

test("header and alignment changes apply to every selected cell", () => {
  const table = setAlign(setHeader(kana(), { top: 2, left: 1, bottom: 2, right: 2 }, true), { top: 2, left: 1, bottom: 2, right: 2 }, "left");
  assert.deepEqual(table.rows[2].map((c) => [c.header, c.attrs[0][1]]), [[true, "left"], [true, "left"], [false, "center"]]);
});

test("tables are found in Markdown source, including nested ones", () => {
  const text = "Intro\n\n<table>\n<tr><td><table><tr><td>x</td></tr></table></td></tr>\n</table>\n\n<TABLE style=\"a\"></TABLE><tablex>";
  const ranges = tableRanges(text);
  assert.equal(ranges.length, 2);
  assert.ok(text.slice(ranges[0].from, ranges[0].to).startsWith("<table>\n<tr>"));
  assert.ok(text.slice(ranges[0].from, ranges[0].to).endsWith("</td></tr>\n</table>"));
  assert.equal(text.slice(ranges[1].from, ranges[1].to), '<TABLE style="a"></TABLE>');
});
