(async (app, context) => {
  const { leaf, wait, report } = context;
  const checks = report.checks;
  const notePath = "Patch Table Tests/Kana.md";
  const doc = leaf.view.contentEl.ownerDocument;
  const win = doc.defaultView;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  async function until(check, label, describe) {
    for (let i = 0; i < 100; i++) {
      if (await check()) { checks.push(label); return; }
      await wait(50);
    }
    throw new Error(`Timed out: ${label}${describe ? "\n" + JSON.stringify(describe()) : ""}`);
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
    '      <td align="center"><code>su</code></td>',
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
  const codeElement = (root, label) => [...root.querySelectorAll("code")].find(el => el.textContent === label);
  const codeFont = (root, label) => {
    const code = codeElement(root, label);
    return code && code.ownerDocument.defaultView.getComputedStyle(code).fontFamily;
  };
  async function glyphFonts(element) {
    // The CSS stack can name a missing font. Ask Chromium which family actually painted these glyphs.
    const client = require("electron").remote.getCurrentWebContents().debugger;
    const attached = client.isAttached();
    if (!attached) client.attach("1.3");
    element.setAttribute("data-patches-font-test", "active");
    try {
      await client.sendCommand("DOM.enable");
      await client.sendCommand("CSS.enable");
      const { root } = await client.sendCommand("DOM.getDocument");
      const { nodeId } = await client.sendCommand("DOM.querySelector", { nodeId: root.nodeId, selector: '[data-patches-font-test="active"]' });
      const { fonts } = await client.sendCommand("CSS.getPlatformFontsForNode", { nodeId });
      return fonts.filter(font => font.glyphCount > 0).map(font => font.familyName);
    } finally {
      element.removeAttribute("data-patches-font-test");
      if (!attached) client.detach();
    }
  }
  let originalFont;
  const selectedFont = () => app.plugins.plugins.patches.settings.appearance.tableCodeFont;
  async function setTableFont(value, chooseSuggestion = false) {
    app.setting.open();
    try {
      app.setting.openTabById("patches");
      // Obsidian may transfer the settings tab to its own desktop window.
      await wait(400);
      const tab = app.setting.activeTab;
      const input = [...tab.containerEl.querySelectorAll(".setting-item")]
        .filter(el => el.querySelector(".setting-item-name")?.textContent === "Inline code font")
        .map(el => el.querySelector("input")).find(el => el?.isConnected && el.getClientRects().length);
      assert(input && tab.getSettingDefinitions().some(group => group.heading === "HTML Tables" && group.items.some(item => item.name === "Inline code font")), "Visible HTML Tables font setting missing");
      const settingsDoc = input.ownerDocument, settingsWin = settingsDoc.defaultView;
      originalFont ??= input.value;
      input.scrollIntoView({ block: "center" });
      settingsWin.focus();
      input.focus();
      assert(settingsDoc.activeElement === input, "The settings window failed to focus the font field");
      input.value = chooseSuggestion ? value.slice(0, Math.max(1, value.length - 2)) : value;
      input.dispatchEvent(new settingsWin.Event("input", { bubbles: true }));
      if (chooseSuggestion) {
        const match = () => [...settingsDoc.querySelectorAll(".suggestion-item")].find(el => el.textContent === value);
        await until(match, "a partial font name completes to the installed family");
        match().click();
      }
      input.blur();
      assert(selectedFont() === value, `Font field blur did not commit: field=${input.value}, setting=${selectedFont()}`);
    } finally { app.setting.close(); }
  }
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

    // Exercise production paste/Enter handlers, not the browser's execCommand.
    const select = (el, start, end = start) => {
      el.focus();
      const range = doc.createRange();
      if (start === undefined) { range.selectNodeContents(el); range.collapse(false); }
      else { range.setStart(el.firstChild, start); range.setEnd(el.firstChild, end); }
      doc.getSelection().removeAllRanges(); doc.getSelection().addRange(range);
    };
    const paste = (el, text) => {
      const data = new win.DataTransfer();
      data.setData("text/plain", text); data.setData("text/html", '<img src=x onerror="throw 1">');
      el.dispatchEvent(new win.ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    };
    await openFromReading();
    let editingCell = cell("si");
    select(editingCell, 1, 2);
    paste(editingCell, "A\r\nB\rC");
    assert(editingCell.innerHTML === "sA<br>B<br>C", `Multiline paste changed markup: ${editingCell.innerHTML}`);
    paste(editingCell, "<literal>&");
    assert(editingCell.innerHTML === "sA<br>B<br>C&lt;literal&gt;&amp;" && !editingCell.querySelector("img"), "Paste was not plain text at the new caret");
    checks.push("plain-text paste replaces a selection, normalizes CRLF/CR, and preserves the caret without inserting clipboard HTML");
    select(editingCell);
    key(editingCell, { key: "Enter" });
    assert(editingCell.innerHTML.endsWith("<br><br>"), "A final Enter lacks its caret placeholder");
    paste(editingCell, "终");
    assert(editingCell.innerHTML.endsWith("<br>终<br>"), "Text after Enter was inserted on the wrong line");
    const composedHtml = editingCell.innerHTML;
    const compositionEnter = new win.KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true });
    editingCell.dispatchEvent(compositionEnter);
    assert(!compositionEnter.defaultPrevented && editingCell.innerHTML === composedHtml, "IME Enter was intercepted");
    checks.push("Enter creates a usable final line and composition Enter remains untouched");
    key(win, { key: "z", ...mod });
    assert(cell("si"), "Undo did not restore the original cell after Range edits");
    key(win, { key: "z", shiftKey: true, ...mod });
    editingCell = cell("sABC<literal>&终");
    assert(editingCell, "Redo did not restore Range edits");
    const history = type => editingCell.dispatchEvent(new win.InputEvent("beforeinput", { inputType: type, bubbles: true, cancelable: true }));
    history("historyUndo");
    assert(cell("si"), "Native history request bypassed the table history");
    editingCell = cell("si"); history("historyRedo");
    assert(cell("sABC<literal>&终"), "Native redo request failed");
    checks.push("keyboard and beforeinput undo/redo preserve the table model after paste and Enter");
    const caption = grid().querySelector("caption");
    select(caption, 0, caption.firstChild.length);
    paste(caption, "Release\nnotes");
    assert(caption.innerHTML === "Release<br>notes", "Caption paste did not update safely");
    const cross = doc.createRange();
    const first = cell("shi"), last = cell("su");
    first.focus(); cross.setStart(first.firstChild, 0); cross.setEnd(last.firstChild, 1);
    doc.getSelection().removeAllRanges(); doc.getSelection().addRange(cross);
    const beforeCross = grid().innerHTML;
    paste(first, "must not replace multiple cells");
    assert(grid().innerHTML === beforeCross, "A cross-cell selection damaged the table");
    checks.push("caption paste works and cross-cell selections cannot delete table structure");
    button("Save").click();
    await until(async () => (await app.vault.read(file())) === original.replace(">si<", ">sA<br>B<br>C&lt;literal&gt;&amp;<br>终<").replace(">五十音<", ">Release<br>notes<"),
      "Range edits save exactly once without caret placeholder breaks");
    await app.vault.modify(file(), original);
    await until(() => [...leaf.view.previewMode.containerEl.querySelectorAll("td")].some(el => el.textContent === "si"), "original table restored after text-input checks");

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
    const widget = () => leaf.view.contentEl.querySelector(".cm-html-embed > table");
    const available = new Set((await win.queryLocalFonts()).map(font => font.family));
    const family = ["JetBrains Mono", "DejaVu Sans Mono", "Menlo", "Consolas", ...available].find(name => available.has(name));
    assert(family, "The desktop returned no installed fonts");
    await setTableFont(family, true);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await until(async () => widget() && (await glyphFonts(codeElement(widget(), "su"))).includes(family), `Live Preview paints HTML cell glyphs with ${family}`);
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
    const widgetConflict = original.replace(">ゆ ユ<", ">Concurrent widget edit<");
    leaf.view.editor.setValue(widgetConflict);
    button("Save").click();
    await until(() => modal() && !modal().inert && cell("ゆ ユ!") && leaf.view.editor.getValue() === widgetConflict,
      "a stale Live Preview save keeps the cell draft and the concurrent editor change");
    leaf.view.editor.setValue(original);
    button("Save").click();
    await until(() => leaf.view.editor.getValue() === original.replace(">ゆ ユ<", ">ゆ ユ!<"), "Live Preview saves through the editor");

    leaf.view.editor.setValue(original);
    const command = app.commands.findCommand("patches:edit-html-table");
    const lines = original.split("\n");
    leaf.view.editor.setCursor({ line: lines.findIndex(line => line.includes(">yi<")), ch: 10 });
    assert(command.editorCheckCallback(true, leaf.view.editor, leaf.view), "Edit command unavailable inside the table");
    command.editorCheckCallback(false, leaf.view.editor, leaf.view);
    await until(() => grid(), "Edit HTML table opens the source-backed draft");
    type(cell("yi"), "Source draft");
    const commandConflict = original.replace(">yi<", ">Concurrent source edit<");
    leaf.view.editor.setValue(commandConflict);
    button("Save").click();
    await until(() => modal() && !modal().inert && cell("Source draft") && leaf.view.editor.getValue() === commandConflict,
      "a stale command save keeps the cell draft and the concurrent editor change");
    button("Cancel").click();
    leaf.view.editor.setValue(original);
    leaf.view.editor.setCursor({ line: 2, ch: 0 });
    assert(!command.editorCheckCallback(true, leaf.view.editor, leaf.view), "Edit command available outside a table");
    checks.push("Edit HTML table is offered only with the cursor in a table");

    leaf.view.editor.setCursor({ line: 2, ch: "Intro.".length });
    app.commands.executeCommandById("patches:insert-html-table");
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
    await leaf.view.save();
    await reading();
    const mixed = "# Before\n\r\n" + table.replaceAll("\n", "\r\n").replace("す ス", "Mixed EOL").replace("</thead>\r\n", "</thead>\n") + "\r\n\r\nAfter\n";
    await app.vault.modify(file(), mixed);
    const rendered = () => leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-table-host")?.textContent ?? "";
    await until(() => rendered().includes("Mixed EOL"), "Reading View renders the mixed-ending note");
    await openFromReading();
    type(cell("Mixed EOL"), "Saved cell");
    button("Save").click();
    await until(async () => (await app.vault.read(file())) === mixed.replace("Mixed EOL", "Saved cell"),
      "Reading View cell edits preserve every other byte of a mixed-ending note");
    await until(() => rendered().includes("Saved cell"), "Reading View displays the saved mixed-ending table");
    await openFromReading();
    type(cell("Saved cell"), "Unsaved draft");
    const concurrent = mixed.replace("Mixed EOL", "Concurrent edit");
    await app.vault.modify(file(), concurrent);
    button("Save").click();
    assert(modal()?.inert, "Reading View closed the draft before the vault write finished");
    button("Save").click();
    await until(() => modal() && !modal().inert && cell("Unsaved draft") &&
      [...doc.querySelectorAll(".notice")].some(el => el.textContent.includes("The table changed while it was being edited")),
    "an unsuccessful Reading View save unlocks the draft with its edited cell intact");
    assert(await app.vault.read(file()) === concurrent, "A stale table draft overwrote the concurrent edit");
    button("Cancel").click();

    const block = "<table>\r\n<thead><tr><th>H</th></tr></thead>\r\n<tbody><tr><td>CRLF item</td></tr></tbody>\r\n</table>";
    const crlf = "Before\r\n\r\n" + block + "\r\n\r\nAfter\r\n";
    await app.vault.modify(file(), crlf);
    await until(() => rendered().includes("CRLF item"), "Reading View renders the CRLF note");
    await openFromReading();
    button("Convert to Markdown").click();
    const mdModal = () => doc.querySelector(".obsidian-patch-table-md-modal");
    await until(() => mdModal()?.querySelector(".obsidian-patch-table-md-preview table") && !mdModal().querySelector(".mod-cta").disabled,
      "Reading View verifies the CRLF table conversion");
    mdModal().querySelector(".mod-cta").click();
    const converted = crlf.replace(block, "| H |\r\n| --- |\r\n| CRLF item |");
    await until(() => leaf.view.getMode() === "source" && leaf.view.editor.getValue() === converted.replaceAll("\r\n", "\n"),
      "Reading View converts the CRLF table at the correct editor positions");
    await leaf.view.save();
    const saved = await app.vault.read(file());
    assert(saved === converted || saved === converted.replaceAll("\r\n", "\n"), "Saving the converted table changed its surroundings or mixed line endings");
    checks.push(saved === converted ? "native editor save preserves CRLF after reverse conversion" : "native editor save uses LF throughout after reverse conversion");
    leaf.view.editor.undo();
    await until(() => leaf.view.editor.getValue() === crlf.replaceAll("\r\n", "\n"), "one undo restores the CRLF table in the editor");

    const wrapped = '<div class="watchlist"><table><tr><td><code>Wrapped code</code></td></tr></table></div>';
    const fontNote = original.replace(">す ス<", "><code>HTML code</code><").replace("| a | b |", "| `Pipe code` | b |").replace("Outro.", wrapped + "\n\n`Outside code`");
    leaf.view.editor.setValue(fontNote);
    await leaf.view.save();
    await reading();
    const preview = leaf.view.previewMode.containerEl;
    await until(() => codeFont(preview, "HTML code") && codeFont(preview, "Pipe code") && codeFont(preview, "Outside code"), "Reading View renders the font comparison cells");
    const pipeFont = codeFont(preview, "Pipe code"), outsideFont = codeFont(preview, "Outside code");
    await setTableFont(family, true);
    await until(() => codeFont(preview, "HTML code")?.includes(family), "Reading View applies the selected HTML table code font", () => {
      const code = codeElement(preview, "HTML code");
      return { selected: selectedFont(), computed: codeFont(preview, "HTML code"), tableParent: code?.closest("table")?.parentElement?.className,
        monospace: code && win.getComputedStyle(code).getPropertyValue("--font-monospace"),
        configuredFont: doc.body.style.getPropertyValue("--obsidian-patch-table-code-font"),
        htmlTable: code?.closest("table")?.hasClass("obsidian-patch-html-table") };
    });
    assert(codeFont(preview, "Pipe code") === pipeFont && codeFont(preview, "Outside code") === outsideFont, "The HTML table code font leaked into other Markdown");
    await until(async () => (await glyphFonts(codeElement(preview, "HTML code"))).includes(family), `Reading View paints HTML cell glyphs with ${family}`);
    await until(async () => {
      const code = codeElement(preview, "Wrapped code");
      return code && (await glyphFonts(code)).includes(family);
    }, "Reading View also applies the chosen font to an HTML table inside a wrapper");
    await openFromReading();
    await until(async () => (await glyphFonts(codeElement(grid(), "HTML code"))).includes(family), `the visual editor paints HTML cell glyphs with ${family}`);
    button("Cancel").click();
    checks.push("The HTML font leaves Markdown pipe tables and ordinary inline code on their theme font");
  } catch (failure) {
    report.error = (failure.stack ?? String(failure)) + "\n" + JSON.stringify({ file: leaf.view.file?.path, mode: leaf.view.getMode(), hidden: doc.hidden, modal: !!modal() });
  } finally {
    doc.querySelector(".obsidian-patch-table-md-modal .modal-button-container button:not(.mod-cta)")?.click();
    for (const el of doc.querySelectorAll(".obsidian-patch-table-modal button")) if (el.textContent === "Cancel") el.click();
    if (originalFont !== undefined && selectedFont() !== originalFont) await setTableFont(originalFont);
    if (file()) {
      if (leaf.view.getMode?.() === "source") leaf.view.editor.setValue(original);
      await leaf.view.save?.();
      await app.vault.modify(file(), original);
    }
  }
})
