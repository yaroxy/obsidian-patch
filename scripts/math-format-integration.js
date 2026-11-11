(async (app, runId) => {
  const checks = [];
  const reportPath = "Patch Math Tests/results.json";
  const notePath = "Patch Math Tests/Math.md";
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
    "Intro",
    "",
    "$$",
    "\\begin{aligned}  ",
    "\\text{Minimize:}\\quad & \\frac{1}{2}\\|\\omega\\|^2\\\\  ",
    "\\text{Subject to:}\\quad & \\delta_i\\ge 0  ",
    "\\end{aligned}  ",
    "$$",
    "",
    "> [!note]",
    "> $$",
    "> \\begin{cases}x&x>0\\\\-x&x\\le 0\\end{cases}",
    "> $$",
    "",
    "$$",
    "a",
    "",
    "b",
    "$$",
    "",
    "End",
  );
  const aligned = lines(
    "$$",
    "\\begin{aligned}",
    "  \\text{Minimize:}\\quad   & \\frac{1}{2}\\|\\omega\\|^2 \\\\",
    "  \\text{Subject to:}\\quad & \\delta_i\\ge 0",
    "\\end{aligned}",
    "$$",
  );
  const cases = lines("> $$", "> \\begin{cases}", ">   x  & x>0 \\\\", ">   -x & x\\le 0", "> \\end{cases}", "> $$");
  const file = () => app.vault.getFileByPath(notePath);
  const notices = () => Array.from(doc.querySelectorAll(".notice")).map(n => n.textContent);
  let error;
  try {
    if (file()) await app.vault.modify(file(), original);
    else await app.vault.create(notePath, original);
    await leaf.setViewState({ type: "markdown", state: { file: notePath, mode: "source", source: true } });
    await until(() => leaf.view.editor?.getValue() === original, "the test note opens in Source mode");
    const editor = leaf.view.editor;
    const command = app.commands.commands["obsidian-patch:format-math-block"];

    editor.setCursor({ line: 0, ch: 0 });
    assert(!command.editorCheckCallback(true, editor, leaf.view), "Format math block offered outside math");
    editor.setCursor({ line: 4, ch: 3 });
    assert(command.editorCheckCallback(true, editor, leaf.view), "Format math block missing inside math");
    checks.push("Format math block is offered only with the cursor in a math block");

    app.commands.executeCommandById("obsidian-patch:format-math-block");
    await until(() => editor.getValue().includes(aligned), "the block at the cursor is aligned and loses its trailing spaces");
    assert(editor.getValue().includes("> \\begin{cases}x&x>0"), "Format math block changed another block");
    assert(editor.getCursor().line === 4, `Cursor moved to line ${editor.getCursor().line}`);
    checks.push("other blocks stay as they are and the cursor keeps its line");

    editor.undo();
    await until(() => editor.getValue() === original, "a single undo restores the note");

    app.commands.executeCommandById("obsidian-patch:format-math-blocks");
    await until(() => editor.getValue().includes(aligned) && editor.getValue().includes(cases), "Format all math blocks also formats a block in a callout");
    assert(editor.getValue().includes(lines("$$", "a", "", "b", "$$")), "A block with a blank line was changed");
    await until(() => notices().some(text => text.includes("Formatted 2 math blocks.") && text.includes("1 left as it is")),
      "the notice counts formatted and skipped blocks");

    const formatted = editor.getValue();
    app.commands.executeCommandById("obsidian-patch:format-math-blocks");
    await wait(100);
    assert(editor.getValue() === formatted, "Formatting twice changed the note");
    checks.push("formatting is idempotent");
  } catch (failure) {
    error = (failure.stack ?? String(failure)) + "\n" + JSON.stringify({ file: leaf.view.file?.path, mode: leaf.view.getMode?.(), hidden: doc.hidden });
  } finally {
    if (file()) await app.vault.modify(file(), original);
    await wait(100);
    const report = JSON.stringify({ runId, checks, error }, null, 2);
    const results = app.vault.getFileByPath(reportPath);
    if (results) await app.vault.modify(results, report);
    else await app.vault.create(reportPath, report);
  }
})
