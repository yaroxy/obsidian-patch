(async (app, runId) => {
  const checks = [];
  const reportPath = "Patch Callout Tests/results.json";
  const notePath = "Patch Callout Tests/Callouts.md";
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
  let error;
  try {
    app.saveLocalStorage(sizeKey, null);
    if (file()) await app.vault.modify(file(), original);
    else await app.vault.create(notePath, original);
    await source();
    await until(() => editor()?.getValue() === original, "the test note opens in Source mode");

    const command = app.commands.commands["obsidian-patch:edit-callout"];
    editor().setCursor({ line: 0, ch: 0 });
    assert(!command.editorCheckCallback(true, editor(), leaf.view), "Edit callout offered outside a callout");
    editor().setCursor({ line: 4, ch: 2 });
    assert(command.editorCheckCallback(true, editor(), leaf.view), "Edit callout missing inside a callout");
    checks.push("Edit callout is offered only with the cursor in a callout");

    app.commands.executeCommandById("obsidian-patch:edit-callout");
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
    app.commands.executeCommandById("obsidian-patch:edit-callout");
    await until(() => modal(), "the editor opens again");
    const body = modal().querySelector(".obsidian-patch-callout-body");
    input(body, `${body.value}\nmore`);
    button("Save").click();
    await until(() => editor().getValue().includes(lines("> [!warning] New title", "> body line", "> > [!tip]", "> > nested", "> more")),
      "a content change writes canonical markers");

    editor().setValue(original);
    editor().setCursor({ line: 3, ch: 0 });
    app.commands.executeCommandById("obsidian-patch:edit-callout");
    await until(() => modal()?.querySelector(".obsidian-patch-callout-github-status.is-error"), "GitHub status flags a titled info callout");
    button("Make GitHub-compatible").click();
    await until(() => modal().querySelector(".obsidian-patch-callout-github-status.is-ok") && chip("NOTE") === null && other().value === "NOTE"
      || modal().querySelector(".obsidian-patch-callout-github-status.is-ok") && chip("note")?.classList.contains("is-active"),
    "Make GitHub-compatible fixes the type and title");
    button("Save").click();
    await until(() => editor().getValue().includes(lines("> [!NOTE]", "> **Title**", "> body line")), "the title moves into the content as bold text");

    editor().setValue(original);
    editor().setCursor({ line: 4, ch: 0 });
    app.commands.executeCommandById("obsidian-patch:callout-to-text");
    await until(() => editor().getValue() === lines("Paragraph one.", "Paragraph two.", "", "**Title**", "", "body line", "> [!tip]", "> nested", "", "End"),
      "Convert callout to text keeps the title as bold text and lifts the nested callout");
    editor().undo();
    await until(() => editor().getValue() === original, "one undo restores the callout");
    editor().setCursor({ line: 6, ch: 0 });
    app.commands.executeCommandById("obsidian-patch:callout-to-blockquote");
    await until(() => editor().getValue().includes(lines("> [!info] Title", ">body line", "> > nested", "", "End")), "Convert callout to blockquote works on the nested callout");

    editor().setValue(original);
    editor().setCursor({ line: 4, ch: 0 });
    app.commands.executeCommandById("obsidian-patch:edit-callout");
    await until(() => modal()?.querySelector(".obsidian-patch-callout-preview .callout[data-callout='info']"), "the editor opens to convert");
    input(field("Title"), "Edited");
    button("Convert to text").click();
    await until(() => editor().getValue() === lines("Paragraph one.", "Paragraph two.", "", "**Edited**", "", "body line", "> [!tip]", "> nested", "", "End"),
      "Convert to text in the editor converts the callout as edited");

    editor().setValue(original);
    editor().setSelection({ line: 0, ch: 0 }, { line: 1, ch: "Paragraph two.".length });
    app.commands.executeCommandById("obsidian-patch:insert-callout");
    await until(() => modal()?.querySelector(".modal-title")?.textContent === "Wrap in callout", "Insert callout wraps a selection");
    assert(!button("Convert to text"), "A new callout offers to convert");
    chip("tip").click();
    button("Save").click();
    await until(() => editor().getValue().startsWith(lines("> [!tip]", "> Paragraph one.", "> Paragraph two.", "", "> [!info] Title")), "the selected lines are wrapped");

    editor().setValue(original);
    editor().setCursor({ line: 8, ch: 3 });
    app.commands.executeCommandById("obsidian-patch:insert-callout");
    await until(() => modal()?.querySelector(".modal-title")?.textContent === "Insert callout", "Insert callout opens for a new callout");
    button("Save").click();
    await until(() => editor().getValue().endsWith(lines("End", "", "> [!note]", "> ")), "a new callout is added after a blank line, with a line to type in");
    assert(editor().getCursor().line === 11 && editor().getCursor().ch === 2, "Cursor not on the new callout's content line");
    checks.push("the cursor waits on the new callout's content line");

    editor().setValue(original);
    editor().setCursor({ line: 3, ch: 0 });
    app.commands.executeCommandById("obsidian-patch:edit-callout");
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
    app.commands.executeCommandById("obsidian-patch:edit-callout");
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
  } catch (failure) {
    error = (failure.stack ?? String(failure)) + "\n" + JSON.stringify({ file: leaf.view.file?.path, mode: leaf.view.getMode?.(), hidden: doc.hidden, modal: !!modal() });
  } finally {
    for (const el of doc.querySelectorAll(".obsidian-patch-callout-modal button")) if (el.textContent === "Cancel") el.click();
    if (file()) await app.vault.modify(file(), original);
    await wait(100);
    const report = JSON.stringify({ runId, checks, error }, null, 2);
    const results = app.vault.getFileByPath(reportPath);
    if (results) await app.vault.modify(results, report);
    else await app.vault.create(reportPath, report);
  }
})
