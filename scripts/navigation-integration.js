async function navigationIntegration(app, config) {
  const fs = require("fs"), path = require("path");
  const wc = require("electron").remote.getCurrentWebContents();
  const { leaf, report, save, wait } = config;
  report.exports = [];
  const plugin = () => app.plugins.plugins["patches"];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const pass = label => { config.checkpoint(); report.checks.push(label); save(); };
  const until = async (condition, label) => {
    for (let i = 0; i < 80; i++) { if (condition()) return; await wait(50); }
    throw new Error(`Timed out: ${label}`);
  };
  const open = async (file, mode) => {
    await leaf.openFile(app.vault.getFileByPath(`Patch Navigation Tests/${file}`));
    await leaf.setViewState({ type: "markdown", state: { file: `Patch Navigation Tests/${file}`, mode: mode === "reading" ? "preview" : "source", source: mode === "source" } });
    app.workspace.setActiveLeaf(leaf, { focus: false });
    await wait(200);
  };
  const checkWorkspaceWidth = async () => {
    const native = require("electron").remote.getCurrentWindow(), ws = app.workspace;
    const original = native.getNormalBounds(), maximized = native.isMaximized(), full = native.isFullScreen();
    const docks = [ws.leftSplit, ws.rightSplit];
    const saved = docks.map(d => ({ size: d.size, collapsed: d.collapsed }));
    const settings = plugin().settings.lineWidth;
    const set = enabled => plugin().setLineWidth({ ...settings, enabled });
    const zoom = wc.getZoomFactor();
    const theme = document.createElement("style");
    const root = ws.rootSplit.containerEl;
    const rect = el => el.getBoundingClientRect();
    let split;
    try {
      if (full) native.setFullScreen(false);
      if (maximized) native.unmaximize();
      wc.setZoomFactor(1);
      await set(false);
      const originalMin = native.getMinimumSize();
      await set(true);
      for (const dock of docks) { dock.expand(); dock.setSize(320); }
      const samples = [];
      for (const [left, right] of [[true,true],[false,true],[false,false],[true,false],[true,true]]) {
        for (const [i, visible] of [left,right].entries()) visible ? docks[i].expand() : docks[i].collapse();
        await wait(320);
        const floor = native.getMinimumSize()[0];
        assert(floor >= 500, "Native minimum did not follow open sidebars");
        native.setSize(200, original.height);
        await until(() => Math.abs(native.getBounds().width - floor) <= 1 && Math.abs(innerWidth * wc.getZoomFactor() - native.getContentBounds().width) <= 1, "native window resized");
        await wait(100);
        const center = rect(root), sides = docks.map(d => rect(d.containerEl).width);
        assert(center.width >= 500 && center.width < 502, "Central split at floor: " + center.width);
        assert(center.left >= 0 && center.right <= innerWidth, "Central split clipped by native window");
        [left,right].forEach((open,i) => assert(open ? sides[i] >= 200 && sides[i] < 202 : sides[i] === 0, "Unexpected sidebar width: " + sides));
        samples.push({ floor, center: center.width, sides });
      }
      report.workspaceWidths = samples;
      pass("shrinking the native window respects a 500 px central split and 200 px open sidebars across collapse and reopen");
      const floor = samples[0].floor;
      const frameWidth = native.getBounds().width - native.getContentBounds().width;
      const resizeSteps = 12, stepSize = 15;
      const resizeTo = async width => {
        native.setSize(width, original.height);
        await until(() => Math.abs(innerWidth - (width - frameWidth)) <= 1, `window reached ${width} px`);
      };
      await resizeTo(floor + resizeSteps * stepSize);
      await wait(100);
      const getMinimumSize = native.getMinimumSize;
      const minimumDescriptor = Object.getOwnPropertyDescriptor(native, "getMinimumSize");
      let minimumReads = 0;
      native.getMinimumSize = () => { minimumReads++; return getMinimumSize.call(native); };
      try {
        for (let step = resizeSteps - 1; step >= 0; step--) {
          await resizeTo(floor + step * stepSize);
          assert(rect(root).width >= 500, "Central split fell below 500 px during resizing");
        }
        await wait(100);
      } finally {
        if (minimumDescriptor) Object.defineProperty(native, "getMinimumSize", minimumDescriptor);
        else delete native.getMinimumSize;
      }
      report.workspaceResize = { steps: resizeSteps, nativeMinimumReads: minimumReads };
      assert(minimumReads === 0, `Read the unchanged native minimum ${minimumReads} times during resizing`);
      pass("continuous window resizing does not query an unchanged native minimum");
      split = ws.getLeaf("split", "vertical");
      await wait(150);
      assert(rect(root).width >= 500 && rect(split.containerEl).width < 500, "Window minimum leaked into a child split");
      split.detach(); split = undefined;
      theme.textContent = ".workspace { column-gap: 8px; } .workspace-split.mod-left-split { min-width: 120px; }";
      document.head.appendChild(theme);
      app.workspace.trigger("css-change");
      docks[0].setSize(250); docks[1].setSize(500);
      await wait(200);
      native.setSize(200, original.height);
      await wait(200);
      const visible = [...ws.containerEl.children].filter(el => rect(el).width > 0);
      const extra = (visible.length - 1) * 8;
      assert(native.getMinimumSize()[0] === samples[0].floor + extra, "Theme gap missing from native minimum");
      assert(docks.every(d => Math.abs(rect(d.containerEl).width - 200) <= 1) && Math.abs(rect(root).width - 500) <= 1,
        "Asymmetric preferred widths defeated the sidebar floor");
      assert(visible.every(el => rect(el).left >= 0 && rect(el).right <= innerWidth), "A visible column was clipped");
      report.themedWorkspace = { minimum: native.getMinimumSize()[0], center: rect(root).width, docks: docks.map(d => rect(d.containerEl).width), extra };
      pass("theme gaps fit within the native window and both asymmetric sidebars keep the 200 px floor");
      docks.forEach(d => d.setSize(320));
      theme.textContent = ".workspace-split.mod-left-split { min-width: 250px; }";
      app.workspace.trigger("css-change");
      wc.setZoomFactor(1.25);
      await wait(300);
      native.setSize(200, original.height);
      await wait(250);
      assert(rect(root).width >= 500 && rect(root).width < 502 && rect(docks[0].containerEl).width >= 250 && rect(docks[1].containerEl).width >= 200, "Zoom or theme sidebar minimum clipped the workspace");
      pass("a wider theme sidebar minimum and 125% zoom are included in the native window minimum");
      wc.setZoomFactor(1);
      theme.remove(); app.workspace.trigger("css-change");
      native.setSize(original.width, original.height);
      await wait(150);
      assert(docks.every(d => Math.abs(rect(d.containerEl).width - 320) <= 1), "Widening failed to restore sidebar widths");
      await set(false);
      assert(native.getMinimumSize().join() === originalMin.join(), "Disabling Line Width did not restore the host minimum");
      pass("child panes can be narrower, widening restores preferred sidebar sizes, and disabling restores the host minimum");
    } finally {
      split?.detach();
      await set(false);
      theme.remove();
      wc.setZoomFactor(zoom);
      native.setBounds(original);
      docks.forEach((d,i) => { d.setSize(saved[i].size); saved[i].collapsed ? d.collapse() : d.expand(); });
      await plugin().setLineWidth(settings);
      if (maximized) native.maximize();
      if (full) native.setFullScreen(true);
      ws.requestSaveLayout();
    }
  };
  const shot = async (name, element, region = element.getBoundingClientRect()) => {
    const win = element.ownerDocument.defaultView;
    const target = win === window ? wc : win.electron.remote.getCurrentWebContents();
    const r = region, debugger_ = target.debugger, owned = !debugger_.isAttached();
    if (owned) debugger_.attach("1.3");
    try {
      const { data } = await debugger_.sendCommand("Page.captureScreenshot", { format: "png", clip: { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, win.innerWidth - Math.max(0, r.left)), height: Math.min(r.height, win.innerHeight - Math.max(0, r.top)), scale: 1 } });
      fs.writeFileSync(path.join(config.output, `${name}.png`), Buffer.from(data, "base64"));
    } finally { if (owned) debugger_.detach(); }
  };
  const textRects = element => {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT), boxes = [];
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim() || walker.currentNode.parentElement.closest(".obsidian-patch-heading-level")) continue;
      const range = element.ownerDocument.createRange(); range.selectNodeContents(walker.currentNode);
      boxes.push(...range.getClientRects());
    }
    return boxes.filter(r => r.width && r.height);
  };
  let cls = app.setting.constructor, Modal;
  while (cls?.prototype) { if (Object.prototype.hasOwnProperty.call(cls.prototype, "open")) Modal = cls; cls = Object.getPrototypeOf(cls); }
  const capture = (show = false) => {
    const open = Modal.prototype.open;
    let modal;
    Modal.prototype.open = function () { modal = this; if (show) return open.call(this); };
    try { app.commands.executeCommandById("workspace:export-pdf"); } finally { Modal.prototype.open = open; }
    assert(modal?.printToPdfDesktop, "The native Export to PDF command did not open its modal");
    return modal;
  };
  const exportPdf = async (name, modal = capture()) => {
    let snapshot;
    const render = modal.print;
    modal.print = async function (...args) {
      const root = await render.apply(this, args);
      await root.ownerDocument.fonts.ready;
      snapshot = {
        headings: [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(h => ({ text: h.textContent, source: h.getAttribute("data-heading"), id: h.id, label: h.ownerDocument.defaultView.getComputedStyle(h, "::after").content })),
        links: [...root.querySelectorAll("a")].map(a => ({ text: a.textContent, href: a.getAttribute("href"), target: a.getAttribute("data-href") })),
      };
      return root;
    };
    const file = path.join(config.output, `${name}.pdf`);
    try { await modal.printToPdfDesktop({ pageSize: "A4", landscape: false, marginsType: 0, scale: 1, scaleFactor: 100, includeName: true, open: false, filepath: file }); }
    finally { modal.print = render; }
    assert(fs.existsSync(file), `No PDF was saved for ${name}`);
    assert(snapshot.headings.every(h => !/^"H[1-6]"$/.test(h.label)), "Screen heading labels leaked into the print DOM");
    report.exports.push({ name, ...snapshot });
    pass(`${name}: the native exporter saved a PDF without screen-only labels`);
  };
  try {
    save();
    await checkWorkspaceWidth();
    await until(() => app.vault.getFileByPath("Patch Navigation Tests/Headings.md"), "fixture indexing");
    await plugin().setHeadingLevels(true);
    app.setting.open(); app.setting.openTabById("patches");
    await wait(200);
    const settings = app.setting.activeTab.containerEl;
    const names = [...settings.querySelectorAll(".setting-item-heading .setting-item-name")].map(el => el.textContent);
    assert(JSON.stringify(names) === JSON.stringify(["Callouts", "Editor", "HTML Tables", "Line Width", "Math Format", "Patch Banner", "Patch Icons", "Patch Mermaid", "PDF Export"]), `Unexpected setting order: ${names}`);
    pass("settings groups appear in alphabetical order by displayed name");
    await shot("settings", settings);
    app.setting.close();

    for (const mode of ["source", "live-preview"]) {
      await open("Headings.md", mode);
      const editor = leaf.view.editor, cm = editor.cm, original = editor.getValue();
      const at = text => original.indexOf(text);
      const lineElement = offset => {
        const dom = cm.domAtPos(offset).node;
        return (dom.nodeType === 1 ? dom : dom.parentElement).closest(".cm-line");
      };
      const inspect = async (text, level) => {
        const offset = at(text);
        assert(offset >= 0, `Missing fixture text ${text}`);
        editor.scrollIntoView({ from: editor.offsetToPos(offset), to: editor.offsetToPos(offset) }, true);
        await until(() => lineElement(offset)?.querySelector(".obsidian-patch-heading-level")?.textContent === `H${level}`, `${mode} label for ${text}`);
        const line = lineElement(offset), label = line.querySelector(".obsidian-patch-heading-level").getBoundingClientRect();
        assert(Math.abs(label.right - line.getBoundingClientRect().right) < 1, `${mode}: heading label is not right aligned`);
        const labelHeight = parseFloat(getComputedStyle(line.querySelector(".obsidian-patch-heading-level")).height);
        assert(Math.abs(labelHeight - parseFloat(getComputedStyle(line).lineHeight)) < 1, mode + ": " + text + " label lost its first-line height");
      };
      for (const [index, word] of ["one", "two", "three", "four", "five", "six"].entries()) await inspect(`Level ${word}`, index + 1);
      await inspect("Setext title", 1);
      editor.scrollIntoView({ from: { line: 0, ch: 0 }, to: { line: 0, ch: 0 } }, true); await wait(100);
      await shot(`headings-${mode}`, leaf.view.contentEl);
      await inspect("Far away", 2);
      const fake = at("# Not a heading\n```");
      editor.scrollIntoView({ from: editor.offsetToPos(fake), to: editor.offsetToPos(fake) }, true); await wait(100);
      assert(!lineElement(fake)?.querySelector(".obsidian-patch-heading-level"), "A code fence acquired a heading label");
      assert(editor.getValue() === original, "Heading labels changed the note source");
      pass(`${mode}: H1–H6, Setext and off-screen headings are labeled; fenced code and source text are unchanged`);
      await inspect("Level two", 2);
      if (mode === "live-preview") {
        const padding = () => getComputedStyle(lineElement(at("Level two")));
        assert(padding().paddingTop === "0px" && padding().paddingBottom === "0px", "Native empty-line exception lost");
        const preceding = editor.offsetToPos(at("## Level two")).line - 1;
        editor.replaceRange("Paragraph", { line: preceding, ch: 0 });
        const title = () => lineElement(editor.getValue().indexOf("Level two"));
        await until(() => parseFloat(getComputedStyle(title()).paddingBottom) > 0, "prose before heading regains spacing");
        editor.undo();
        await until(() => padding().paddingBottom === "0px", "undo restores compact heading spacing");
        pass("a single blank line between headings retains native spacing after editing and undo");
      }
      const pos = editor.offsetToPos(at("## Level two"));
      editor.replaceRange("#", pos);
      await until(() => lineElement(at("Level two") + 1)?.querySelector(".obsidian-patch-heading-level")?.textContent === "H3", "label follows heading edit");
      editor.undo(); await until(() => editor.getValue() === original, "one undo restores the source");
      await plugin().setHeadingLevels(false);
      assert(!leaf.view.contentEl.querySelector(".obsidian-patch-heading-level"), "Disabled editor labels remain");
      await plugin().setHeadingLevels(true);
      await inspect("Level two", 2);
      const content = leaf.view.contentEl, width = content.style.getPropertyValue("--file-line-width");
      content.style.setProperty("--file-line-width", "520px", "important"); leaf.view.onResize(); await wait(150);
      await inspect("Long title for wrapping", 2);
      const long = lineElement(at("Long title for wrapping")), label = long.querySelector(".obsidian-patch-heading-level").getBoundingClientRect();
      assert(textRects(long).every(r => r.right <= label.left - 2), `${mode}: wrapped title overlaps its label`);
      await shot(`headings-${mode}-narrow`, content);
      if (width) content.style.setProperty("--file-line-width", width); else content.style.removeProperty("--file-line-width");
      leaf.view.onResize();
      await leaf.view.save();
      pass(`${mode}: editing, undo and the toggle work; long titles wrap clear of the right-aligned label at 520 px`);
    }
    await open("Headings.md", "reading");
    await until(() => leaf.view.contentEl.querySelector("h1[data-heading='Level one']"), "reading headings");
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const h = leaf.view.contentEl.querySelector(`h${level}`);
      assert(h && h.ownerDocument.defaultView.getComputedStyle(h, "::after").content === `"H${level}"`, `Reading H${level} is unlabeled`);
    }
    leaf.view.previewMode.renderer.applyScroll(0, { center: false });
    await wait(150);
    await shot("headings-reading", leaf.view.contentEl);
    await plugin().setHeadingLevels(false);
    assert(getComputedStyle(leaf.view.contentEl.querySelector("h1"), "::after").content === "none", "Disabled reading labels remain");
    await plugin().setHeadingLevels(true);
    pass("Reading View displays all six levels and respects the toggle without changing heading text");
    const readingContent = leaf.view.contentEl, readingWidth = readingContent.style.getPropertyValue("--file-line-width");
    readingContent.style.setProperty("--file-line-width", "520px", "important"); leaf.view.previewMode.onResize();
    const headingLine = (await app.vault.read(leaf.view.file)).split("\n").findIndex(l => l.startsWith("## Long title"));
    leaf.view.previewMode.renderer.applyScroll(headingLine, { center: true }); await wait(200);
    const longReading = [...readingContent.querySelectorAll("h2")].find(h => h.textContent.startsWith("Long title"));
    assert(longReading, "Long reading title was not rendered");
    const edge = longReading.getBoundingClientRect().right - parseFloat(getComputedStyle(longReading, "::after").width);
    assert(textRects(longReading).every(r => r.right <= edge - 2), "Reading View: wrapped title overlaps its label");
    await shot("headings-reading-narrow", readingContent);
    if (readingWidth) readingContent.style.setProperty("--file-line-width", readingWidth); else readingContent.style.removeProperty("--file-line-width");
    leaf.view.previewMode.onResize();
    pass("Reading View reserves space for a right-aligned label when long headings wrap at 520 px");

    const defaults = { enabled: false, preset: "decimal", startLevel: 0, maxDepth: 6, startAt: 1 };
    await plugin().setHeadingNumbering(defaults);
    const numberingPath = path.join(config.vault, "Patch Navigation Tests", "Numbering.md");
    const originalBytes = fs.readFileSync(numberingPath);
    const prefixClass = ".obsidian-patch-heading-number";
    const checkNumberStarts = (spans, context) => {
      assert(spans.length > 1, context + ": expected multiple numbered headings");
      const starts = Array.from(spans, span => {
        const style = getComputedStyle(span);
        const probe = span.ownerDocument.createElement("span");
        probe.style.fontFamily = "var(--font-text)";
        span.ownerDocument.body.appendChild(probe);
        try { assert(style.fontFamily === getComputedStyle(probe).fontFamily, context + ": number does not use the vault text font"); }
        finally { probe.remove(); }
        assert(style.fontWeight === "700" && style.boxShadow !== "none", context + ": expected a bold, outlined number");
        assert(style.textAlign === "start", context + ": number does not align to the start of its column");
        assert(style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== style.color, context + ": number needs a visible background and text");
        return span.getBoundingClientRect().left;
      });
      const delta = Math.max(...starts) - Math.min(...starts);
      assert(delta <= 1, context + ": number column starts differ by " + delta + "px");
      report.numberColumnOffsets ??= {};
      report.numberColumnOffsets[context] = delta;
    };
    const noteRoot = () => leaf.view.contentEl;
    const readingPrefixes = title => [...noteRoot().querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(h => h.dataset.heading === title).map(h => h.querySelector(prefixClass)?.dataset.prefix);
    for (const mode of ["reading", "live-preview"]) {
      await open("Linked headings.md", mode);
      const section = mode === "reading" ? ".markdown-reading-view" : ".cm-content";
      const badges = () => [...noteRoot().querySelectorAll(section + " " + prefixClass)];
      await until(() => badges().some(b => b.dataset.prefix === "3"), mode + ": ordinary heading numbered");
      assert(badges().length === 1, mode + ": linked handwritten number duplicated");
      pass(mode + ": wiki aliases and reference links retain a single handwritten number");
    }
    await open("Numbering.md", "reading");
    await until(() => readingPrefixes("Methods").join() === "1,2", "both repeated reading headings have distinct numbers");
    assert(readingPrefixes("Materials")[0] === "1.1" && readingPrefixes("Verification")[0] === "1.2", "Skipped levels lost sibling order");
    assert(readingPrefixes("Setext detail")[0] === "3" && !readingPrefixes("1.3 Existing")[0], "Setext or handwritten reading number incorrect");
    await until(() => noteRoot().querySelector('.markdown-embed [data-heading="Embedded section"]'), "opted-in embed is actually rendered");
    assert(!noteRoot().querySelector(".markdown-embed " + prefixClass) && !noteRoot().querySelector("blockquote " + prefixClass), "An embedded or quoted heading was numbered");
    const numberedHeading = noteRoot().querySelector('h4[data-heading="Materials"]');
    const number = numberedHeading.querySelector(prefixClass);
    assert(number.getBoundingClientRect().width > 0 && getComputedStyle(number, "::before").content.includes("1.1"), "The prefix is not visibly painted");
    const selection = numberedHeading.ownerDocument.createRange(); selection.selectNodeContents(numberedHeading);
    assert(selection.toString() === "Materials" && numberedHeading.dataset.heading === "Materials", "Reading selection or link target gained an automatic number");
    pass("a single opted-in note numbers skipped, Setext and repeated headings with intact selection and link targets");
    await shot("numbering-reading", noteRoot());
    const readingFold = () => noteRoot().querySelector('h2[data-heading="Methods"] .heading-collapse-indicator');
    const materialsVisible = () => noteRoot().querySelector('h4[data-heading="Materials"]')?.getBoundingClientRect().height > 0;
    readingFold().click();
    await until(() => !materialsVisible(), "folded reading section");
    assert(readingPrefixes("Methods").at(-1) === "2", "Folding renumbered a following section");
    readingFold().click();
    await until(() => materialsVisible() && readingPrefixes("Materials")[0] === "1.1", "expanded section retains its number");
    pass("folding and expanding one section preserves its numbering and the next chapter");
    await open("Numbering.md", "source");
    assert(!noteRoot().querySelector(".cm-line " + prefixClass), "Source mode shows automatic numbers");
    await open("Numbering.md", "live-preview");
    const ed = leaf.view.editor, originalNote = ed.getValue();
    const prefixAt = text => {
      const pos = ed.getValue().indexOf(text);
      if (pos < 0 || pos < ed.cm.viewport.from || pos >= ed.cm.viewport.to) return;
      const dom = ed.cm.domAtPos(pos + 1).node;
      return (dom.nodeType === 1 ? dom : dom.parentElement).closest(".cm-line")?.querySelector(prefixClass)?.dataset.prefix;
    };
    await until(() => prefixAt("Verification") === "1.2", "Live Preview agrees with the reading index");
    const editorPrefix = noteRoot().querySelector(".cm-line " + prefixClass);
    assert(editorPrefix.getBoundingClientRect().width > 0 && editorPrefix.getAttribute("aria-hidden") === "true", "The editor prefix is invisible or exposes decorative text to assistive technology");
    assert(fs.readFileSync(numberingPath).equals(originalBytes) && originalNote === originalBytes.toString("utf8"), "Displaying numbers changed the saved Markdown or editor buffer");
    pass("switching between Reading, Source and Live Preview preserves the exact note bytes and editor text");
    await shot("numbering-live-preview", noteRoot());
    const far = ed.offsetToPos(originalNote.indexOf("Far away"));
    ed.scrollIntoView({ from: far, to: far }, true);
    await until(() => prefixAt("Far away") === "4", "off-screen heading retains whole-note numbering");
    const start = { line: 0, ch: 0 }; ed.scrollIntoView({ from: start, to: start }, true);
    await until(() => prefixAt("Materials") === "1.1", "returned to first section");
    const moveStart = originalNote.indexOf("#### Materials"), moveEnd = originalNote.indexOf("### 1.3 Existing");
    ed.replaceRange("### Verification\n#### Materials\n", ed.offsetToPos(moveStart), ed.offsetToPos(moveEnd));
    // The handwritten 1.3 is now expected to be 1.2 and pauses the whole note.
    await until(() => !noteRoot().querySelector(".cm-line " + prefixClass), "conflict pauses all editor prefixes");
    app.setting.open(); app.setting.openTabById("patches");
    await until(() => app.setting.activeTab.containerEl.textContent.includes("Expected 1.2."), "current-note preview explains the handwritten conflict");
    const openOptions = async label => {
      const findRow = () => [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].find(el => el.isConnected && el.getClientRects().length && el.querySelector(".setting-item-name")?.textContent === "Heading numbering");
      await until(findRow, "heading numbering setting is visible");
      const setting = findRow();
      const panel = () => setting.ownerDocument.querySelector(".obsidian-patch-heading-number-modal") ?? document.querySelector(".obsidian-patch-heading-number-modal");
      setting.scrollIntoView({ block: "center" });
      setting.ownerDocument.defaultView.focus();
      [...setting.querySelectorAll("button")].find(el => el.textContent === label).click();
      await until(panel, "numbering options open");
      return panel();
    };
    const setOption = (control, value) => { control.value = value; control.dispatchEvent(new Event("change", { bubbles: true })); };
    const setField = (modal, label, value) => setOption(modal.querySelector('[aria-label="' + label + '"]'), value);
    const applyOptions = async modal => {
      modal.querySelector('button[type="submit"]').click();
      await until(() => !modal.isConnected, "numbering options saved");
    };
    const options = await openOptions("Vault options");
    options.querySelector("details").open = true;
    assert(getComputedStyle(options.querySelector(prefixClass)).fontWeight === "700", "sample did not show bold numbers");
    setField(options, "Numbering style", "zh-report");
    setField(options, "Starting heading level", "2");
    setField(options, "Maximum depth", "1");
    setField(options, "First number", "10");
    await until(() => options.querySelector(".obsidian-patch-heading-number-preview")?.textContent.includes("十一、 Results"), "advanced controls update the sample");
    checkNumberStarts(options.querySelectorAll(".obsidian-patch-heading-number-preview " + prefixClass), "settings");
    await shot("numbering-settings", options);
    await applyOptions(options);
    assert(plugin().settings.headingNumbering.startLevel === 2 && plugin().settings.headingNumbering.maxDepth === 1, "Advanced heading options did not persist");
    await plugin().setHeadingNumbering({ ...defaults, preset: "zh-report" });
    pass("the settings controls preview the selected style, starting level, depth and initial ordinal");
    app.setting.close();
    ed.undo();
    await until(() => ed.getValue() === originalNote && prefixAt("Materials") === "1.1", "one undo restores the text and decimal per-note numbers");
    pass("Live Preview numbers off-screen headings and undo restores automatic numbers after a manual conflict");
    const unnumbered = originalNote.replace("1.3 Existing", "Existing");
    for (const [preset, expected] of [["zh-report", "（二）"], ["en-outline", "B."], ["continuous", "3"]]) {
      ed.setValue(unnumbered.replace("patch-heading-numbering: decimal", "patch-heading-numbering: " + preset));
      await until(() => prefixAt("Verification") === expected, "unsaved property selects " + preset);
    }
    const moved = unnumbered.replace("#### Materials\n### Verification", "### Verification\n#### Materials");
    ed.setValue(moved);
    await until(() => prefixAt("Materials") === "1.1.1" && prefixAt("Verification") === "1.1", "moving a section recomputes descendants");
    await plugin().setHeadingNumbering({ ...defaults, enabled: true });
    ed.setValue(unnumbered.replace("patch-heading-numbering: decimal", "patch-heading-numbering: false"));
    await until(() => !noteRoot().querySelector(".cm-line " + prefixClass), "per-note false overrides the vault setting");
    ed.setValue(originalNote); await leaf.view.save();
    pass("all four presets, unsaved note overrides, and moving a subtree work through the live editor");

    const split = app.workspace.getLeaf("split", "vertical");
    try {
      await split.openFile(leaf.view.file, { active: false, state: { mode: "preview" } });
      const peerPrefix = () => split.view.contentEl.querySelector('h3[data-heading="Verification"] ' + prefixClass)?.dataset.prefix;
      await until(() => peerPrefix() === "1.2", "second pane reads the original numbering");
      ed.setValue(unnumbered.replace("patch-heading-numbering: decimal", "patch-heading-numbering: decimal\nunrelated: keep"));
      await leaf.view.save();
      app.setting.open(); app.setting.openTabById("patches");
      const noteOptions = await openOptions("This note…");
      noteOptions.querySelector("details").open = true;
      setField(noteOptions, "First number", "10"); setField(noteOptions, "Starting heading level", "2"); setField(noteOptions, "Maximum depth", "1");
      const reference = noteOptions.querySelectorAll("details")[1];
      reference.open = true;
      assert(reference.querySelector("pre").textContent === "patch-heading-numbering: decimal start=10 level=2 depth=1", "YAML reference did not show a single property");
      reference.open = false;
      await shot("numbering-note-settings", noteOptions);
      await applyOptions(noteOptions);
      app.setting.close();
      const currentPrefixes = () => [prefixAt("## Methods"), peerPrefix(), ...Array.from(split.view.contentEl.querySelectorAll('.markdown-reading-view [data-heading] '+prefixClass), item => [item.parentElement.dataset.heading, item.dataset.prefix])];
      await until(() => prefixAt("## Methods") === "10" && !peerPrefix() && split.view.contentEl.querySelector('h2[data-heading="Methods"] ' + prefixClass)?.dataset.prefix === "10", "both views use the note's starting number and depth").catch(error => { throw new Error(error.message + JSON.stringify(currentPrefixes())); });
      assert(ed.getValue().includes("unrelated: keep") && plugin().settings.headingNumbering.startAt === 1, "note settings changed other properties or the vault default");
      app.setting.open(); app.setting.openTabById("patches");
      const reset = await openOptions("This note…");
      reset.querySelector("details").open = true;
      for (const label of ["First number", "Starting heading level", "Maximum depth"]) setField(reset, label, "");
      await applyOptions(reset);
      app.setting.close();
      await until(() => prefixAt("## Methods") === "1" && peerPrefix() === "1.2", "cleared properties inherit the vault values again");
      assert(ed.getValue().includes("patch-heading-numbering: decimal\n") && !ed.getValue().includes("start=10"), "clearing advanced options did not restore the simple style");
      const badges = [leaf.view.contentEl.querySelector(".cm-line " + prefixClass), split.view.contentEl.querySelector(".markdown-reading-view " + prefixClass)];
      assert(badges.every(el => el && getComputedStyle(el).fontWeight === "700"), "open panes use different number weights");
      pass("number badges stay bold in both open panes with a single note property");
      pass("note controls persist individual overrides, show their YAML, preserve unrelated properties and restore inheritance in both panes");
      ed.setValue(unnumbered.replace("## Methods", "## Introduction\n## Methods"));
      await leaf.view.save();
      await until(() => prefixAt("Verification") === "2.2" && peerPrefix() === "2.2", "retained heading updates in both panes after a preceding insertion");
      ed.setValue(originalNote.replace("1.3 Existing", "7.3 Existing")); await leaf.view.save();
      await until(() => !split.view.contentEl.querySelector(".markdown-reading-view " + prefixClass), "handwritten conflict clears the entire reading pane");
      ed.setValue(originalNote); await leaf.view.save();
      await until(() => peerPrefix() === "1.2", "reading numbers recover after a conflict is resolved");
      pass("an open reading pane follows earlier inserts, manual conflicts and corrections in the editor");
    } finally {
      split.detach();
      app.workspace.setActiveLeaf(leaf, { focus: false });
    }

    for (const mode of ["reading", "live-preview"]) {
      await plugin().setActiveLine(true);
      await open("Number columns.md", mode);
      const content = noteRoot();
      content.style.setProperty("--file-line-width", "340px", "important");
      try {
        leaf.view.onResize();
        for (const preset of ["decimal", "zh-report", "en-outline", "continuous"]) {
          await plugin().setHeadingNumbering({ ...defaults, enabled: true, preset, startAt: 9 });
          const host = mode === "reading" ? ".markdown-reading-view" : ".cm-content";
          const spans = () => [...content.querySelectorAll(host + " " + prefixClass)];
          await until(() => spans().length === 4 && spans()[0].dataset.prefix === ({decimal:"9","zh-report":"九、","en-outline":"IX.",continuous:"9"})[preset], "number columns " + mode + " " + preset);
          checkNumberStarts(spans(), mode + "/" + preset);
          const boxes = spans().map((span, i) => {
            const heading = span.closest(".cm-line,h2,h3,h4");
            const walker = heading.ownerDocument.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
            const label = ["方法概述", "数据来源", "结果分析", "复核步骤"][i];
            while (walker.nextNode()) {
              const node = walker.currentNode, start = node.textContent.indexOf(label);
              if (start < 0) continue;
              const range = heading.ownerDocument.createRange();
              range.setStart(node, start); range.setEnd(node, node.length);
              return [...range.getClientRects()].filter(box => box.width > 0);
            }
            throw Error("Missing heading text " + label);
          });
          assert(boxes[3].length > 1, mode + ": fixture did not wrap");
          if (preset === "decimal") {
            const arrow = () => spans()[0].parentElement.querySelector(mode === "reading" ? ".heading-collapse-indicator" : ".cm-fold-indicator .collapse-indicator");
            const clickArrow = async () => {
              const a = arrow(), box = a?.getBoundingClientRect(), badge = spans()[0].getBoundingClientRect();
              assert(box && box.width > 0 && box.right <= badge.left + 0.5, mode + ": fold control overlaps numbering: " + JSON.stringify([box,badge]));
              const x = box.left + box.width / 2, y = box.top + box.height / 2;
              const debugger_ = wc.debugger, owned = !debugger_.isAttached();
              if (owned) debugger_.attach();
              try {
                await debugger_.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
                assert(a.contains(content.ownerDocument.elementFromPoint(x, y)), mode + ": fold control cannot be hit");
                for (const type of ["mousePressed", "mouseReleased"]) await debugger_.sendCommand("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
              } finally { if (owned) debugger_.detach(); }
            };
            const childVisible = () => spans().some(s => s.dataset.prefix === "9.1" && s.getBoundingClientRect().height > 0);
            await clickArrow(); await until(() => !childVisible(), mode + ": click folds numbered section");
            await clickArrow(); await until(childVisible, mode + ": click unfolds numbered section");
            pass(mode + ": native fold arrow has a separate clickable area before the number");
            const body = content.ownerDocument.body;
            const savedFont = body.style.getPropertyValue("--font-text"), priority = body.style.getPropertyPriority("--font-text");
            try {
              const widths = [];
              for (const font of ["monospace","serif"]) {
                body.style.setProperty("--font-text", font, "important");
                app.workspace.trigger("css-change"); await wait(100);
                assert(getComputedStyle(spans()[0]).fontFamily === font, mode + ": number font failed to update");
                widths.push(spans()[0].getBoundingClientRect().width);
              }
              assert(Math.abs(widths[0] - widths[1]) > 1, mode + ": changing vault fonts did not resize the number column");
              pass(mode + ": changing the vault text font resizes the number column in the open note");
            } finally {
              if (savedFont) body.style.setProperty("--font-text", savedFont, priority);
              else body.style.removeProperty("--font-text");
              app.workspace.trigger("css-change"); await wait(100);
            }
            report.headingRows ??= {};
            report.headingRows[mode] = spans().map((span, i) => {
              const h = span.closest(".cm-line,h2,h3,h4"), css = getComputedStyle(h);
              const bounds = h.getBoundingClientRect(), number = span.getBoundingClientRect(), text = boxes[i][0];
              const label = h.querySelector(".obsidian-patch-heading-level");
              const style = label ? getComputedStyle(label) : getComputedStyle(h, "::after");
              const titleCenter = text.top + text.height / 2;
              const labelCenter = bounds.top + parseFloat(style.top) + parseFloat(style.paddingTop) + parseFloat(style.height) / 2;
              return { numberOffset: number.top + number.height / 2 - titleCenter, labelOffset: labelCenter - titleCenter,
                paddingTop: css.paddingTop, paddingBottom: css.paddingBottom, marginTop: css.marginTop, marginBottom: css.marginBottom,
                visualLines: boxes[i].length };
            });
            for (const row of report.headingRows[mode]) {
              assert(Math.abs(row.numberOffset) <= 1 && Math.abs(row.labelOffset) <= 1,
                mode + ": number or level label is off the first visual line: " + JSON.stringify(row));
              const symmetric = mode === "reading" ? row.marginTop === row.marginBottom : row.paddingTop === row.paddingBottom;
              assert(symmetric, mode + ": heading space is asymmetric: " + JSON.stringify(row));
            }
            pass(mode + ": short and wrapped headings have symmetric spacing and first-line labels");
          }
          const lefts = boxes.flat().map(r => r.left);
          const delta = Math.max(...lefts) - Math.min(...lefts);
          assert(delta <= 1, `${mode}/${preset}: title and continuation starts differ by ${delta}px: ${lefts}`);
          report.headingColumnOffsets ??= {};
          report.headingColumnOffsets[mode + "/" + preset] = delta;
          if (preset === "decimal") {
            const classes = content.ownerDocument.body.classList;
            const light = classes.contains("theme-light"), dark = classes.contains("theme-dark");
            const colors = {};
            try {
              for (const theme of ["light", "dark"]) {
                classes.toggle("theme-light", theme === "light");
                classes.toggle("theme-dark", theme === "dark");
                await wait(150);
                const numbers = spans();
                const style = getComputedStyle(numbers[0]);
                colors[theme] = style.backgroundColor;
                assert(colors[theme] !== "rgba(0, 0, 0, 0)" && colors[theme] !== style.color, mode + "/" + theme + ": number is not legible");
                const first = numbers[0].closest(".cm-line,h2").getBoundingClientRect();
                const last = numbers[3].closest(".cm-line,h4").getBoundingClientRect();
                await shot("aligned-headings-" + mode + "-" + theme, content, { left: first.left - 6, top: first.top - 4,
                  width: first.width + 12, height: last.bottom - first.top + 8 });
              }
              assert(colors.light !== colors.dark, mode + ": number background did not follow the theme");
              pass(mode + ": automatic number backgrounds follow the light and dark palettes");
            } finally {
              classes.toggle("theme-light", light);
              classes.toggle("theme-dark", dark);
            }
            if (mode === "live-preview") {
              const ed = leaf.view.editor;
              ed.setCursor(ed.offsetToPos(ed.getValue().indexOf("方法概述") + 1));
              ed.focus(); await wait(100);
              const active = content.querySelector(".cm-line.cm-active");
              assert(active?.querySelector(prefixClass)?.dataset.prefix === "9" && active.textContent.includes("方法概述"), "Editing a numbered heading lost its number or Markdown text");
              ed.setCursor(ed.offsetToPos(ed.getValue().indexOf("复核步骤") + 1)); await wait(100);
              const wrapped = content.querySelector(".cm-line.cm-active").getBoundingClientRect();
              const left = Math.min(wrapped.left - 26, content.querySelector(".cm-gutters").getBoundingClientRect().left);
              await shot("active-numbered-heading", content, { left, top: wrapped.top - 4,
                width: wrapped.right - left + 6, height: wrapped.height + 8 });
              ed.setCursor({ line: 2, ch: 0 }); await wait(100);
            }
          }
        }
        await plugin().setActiveLine(false);
        await plugin().setHeadingLevels(false);
        const firstHeading = () => content.querySelector(mode === "reading" ? 'h2[data-heading="方法概述"]' : ".cm-content .HyperMD-header-2");
        const spacing = () => {
          const css = getComputedStyle(firstHeading());
          return mode === "reading" ? [css.marginTop, css.marginBottom] : [css.paddingTop, css.paddingBottom];
        };
        const [above, below] = spacing();
        assert(firstHeading().querySelector(prefixClass) && parseFloat(above) > 0 && above === below, mode + ": numbering alone lost the balanced space");
        await plugin().setHeadingNumbering(defaults);
        await until(() => !firstHeading().querySelector(prefixClass), "numbering disabled");
        const [nativeAbove, nativeBelow] = spacing();
        assert(parseFloat(nativeAbove) > parseFloat(nativeBelow), mode + ": disabling decorations did not restore native spacing");
        await plugin().setHeadingLevels(true);
        const [labelAbove, labelBelow] = spacing();
        assert(labelAbove === labelBelow, mode + ": heading levels alone lost the balanced space");
        pass(mode + ": either heading feature balances spacing and disabling the decorations restores native spacing");
        pass(mode + ": all four presets align numbers and titles at their column starts across levels, digit widths and wrapped lines");
      } finally { content.style.removeProperty("--file-line-width"); leaf.view.onResize(); }
    }
    await plugin().setHeadingNumbering({ ...defaults, enabled: true });
    await open("Navigation note.md", "reading");
    await until(() => readingPrefixes("Target Heading").some(Boolean), "inherited numbering is visible before PDF export");
    await plugin().setPdfExport({ outline: true, headingLinks: true });
    const visibleModal = capture(true); await wait(100);
    assert(visibleModal.containerEl.isConnected && visibleModal.ctaEl, "The native export dialog is not usable");
    visibleModal.close(); pass("the ordinary Export to PDF command retains its native dialog");
    await exportPdf("enabled");
    const enabled = report.exports.at(-1);
    const expected = ["Wiki target", "Markdown slug", "Encoded", "Same basename", "Vault path", "Relative Markdown", "First repeated", "Second repeat", "Formatted"];
    for (const text of expected) assert(enabled.links.find(a => a.text === text)?.href?.startsWith("#"), `Missing local heading link: ${text}`);
    for (const text of ["Other note", "Missing heading", "Block reference"]) assert(!enabled.links.find(a => a.text === text)?.href, `Incorrect local jump: ${text}`);
    assert(enabled.links.find(a => a.text === "External")?.href === "https://example.com/#Target", "An external link was changed");
    pass("same-note Unicode, Markdown, wiki and repeated-heading links resolve; other notes and block references are not misdirected");
    await plugin().setPdfExport({ outline: true, headingLinks: false }); await exportPdf("outline-only");
    await plugin().setPdfExport({ outline: false, headingLinks: true }); await exportPdf("links-only");
    await plugin().setHeadingNumbering(defaults);
    await plugin().setPdfExport({ outline: false, headingLinks: false }); await exportPdf("disabled");
    await plugin().setPdfExport({ outline: true, headingLinks: true });
    const pending = capture();
    await app.plugins.disablePlugin("patches");
    assert(!leaf.view.contentEl.classList.contains("obsidian-patch-heading-levels"), "Reading style survived unload");
    assert(leaf.view.printToPdf.toString().includes("new "), "The native export method was not restored");
    await exportPdf("unloaded", pending);
    await app.plugins.enablePlugin("patches");
    await exportPdf("reloaded");
    pass("unload restores the native exporter, including an already-open modal; reload re-enables navigation once");
  } catch (e) {
    report.error = e.stack ?? String(e);
    report.diagnostics = { file: leaf.view.file?.path, mode: leaf.view.getMode?.(), lines: [...leaf.view.contentEl.querySelectorAll(".cm-line")].slice(0,15).map(e => e.outerHTML) };
  } finally {
    app.setting.close();
    if (!plugin()) await app.plugins.enablePlugin("patches");
    save();
  }
}
