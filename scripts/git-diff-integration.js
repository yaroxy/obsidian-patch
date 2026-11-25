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
  const markFor = row => row && marks().find(el => Math.abs(el.parentElement.getBoundingClientRect().top - row.getBoundingClientRect().top) < 1);
  const showEditor = async () => {
    await app.workspace.revealLeaf(leaf);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    leaf.view.editor.focus();
  };
  const capture = async (bounds, name) => {
    const rect = { x: Math.ceil(bounds.x), y: Math.ceil(bounds.y), width: Math.floor(bounds.width), height: Math.floor(bounds.height) };
    const image = await require("electron").remote.getCurrentWebContents().capturePage(rect);
    fs.writeFileSync(join(context.output, name), image.toPNG());
    return { image, rect };
  };
  const measureActiveLine = async (line, filename) => {
    const box = line.getBoundingClientRect(), css = getComputedStyle(line), bar = getComputedStyle(line, "::after");
    const paddingTop = parseFloat(css.paddingTop), paddingBottom = parseFloat(css.paddingBottom);
    const barX = box.left + parseFloat(bar.left) + parseFloat(bar.width) / 2;
    const lineHeight = parseFloat(css.lineHeight);
    const { image, rect } = await capture({ x: editor().querySelector(".cm-gutters").getBoundingClientRect().left - 4,
      y: box.top - 16, width: 250, height: box.height + 40 }, filename);
    const after = line.getBoundingClientRect();
    if (box.top !== after.top || box.left !== after.left || box.height !== after.height) return;
    const pixels = image.resize({ width: rect.width, height: rect.height }).toBitmap({ scaleFactor: 1 });
    const x = Math.floor(barX - rect.x);
    const painted = [];
    for (let y = Math.ceil(box.top) - rect.y; y < Math.floor(box.bottom) - rect.y; y++) {
      // Compare the middle of the bar with the adjacent empty margin in the same row.
      const pixel = (y * rect.width + x) * 4, margin = pixel + 4 * 4;
      if ([0, 1, 2].some(c => Math.abs(pixels[pixel + c] - pixels[margin + c]) > 30)) painted.push(y);
    }
    if (!painted.length) return;
    return {
      paddingTop, paddingBottom, lineHeight, paintedHeight: painted.at(-1) - painted[0] + 1,
      paintedTop: rect.y + painted[0], paintedBottom: rect.y + painted.at(-1) + 1,
      centerOffset: rect.y + (painted[0] + painted.at(-1) + 1) / 2 - (box.top + paddingTop + box.bottom - paddingBottom) / 2,
    };
  };
  const checkHeadingLayout = async (row, kind, measurement) => {
    const bounds = row.getBoundingClientRect();
    const marker = markFor(row);
    const num = editor().querySelector(".cm-lineNumbers .cm-active");
    assert(marker, "Visible heading has no corresponding Git mark");
    const firstTextRect = el => {
      const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects()[0];
    };
    const title = firstTextRect(row.querySelector(".cm-header:not(.cm-formatting)"));
    const lineNumber = firstTextRect(num), level = firstTextRect(row.querySelector(".obsidian-patch-heading-level"));
    const badge = row.querySelector(".obsidian-patch-heading-number").getBoundingClientRect();
    const git = marker.getBoundingClientRect(), bar = getComputedStyle(row, "::after");
    const barLeft = bounds.left + parseFloat(bar.left);
    const center = box => box.top + box.height / 2;
    const labelOffsets = [lineNumber, badge, level].map(box => center(box) - center(title));
    const edges = [git.top - measurement.paintedTop, git.bottom - measurement.paintedBottom];
    const gaps = [git.left - lineNumber.right, barLeft - git.right];
    report.headingLayout ??= {};
    report.headingLayout[kind] = { labelOffsets, edges, gaps, height: bounds.height, padding: getComputedStyle(row).paddingTop };
    assert(labelOffsets.every(offset => Math.abs(offset) <= 2), "Heading labels differ from the first row: " + labelOffsets);
    assert(edges.every(edge => Math.abs(edge) <= 1), "Git rail differs from the active rail: " + edges + " " + marker.outerHTML);
    assert(gaps.every(gap => gap > 0) && Math.abs(gaps[0] - gaps[1]) <= 1, "Uneven rail gaps beside the line number: " + gaps);
    assert(barLeft + parseFloat(bar.width) < badge.left && badge.right <= title.left && title.right <= level.left, "Heading columns overlap");
    const left = Math.floor(lineNumber.left - 6);
    await capture({ x: left, y: bounds.top - 4, width: bounds.right - left + 6, height: bounds.height + 8 }, "layout-" + kind + ".png");
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
    const runLines = ["准备投影设备。", "### 核对片单", "检查字幕时间轴。", "### 补充记录", "记录本次放映时间。", "保存复核结果。"];
    const runText = baseline.replace("Bring the projector.\nCharge the speakers.\nCheck the subtitles.", runLines.join("\n")).replace("8 pm", "9 pm");
    const firstRunLine = runText.split("\n").indexOf(runLines[0]) + 1;
    for (const source of [true, false]) {
      const mode = source ? "source" : "live-preview";
      await leaf.openFile(file, { state: { mode: "source", source } });
      assert(editor().closest(".markdown-source-view").classList.contains("is-live-preview") === !source, "Wrong editor mode for " + mode);
      leaf.view.editor.setValue(runText);
      leaf.view.editor.setCursor({ line: firstRunLine, ch: 5 });
      await until(() => marks().length === 7 && marks()[5].dataset.kind === "added", mode + ": adjacent modified and added runs are visible");
      await wait(150);
      const boxes = marks().map(mark => mark.getBoundingClientRect());
      const left = editor().querySelector(".cm-gutters").getBoundingClientRect().left - 4;
      const { image, rect } = await capture({ x: left, y: boxes[0].top - 4, width: 290, height: boxes[6].bottom - boxes[0].top + 8 }, "change-runs-" + mode + ".png");
      const bitmap = image.resize({ width: rect.width, height: rect.height }).toBitmap({ scaleFactor: 1 });
      const seams = [];
      for (const start of [0, 3]) {
        const group = boxes.slice(start, start + 3);
        seams.push(group[1].top - group[0].bottom, group[2].top - group[1].bottom);
        const x = Math.floor(group[0].left + group[0].width / 2) - rect.x;
        const y1 = Math.ceil(group[0].top) + 2 - rect.y, y2 = Math.floor(group[2].bottom) - 2 - rect.y;
        const offset = y => (y * rect.width + x) * 4;
        const first = offset(y1);
        assert([0, 1, 2].some(c => Math.abs(bitmap[first + c] - bitmap[first + 16 + c]) > 30), mode + ": the rail is not visible");
        for (let y = y1; y <= y2; y++) {
          assert([0, 1, 2].every(c => Math.abs(bitmap[offset(y) + c] - bitmap[first + c]) <= 12),
            mode + ": a gap is painted inside the " + marks()[start].dataset.kind + " run; row gaps in pixels: " + seams);
        }
      }
      assert(seams.every(gap => Math.abs(gap) <= 0.1), mode + ": Git run segments are separated by " + seams);
      assert(boxes[3].top > boxes[2].bottom && boxes[6].top > boxes[5].bottom, mode + ": change type or unchanged line failed to separate runs");
      report.checks.push(mode + ": continuous blue and green pixels span three lines each, with separate change boundaries");
      if (!source) {
        const editor = leaf.view.editor, middle = { line: firstRunLine, ch: 0 };
        editor.replaceRange("Charge the speakers.", middle, { line: middle.line, ch: runLines[1].length });
        await until(() => marks().length === 6 && !marks().some(mark => Number(mark.dataset.gitLine) === firstRunLine + 1)
          && !marks()[0].classList.contains("is-joined-end"), "restoring an unchanged line splits a blue run");
        editor.undo();
        await until(() => marks().length === 7 && marks()[1].matches(".is-joined-start.is-joined-end"), "undo reconnects the three modified lines");
        const inside = marks()[4], box = inside.getBoundingClientRect();
        inside.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true,
          clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
        await until(() => app.workspace.activeLeaf === diffLeaf && regions()[1]?.textContent.includes(runLines[4]), "clicking inside a joined green run opens its diff");
        await showEditor();
      }
    }
    await leaf.openFile(file, { state: { mode: "source", source: true } });
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
    const deletion = marks().find(mark => mark.dataset.kind === "deleted");
    const triangle = deletion.getBoundingClientRect(), cell = deletion.parentElement.getBoundingClientRect();
    assert(Math.abs(triangle.left + triangle.width / 2 - cell.left - cell.width / 2) < 1, "Deletion triangle is off the Git column center");
    report.checks.push("the active-line bar is visible separately from the colored Git gutter");
    const codeRect = editor().querySelector(".cm-content").getBoundingClientRect();
    const lineNumbers = editor().querySelector(".cm-lineNumbers").getBoundingClientRect();
    const left = Math.floor(Math.min(lineNumbers.left, entry.left) - 6);
    const lines = [...editor().querySelectorAll(".cm-content > .cm-line")];
    await capture({ x: left, y: lines[0].getBoundingClientRect().top - 4, width: Math.min(570, editor().getBoundingClientRect().right - left), height: Math.min(codeRect.height, lines.at(-1).getBoundingClientRect().bottom - lines[0].getBoundingClientRect().top + 8) }, "note-git-gutter.png");
    const { samples, fixtureLines } = context.options;
    const headingFile = await app.vault.create(folder + "/Headings.md", fixtureLines.join("\n"));
    await app.plugins.plugins.patches.setHeadingLevels(true);
    await app.plugins.plugins.patches.setHeadingNumbering({ enabled: true, preset: "decimal", startLevel: 1, maxDepth: 6, startAt: 1 });
    for (const source of [true, false]) {
      const mode = source ? "source" : "live-preview";
      await leaf.openFile(headingFile, { state: { mode: "source", source } });
      await showEditor();
      for (const [kind, text] of samples) {
        const pos = { line: fixtureLines.indexOf(text), ch: text.length };
        leaf.view.editor.setCursor(pos);
        leaf.view.editor.scrollIntoView({ from: pos, to: pos }, true);
        const activeLine = () => editor().querySelector(".cm-contentContainer > .cm-content > .cm-line.cm-active");
        const cm = leaf.view.editor.cm;
        await until(() => activeLine() && cm.posAtDOM(activeLine()) === cm.state.doc.line(pos.line + 1).from
          && editor().querySelector(".cm-lineNumbers .cm-active")?.textContent.trim() === String(pos.line + 1),
          `${mode}: ${kind} and its line number are active on line ${pos.line + 1}`);
        const win = editor().win;
        let measurement;
        // Scrolling can update the layout while Electron is capturing the previous frame.
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
          measurement = await measureActiveLine(activeLine(), `active-${kind}-${mode}.png`);
          if (measurement && Math.abs(measurement.centerOffset) <= 1) break;
        }
        assert(measurement, `${mode}: no stable active-line pixels beside ${kind}`);
        report.activeLineOffsets ??= {};
        report.activeLineOffsets[mode] ??= {};
        report.activeLineOffsets[mode][kind] = measurement;
        if (!source && ["h3", "wrapped-heading"].includes(kind)) {
          await checkHeadingLayout(activeLine(), kind, measurement);
          if (kind === "wrapped-heading") {
            const host = leaf.view.contentEl, previous = host.getAttribute("style");
            try {
              host.style.setProperty("--file-line-width", "480px", "important");
              host.style.setProperty("--font-text-size", "20px");
              host.style.setProperty("--h3-size", "1.6rem");
              host.style.setProperty("--p-spacing", "24px");
              leaf.view.onResize();
              const previousHeight = report.headingLayout[kind].height;
              await until(() => activeLine()?.getBoundingClientRect().height > previousHeight && getComputedStyle(activeLine()).paddingTop === "12px",
                "the same heading reflows with a narrower pane, larger font and different theme spacing");
              await wait(150);
              const resized = await measureActiveLine(activeLine(), "active-heading-resized.png");
              assert(resized, "No active rail in the resized viewport");
              await checkHeadingLayout(activeLine(), "resized", resized);
              app.vault.setConfig("showLineNumber", false);
              await until(() => !editor().querySelector(".cm-lineNumbers") && markFor(activeLine()),
                "hiding line numbers retains the active heading's Git marker");
              await until(() => {
                const row = activeLine(), mark = markFor(row);
                if (!mark) return false;
                const box = row.getBoundingClientRect(), rail = mark.getBoundingClientRect();
                const bar = getComputedStyle(row, "::after");
                return Math.abs(box.bottom - parseFloat(bar.bottom) - parseFloat(bar.paddingBottom) - rail.bottom) < 1;
              }, "the Git mark tracks the reflowed text after line numbers disappear");
              await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
              const hidden = await measureActiveLine(activeLine(), "active-heading-no-line-numbers.png");
              const git = markFor(activeLine()).getBoundingClientRect();
              assert(hidden && Math.abs(hidden.paintedTop - git.top) <= 1 && Math.abs(hidden.paintedBottom - git.bottom) <= 1,
                "Hiding line numbers separated the Git and active rails: " + JSON.stringify({ hidden, git: git.toJSON() }));
              app.vault.setConfig("showLineNumber", true);
              await until(() => editor().querySelector(".cm-lineNumbers .cm-active"), "showing line numbers restores the native column");
              assert(app.commands.executeCommandById(toggle), "Git toggle is unavailable");
              await until(() => !editor().querySelector(".obsidian-patch-git-gutter") && activeLine()?.querySelector(".obsidian-patch-heading-number")
                && editor().querySelector(".cm-lineNumbers .cm-active"), "hiding Git retains the numbered heading and native line number");
              assert(app.commands.executeCommandById(toggle), "Git toggle is unavailable");
              await until(() => markFor(activeLine()),
                "restoring Git repaints the wrapped heading");
            } finally {
              if (previous === null) host.removeAttribute("style"); else host.setAttribute("style", previous);
              leaf.view.onResize();
            }
          }
        }
        assert(Math.abs(measurement.centerOffset) <= 1, `${mode}: active bar center offset from ${kind} content: ${measurement.centerOffset} px`);
        if (kind === "wrapped" || kind === "wrapped-heading") assert(measurement.paintedHeight > measurement.lineHeight, `${mode}: bar covered only one visual line`);
        if (kind === "h3") {
          assert(source || activeLine().querySelector(".obsidian-patch-heading-number"), "The active H3 is missing its automatic number");
          assert(measurement.paddingTop === measurement.paddingBottom, mode + ": active heading padding is asymmetric");
          const range = document.createRange(); range.selectNodeContents(editor().querySelector(".cm-lineNumbers .cm-active"));
          const gutterText = range.getBoundingClientRect(), box = activeLine().getBoundingClientRect();
          measurement.lineNumberOffset = gutterText.top + gutterText.height / 2 - (box.top + measurement.paddingTop + box.bottom - measurement.paddingBottom) / 2;
          assert(Math.abs(measurement.lineNumberOffset) <= 1, mode + ": line number is vertically offset beside the heading");
        }
      }
    }
    await leaf.openFile(file, { state: { mode: "source", source: true } });
    await showEditor();
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
    // A broken gitfile stops Git at the fixture even when the development vault has its own repository.
    await app.vault.adapter.write(folder + "/.git", "gitdir: " + join(context.output, "missing-git-dir") + "\n");
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
