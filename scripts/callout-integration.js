(async (app, context) => {
  const { leaf, wait, report } = context;
  const checks = report.checks;
  const notePath = "Patch Callout Tests/Callouts.md";
  const doc = leaf.view.contentEl.ownerDocument;
  const win = doc.defaultView;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  async function until(check, label) {
    for (let i = 0; i < 100; i++) {
      if (await check()) { checks.push(label); return; }
      await wait(50);
    }
    throw new Error(`Timed out: ${label}`);
  }
  const lines = (...rows) => rows.join("\n");
  const original = lines(
    "Paragraph one.",
    "Paragraph two.",
    "",
    "> [!info] Title",
    ">body line",
    "> > [!tip]",
    "> > nested",
    "",
    "End",
  );
  const file = () => app.vault.getFileByPath(notePath);
  // A closing modal can linger in the DOM, so the newest one is the one in use.
  const modal = () => Array.from(doc.querySelectorAll(".obsidian-patch-callout-modal")).pop();
  const button = text => Array.from(modal().querySelectorAll("button")).find(b => b.textContent === text);
  const chip = name => modal().querySelector(`.obsidian-patch-callout-chip[aria-label="${name}"]`);
  const field = name => Array.from(modal().querySelectorAll(".obsidian-patch-callout-field"))
    .find(f => f.querySelector(".obsidian-patch-callout-label")?.textContent === name)?.querySelector("input, select");
  const other = () => modal().querySelector(".obsidian-patch-callout-other");
  const sizeKey = "obsidian-patch-callout-editor-size";
  const input = (el, value) => { el.value = value; el.dispatchEvent(new win.Event("input", { bubbles: true })); };
  const editor = () => leaf.view.editor;
  async function source() {
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "source", source: true } });
    await wait(150);
  }
  const contents = window => window === win ? require("electron").remote.getCurrentWebContents() : window.electron.remote.getCurrentWebContents();
  const capture = async (name, window, box) => {
    await wait(180);
    const x = Math.max(0, Math.floor(box.left - 8)), y = Math.max(0, Math.floor(box.top - 8));
    const width = Math.ceil(Math.min(window.innerWidth, box.right + 8) - x);
    const height = Math.ceil(Math.min(window.innerHeight, box.bottom + 8) - y);
    const image = await contents(window).capturePage({ x, y, width, height });
    require("fs").writeFileSync(require("path").join(context.output, name + ".png"), image.toPNG());
  };
  const githubReport = () => [...doc.querySelectorAll(".obsidian-patch-callout-report")].at(-1);
  const reportRows = () => [...githubReport().querySelectorAll(".obsidian-patch-callout-report-row")];
  const toggle = row => row.querySelector("[aria-expanded]");
  const reasons = row => doc.getElementById(toggle(row).getAttribute("aria-controls"));
  async function checkReportLayout(status) {
    const sample = "---\ngithub: true\n---\n\n" + original;
    editor().setValue(sample);
    app.commands.executeCommandById("patches:check-callouts-github");
    await until(() => githubReport()?.querySelector('[role="status"]').textContent === "2 callouts checked · 0 alerts · 2 plain blockquotes",
      "the command shows the count of alerts and plain blockquotes");
    const [first, nested] = reportRows();
    assert(first.innerText.includes("Line 8") && nested.innerText.includes("Line 10"), "Rows should show the note's line numbers");
    assert(toggle(first).textContent === "Details (3)" && toggle(nested).textContent === "Details (1)", "Incorrect number of reasons");
    assert([first, nested].every(row => reasons(row).hidden && toggle(row).getAttribute("aria-expanded") === "false"), "Reasons should start collapsed");
    await capture("callout-report", win, githubReport().getBoundingClientRect());
    toggle(first).focus();
    contents(win).sendInputEvent({ type: "keyDown", keyCode: "Space" });
    contents(win).sendInputEvent({ type: "keyUp", keyCode: "Space" });
    await until(() => !reasons(first).hidden && toggle(first).getAttribute("aria-expanded") === "true" && reasons(nested).hidden,
      "Space expands only the chosen callout and exposes its three reasons");
    assert(reasons(first).children.length === 3 && reasons(first).innerText.includes('GitHub has no "info" alert'), "The complete reasons are missing");
    toggle(first).click();
    assert(reasons(first).hidden, "Details did not collapse again");
    nested.querySelector("button").click();
    await until(() => editor().getCursor().line === 9 && editor().getValue() === sample, "Jump moves the cursor to the nested header without modifying the note");

    const header = "[!info] " + "LongTitle".repeat(50);
    const blocks = Array.from({ length: 32 }, (_, index) => `> ${index === 0 ? "[!CAUTION]" : header}\n> Callout ${index + 1}`);
    const longNote = "---\ngithub: true\n---\n\n" + blocks.join("\n\n");
    editor().setValue(longNote);
    app.commands.executeCommandById("patches:check-callouts-github");
    await until(() => githubReport() && reportRows().length === 32, "a long report lists all 32 callouts in note order");
    const panel = githubReport(), list = panel.querySelector(".obsidian-patch-report-list"), summary = panel.querySelector('[role="status"]');
    const [advisory] = reportRows(), last = reportRows().at(-1);
    assert(advisory.querySelector(".obsidian-patch-callout-report-outcome").textContent === "Alert" && reasons(advisory).textContent.includes("in red"),
      "A display difference should keep the Alert outcome and its explanation");
    const wc = contents(win), originalZoom = wc.getZoomFactor(), container = panel.parentElement;
    const reachable = button => {
      const box = button.getBoundingClientRect();
      return button.contains(doc.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    };
    report.calloutReportLayout = [];
    try {
      for (const zoom of [1, 1.5, 2]) {
        wc.setZoomFactor(zoom);
        await wait(180);
        const summaryTop = summary.getBoundingClientRect().top;
        list.scrollTop = list.scrollHeight;
        const box = panel.getBoundingClientRect(), bottom = win.innerHeight - box.bottom;
        report.calloutReportLayout.push({ zoom, width: box.width, top: box.top, bottom });
        assert(box.top >= 23 && bottom >= 23 && Math.abs(box.top - bottom) < 2, `Off-center panel at ${zoom}x`);
        assert(box.left >= 15 && win.innerWidth - box.right >= 15 && Math.abs(box.width - Math.min(760, win.innerWidth - 32)) < 2, `Unexpected width at ${zoom}x`);
        assert(list.scrollTop > 0 && summary.getBoundingClientRect().top === summaryTop && [...last.querySelectorAll("button")].every(reachable),
          `The summary or the final controls are out of reach at ${zoom}x`);
      }
      container.style.width = "340px";
      toggle(last).click();
      list.scrollTop = list.scrollHeight;
      const marker = last.querySelector(".obsidian-patch-callout-report-marker");
      assert(marker.scrollWidth > marker.clientWidth && marker.title === header, "A long header should retain its full text while truncated");
      assert(list.scrollWidth <= list.clientWidth + 1 && panel.scrollWidth <= panel.clientWidth + 1 && [...last.querySelectorAll("button")].every(reachable),
        "The narrow report should wrap its controls and keep the reasons inside the list");
      checks.push("the summary and final actions stay accessible with long titles, expanded details, 100–200% zoom and a 340 px container");
    } finally {
      container.style.removeProperty("width");
      wc.setZoomFactor(originalZoom);
      panel.querySelector(".modal-header-button")?.click();
    }

    await leaf.view.save();
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview" } });
    const preview = leaf.view.previewMode.containerEl;
    const visible = text => [...preview.querySelectorAll(".callout-content")].some(el => {
      const box = el.getBoundingClientRect(), viewport = preview.getBoundingClientRect();
      return el.textContent.trim() === text && box.height > 0 && box.top < viewport.bottom && box.bottom > viewport.top;
    });
    leaf.view.setEphemeralState({ line: 4 });
    await until(() => visible("Callout 1") && !visible("Callout 21") && status.textContent === "GitHub: 31/32 callouts not alerts",
      "Reading view has an opted-in note with a scrollable set of callouts");
    status.click();
    await until(() => githubReport() && reportRows().length === 32, "the status bar opens the same report in Reading view");
    reportRows()[20].querySelector("button").click();
    await until(() => leaf.view.getMode() === "preview" && visible("Callout 21"),
      "Jump scrolls to the selected callout in Reading view");
    const replacement = "> [!TIP]\n> An update from another editor.";
    await app.vault.modify(file(), "---\ngithub: true\n---\n\n" + replacement);
    await until(() => status.textContent === "GitHub: callouts OK", "the Reading count follows an external save");
    await app.vault.modify(file(), replacement);
    await until(() => status.style.display === "none", "the saved unmarked note has no status button");
    assert(app.commands.executeCommandById("patches:check-callouts-github"), "The Reading-view command should be available without a status button");
    await until(() => githubReport() && reportRows().length === 1 && reportRows()[0].innerText.includes("Line 1"),
      "the command checks the saved unmarked note in Reading view");
    await app.vault.modify(file(), "A new introduction.\n\n" + replacement);
    reportRows()[0].querySelector("button").click();
    await until(() => [...doc.querySelectorAll(".notice")].some(el => el.textContent.includes("Run the callout check again")),
      "a file change while the report is open rejects the stale Jump");
    await source();
  }
  async function checkFolderSuggestions(status) {
    const root = "Patch Callout Tests", guides = root + "/Guides";
    const vault = app.vault, plugin = app.plugins.plugins.patches;
    const created = [];
    try {
      if (!vault.getFolderByPath(guides)) created.push(await vault.createFolder(guides));
      const sample = lines("> [!NOTE]", "> Changes ship on Friday.", "", "> [!example] Migration", "> Update the old setting.");
      const note = await vault.create(guides + "/GitHub alerts " + context.runId + ".md", sample);
      created.push(note);
      await leaf.openFile(note);
      await until(() => editor()?.getValue() === sample && status.style.display === "none", "an unmarked note starts without a GitHub count");

      app.setting.open();
      app.setting.openTabById("patches");
      // Desktop can move settings to a separate native window after opening.
      await wait(400);
      const findRow = () => [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")]
        .find(el => el.querySelector(".setting-item-name")?.textContent === "GitHub folders");
      await until(() => findRow()?.isConnected, "the native GitHub folders setting is available");
      const row = findRow(), field = row.querySelector("input"), settingsDoc = field.ownerDocument, window = settingsDoc.defaultView;
      row.scrollIntoView({ block: "center" });
      window.focus();
      field.focus();
      const choices = () => [...settingsDoc.querySelectorAll(".suggestion-container .suggestion-item")];
      const choice = path => choices().find(el => el.textContent === path);
      const type = (value, caret = value.length) => {
        field.value = value;
        field.setSelectionRange(caret, caret);
        field.dispatchEvent(new window.Event("input", { bubbles: true }));
      };
      const key = code => {
        contents(window).sendInputEvent({ type: "keyDown", keyCode: code });
        contents(window).sendInputEvent({ type: "keyUp", keyCode: code });
      };
      type("Manual, patch call, Archive", "Manual, patch call".length);
      await until(() => choice(root) && choice(guides), "folder suggestions match partial paths regardless of case and show nested folders");
      choice(guides).click();
      await until(() => field.value === "Manual, " + guides + ", Archive" && plugin.settings.callouts.githubFolders.join("|") === ["Manual", guides, "Archive"].join("|"),
        "clicking a folder replaces only the middle entry and saves both neighbors");
      type(root + ", patch call, Archive", (root + ", patch call").length);
      await until(() => choice(guides) && !choice(root), "already selected folders are omitted from the other entry's matches");
      field.setSelectionRange(2, 2);
      await until(() => choice(root), "moving the caret across a comma refreshes the matches without typing");
      const query = "callout te";
      type(query);
      await until(() => choice(root) && choice(guides), "the keyboard picker shows the test folder and its child");
      const r = row.getBoundingClientRect(), p = choice(root).closest(".suggestion-container").getBoundingClientRect();
      const frame = { left: Math.min(r.left, p.left), top: Math.min(r.top, p.top), right: Math.max(r.right, p.right), bottom: Math.max(r.bottom, p.bottom) };
      await capture("folder-matches", window, frame);
      key("Escape");
      await until(() => choices().length === 0 && field.value === query, "Escape dismisses suggestions and preserves the typed path");
      type("");
      field.blur();
      await capture("folder-empty", window, frame);
      field.focus();
      type(query);
      const paths = choices().map(el => el.textContent);
      const parentIndex = paths.indexOf(root), childIndex = paths.indexOf(guides);
      assert(parentIndex >= 0 && childIndex > parentIndex, "The keyboard list should contain both test paths");
      key("Home");
      for (let index = 0; index < childIndex; index++) key("Down");
      await until(() => choice(guides)?.classList.contains("is-selected"), "Down selects the child folder");
      for (let index = childIndex; index > parentIndex; index--) key("Up");
      key("Enter");
      await until(() => field.value === root && choices().length === 0 && plugin.settings.callouts.githubFolders[0] === root,
        "Up and Enter choose the parent folder and persist its vault-relative path");
      await capture("folder-selected", window, frame);
      app.setting.close();
      await until(() => status.style.display !== "none" && status.textContent === "GitHub: 1/2 callouts not alerts",
        "choosing a parent folder refreshes a descendant note's GitHub count without editing or reopening it");
      await capture("folder-count", win, status.getBoundingClientRect());
      status.click();
      await until(() => githubReport()?.querySelector('[role="status"]').textContent === "2 callouts checked · 1 alert · 1 plain blockquote", "clicking the count opens the compatibility report");
      const [ok, problem] = reportRows();
      assert(!toggle(ok) && toggle(problem).textContent === "Details (2)", "Only rows with reasons should offer Details");
      await capture("folder-report", win, githubReport().getBoundingClientRect());
      toggle(problem).click();
      await capture("folder-report-details", win, githubReport().getBoundingClientRect());
      githubReport().querySelector(".modal-header-button").click();
    } finally {
      app.setting.close();
      doc.querySelector(".obsidian-patch-callout-report .modal-header-button")?.click();
      await source();
      for (const entry of created.reverse()) {
        if (!entry.children) await vault.delete(entry);
        else if (!entry.children.length) require("fs").rmdirSync(require("path").join(context.vault, entry.path));
      }
    }
  }
  try {
    await app.plugins.plugins["patches"].setCallouts({ github: true, githubFolders: [] });
    app.saveLocalStorage(sizeKey, null);
    if (file()) await app.vault.modify(file(), original);
    else await app.vault.create(notePath, original);
    await source();
    await until(() => editor()?.getValue() === original, "the test note opens in Source mode");

    const command = app.commands.commands["patches:edit-callout"];
    editor().setCursor({ line: 0, ch: 0 });
    assert(!command.editorCheckCallback(true, editor(), leaf.view), "Edit callout offered outside a callout");
    editor().setCursor({ line: 4, ch: 2 });
    assert(command.editorCheckCallback(true, editor(), leaf.view), "Edit callout missing inside a callout");
    checks.push("Edit callout is offered only with the cursor in a callout");

    app.commands.executeCommandById("patches:edit-callout");
    await until(() => modal()?.querySelector(".obsidian-patch-callout-preview .callout[data-callout='info']"), "the editor opens with a rendered preview");
    assert(modal().querySelectorAll(".obsidian-patch-callout-chip").length >= 27, "Type picker lacks Obsidian's types");
    assert(chip("info").classList.contains("is-active"), "Current type not selected");
    assert(modal().querySelector(".obsidian-patch-callout-body").value === lines("body line", "> [!tip]", "> nested"), "Content not shown without markers");
    checks.push("the picker lists Obsidian's types and the content shows without markers");
    assert(modal().querySelector(":scope > .modal-button-container") && !modal().querySelector(".modal-content .modal-button-container"), "Buttons sit inside the scrolling content");
    assert(button("Convert to text") && button("Convert to blockquote"), "The editor lacks the convert buttons");
    checks.push("the buttons sit below the content, with both conversions");
    chip("warning").click();
    assert(field("Title").placeholder === "Warning", `Empty title shows "${field("Title").placeholder}"`);
    checks.push("the empty title shows the name Obsidian would show");
    input(field("Title"), "New title");
    await until(() => modal().querySelector(".obsidian-patch-callout-preview .callout[data-callout='warning'] .callout-title")?.textContent.includes("New title"),
      "the preview follows the type and title");
    button("Save").click();
    await until(() => editor().getValue() === original.replace("> [!info] Title", "> [!warning] New title"), "a header change rewrites only the header line");

    editor().setCursor({ line: 3, ch: 0 });
    app.commands.executeCommandById("patches:edit-callout");
    await until(() => modal(), "the editor opens again");
    const body = modal().querySelector(".obsidian-patch-callout-body");
    input(body, `${body.value}\nmore`);
    button("Save").click();
    await until(() => editor().getValue().includes(lines("> [!warning] New title", "> body line", "> > [!tip]", "> > nested", "> more")),
      "a content change writes canonical markers");

    editor().setValue(original);
    editor().setCursor({ line: 3, ch: 0 });
    app.commands.executeCommandById("patches:edit-callout");
    await until(() => modal()?.querySelector(".obsidian-patch-callout-github-status.is-error"), "GitHub status flags a titled info callout");
    button("Make GitHub-compatible").click();
    await until(() => modal().querySelector(".obsidian-patch-callout-github-status.is-ok") && chip("NOTE") === null && other().value === "NOTE"
      || modal().querySelector(".obsidian-patch-callout-github-status.is-ok") && chip("note")?.classList.contains("is-active"),
    "Make GitHub-compatible fixes the type and title");
    button("Save").click();
    await until(() => editor().getValue().includes(lines("> [!NOTE]", "> **Title**", "> body line")), "the title moves into the content as bold text");

    editor().setValue(original);
    editor().setCursor({ line: 4, ch: 0 });
    app.commands.executeCommandById("patches:callout-to-text");
    await until(() => editor().getValue() === lines("Paragraph one.", "Paragraph two.", "", "**Title**", "", "body line", "> [!tip]", "> nested", "", "End"),
      "Convert callout to text keeps the title as bold text and lifts the nested callout");
    editor().undo();
    await until(() => editor().getValue() === original, "one undo restores the callout");
    editor().setCursor({ line: 6, ch: 0 });
    app.commands.executeCommandById("patches:callout-to-blockquote");
    await until(() => editor().getValue().includes(lines("> [!info] Title", ">body line", "> > nested", "", "End")), "Convert callout to blockquote works on the nested callout");

    editor().setValue(original);
    editor().setCursor({ line: 4, ch: 0 });
    app.commands.executeCommandById("patches:edit-callout");
    await until(() => modal()?.querySelector(".obsidian-patch-callout-preview .callout[data-callout='info']"), "the editor opens to convert");
    input(field("Title"), "Edited");
    button("Convert to text").click();
    await until(() => editor().getValue() === lines("Paragraph one.", "Paragraph two.", "", "**Edited**", "", "body line", "> [!tip]", "> nested", "", "End"),
      "Convert to text in the editor converts the callout as edited");

    editor().setValue(original);
    editor().setSelection({ line: 0, ch: 0 }, { line: 1, ch: "Paragraph two.".length });
    app.commands.executeCommandById("patches:insert-callout");
    await until(() => modal()?.querySelector(".modal-title")?.textContent === "Wrap in callout", "Insert callout wraps a selection");
    assert(!button("Convert to text"), "A new callout offers to convert");
    chip("tip").click();
    button("Save").click();
    await until(() => editor().getValue().startsWith(lines("> [!tip]", "> Paragraph one.", "> Paragraph two.", "", "> [!info] Title")), "the selected lines are wrapped");

    editor().setValue(original);
    editor().setCursor({ line: 8, ch: 3 });
    app.commands.executeCommandById("patches:insert-callout");
    await until(() => modal()?.querySelector(".modal-title")?.textContent === "Insert callout", "Insert callout opens for a new callout");
    button("Save").click();
    await until(() => editor().getValue().endsWith(lines("End", "", "> [!note]", "> ")), "a new callout is added after a blank line, with a line to type in");
    assert(editor().getCursor().line === 11 && editor().getCursor().ch === 2, "Cursor not on the new callout's content line");
    checks.push("the cursor waits on the new callout's content line");

    editor().setValue(original);
    editor().setCursor({ line: 3, ch: 0 });
    app.commands.executeCommandById("patches:edit-callout");
    await until(() => modal()?.querySelector(".obsidian-patch-callout-preview .callout"), "the editor opens at its default size");
    input(modal().querySelector(".obsidian-patch-callout-body"), Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n"));
    await wait(300);
    const save = button("Save").getBoundingClientRect();
    assert(save.bottom <= win.innerHeight && save.bottom <= modal().getBoundingClientRect().bottom, "Long content pushed Save out of view");
    checks.push("long content scrolls inside the panes and leaves the buttons in view");
    const grip = modal().querySelector(":scope > .obsidian-patch-resize-grip");
    const before = modal().getBoundingClientRect();
    const corner = grip.getBoundingClientRect();
    const pointer = (type, dx, dy) => grip.dispatchEvent(new win.PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: corner.x + 6 + dx, clientY: corner.y + 6 + dy,
    }));
    pointer("pointerdown", 0, 0);
    pointer("pointermove", -40, -30);
    pointer("pointerup", -40, -30);
    const after = modal().getBoundingClientRect();
    assert(Math.abs(after.width - (before.width - 80)) <= 1 && Math.abs(after.height - (before.height - 60)) <= 1,
      `Grip resized ${before.width}x${before.height} to ${after.width}x${after.height}`);
    checks.push("dragging the grip resizes the centered editor by twice the pointer's travel");
    button("Cancel").click();
    app.commands.executeCommandById("patches:edit-callout");
    await until(() => {
      const box = modal()?.getBoundingClientRect();
      return box && Math.abs(box.width - after.width) <= 1 && Math.abs(box.height - after.height) <= 1;
    }, "the editor reopens at the size it was given");
    modal().style.width = "600px";
    assert(win.getComputedStyle(modal().querySelector(".obsidian-patch-callout-panes")).gridTemplateColumns.split(" ").length === 1, "Narrow editor keeps two panes");
    checks.push("a narrow editor stacks the content above the preview");
    modal().querySelector(":scope > .obsidian-patch-resize-grip").dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
    assert(modal().style.width === "" && modal().style.height === "" && app.loadLocalStorage(sizeKey) === null, "Double-click kept the size");
    checks.push("a double-click on the grip restores the default size");
    button("Cancel").click();

    editor().setValue(original);
    await wait(100);
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "source", source: false } });
    let embed;
    await until(() => (embed = leaf.view.contentEl.querySelector(".cm-callout")), "Live Preview renders the callout as a widget");
    embed.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    await until(() => embed.querySelector(":scope > .embed-actions > .obsidian-patch-callout-edit"), "Live Preview shows Edit callout among the widget's actions");
    embed.querySelector(".obsidian-patch-callout-edit").click();
    await until(() => modal()?.querySelector(".obsidian-patch-callout-chip.is-active[aria-label='info']"), "the Live Preview button opens the callout");
    input(field("Title"), "From Live Preview");
    button("Save").click();
    await until(() => editor().getValue().includes("> [!info] From Live Preview\n>body line"), "Live Preview writes back the header");

    editor().setValue(original);
    await until(() => (embed = leaf.view.contentEl.querySelector(".cm-callout")) && embed.querySelector(".callout-title")?.textContent.includes("Title"),
      "Live Preview renders the restored callout");
    embed.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    await until(() => embed.querySelector(":scope > .embed-actions > .obsidian-patch-callout-edit"), "the restored widget offers Edit callout");
    embed.querySelector(".obsidian-patch-callout-edit").click();
    await until(() => modal()?.querySelector(".obsidian-patch-callout-chip.is-active[aria-label='info']"), "the Live Preview button opens the callout to convert");
    button("Convert to blockquote").click();
    await until(() => editor().getValue() === original.replace(lines("> [!info] Title", ">body line"), lines("> **Title**", "> body line")),
      "Convert to blockquote from Live Preview keeps the quote and drops the callout marker");

    // The editor saves on a delay; flush it so the next write is not overwritten by the old buffer.
    await leaf.view.save();
    await app.vault.modify(file(), original);
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "preview", source: false } });
    await until(() => leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-callout-host > .obsidian-patch-callout-edit"), "Reading View offers Edit callout");
    leaf.view.previewMode.containerEl.querySelector(".obsidian-patch-callout-edit").click();
    await until(() => modal(), "the Reading View button opens the editor");
    chip("example").click();
    button("Save").click();
    await wait(800);
    const written = await app.vault.read(file());
    assert(written === original.replace("> [!info] Title", "> [!example] Title"),
      `Reading View did not write back: ${JSON.stringify({ line: written.split("\n")[3], notices: Array.from(doc.querySelectorAll(".notice")).map(n => n.textContent) })}`);
    checks.push("Reading View writes back through the vault");

    await app.vault.modify(file(), `---\ngithub: true\n---\n${original}`);
    await source();
    const status = doc.querySelector(".obsidian-patch-callout-status");
    await until(() => status && status.style.display !== "none" && status.textContent === "GitHub: 2/2 callouts not alerts",
      "the status bar counts callouts GitHub would not show as alerts in a note marked github: true");
    await checkReportLayout(status);
    await checkFolderSuggestions(status);
  } catch (failure) {
    report.error = (failure.stack ?? String(failure)) + "\n" + JSON.stringify({ file: leaf.view.file?.path, mode: leaf.view.getMode?.(), hidden: doc.hidden, modal: !!modal() });
  } finally {
    githubReport()?.querySelector(".modal-header-button")?.click();
    for (const el of doc.querySelectorAll(".obsidian-patch-callout-modal button")) if (el.textContent === "Cancel") el.click();
    if (file()) {
      if (leaf.view.getMode?.() === "source") leaf.view.editor.setValue(original);
      await leaf.view.save?.();
      await app.vault.modify(file(), original);
    }
  }
})
