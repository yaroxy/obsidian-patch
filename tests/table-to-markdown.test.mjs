import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import MarkdownIt from "markdown-it";

const toMdBundle = await build({ entryPoints: ["src/features/table/to-markdown.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const mdBundle = await build({ entryPoints: ["src/features/table/markdown.ts"], bundle: true, write: false, format: "esm", platform: "node" });

const {
  auditHtmlTable,
  convertHtmlTableToMarkdown,
  DEFAULT_HTML_TO_MARKDOWN_OPTIONS,
  escapeCellText,
  normalizeTexForTable,
  verifyRenderedMarkdownTable,
} = await import(`data:text/javascript;base64,${Buffer.from(toMdBundle.outputFiles[0].contents).toString("base64")}`);

const { selectHtmlTables, tableReplacement } = await import(
  `data:text/javascript;base64,${Buffer.from(mdBundle.outputFiles[0].contents).toString("base64")}`);

const VOID_TAGS = new Set(["BR", "COL", "EMBED", "HR", "IMG", "INPUT", "WBR"]);

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&(lt|gt|amp|quot|apos|nbsp);/g, (_, name) =>
      ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: "\u00a0" })[name]);
}

function makeEl(tagName, attrText = "") {
  const attributes = [];
  for (const match of attrText.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = match[1];
    if (!name) continue;
    attributes.push({ name, value: decodeEntities(match[2] ?? match[3] ?? match[4] ?? "") });
  }
  const el = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes: [],
    attributes,
    getAttribute(name) {
      const lower = name.toLowerCase();
      return attributes.find(a => a.name.toLowerCase() === lower)?.value ?? null;
    },
    hasAttribute(name) { return el.getAttribute(name) !== null; },
    get rowSpan() { return Number(this.getAttribute("rowspan") ?? 1); },
    get colSpan() { return Math.min(1000, Number(this.getAttribute("colspan") ?? 1) || 1); },
    get textContent() { return el.childNodes.map(c => c.textContent ?? "").join(""); },
  };
  return el;
}

/** Tiny structural HTML parser for Node unit tests of HTML->Markdown conversion. */
function parseHtmlFragment(html) {
  const root = makeEl("DIV");
  const stack = [root];
  const tokenRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(tokenRe)) {
    const parent = stack[stack.length - 1];
    if (m[5] !== undefined) {
      parent.childNodes.push({ nodeType: 3, textContent: decodeEntities(m[5]) });
      continue;
    }
    const closing = Boolean(m[1]);
    const name = m[2].toUpperCase();
    const selfClosing = Boolean(m[4]) || VOID_TAGS.has(name);
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === name) { stack.length = i; break; }
      }
      continue;
    }
    const node = makeEl(name, m[3] ?? "");
    parent.childNodes.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

const parseTableDom = (html) => parseHtmlFragment(html).childNodes.find(n => n.nodeType === 1 && n.tagName === "TABLE");

test("recognizes native highlight and link attributes while reporting custom values", () => {
  const convert = cell => convertHtmlTableToMarkdown(parseTableDom(`<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>${cell}</td></tr></tbody></table>`));
  const defaults = '<mark data-highlight="">Hi</mark> <a class="external-link" target="_blank" rel="noopener nofollow" href="https://example.com">site</a>';
  assert.deepEqual(convert(defaults).issues, []);
  const authored = '<mark data-highlight="red">Hi</mark> <a target="_self" rel="author" href="https://example.com">site</a>';
  const notices = convert(authored).issues.map(issue => issue.message).join(" ");
  for (const attribute of ["mark[data-highlight]", "a[target]", "a[rel]"]) assert.ok(notices.includes(attribute));
});

