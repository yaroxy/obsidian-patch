(async (app, context) => {
  const { leaf, wait, report, options, output } = context;
  const fs = require("fs"), path = require("path");
  const notePath = "Patch Table Conversion Tests/Conversion.md";
  const original = options.fixture;
  const existing = app.vault.getFileByPath(notePath), prior = existing ? await app.vault.read(existing) : undefined;
  const doc = leaf.view.contentEl.ownerDocument, win = doc.defaultView;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const pass = label => report.checks.push(label);
  const editor = () => leaf.view.editor;
  const modal = () => doc.querySelector(".obsidian-patch-table-modal");
  const grid = () => modal()?.querySelector(".obsidian-patch-table-grid table");
  const button = name => [...modal().querySelectorAll("button")].find(b => b.textContent === name || b.getAttribute("aria-label") === name);
  const confirm = () => modal().querySelector(".mod-cta").click();
  const notices = () => [...doc.querySelectorAll(".notice")].map(n => n.textContent).join("\n");
  const cmd = "patches:convert-markdown-tables";
  const reverseCmd = "patches:convert-html-tables-to-markdown";
  const mdModal = () => doc.querySelector(".obsidian-patch-table-md-modal");
  const mdButton = name => [...mdModal().querySelectorAll("button")].find(b => b.textContent === name);
  const mdConfirm = () => mdModal().querySelector(".mod-cta");
  const mdDropdown = labelText => [...mdModal().querySelectorAll(".obsidian-patch-table-md-option")]
    .find(el => el.querySelector("span")?.textContent === labelText)?.querySelector("select");
  const simple = "| A | B |\n| --- | --- |\n| x | y |";
  async function until(check, label) {
    for (let i = 0; i < 120; i++) { if (await check()) return; await wait(25); }
    throw new Error("Timed out: " + label + "\n" + notices());
  }
  async function source(text, live = false) {
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "source", source: !live } });
    editor().setValue(text);
    editor().setCursor({ line: 0, ch: 0 });
    editor().focus();
    await wait(30);
  }
  function selectAll() { editor().setSelection({ line: 0, ch: 0 }, editor().offsetToPos(editor().getValue().length)); }
  async function open() {
    app.commands.executeCommandById(cmd);
    await until(() => grid(), "conversion preview");
  }
  function type(el, text) {
    el.focus();
    const range = doc.createRange(); range.selectNodeContents(el);
    doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range);
    doc.execCommand("insertText", false, text);
  }
  const cells = table => [...table.rows].map(r => [...r.cells].map(c => c.textContent));
  function tables(html) { return [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("table")]; }
  async function nativeTables(markdown) {
    let Component = app.plugins.plugins["patches"].constructor;
    while (Object.getPrototypeOf(Component)?.prototype?.addChild) Component = Object.getPrototypeOf(Component);
    const component = new Component(), container = doc.createElement("div");
    component.load();
    try {
      await leaf.view.previewMode.constructor.render(app, markdown, container, notePath, component);
      return [...container.querySelectorAll("table")].map(t => t.cloneNode(true));
    } finally { component.unload(); }
  }
  async function screenshot(name, target) {
    const wc = require("electron").remote.getCurrentWebContents();
    const debugger_ = wc.debugger, owned = !debugger_.isAttached();
    if (owned) debugger_.attach("1.3");
    try {
      const params = { format: "png" };
      if (target) {
        const rect = target.getBoundingClientRect();
        const x = Math.max(0, Math.floor(rect.left) - 24), y = Math.max(0, Math.floor(rect.top) - 16);
        params.clip = { x, y, width: Math.min(win.innerWidth, Math.ceil(rect.right) + 24) - x,
          height: Math.min(win.innerHeight, Math.ceil(rect.bottom) + 16) - y, scale: 1 };
      }
      const { data } = await debugger_.sendCommand("Page.captureScreenshot", params);
      fs.writeFileSync(path.join(output, name + ".png"), Buffer.from(data, "base64"));
    } finally { if (owned) debugger_.detach(); }
  }
  try {
    if (!existing) await app.vault.create(notePath, original);
    await source(original);
    // Inspect the native Markdown rendering before conversion, independent of the new parser.
    const expected = (await nativeTables(original)).map(cells);
    assert(JSON.stringify(expected.map(t => t.length)) === "[8,39,19]", "Fixture rows changed");
    await source(original);
    selectAll(); await open();
    assert(editor().getValue() === original && grid().rows.length === 8, "Opening preview changed source or lost first table");
    assert(button("Previous table").disabled && !button("Next table").disabled, "Wrong initial navigation state");
    pass("batch opens in the table editor without changing the note");
    type(grid().querySelector("td"), "Edited first table");
    button("Next table").click();
    assert(grid().rows.length === 39 && modal().textContent.includes("Table 2 of 3"), "Second table missing");
    type(grid().querySelector("td"), "Edited second table");
    button("Previous table").click();
    assert(grid().querySelector("td").textContent === "Edited first table", "First draft lost");
    button("Undo").click();
    assert(grid().querySelector("td").textContent === "Very Unpleasant", "Per-table undo failed");
    button("Next table").click();
    assert(grid().querySelector("td").textContent === "Edited second table", "Second draft lost");
    button("Next table").click();
    assert(grid().rows.length === 19 && button("Next table").disabled, "Last navigation state");
    pass("navigation preserves each draft and its independent undo history");
    button("Cancel").click();
    assert(editor().getValue() === original, "Cancel wrote drafts");
    pass("cancel discards every table draft without changing source");

    selectAll(); await open();
    button("Next table").click();
    await screenshot("batch-preview");
    confirm();
    const converted = editor().getValue();
    const convertedTables = tables(converted);
    assert(convertedTables.length === 3 && JSON.stringify(convertedTables.map(cells)) === JSON.stringify(expected), "Batch lost cell content");
    assert(converted.includes("Between the first and second tables.") && converted.endsWith("After all three tables.\n"), "Surrounding text lost");
    assert(convertedTables.every(t => t.style.width === "100%" && t.tHead.rows.length === 1 && [...t.querySelectorAll("th,td")].every(c => c.getAttribute("align") === "left")), "HTML layout missing");
    assert(!converted.match(/<table[\s\S]*?<\/table>/g).some(t => /\n\s*\n/.test(t)), "Blank lines inside HTML");
    fs.writeFileSync(path.join(output, "converted.md"), converted);
    pass("all 63 data rows and 3 headers match native rendering; surrounding paragraphs and HTML layout survive");
    editor().undo(); assert(editor().getValue() === original, "Batch needed more than one undo");
    editor().redo(); assert(editor().getValue() === converted, "Batch redo failed");
    pass("one editor undo restores the whole batch and one redo reapplies it");
    await leaf.view.save();
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview" } });
    await until(() => leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-table-edit"), "converted HTML editable in Reading View");
    assert(JSON.stringify((await nativeTables(converted)).map(cells)) === JSON.stringify(expected), "Native rendering differs after conversion");
    assert([...leaf.view.previewMode.containerEl.querySelectorAll("table")].every(t => expected.some(e => JSON.stringify(cells(t)) === JSON.stringify(e))), "Visible Reading View table differs");
    pass("converted tables render in Reading View and expose the existing HTML table editor");

    await source(original);
    editor().setCursor(editor().offsetToPos(original.indexOf("| Anxious")));
    const entries = [];
    app.workspace.trigger("editor-menu", { addSeparator() {}, addItem(fn) {
      const item = { setTitle(title) { entries.push(title); return item; }, setIcon() { return item; },
        setSection() { return item; }, setDisabled() { return item; }, onClick() { return item; } };
      fn(item);
    } }, editor(), leaf.view);
    assert(entries.includes("Convert Markdown tables to HTML"), "No editor menu conversion entry");
    await open();
    assert(!button("Next table") && grid().rows.length === 39, "Cursor selected wrong table");
    type(grid().querySelector("td"), "Amazed!"); confirm();
    assert(tables(editor().getValue()).length === 1 && editor().getValue().includes("Amazed!</td>") && editor().getValue().includes("| Very Unpleasant") && editor().getValue().includes("| Community"), "Single conversion affected other tables");
    editor().undo(); assert(editor().getValue() === original, "Single undo did not restore source");
    pass("cursor and editor context menu convert only the current table, including preview edits");

    await source(simple);
    editor().transaction({ changes: [{ from: { line: 0, ch: 2 }, to: { line: 0, ch: 3 }, text: "Before" }] }, "input.type");
    const before = editor().getValue(); selectAll(); await open(); confirm();
    const batch = editor().getValue();
    editor().transaction({ changes: [{ from: { line: 0, ch: 0 }, text: "After\n\n" }] }, "input.type");
    editor().undo(); assert(editor().getValue() === batch, "Following typing merged into conversion");
    editor().undo(); assert(editor().getValue() === before, "Conversion merged with preceding typing");
    editor().undo(); assert(editor().getValue() === simple, "Preceding typing undo lost");
    pass("conversion undo is isolated from typing immediately before and after");

    const rich = '| **Bold** | *Emphasis* | Plain |\n| :--- | :---: | ---: |\n| `a\\|b` & < > | ~~deleted~~ ==highlight== <br> line | [site][ref] |\n| [[Conversion\\|Alias]] | <small>small</small> | escaped \\| pipe |\n\n[ref]: https://example.com "Title"\n';
    await source(rich); selectAll(); await open();
    assert(grid().querySelector("strong") && grid().querySelector("em") && grid().querySelector("code") && grid().querySelector("mark") && grid().querySelector("del") && grid().querySelector("small"), "Inline formats lost in preview");
    confirm();
    const richTable = tables(editor().getValue())[0];
    assert(JSON.stringify([...richTable.rows[1].cells].map(c => c.getAttribute("align"))) === '["left","center","right"]', "Alignment lost");
    assert(richTable.querySelector('a[href="https://example.com"]').title === "Title" && richTable.querySelector('a.internal-link[data-href="Conversion"]').textContent === "Alias", "Links lost");
    assert(editor().getValue().endsWith('[ref]: https://example.com "Title"\n'), "Reference definition changed");
    pass("alignment, escaped pipes, formatting, inline HTML, wiki aliases and reference links survive");

    const math = options.mathFixture;
    const formulas = (table, selector, read) => [...table.rows].map(row =>
      [...row.cells].map(cell => [...cell.querySelectorAll(selector)].map(read)));
    const renderedMath = table => formulas(table, "mjx-math[data-latex]", el => el.getAttribute("data-latex"));
    const sourceMath = table => formulas(table, "span.math.math-inline", el => el.textContent);
    const expectedMath = renderedMath((await nativeTables(math))[0]);
    const formulaCount = expectedMath.flat(2).length;
    assert(formulaCount === 10, `Markdown table rendered ${formulaCount} of 10 formulas`);
    await source(math); selectAll(); await open();
    assert(JSON.stringify(sourceMath(grid())) === JSON.stringify(expectedMath), "Formula source lost in the table editor");
    assert(grid().querySelector("strong") && grid().querySelector("code")?.textContent === "norm", "Adjacent formatting lost");
    type(grid().caption, "Vector operations");
    confirm();
    const mathHtml = editor().getValue();
    assert(JSON.stringify(sourceMath(tables(mathHtml)[0])) === JSON.stringify(expectedMath), "Saved HTML changed the TeX or its cell");
    assert(!mathHtml.includes("mjx-") && tables(mathHtml)[0].caption?.textContent === "Vector operations",
      "Saved HTML contains generated math markup or lost the caption");
    editor().undo(); assert(editor().getValue() === math, "Math table conversion needed more than one undo");
    editor().redo(); assert(editor().getValue() === mathHtml, "Math table conversion redo failed");
    await leaf.view.save();
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview" } });
    await until(() => leaf.view.previewMode.containerEl.querySelectorAll("table mjx-math").length === formulaCount, "inline math in Reading View");
    const mathTable = leaf.view.previewMode.containerEl.querySelector("table");
    assert(JSON.stringify(renderedMath(mathTable)) === JSON.stringify(expectedMath), "Reading View changed the formulas");
    await doc.fonts.ready;
    await screenshot("inline-math-table", mathTable);
    await source("Intro\n\n" + mathHtml, true);
    await until(() => leaf.view.contentEl.querySelector(".cm-html-embed table"), "converted math table in Live Preview");
    await until(() => leaf.view.contentEl.querySelectorAll(".cm-html-embed table mjx-math").length === formulaCount, "inline math in Live Preview");
    assert(JSON.stringify(renderedMath(leaf.view.contentEl.querySelector(".cm-html-embed table"))) === JSON.stringify(expectedMath), "Live Preview changed the formulas");
    pass("inline formulas in headers and body cells survive conversion, caption editing, undo, Reading View and Live Preview");

    const escapedTex = String.raw`a < b \& c \| d`;
    const escapedMath = simple.replace("| x | y |", () => `| **$${escapedTex}$** | \`$literal$\` |`);
    await source(escapedMath); await open(); confirm();
    const escapedHtml = editor().getValue();
    const escapedTable = tables(escapedHtml)[0];
    assert(escapedTable.querySelector("strong .math")?.textContent === escapedTex && escapedTable.querySelector("code")?.textContent === "$literal$",
      "Escaping or adjacent inline code changed");
    assert(escapedHtml.includes("&lt;") && escapedHtml.includes("&amp;") && renderedMath((await nativeTables(escapedHtml))[0]).flat(2)[0] === escapedTex,
      "Escaped HTML did not round-trip to the original TeX");
    pass("inline TeX preserves angle brackets, ampersands and escaped pipes alongside literal dollar signs in code");

    for (const text of ["A | B | C\n- | - | -\nx | y\nonly one cell", "| Header |\n| - |", "# Before\n" + simple + "\n# After", simple + "\n    | code | row |"]) {
      await source(text); selectAll(); await open(); confirm();
      assert(JSON.stringify((await nativeTables(editor().getValue())).map(cells)) === JSON.stringify((await nativeTables(text)).map(cells)), "Boundary table lost cells");
      if (text.startsWith("# Before")) assert(editor().getValue().startsWith("# Before\n\n<table") && editor().getValue().endsWith("</table>\n\n# After"), "Missing block separation");
      if (text.includes("only one cell")) assert(editor().getValue().endsWith("</table>\n\nonly one cell"), "Following paragraph swallowed");
      if (text.includes("| code |")) assert(editor().getValue().endsWith("</table>\n\n    | code | row |"), "Following code swallowed");
    }
    pass("optional pipes, one-hyphen separators, short rows, header-only tables and adjacent headings render correctly");

    await source(simple + "\n\n" + simple);
    editor().setSelection({ line: 0, ch: 3 }, editor().offsetToPos(editor().getValue().length));
    app.commands.executeCommandById(cmd);
    await until(() => notices().includes("Select complete Markdown tables"), "partial selection notice");
    assert(!modal() && editor().getValue() === simple + "\n\n" + simple, "Partial selection wrote content");
    pass("partial table selections are explained and leave source intact");

    for (const [bad, reason] of [
      [simple + "\n| extra | cells | rejected |", "more cells"],
      [simple.replace("| x | y |", "| ![[missing.png]] | y |"), "not supported"],
      [simple.replace("| x | y |", "| [^foot] | y |"), "Footnotes"],
    ]) {
      const text = simple + "\n\n" + bad;
      await source(text); selectAll(); app.commands.executeCommandById(cmd);
      await until(() => notices().includes("Table 2:") && notices().includes(reason), reason);
      await wait(60);
      assert(!modal() && editor().getValue() === text, "Invalid second table partially converted the batch");
    }
    pass("extra cells, embeds and footnotes reject the entire batch without partial writes");

    for (const text of ["```sql\n" + simple + "\n```", "> [!note]\n" + simple.split("\n").map(l => "> " + l).join("\n"), "Paragraph\n" + simple]) {
      await source(text); selectAll(); app.commands.executeCommandById(cmd);
      await until(() => notices().includes("standalone Markdown table"), "excluded source notice");
      assert(!modal() && editor().getValue() === text, "Converted a code block or Callout");
    }
    pass("code examples and Callout tables are left untouched");

    await source(simple); selectAll(); await open();
    editor().replaceRange("Concurrent edit\n\n", { line: 0, ch: 0 });
    const changed = editor().getValue(); confirm();
    assert(modal() && editor().getValue() === changed, "Stale preview overwrote source");
    button("Cancel").click();
    pass("a stale preview cannot overwrite concurrent edits and retains its drafts");

    await source("Intro\n\n" + simple, true);
    await until(() => leaf.view.contentEl.querySelector(".cm-table-widget td"), "native Live Preview table");
    const nativeCell = leaf.view.contentEl.querySelector(".cm-table-widget td .table-cell-wrapper");
    const rect = nativeCell.getBoundingClientRect();
    const debugger_ = require("electron").remote.getCurrentWebContents().debugger, owned = !debugger_.isAttached();
    if (owned) debugger_.attach("1.3");
    try {
      for (const type of ["mousePressed", "mouseReleased"]) await debugger_.sendCommand("Input.dispatchMouseEvent", {
        type, button: "left", x: rect.x + 10, y: rect.y + 10, clickCount: 1,
      });
    } finally { if (owned) debugger_.detach(); }
    await wait(50);
    assert(doc.activeElement?.closest(".cm-table-widget"), "Native table cell was not focused");
    const liveBefore = editor().getValue(); // Obsidian normalizes pipe spacing when a cell receives focus.
    await open();
    assert(editor().getValue() === liveBefore, "Preview changed the focused table");
    pass("conversion opens from a focused native Live Preview table cell");
    confirm();
    editor().setCursor({ line: 0, ch: 0 });
    await until(() => leaf.view.contentEl.querySelector(".cm-html-embed table"), "converted table in Live Preview");
    assert(leaf.view.contentEl.querySelector(".cm-html-embed table").textContent.includes("x"), "Live Preview lost cells");
    editor().undo(); assert(editor().getValue() === liveBefore, "Live Preview undo failed: " + editor().getValue());
    pass("Live Preview supports conversion, HTML rendering and one-step undo");

    // Reverse conversion: HTML table -> Markdown table
    const openReverse = async () => {
      app.commands.executeCommandById(reverseCmd);
      await until(() => mdModal()?.querySelector(".obsidian-patch-table-md-preview table") && !mdConfirm().disabled,
        "reverse conversion modal verifies output");
    };

    await source(rich); selectAll(); await open(); confirm();
    const richHtml = editor().getValue().replace("<code>a\\|b</code>", "<code>a\\|b</code> &amp; <code>c|d</code>");
    await source(richHtml); selectAll(); await openReverse();
    assert(mdModal().querySelector(".obsidian-patch-table-md-status.is-ok"),
      "Rich forward-converted table should round-trip without warnings: " +
      mdModal().querySelector(".obsidian-patch-table-md-status").textContent + " " +
      mdModal().querySelector(".obsidian-patch-table-md-issues").textContent + " " +
      [...tables(richHtml)[0].querySelectorAll("mark,a")].map(el => el.outerHTML).join(" "));
    const richPreviewTable = mdModal().querySelector(".obsidian-patch-table-md-preview table");
    assert(JSON.stringify([...richPreviewTable.rows[1].cells].map(c => c.getAttribute("align"))) === '["left","center","right"]',
      "Reverse preview lost column alignment");
    mdConfirm().click();
    await until(() => !mdModal(), "reverse modal closes after confirm");
    const richMd = editor().getValue();
    assert(!richMd.includes("<table") && richMd.includes("`a\\|b`") && richMd.includes("<code>c&#124;d</code>") && richMd.includes("[[Conversion\\|Alias]]"),
      "Reverse Markdown lost pipe code or wiki alias: " + richMd);
    assert(richMd.endsWith('[ref]: https://example.com "Title"\n'), "Reverse conversion disturbed reference link definitions");
    assert(JSON.stringify((await nativeTables(richMd)).map(cells)) === JSON.stringify((await nativeTables(richHtml)).map(cells)),
      "Round-tripped rich Markdown table differs under native renderer");
    editor().undo(); assert(editor().getValue() === richHtml, "Reverse conversion needed more than one undo");
    editor().redo(); assert(editor().getValue() === richMd, "Reverse conversion redo failed");
    pass("lossless HTML tables round-trip back to Markdown with formatting, links, alignment and one-step undo");

    const spacedCodeHtml = "<table><caption>Copy <code>cap  tion</code></caption><tr><th><code> head </code></th></tr>"
      + "<tr><td>Use <code>a  b</code> or <code> left  | right </code>.</td></tr></table>";
    await source(spacedCodeHtml); selectAll(); await openReverse();
    const spacedPreview = mdModal().querySelector(".obsidian-patch-table-md-preview");
    const codeText = root => [...root.querySelectorAll("code")].map(code => code.textContent);
    const spacedValues = [" head ", "a  b", " left  | right "];
    assert(JSON.stringify(codeText(spacedPreview)) === JSON.stringify(["cap  tion", ...spacedValues]),
      "Reverse preview altered literal code whitespace");
    mdConfirm().click();
    await until(() => !mdModal(), "reverse code modal closes");
    assert(JSON.stringify(codeText((await nativeTables(editor().getValue()))[0])) === JSON.stringify(spacedValues),
      "Saved Markdown altered literal code whitespace");
    editor().undo(); assert(editor().getValue() === spacedCodeHtml, "Reverse code conversion undo failed");
    pass("reverse conversion preserves literal code whitespace in captions, headers and cells");

    await source(math); selectAll(); await open(); confirm();
    const mathWithPipeHtml = editor().getValue().replace(">u</span>", '>u</span> <span class="math math-inline">a | b</span>');
    await source(mathWithPipeHtml); selectAll(); await openReverse();
    mdConfirm().click();
    await until(() => !mdModal(), "reverse math modal closes");
    const mathBackMd = editor().getValue();
    assert(mathBackMd.includes("\\vert"), "Unescaped math pipe was not rewritten to \\vert");
    const expectedBackMath = renderedMath((await nativeTables(mathWithPipeHtml))[0])
      .map(row => row.map(cell => cell.map(tex => (tex === "a | b" ? "a \\vert b" : tex))));
    assert(JSON.stringify(renderedMath((await nativeTables(mathBackMd))[0])) === JSON.stringify(expectedBackMath),
      "Reverse math conversion changed rendered TeX");
    editor().undo(); assert(editor().getValue() === mathWithPipeHtml, "Reverse math conversion undo failed");
    pass("inline LaTeX formulas and math pipes survive HTML-to-Markdown conversion");

    const lossyHtml = [
      '<table style="width:100%">',
      '  <caption style="caption-side:top; text-align:center; font-weight:600; padding:0 0 4px">Plan</caption>',
      "  <tbody>",
      '    <tr><td align="left" colspan="2">Merged</td></tr>',
      '    <tr><td align="right">One</td><td align="right">Two</td></tr>',
      "  </tbody>",
      "</table>",
    ].join("\n");
    await source(lossyHtml); selectAll(); await openReverse();
    assert(mdModal().querySelector(".obsidian-patch-table-md-status.is-warning"), "Lossy HTML table should show structure warning");
    assert(mdModal().querySelector(".obsidian-patch-table-md-source").textContent.startsWith("**Plan**\n\n|  |  |"),
      "Default reverse conversion should add empty header row and bold caption");
    await screenshot("html-to-markdown-modal", mdModal());
    const selectOpt = (labelText, value) => {
      const sel = mdDropdown(labelText);
      sel.value = value;
      sel.dispatchEvent(new win.Event("change", { bubbles: true }));
    };
    selectOpt("Merged cells", "repeat");
    selectOpt("Headerless table", "promote-first");
    selectOpt("Caption", "drop");
    await until(() => !mdConfirm().disabled && mdModal().querySelector(".obsidian-patch-table-md-source").textContent.startsWith("| Merged | Merged |"),
      "toggling reverse conversion options updates Markdown source and re-verifies");
    mdConfirm().click();
    await until(() => !mdModal(), "lossy reverse modal closes");
    assert(editor().getValue() === "| Merged | Merged |\n| :--- | :--- |\n| One | Two |",
      `Lossy options produced unexpected Markdown: ${editor().getValue()}`);
    pass("lossy HTML tables expose merged-cell, headerless and caption options with verified previews");

    const htmlTable1 = "<table>\n  <tbody>\n    <tr><th>H</th></tr>\n    <tr><td>1</td></tr>\n  </tbody>\n</table>";
    const htmlTable2 = "<table>\n  <tbody>\n    <tr><th>H</th></tr>\n    <tr><td>2</td></tr>\n  </tbody>\n</table>";
    for (const [bad, reason] of [
      ["<table><tr><td><table><tr><td>nested</td></tr></table></td></tr></table>", "nested <table>"],
      ["<table><tr><td><p>block</p></td></tr></table>", "<p>"],
      ['<table><tr><td><img src="x.png"></td></tr></table>', "<img>"],
      ['<table id="ref-id"><tr><td>ok</td></tr></table>\n\n[[#ref-id]]', "ref-id"],
    ]) {
      const mixed = htmlTable1 + "\n\n" + bad;
      await source(mixed); selectAll();
      app.commands.executeCommandById(reverseCmd);
      await until(() => notices().includes(reason), reason);
      await wait(60);
      assert(!mdModal() && editor().getValue() === mixed, `Blocking case wrote changes: ${reason}`);
    }
    const twoHtml = htmlTable1 + "\n\n" + htmlTable2;
    await source(twoHtml);
    editor().setSelection({ line: 0, ch: 3 }, editor().offsetToPos(twoHtml.length));
    app.commands.executeCommandById(reverseCmd);
    await until(() => notices().includes("Select complete HTML tables"), "partial HTML selection notice");
    assert(!mdModal() && editor().getValue() === twoHtml, "Partial HTML selection changed source");
    for (const excluded of ["```html\n" + htmlTable1 + "\n```", "<!--\n" + htmlTable1 + "\n-->", "> [!note]\n> " + htmlTable1.split("\n").join("\n> ")]) {
      await source(excluded);
      editor().setCursor(editor().offsetToPos(excluded.indexOf("<td")));
      assert(!app.commands.commands["patches:edit-html-table"].editorCheckCallback(true, editor(), leaf.view),
        "Edit HTML table should ignore excluded tables");
      app.commands.executeCommandById(reverseCmd);
      await until(() => notices().includes("standalone HTML table"), "excluded HTML table notice");
      assert(!mdModal() && editor().getValue() === excluded, "Excluded HTML table was converted");
    }
    pass("blocking HTML constructs, partial selections, and excluded code/comment/callout tables leave source untouched");

    const grouped = [
      "<table><thead><tr><th>Left</th><th>Right</th></tr></thead>",
      '<tbody><tr><td rowspan="0">A</td><td>B</td></tr><tr><td>C</td></tr></tbody>',
      '<tbody><tr><td rowspan="8">D</td><td>E</td></tr></tbody>',
      "<tfoot><tr><td>F</td><td>G</td></tr></tfoot></table>",
    ].join("\n");
    const expectedGrouped = "| Left | Right |\n| --- | --- |\n| A | B |\n|  | C |\n| D | E |\n| F | G |";
    for (const viaEditor of [false, true]) {
      await source(grouped);
      if (viaEditor) {
        app.commands.executeCommandById("patches:edit-html-table");
        await until(() => grid(), "grouped table draft opens");
        assert(grid().rows[1].cells[0].rowSpan === 2 && grid().rows[3].cells[0].rowSpan === 1,
          "The editor placed a span outside its row group");
        button("Convert to Markdown").click();
      } else {
        app.commands.executeCommandById(reverseCmd);
      }
      await until(() => mdConfirm() && !mdConfirm().disabled, "grouped table passes native verification");
      assert(mdModal().querySelector(".obsidian-patch-table-md-source").textContent === expectedGrouped, "A cell changed columns in the preview");
      mdConfirm().click();
      await until(() => !mdModal() && !modal(), "grouped table conversion closes");
      assert(editor().getValue() === expectedGrouped, "A cell changed columns in the saved table");
      editor().undo();
      assert(editor().getValue() === grouped, "Undo did not restore the row-group source");
    }
    pass("direct and draft conversion keep zero and positive row spans within their row groups, with identical columns and undo");

    const wide = '<table><tr><td colspan="1000">Wide</td></tr>' + "<tr><td>One</td></tr>".repeat(50) + "</table>";
    for (const id of ["patches:edit-html-table", reverseCmd]) {
      await source(wide);
      const priorNotices = new Set(doc.querySelectorAll(".notice"));
      app.commands.executeCommandById(id);
      await until(() => [...doc.querySelectorAll(".notice")].some(n => !priorNotices.has(n) && n.textContent.includes("expanded grid slots")),
        "oversized layout is rejected");
      assert(!grid() && !mdModal() && editor().getValue() === wide, "Oversized layout opened a draft or changed the note");
    }
    pass("editing and converting an oversized expanded table show a notice and preserve the source");

    const linkedTable = "Intro\n\n" + htmlTable1.replace("<table>", '<table id="rates">').replace("<th>H</th>", "<th>Rates</th>");
    const newReference = linkedTable + "\n\n[Jump](#rates)";
    for (const mode of ["source", "live", "reading"]) {
      await source(linkedTable, mode === "live");
      if (mode === "source") {
        editor().setCursor({ line: 2, ch: 1 });
        app.commands.executeCommandById("patches:edit-html-table");
      } else if (mode === "live") {
        const widget = () => leaf.view.contentEl.querySelector(".cm-html-embed > table");
        await until(() => widget()?.querySelector("th")?.textContent === "Rates", "Live Preview renders the table with the reference target");
        widget().dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
        widget().parentElement.querySelector(".obsidian-patch-table-edit").click();
      } else {
        await leaf.view.save();
        await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview" } });
        const host = () => leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-table-host");
        await until(() => host()?.querySelector("th")?.textContent === "Rates" && host()?.querySelector(".obsidian-patch-table-edit"),
          "Reading View renders the table with the reference target");
        host().querySelector(".obsidian-patch-table-edit").click();
      }
      await until(() => grid(), mode + " opens the table editor");
      type(grid().querySelector("td"), "Pending draft");
      button("Convert to Markdown").click();
      await until(() => mdConfirm() && !mdConfirm().disabled, mode + " verifies the draft conversion");
      const file = app.vault.getFileByPath(notePath);
      if (mode === "reading") await app.vault.modify(file, newReference);
      else editor().setValue(newReference);
      const previousNotices = new Set(doc.querySelectorAll(".notice"));
      mdConfirm().click();
      await until(() => mdConfirm() && !mdConfirm().disabled && [...doc.querySelectorAll(".notice")].some(
        notice => !previousNotices.has(notice) && notice.textContent.includes("changed while it was being edited")),
      mode + " rejects a conversion after the note gained a reference to the table ID");
      assert((mode === "reading" ? await app.vault.read(file) : editor().getValue()) === newReference,
        mode + " removed a newly referenced ID");
      mdButton("Cancel").click();
      assert(grid()?.querySelector("td")?.textContent === "Pending draft", mode + " lost the edited cell draft");
      button("Cancel").click();
    }
    pass("all three table-editor routes retain drafts and newly added links to a table ID after a concurrent note edit");

    const draftHtml = htmlTable1.replace("<th>H</th>", "<th><code>H&#10;  1</code></th>");
    await source(draftHtml);
    editor().setCursor({ line: 1, ch: 2 });
    app.commands.executeCommandById("patches:edit-html-table");
    await until(() => grid(), "TableEditor opens for reverse conversion");
    type(grid().querySelector("td"), "Drafted");
    button("Convert to Markdown").click();
    await until(() => mdModal()?.querySelector(".obsidian-patch-table-md-preview table") && !mdConfirm().disabled,
      "Convert to Markdown previews the edited TableEditor draft");
    assert(mdModal().querySelector(".obsidian-patch-table-md-source").textContent.includes("Drafted"),
      "Reverse conversion did not include TableEditor edits");
    assert(mdModal().querySelector(".obsidian-patch-table-md-preview th code")?.textContent === "H\n  1",
      "Reverse conversion normalized a literal line break while serializing the edit draft");
    mdButton("Cancel").click();
    await until(() => !mdModal(), "canceling reverse modal leaves TableEditor open");
    assert(modal() && grid().querySelector("td").textContent === "Drafted", "Canceling reverse conversion lost TableEditor draft");
    button("Convert to Markdown").click();
    await until(() => mdModal()?.querySelector(".obsidian-patch-table-md-preview table") && !mdConfirm().disabled,
      "reopening Convert to Markdown from TableEditor");
    mdConfirm().click();
    await until(() => !mdModal() && !modal(), "confirming conversion closes both modals");
    assert(editor().getValue().includes("| <code>H&#10;  1</code> |\n| --- |\n| Drafted |"), "TableEditor reverse conversion did not write edited Markdown");
    editor().undo();
    assert(editor().getValue() === draftHtml, "TableEditor reverse conversion undo failed");
    pass("TableEditor can cancel back to drafts or convert edited HTML tables to Markdown in one undo step");

    await source(htmlTable1);
    await leaf.view.save();
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview" } });
    await until(() => {
      const host = leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-table-host");
      const table = host?.querySelector("table");
      return host?.querySelector(".obsidian-patch-table-edit") && table && JSON.stringify(cells(table)) === '[["H"],["1"]]';
    }, "Reading View offers Edit table for reverse conversion");
    const host = leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-table-host");
    host.querySelector(".obsidian-patch-table-edit").click();
    await until(() => grid(), "Reading View TableEditor opens");
    button("Convert to Markdown").click();
    await until(() => mdModal()?.querySelector(".obsidian-patch-table-md-preview table") && !mdConfirm().disabled,
      "Reading View Convert to Markdown verifies output");
    // A rerender can detach the source section while the confirmation is open.
    const marker = doc.createComment("original table position");
    host.replaceWith(marker);
    try {
      mdConfirm().click();
      await until(() => notices().includes("Open the source note") && mdConfirm() && !mdConfirm().disabled, "missing owner leaves the draft available");
      assert(modal() && await app.vault.read(app.vault.getFileByPath(notePath)) === htmlTable1, "Missing owner closed the draft or changed the saved note");
    } finally { marker.replaceWith(host); }
    pass("a detached Reading View table keeps both conversion drafts open and the saved file untouched");
    mdConfirm().click();
    await until(() => !mdModal() && !modal() && leaf.view.getMode() === "source", "Reading View conversion switches to edit mode");
    await until(() => editor().getValue() === "| H |\n| --- |\n| 1 |", "Reading View wrote converted Markdown table");
    editor().undo();
    await until(() => editor().getValue() === htmlTable1, "one undo after Reading View conversion restores the original HTML table");
    pass("Reading View conversion switches cleanly to edit mode and supports one-step undo");
  } finally {
    if (mdModal()) mdButton("Cancel").click();
    if (modal()) button("Cancel").click();
    if (leaf.view.getMode?.() === "source") editor().setValue(prior ?? original);
    await leaf.view.save?.();
    await app.vault.modify(app.vault.getFileByPath(notePath), prior ?? original);
  }
})
