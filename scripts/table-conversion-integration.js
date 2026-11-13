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
  async function screenshot(name) {
    const wc = require("electron").remote.getCurrentWebContents();
    const debugger_ = wc.debugger, owned = !debugger_.isAttached();
    if (owned) debugger_.attach("1.3");
    try {
      const { data } = await debugger_.sendCommand("Page.captureScreenshot", { format: "png" });
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
      [simple.replace("| x | y |", "| $x^2$ | y |"), "not supported"],
      [simple.replace("| x | y |", "| ![[missing.png]] | y |"), "not supported"],
      [simple.replace("| x | y |", "| [^foot] | y |"), "Footnotes"],
    ]) {
      const text = simple + "\n\n" + bad;
      await source(text); selectAll(); app.commands.executeCommandById(cmd);
      await until(() => notices().includes("Table 2:") && notices().includes(reason), reason);
      await wait(60);
      assert(!modal() && editor().getValue() === text, "Invalid second table partially converted the batch");
    }
    pass("extra cells, formulas, embeds and footnotes reject the entire batch without partial writes");

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
  } finally {
    if (modal()) button("Cancel").click();
    if (leaf.view.getMode?.() === "source") editor().setValue(prior ?? original);
    await leaf.view.save?.();
    await app.vault.modify(app.vault.getFileByPath(notePath), prior ?? original);
  }
})
