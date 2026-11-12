import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/table/markdown.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { markdownTables, selectMarkdownTables, tableReferences, tableReplacement } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const simple = "| A | B |\n| --- | --- |\n| x | y |";

test("the user's three tables retain every header, cell and source range", () => {
  const source = readFileSync("tests/fixtures/markdown-tables.md", "utf8");
  const tables = markdownTables(source);
  assert.deepEqual(tables.map(t => [t.rows.length, t.align.length]), [[8, 2], [39, 3], [19, 3]]);
  assert.deepEqual(tables.map(t => t.rows.at(-1)[0]), ["Very Pleasant", "Worried", "Work"]);
  assert.ok(tables.every(t => source.slice(t.from, t.to) === t.source));
  assert.match(tables[1].rows[1][2], /某事远超预期/);
});

test("optional outer pipes, alignment, short rows and header-only tables", () => {
  const [table] = markdownTables("A | B | C\n:- | :-: | -:\nx | y\nonly one cell\n\n| Header |\n| - |");
  assert.deepEqual(table.align, ["left", "center", "right"]);
  assert.deepEqual(table.rows, [["A", "B", "C"], ["x", "y"]]);
  assert.equal(markdownTables("| Header |\n| - |")[0].rows.length, 1);
  assert.equal(markdownTables("A | B\n- | -\nx | y")[0].rows.length, 2);
  assert.equal(markdownTables("Paragraph\n" + simple).length, 0);
});

test("escaped pipes, code and wiki-link aliases do not split cells", () => {
  const row = String.raw`| a\|b | \`c\|d\` | [[Note\|Alias]] |`.replaceAll("\\`", "`");
  const [table] = markdownTables("| A | B | C |\n| - | - | - |\n" + row);
  assert.equal(table.rows[1].length, 3);
  assert.equal(table.rows[1][2], String.raw`[[Note\|Alias]]`);
  const [slashes] = markdownTables("| A | B | C |\n| - | - | - |\n" + String.raw`| a\\| b | c |`);
  assert.equal(slashes.rows[1].length, 3);
});

test("fences, YAML, comments, math, HTML, callouts and nested lists are excluded", () => {
  const cases = [
    `---\n${simple}\n---`, "```sql\n" + simple + "\n```", "~~~~\n" + simple + "\n~~~\n" + simple + "\n~~~~",
    `<!--\n${simple}\n-->`, `text <!--\n${simple}\n-->`, `%%\n${simple}\n%%`, `text %%\n${simple}\n%%`,
    `$$\n${simple}\n$$`, `<div>\n${simple}\n</div>`, `<pre>\n\n${simple}\n</pre>`,
    simple.split("\n").map(l => "> " + l).join("\n"), simple.split("\n").map(l => "    " + l).join("\n"),
    "- item\n" + simple.split("\n").map(l => "  " + l).join("\n"), "- item\n" + simple,
  ];
  for (const text of cases) assert.equal(markdownTables(text).length, 0, text);
  for (const text of cases) assert.equal(markdownTables(text + "\n\n" + simple).length, 1, text);
});

test("mismatched delimiters are ignored; excess body cells are retained for validation", () => {
  assert.equal(markdownTables("| A | B |\n| --- |\n| x | y |").length, 0);
  assert.equal(markdownTables(simple + "\n| a | b | c |")[0].rows.at(-1).length, 3);
});

test("a cursor picks one table; a selection includes whole tables and rejects partial ones", () => {
  const text = "Before\n\n" + simple + "\n\nBetween\n\n" + simple + "\n\nAfter";
  const tables = markdownTables(text);
  assert.equal(selectMarkdownTables(text, tables[0].from + 5).length, 1);
  assert.equal(selectMarkdownTables(text, tables[0].to).length, 1);
  assert.equal(selectMarkdownTables(text, 0).length, 0);
  assert.equal(selectMarkdownTables(text, tables[0].from, tables[1].to).length, 2);
  assert.throws(() => selectMarkdownTables(text, tables[0].from + 3, tables[1].to), /complete/);
  assert.throws(() => selectMarkdownTables(text, tables[0].from, tables[1].to - 3), /complete/);
});

test("CRLF offsets and replacements preserve surrounding bytes and required block separation", () => {
  const text = "# Before\r\n" + simple.replaceAll("\n", "\r\n") + "\r\n# After";
  const [table] = markdownTables(text);
  assert.equal(text.slice(table.from, table.to), simple.replaceAll("\n", "\r\n"));
  const replacement = tableReplacement(text, table, "<table>\n</table>");
  assert.equal(text.slice(0, table.from) + replacement + text.slice(table.to), "# Before\r\n\r\n<table>\r\n</table>\r\n\r\n# After");
  const lone = markdownTables(simple)[0];
  assert.equal(tableReplacement(simple, lone, "<table></table>"), "<table></table>");
});

test("reference definitions retain destinations and titles but exclude code and footnotes", () => {
  const text = '[site]: https://example.com "Title"\n\n[multi]:\n  https://example.com\n  "Title"\n\n```\n[no]: https://invalid.example\n```\n\n[^foot]: text';
  assert.equal(tableReferences(text), '[site]: https://example.com "Title"\n\n[multi]:\n  https://example.com\n  "Title"\n');
});