test("discloses comments and inline attributes that Markdown conversion removes, including in visual drafts", () => {
  const table = parseTableDom('<table><tr><th>Header</th></tr><tr><td><strong title="Before launch">Hold</strong></td></tr></table>');
  table.childNodes[1].childNodes[0].childNodes.push({ nodeType: 8, textContent: "Audit ABC-123" });
  const audit = auditHtmlTable(table);
  const cleanDraft = parseTableDom("<table><tr><th>Header</th></tr><tr><td><strong>Hold</strong></td></tr></table>");
  for (const result of [convertHtmlTableToMarkdown(table), convertHtmlTableToMarkdown(cleanDraft, DEFAULT_HTML_TO_MARKDOWN_OPTIONS, "", audit)]) {
    assert.ok(result.issues.some(issue => issue.message.includes("strong[title]")));
    assert.ok(result.issues.some(issue => issue.message.includes("comments")));
    assert.deepEqual(result.blocking, []);
  }
});

test("conversion uses the reflected colSpan and checks the expanded dimensions of even sparse rows", () => {
  const wide = '<tr><th colspan="1001">Across</th></tr>';
  const one = convertHtmlTableToMarkdown(parseTableDom(`<table>${wide}</table>`));
  assert.deepEqual(one.blocking, []);
  assert.equal(one.expectedCols, 1000);
  const overBudget = parseTableDom(`<table>${wide}${"<tr><td>One</td></tr>".repeat(50)}</table>`);
  const result = convertHtmlTableToMarkdown(overBudget);
  assert.match(result.blocking.join(" "), /50,000 expanded grid slots/);
  assert.equal(result.markdown, "");
});

test("selectHtmlTables and tableReplacement respect EOF, standalone boundaries, and partial selection", () => {
  const t1 = "<table>\n  <tbody>\n    <tr><td>a</td></tr>\n  </tbody>\n</table>";
  const t2 = "<table>\n  <tbody>\n    <tr><td>b</td></tr>\n  </tbody>\n</table>";
  const text = `${t1}\n\n${t2}\n`;
  assert.equal(selectHtmlTables(text, 5).length, 1);
  assert.equal(selectHtmlTables(text, 0, text.length).length, 2);
  assert.throws(() => selectHtmlTables(text, 5, text.length), /complete HTML/);
  const inlineText = "Before <table><tr><td>x</td></tr></table>";
  assert.equal(selectHtmlTables(inlineText, inlineText.indexOf("<td")).length, 0);
  const single = `${t1}\n`;
  const [range] = selectHtmlTables(single, 3);
  assert.equal(single.slice(0, range.from) + tableReplacement(single, range, "| A |\n| --- |\n| a |") + single.slice(range.to),
    "| A |\n| --- |\n| a |\n");
});

test("escapeCellText and normalizeTexForTable protect Markdown table semantics without noise", () => {
  assert.equal(escapeCellText("$5 & $6 #tag ==no== *star* [a] a|b \\"), "\\$5 & \\$6 \\#tag \\=\\=no\\=\\= \\*star\\* \\[a\\] a\\|b \\\\");
  assert.equal(escapeCellText("foo#bar normal-text (1, 2)"), "foo#bar normal-text (1, 2)");
  assert.deepEqual(normalizeTexForTable("\\Vert v\\Vert"), { tex: "\\Vert v\\Vert", rewrotePipe: false });
  assert.deepEqual(normalizeTexForTable("|x| + \\|y\\| + a | b"), { tex: "\\vert x\\vert + \\|y\\| + a \\vert b", rewrotePipe: true });
});

