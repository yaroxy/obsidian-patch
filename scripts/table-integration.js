(async (app, runId) => {
  const checks = [];
  const reportPath = "Patch Table Tests/results.json";
  const notePath = "Patch Table Tests/Kana.md";
  const leaf = app.workspace.getLeavesOfType("markdown")[0] ?? app.workspace.getLeaf("tab");
  const doc = leaf.view.contentEl.ownerDocument;
  const win = doc.defaultView;
  const wait = ms => new Promise(resolve => win.setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  async function until(check, label) {
    for (let i = 0; i < 100; i++) {
      if (await check()) { checks.push(label); return; }
      await wait(50);
    }
    throw new Error(`Timed out: ${label}`);
  }
  // Canonical output, so an untouched table must round-trip byte for byte.
  const table = [
    '<table style="width:100%">',
    '  <caption style="caption-side:top; text-align:center; font-weight:600; padding:0 0 4px">五十音</caption>',
    "  <thead>",
    "    <tr>",
    '      <th align="center" style="width:20%">假名</th>',
    '      <th colspan="2" align="center" style="width:40%">い段</th>',
    '      <th align="center" style="width:40%">う段</th>',
    "    </tr>",
    "  </thead>",
    "  <tbody>",
    "    <tr>",
    '      <th rowspan="2" align="center" style="vertical-align:middle">さ行</th>',
    '      <td colspan="2" align="center">し シ</td>',
    '      <td align="center">す ス</td>',
    "    </tr>",
    "    <tr>",
    '      <td align="center">si</td>',
    '      <td align="center">shi</td>',
    '      <td align="center">su</td>',
    "    </tr>",
    "    <tr>",
    '      <th rowspan="2" align="center" style="vertical-align:middle">や行</th>',
    '      <td colspan="2" align="center" style="color:var(--text-muted)"><small>（已弃用）</small></td>',
    '      <td align="center">ゆ ユ</td>',
    "    </tr>",
    "    <tr>",
    '      <td colspan="2" align="center">yi</td>',
    '      <td align="center">yu</td>',
    "    </tr>",
    "  </tbody>",
    "</table>",
  ].join("\n");
  const original = `# Kana\n\nIntro.\n\n${table}\n\n| Markdown | table |\n| --- | --- |\n| a | b |\n\nOutro.\n`;
  const file = () => app.vault.getFileByPath(notePath);
  const modal = () => doc.querySelector(".obsidian-patch-table-modal");
  const grid = () => modal()?.querySelector(".obsidian-patch-table-grid table");
  const cell = text => Array.from(grid().querySelectorAll("th, td")).find(c => c.textContent === text);
  const button = text => Array.from(modal().querySelectorAll("button")).find(b => b.textContent === text);
  const key = (target, init) => target.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  const mod = navigator.platform.startsWith("Mac") ? { metaKey: true } : { ctrlKey: true };
  function type(el, text) {
    el.focus();
    const range = doc.createRange();
    range.selectNodeContents(el);
    doc.getSelection().removeAllRanges();
    doc.getSelection().addRange(range);
    doc.execCommand("insertText", false, text);
  }
  async function reading() {
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview", source: false } });
    await until(() => leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-table-host > .obsidian-patch-table-edit"),
      "Reading View offers Edit table on the HTML table");
  }
  async function openFromReading() {
    leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-table-edit").click();
    await until(() => grid(), "edit button opens the table editor");
  }
  let error;
  try {
    app.saveLocalStorage("obsidian-patch-table-editor-size", null);
    if (file()) await app.vault.modify(file(), original);
    else await app.vault.create(notePath, original);
    await reading();
    assert(leaf.view.previewMode.containerEl.querySelectorAll(".obsidian-patch-table-edit").length === 1, "Markdown table got an edit button");
    checks.push("Markdown pipe tables get no edit button");

    await openFromReading();
    assert(grid().caption.textContent === "五十音" && grid().tHead.rows.length === 1, "Caption or thead lost");
    assert(grid().querySelectorAll("th, td").length === 14 && cell("し シ").colSpan === 2 && cell("さ行").rowSpan === 2, "Spans lost");
    assert(cell("（已弃用）").querySelector("small") && cell("（已弃用）").getAttribute("style") === "color:var(--text-muted)", "Cell markup lost");
    checks.push("editor shows caption, header row, spans and cell markup");
    assert(modal().querySelector(":scope > .obsidian-patch-resize-grip") && modal().querySelector(":scope > .modal-button-container")
      && !modal().querySelector(".modal-content .modal-button-container"), "Table editor lacks the grip or keeps its buttons in the content");
    checks.push("the table editor has a resize grip and its buttons below the scrolling content");
    const mtime = file().stat.mtime;
    button("Save").click();
    await until(() => !modal(), "saving an untouched table closes the editor");
    await wait(200);
    assert(file().stat.mtime === mtime && (await app.vault.read(file())) === original, "Untouched table was rewritten");
    checks.push("an untouched table is not written");

    await openFromReading();
    type(cell("す ス"), "す ス!");
    button("Save").click();
    await until(async () => (await app.vault.read(file())) === original.replace(">す ス<", ">す ス!<"),
      "editing one cell changes only that cell in the note");
    // A button from before the re-render still holds the old source, which the save would refuse.
    await until(() => leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-table-host table")?.textContent.includes("す ス!"),
      "Reading View re-renders the edited table");
    await openFromReading();
    cell("si").dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, button: 0 }));
    cell("shi").dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    doc.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true }));
    assert(JSON.stringify(Array.from(grid().querySelectorAll(".is-selected"), c => c.textContent)) === '["si","shi"]', "Drag did not select si and shi");
    assert(win.getComputedStyle(cell("shi")).backgroundColor !== win.getComputedStyle(cell("su")).backgroundColor, "Selected even cell is not highlighted");
    const merge = modal().querySelector('[aria-label="Merge cells"]');
    assert(!merge.disabled && modal().querySelector('[aria-label="Split cell"]').disabled, "Merge or split state is wrong");
    checks.push("dragging selects cells and enables merging");
    merge.click();
    assert(Array.from(grid().querySelectorAll("td")).some(c => c.innerHTML === "si<br>shi" && c.colSpan === 2), "Merge failed");
    key(win, { key: "z", ...mod });
    assert(cell("si") && cell("shi"), "Undo did not restore the cells");
    key(win, { key: "z", shiftKey: true, ...mod });
    assert(Array.from(grid().querySelectorAll("td")).some(c => c.innerHTML === "si<br>shi"), "Redo did not merge again");
    checks.push("merging joins the text, and undo and redo restore each state");
    cell("yu").focus();
    key(doc.activeElement, { key: "Escape" });
    assert(modal() && !grid().contains(doc.activeElement), "Escape in a cell closed the editor");
    checks.push("Escape in a cell leaves the cell and keeps the editor open");
    button("Save").click();
    await until(async () => {
      const text = await app.vault.read(file());
      return text.includes('      <td colspan="2" align="center">si<br>shi</td>') && !/<table[\s\S]*\n[ \t]*\n[\s\S]*<\/table>/.test(text);
    }, "merged cells are saved without a blank line in the block");

    await app.vault.modify(file(), original);
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "source", source: false } });
    leaf.view.editor.setCursor({ line: 0, ch: 0 });
    await until(() => leaf.view.contentEl.querySelector(".cm-html-embed > table"), "Live Preview renders the table as a widget");
    const embed = leaf.view.contentEl.querySelector(".cm-html-embed");
    embed.querySelector("td").dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    const actions = Array.from(embed.querySelectorAll(".embed-actions > *"), el => el.getAttribute("aria-label"));
    assert(JSON.stringify(actions) === '["Edit table","Edit this block"]', `Unexpected widget actions ${JSON.stringify(actions)}`);
    checks.push("Live Preview adds Edit table beside Edit this block");
    const lpButton = embed.querySelector(".obsidian-patch-table-edit");
    lpButton.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    lpButton.click();
    await until(() => grid(), "Live Preview button opens the editor");
    assert(leaf.view.editor.getCursor().line === 0, "Pressing the button moved the cursor into the source");
    type(cell("ゆ ユ"), "ゆ ユ!");
    button("Save").click();
    await until(() => leaf.view.editor.getValue() === original.replace(">ゆ ユ<", ">ゆ ユ!<"), "Live Preview saves through the editor");

    leaf.view.editor.setValue(original);
    const command = app.commands.findCommand("obsidian-patch:edit-html-table");
    const lines = original.split("\n");
    leaf.view.editor.setCursor({ line: lines.findIndex(line => line.includes(">yi<")), ch: 10 });
    assert(command.editorCheckCallback(true, leaf.view.editor, leaf.view), "Edit command unavailable inside the table");
    leaf.view.editor.setCursor({ line: 2, ch: 0 });
    assert(!command.editorCheckCallback(true, leaf.view.editor, leaf.view), "Edit command available outside a table");
    checks.push("Edit HTML table is offered only with the cursor in a table");

    leaf.view.editor.setCursor({ line: 2, ch: "Intro.".length });
    app.commands.executeCommandById("obsidian-patch:insert-html-table");
    await until(() => grid() && doc.activeElement?.tagName === "TH", "Insert HTML table starts in the first cell");
    type(doc.activeElement, "A");
    key(doc.activeElement, { key: "Tab" });
    type(doc.activeElement, "B");
    button("Save").click();
    await until(() => leaf.view.editor.getValue().startsWith(
      '# Kana\n\nIntro.\n\n<table style="width:100%">\n  <thead>\n    <tr>\n      <th align="center" style="width:20%">A</th>\n      <th align="center" style="width:40%">B</th>'),
    "a new table is inserted with a blank line before it");
    assert(leaf.view.editor.getValue().includes("</table>\n\n<table"), "No blank line after the inserted table");
    checks.push("a new table is followed by a blank line");
    leaf.view.editor.setValue(original);
  } catch (failure) {
    error = (failure.stack ?? String(failure)) + "\n" + JSON.stringify({ file: leaf.view.file?.path, mode: leaf.view.getMode(), hidden: doc.hidden, modal: !!modal() });
  } finally {
    for (const el of doc.querySelectorAll(".obsidian-patch-table-modal button")) if (el.textContent === "Cancel") el.click();
    if (file()) await app.vault.modify(file(), original);
    await wait(100);
    const report = JSON.stringify({ runId, checks, error }, null, 2);
    const results = app.vault.getFileByPath(reportPath);
    if (results) await app.vault.modify(results, report);
    else await app.vault.create(reportPath, report);
  }
})
