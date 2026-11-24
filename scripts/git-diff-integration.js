(async (app, context) => {
  const { leaf, report, wait } = context;
  const { join } = require("path");
  const fs = require("fs");
  const folder = "Patch Git Diff Tests/" + context.runId;
  const path = folder + "/Weekend watchlist.md";
  let diffLeaf;
  const markersKey = "patches-git-markers-disabled";
  const rawKey = app.appId + "-" + markersKey;
  const previousMarkers = localStorage.getItem(rawKey);
  const originalLineNumbers = app.vault.config.showLineNumber;
  const assert = (value, message) => { if (!value) throw new Error(message); };
  async function until(check, label) {
    for (let i = 0; i < 120; i++) {
      if (check()) { report.checks.push(label); return; }
      await wait(50);
    }
    throw new Error("Timed out: " + label);
  }
  const command = "patches:view-note-git-diff";
  const toggle = "patches:toggle-vault-git-markers";
  const root = join(context.output, "vault-root");
  // Override only the root passed to Git discovery during enable. The real development vault stays outside this fixture.
  const enableAtFixtureRoot = async () => {
    const adapter = app.vault.adapter, original = adapter.getFullPath;
    const own = Object.getOwnPropertyDescriptor(adapter, "getFullPath");
    adapter.getFullPath = function(relative) { return relative === "" ? root : original.call(this, relative); };
    try { await app.plugins.enablePlugin("patches"); }
    finally {
      if (own) Object.defineProperty(adapter, "getFullPath", own);
      else delete adapter.getFullPath;
    }
  };
  const focusWindow = () => {
    const win = leaf.view.contentEl.win;
    win.dispatchEvent(new win.Event("focus"));
  };
  const view = () => (diffLeaf = app.workspace.getLeavesOfType("obsidian-patch-git-diff").find(l => l.getViewState().state?.path === path));
  const el = () => view()?.view.contentEl;
  const regions = () => [...(el()?.querySelectorAll(".obsidian-patch-git-pane") ?? [])];
  const button = name => [...el().querySelectorAll("button")].find(b => b.textContent === name);
  const editor = () => leaf.view.contentEl.querySelector(".cm-editor");
  const marks = () => [...(editor()?.querySelectorAll(".obsidian-patch-git-mark") ?? [])];
  const showEditor = async () => {
    await app.workspace.revealLeaf(leaf);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    leaf.view.editor.focus();
  };
  const capture = async (bounds, name) => {
    const rect = { x: Math.ceil(bounds.x), y: Math.ceil(bounds.y), width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
    const image = await require("electron").remote.getCurrentWebContents().capturePage(rect);
    fs.writeFileSync(join(context.output, name), image.toPNG());
  };
  try {
    await app.vault.createFolder(folder);
    const repo = join(context.output, "baseline");
    await app.vault.adapter.write(folder + "/.git", "gitdir: " + join(repo, ".git") + "\n");
    const baseline = fs.readFileSync(join(repo, "Weekend watchlist.md"), "utf8");
    const file = await app.vault.create(path, baseline);
    await leaf.openFile(file, { state: { mode: "source", source: true } });
    fs.mkdirSync(root);
    await app.plugins.disablePlugin("patches");
    localStorage.removeItem(rawKey);
    await enableAtFixtureRoot();
    assert(!app.commands.commands[command] && !app.commands.commands[toggle], "Ordinary vault registered Git commands");
    assert(!editor().querySelector(".obsidian-patch-git-gutter"), "Ordinary vault has a Git gutter");
    report.checks.push("a non-Git vault offers no Git commands or gutter, including on a note inside a nested repository");
    fs.writeFileSync(join(root, ".git"), "gitdir: " + join(repo, ".git") + "\n");
    focusWindow();
    await until(() => app.commands.commands[command] && app.commands.commands[toggle], "returning to a vault that became a working tree exposes the Git commands");
    await until(() => editor().querySelector(".obsidian-patch-git-gutter"), "a Git vault enables the editor gutter by default before opening a comparison");
    const childProcess = require("child_process"), originalExec = childProcess.execFile;
    const calls = [];
    const fixtureDir = app.vault.adapter.getFullPath(folder);
    childProcess.execFile = function(program, args, options, callback) {
      if (program === "git" && options?.cwd?.startsWith(fixtureDir)) calls.push(args);
      return originalExec.apply(this, arguments);
    };
    try {
      await app.vault.create(folder + "/Unopened.md", "# Unopened\n");
      for (let i = 0; i < 12; i++) leaf.view.editor.setValue(baseline.replace("Start at 8 pm.", "Start at " + i + " pm."));
      await until(() => marks().some(mark => mark.dataset.kind === "modified"), "a burst of editor changes updates the gutter");
      assert(!calls.length, "Unexpected Git processes while typing or creating an unopened note: " + JSON.stringify(calls));
      report.checks.push("twelve edits and an unopened note spawn zero extra Git processes for the fixture");
      leaf.view.editor.setValue(baseline);
      await leaf.view.save();
    } finally { childProcess.execFile = originalExec; }
    const current = baseline.replace("- Arrival", "- Arrival and Moon").replace("Start at 8 pm.", "Start at 7 pm.");
    leaf.view.editor.setValue(current);
    assert(await app.vault.read(file) === baseline, "The buffer must still be unsaved when opening the comparison");
    const indexPath = join(repo, ".git", "index");
    const index = fs.readFileSync(indexPath);
    assert(app.commands.executeCommandById(command), "Diff command unavailable on the note");
    await until(() => regions()[0]?.textContent.includes("- Arrival") && regions()[1]?.textContent.includes("- Arrival and Moon"), "HEAD is above the current buffer and includes the unsaved edit");
    assert(regions()[0].querySelector('[data-change="-"]') && regions()[1].querySelector('[data-change="+"]'), "The two panes lack marked lines");
    button("Next").click();
    await until(() => regions()[1].textContent.includes("Start at 7 pm.") && el().textContent.includes("Change 2 of 2"), "Next moves both panes to the same second change");
    button("Previous").click();
    await until(() => regions()[0].textContent.includes("- Arrival"), "Previous returns both panes to the first change");
    const panesRect = regions()[1].getBoundingClientRect(), toolbar = el().querySelector(".obsidian-patch-git-toolbar").getBoundingClientRect();
    await capture({ x: toolbar.x, y: toolbar.y, width: toolbar.width, height: panesRect.bottom - toolbar.top + 4 }, "note-git-diff.png");
    await showEditor();
    await until(() => marks().filter(mark => mark.dataset.kind === "modified").length === 2, "the gutter shows both modified source lines");
    const clickMark = marks().at(-1), rect = clickMark.getBoundingClientRect();
    assert(rect.width > 0 && rect.height > 0, "Modified marker has no visible area");
    clickMark.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
    await until(() => app.workspace.activeLeaf === diffLeaf && el()?.textContent.includes("Change 2 of 2") && regions()[1].textContent.includes("Start at 7 pm."), "clicking a gutter mark opens its matching hunk in the existing comparison");
    await showEditor();
    app.vault.setConfig("showLineNumber", true);
    await app.plugins.plugins.patches.setActiveLine(true);
    const mixed = current.replace("- Spirited Away", "- Spirited Away\n- Paprika").replace("Charge the speakers.\n", "");
    leaf.view.editor.setValue(mixed);
    leaf.view.editor.setCursor({ line: 3, ch: 8 });
    await until(() => new Set(marks().map(mark => mark.dataset.kind)).size === 3 && editor().querySelector(".cm-lineNumbers"), "source mode shows additions, modifications and deletion anchors alongside line numbers");
    const active = editor().querySelector(".cm-line.cm-active");
    const activeBar = active && getComputedStyle(active, "::after");
    const modified = marks().find(mark => mark.dataset.kind === "modified");
    assert(activeBar && parseFloat(activeBar.width) > 0 && activeBar.content !== "none", "The active-line indicator disappeared");
    const entry = modified.getBoundingClientRect();
    const activeX = active.getBoundingClientRect().left + parseFloat(activeBar.left);
    assert(entry.right <= activeX || entry.left >= activeX + parseFloat(activeBar.width), "Active and Git line indicators overlap");
    const tint = kind => getComputedStyle(marks().find(mark => mark.dataset.kind === kind)).backgroundColor;
    assert(tint("added") !== tint("modified") && tint("modified") !== "rgba(0, 0, 0, 0)", "Git addition and modification colors are indistinguishable");
    report.checks.push("the active-line bar is visible separately from the colored Git gutter");
    const codeRect = editor().querySelector(".cm-content").getBoundingClientRect();
    const lineNumbers = editor().querySelector(".cm-lineNumbers").getBoundingClientRect();
    const left = Math.floor(Math.min(lineNumbers.left, entry.left) - 6);
    const lines = [...editor().querySelectorAll(".cm-content > .cm-line")];
    await capture({ x: left, y: lines[0].getBoundingClientRect().top - 4, width: Math.min(570, editor().getBoundingClientRect().right - left), height: Math.min(codeRect.height, lines.at(-1).getBoundingClientRect().bottom - lines[0].getBoundingClientRect().top + 8) }, "note-git-gutter.png");
    app.vault.setConfig("showLineNumber", false);
    await until(() => !editor().querySelector(".cm-lineNumbers") && marks().some(mark => mark.getBoundingClientRect().width > 0), "the Git gutter remains visible when line numbers are hidden");
    assert(app.commands.executeCommandById(toggle), "Toggle command unavailable");
    await until(() => !editor().querySelector(".obsidian-patch-git-gutter") && app.loadLocalStorage(markersKey) === true, "the vault switch hides the gutter and persists one disabled flag");
    assert(app.commands.executeCommandById(command), "Manual comparison missing while the gutter is disabled");
    await until(() => app.workspace.activeLeaf === diffLeaf && regions().length === 2, "the manual comparison opens with the vault gutter disabled");
    await showEditor();
    assert(!editor().querySelector(".obsidian-patch-git-gutter") && app.loadLocalStorage(markersKey) === true, "Opening the comparison overrode the vault switch");
    const other = await app.vault.create(folder + "/Other.md", "# Another note\n");
    await leaf.openFile(other, { state: { mode: "source", source: false } });
    await until(() => editor() && !editor().querySelector(".obsidian-patch-git-gutter"), "other notes respect the disabled vault switch");
    await leaf.openFile(file, { state: { mode: "source", source: false } });
    await showEditor();
    leaf.view.editor.setValue(mixed);
    assert(app.commands.executeCommandById(toggle), "Toggle command unavailable in Live Preview");
    await until(() => new Set(marks().map(mark => mark.dataset.kind)).size === 3 && app.loadLocalStorage(markersKey) === null && app.workspace.activeLeaf === leaf, "the global switch enables Live Preview markers without switching tabs");
    await leaf.openFile(other);
    await until(() => editor() && marks().some(mark => mark.dataset.kind === "added") && !marks().some(mark => mark.dataset.kind === "modified"), "another note automatically shows its own additions without a per-note selection");
    await leaf.openFile(file, { state: { mode: "source", source: false } });
    await until(() => marks().length >= 3, "returning to the first note restores its own changes");
    leaf.view.editor.setValue(baseline);
    await until(() => el()?.textContent.includes("No changes from HEAD"), "the diff tab updates after an editor change");
    assert(app.commands.executeCommandById(command), "Reopen command unavailable");
    await until(() => app.workspace.activeLeaf === diffLeaf, "reopening the same note reuses its diff tab");
    assert(app.workspace.getLeavesOfType("obsidian-patch-git-diff").filter(l => l.getViewState().state?.path === path).length === 1, "Duplicate diff tab");
    const next = fs.readFileSync(join(context.output, "next-head.txt"), "utf8");
    require("child_process").execFileSync("git", ["update-ref", "HEAD", next], { cwd: repo });
    await showEditor();
    await until(() => el()?.textContent.includes(next.slice(0, 8)) && el()?.textContent.includes("No changes from HEAD"), "returning to a marked editor refreshes the comparison after a local commit");
    leaf.view.editor.setValue(baseline + Array.from({ length: 550 }, (_, i) => "New line " + (i + 1)).join("\n"));
    await until(() => regions()[1]?.querySelector("button")?.textContent === "Show next 200 lines", "large changes render a bounded first page");
    const currentPane = regions()[1], list = currentPane.querySelector(".obsidian-patch-git-lines");
    assert(list.querySelectorAll(".obsidian-patch-git-line").length === 200, "Large hunk created unexpected DOM rows");
    list.querySelector("button").click();
    assert(list.querySelectorAll(".obsidian-patch-git-line").length === 400, "The next lines were unavailable");
    list.querySelector("button").click();
    assert(list.textContent.includes("New line 550") && !list.querySelector("button"), "The last lines were unavailable");
    report.checks.push("both following pages expose all lines of a large change");
    leaf.view.editor.setValue(current);
    await leaf.view.save();
    diffLeaf.detach();
    await app.plugins.disablePlugin("patches");
    assert(!editor().querySelector(".obsidian-patch-git-gutter"), "Unloading left Git gutter DOM");
    await enableAtFixtureRoot();
    await until(() => marks().some(mark => mark.dataset.kind === "modified"), "reloading the plugin restores the vault's saved marker preference");
    assert(app.commands.executeCommandById(command), "Diff command unavailable after reload");
    await until(() => regions()[0]?.textContent.includes("- Arrival"), "the comparison reopens after a reload");
    await app.vault.adapter.remove(folder + "/.git");
    button("Refresh").click();
    await until(() => el()?.textContent.includes("outside a Git working tree"), "Refresh reports a missing repository without stale lines");
    fs.unlinkSync(join(root, ".git"));
    focusWindow();
    await until(() => !app.commands.commands[command] && !app.commands.commands[toggle] && !view(), "leaving a Git working tree removes both commands and closes its comparison");
    await showEditor();
    await until(() => !editor().querySelector(".obsidian-patch-git-gutter"), "the gutter disappears when the vault loses its working tree");
    app.saveLocalStorage(markersKey, true);
    fs.writeFileSync(join(root, ".git"), "gitdir: " + join(repo, ".git") + "\n");
    await app.plugins.disablePlugin("patches");
    await enableAtFixtureRoot();
    assert(app.commands.commands[command] && app.commands.commands[toggle] && app.loadLocalStorage(markersKey) === true, "Reload lost the disabled vault preference");
    await wait(350);
    assert(!editor().querySelector(".obsidian-patch-git-gutter"), "Reload enabled the gutter despite the disabled preference");
    report.checks.push("a Git vault retains a disabled gutter across reload while keeping the manual diff command");
    assert(fs.readFileSync(indexPath).equals(index), "Comparing notes changed the Git index");
    report.checks.push("the note comparisons preserved the Git index byte for byte");
  } finally {
    diffLeaf?.detach();
    await leaf.setViewState({ type: "empty" });
    const fixture = app.vault.getAbstractFileByPath(folder);
    if (fixture) await app.vault.delete(fixture, true);
    app.vault.setConfig("showLineNumber", originalLineNumbers);
    if (previousMarkers === null) localStorage.removeItem(rawKey);
    else localStorage.setItem(rawKey, previousMarkers);
  }
})