test("forward-converted HTML table audits with zero blockers and zero losses", () => {
  const html = [
    '<table style="width:100%">',
    "  <thead>",
    "    <tr>",
    '      <th align="left" style="width:20%">Name</th>',
    '      <th align="center" style="width:40%">Formula</th>',
    '      <th align="right" style="width:40%">Link</th>',
    "    </tr>",
    "  </thead>",
    "  <tbody>",
    "    <tr>",
    '      <td align="left"><strong>Bold</strong> &amp; <code>a|b</code> &amp; <code>c\\|d</code> &amp; <code>e\\\\|f</code></td>',
    '      <td align="center"><span class="math math-inline"><mjx-container><mjx-math data-latex="\\lVert v\\rVert">‖v‖</mjx-math></mjx-container></span></td>',
    '      <td align="right"><a class="internal-link" data-href="Note" href="Note">Alias</a></td>',
    "    </tr>",
    "  </tbody>",
    "</table>",
  ].join("\n");
  const res = convertHtmlTableToMarkdown(parseTableDom(html), DEFAULT_HTML_TO_MARKDOWN_OPTIONS);
  assert.deepEqual(res.blocking, []);
  assert.deepEqual(res.issues, []);
  assert.equal(res.markdown, [
    "| Name | Formula | Link |",
    "| :--- | :---: | ---: |",
    "| **Bold** & <code>a&#124;b</code> & `c\\|d` & <code>e&#92;&#92;&#124;f</code> | $\\lVert v\\rVert$ | [[Note\\|Alias]] |",
  ].join("\n"));
});

test("inline formatting, links, code spans, and safe inline HTML convert accurately", () => {
  const html = [
    "<table><thead><tr><th>Col 1</th><th>Col 2</th></tr></thead><tbody>",
    '<tr><td><b>bold</b><i>italic</i> <del>cut</del> <mark>hi</mark><br><small class="muted">note</small></td>',
    '<td><code>`a`</code> <a href="https://example.com/a (b)" title="My &quot;Title&quot;">site</a> [[raw]]</td></tr>',
    "</tbody></table>",
  ].join("");
  const res = convertHtmlTableToMarkdown(parseTableDom(html));
  assert.deepEqual(res.blocking, []);
  assert.equal(res.markdown, [
    "| Col 1 | Col 2 |",
    "| --- | --- |",
    '| **bold**_italic_ ~~cut~~ ==hi==<br><small class="muted">note</small> | `` `a` `` [site](<https://example.com/a (b)> "My \\"Title\\"") \\[\\[raw\\]\\] |',
  ].join("\n"));
});

test("inline code retains literal whitespace in headers, cells and captions and is verified independently of prose", () => {
  const html = [
    "<table><caption>Use <code>a  b</code></caption><tr><th><code> head </code></th></tr>",
    "<tr><td>some   prose <code>  a  b</code> and <code>tail  </code> and <code>   </code></td></tr>",
    "<tr><td><code>\tx\n  y|*z*</code> or <code></code></td></tr></table>",
  ].join("");
  const expected = convertHtmlTableToMarkdown(parseTableDom(html));
  assert.deepEqual(expected.blocking, []);
  assert.match(expected.markdown, /some prose/);
  const markdown = new MarkdownIt({ html: true });
  function verify(source) {
    const root = parseHtmlFragment(markdown.render(source));
    const table = root.childNodes.find(n => n.tagName === "TABLE");
    const rows = table.childNodes.flatMap(section => (section.childNodes ?? []).filter(n => n.tagName === "TR"));
    for (const row of rows) row.cells = row.childNodes.filter(node => ["TH", "TD"].includes(node.tagName));
    for (const row of rows) for (const cell of row.cells) cell.style = {};
    return verifyRenderedMarkdownTable({
      querySelectorAll: () => [{ rows }],
      querySelector: () => root.childNodes.find(n => n.tagName === "P"),
    }, expected);
  }
  assert.deepEqual(verify(expected.markdown), { ok: true });
  assert.match(verify(expected.markdown.replace("a  b`", "a b`")).reason, /caption/i);
  assert.match(verify(expected.markdown.replace("  a  b`", "  a b`")).reason, /inline code/i);
});

test("merged cells, rowspan=0, headerless options, captions, alignments, and attribute losses", () => {
  const html = [
    '<table id="data-tbl">',
    '  <colgroup><col style="width:30%"></colgroup>',
    '  <caption style="caption-side:top; text-align:center; font-weight:600; padding:0 0 4px">Summary</caption>',
    '  <tbody>',
    '    <tr class="hi"><td align="left" colspan="2">Span</td></tr>',
    '    <tr><td align="right" rowspan="0">Side</td><td align="right">Two</td></tr>',
    '    <tr><td align="right">Three</td></tr>',
    "  </tbody>",
    "</table>",
  ].join("\n");
  const dom = parseTableDom(html);
  const blankDefault = convertHtmlTableToMarkdown(dom, DEFAULT_HTML_TO_MARKDOWN_OPTIONS);
  assert.equal(blankDefault.markdown, [
    "**Summary**",
    "",
    "|  |  |",
    "| ---: | ---: |",
    "| Span |  |",
    "| Side | Two |",
    "|  | Three |",
  ].join("\n"));
  assert.ok(blankDefault.issues.some(i => i.kind === "headerless"));
  assert.ok(blankDefault.issues.some(i => i.kind === "merged" && i.message.includes("Row 1, Col 1")));
  assert.ok(blankDefault.issues.some(i => i.kind === "caption"));
  assert.ok(blankDefault.issues.some(i => i.kind === "structure" && i.message.includes("colgroup")));
  assert.ok(blankDefault.issues.some(i => i.kind === "alignment" && i.message.includes("Column 1")));
  assert.ok(blankDefault.issues.some(i => i.kind === "attribute" && i.message.includes("table[id]")));

  const repeatedPromoted = convertHtmlTableToMarkdown(dom, {
    mergedCells: "repeat",
    headerless: "promote-first",
    caption: "drop",
  });
  assert.equal(repeatedPromoted.markdown, [
    "| Span | Span |",
    "| ---: | ---: |",
    "| Side | Two |",
    "| Side | Three |",
  ].join("\n"));
});

test("multi-header, body th, and tfoot are audited and converted properly", () => {
  const html = [
    "<table>",
    "  <thead><tr><th>H1</th><th>H2</th></tr><tr><th>Sub1</th><th>Sub2</th></tr></thead>",
    "  <tbody><tr><th>RowH</th><td>Val</td></tr></tbody>",
    "  <tfoot><tr><td>Foot</td><td>Total</td></tr></tfoot>",
    "</table>",
  ].join("");
  const res = convertHtmlTableToMarkdown(parseTableDom(html));
  assert.equal(res.markdown, [
    "| H1 | H2 |",
    "| --- | --- |",
    "| Sub1 | Sub2 |",
    "| RowH | Val |",
    "| Foot | Total |",
  ].join("\n"));
  assert.ok(res.issues.some(i => i.kind === "multi-header"));
  assert.ok(res.issues.some(i => i.kind === "body-header"));
  assert.ok(res.issues.some(i => i.kind === "structure" && i.message.includes("<tfoot>")));
});

test("blocking constructs reject conversion before rewriting", () => {
  const nested = "<table><tr><td><table><tr><td>nested</td></tr></table></td></tr></table>";
  assert.ok(auditHtmlTable(parseTableDom(nested)).blocking[0].includes("nested <table>"));

  const blockP = "<table><tr><td><p>para</p></td></tr></table>";
  assert.ok(auditHtmlTable(parseTableDom(blockP)).blocking[0].includes("<p>"));

  const image = '<table><tr><td><img src="a.png"></td></tr></table>';
  assert.ok(auditHtmlTable(parseTableDom(image)).blocking[0].includes("<img>"));

  const mathBlock = '<table><tr><td><div class="math math-block">x</div></td></tr></table>';
  assert.ok(auditHtmlTable(parseTableDom(mathBlock)).blocking.length > 0);

  const referencedId = '<table id="tbl-1"><tr><td><span id="cell-id">ok</span></td></tr></table>';
  assert.ok(auditHtmlTable(parseTableDom(referencedId), "See [[#cell-id]] above.").blocking[0].includes("cell-id"));
  assert.deepEqual(auditHtmlTable(parseTableDom(referencedId), "No link here.").blocking, []);
});
