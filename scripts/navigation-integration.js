async function navigationIntegration(app, config) {
  const fs = require("fs"), path = require("path");
  const wc = require("electron").remote.getCurrentWebContents();
  const { leaf, report, save, wait } = config;
  report.exports = [];
  const plugin = () => app.plugins.plugins["obsidian-patch"];
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
  const shot = async (name, element) => {
    const win = element.ownerDocument.defaultView;
    const target = win === window ? wc : win.electron.remote.getCurrentWebContents();
    const r = element.getBoundingClientRect(), debugger_ = target.debugger, owned = !debugger_.isAttached();
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
    await until(() => app.vault.getFileByPath("Patch Navigation Tests/Headings.md"), "fixture indexing");
    await plugin().setHeadingLevels(true);
    app.setting.open(); app.setting.openTabById("obsidian-patch");
    await wait(200);
    const settings = app.setting.activeTab.containerEl;
    const names = [...settings.querySelectorAll(".setting-item-heading .setting-item-name")].map(el => el.textContent);
    assert(JSON.stringify(names) === JSON.stringify(["Callouts", "Editor", "Line Width", "Math Format", "Patch Banner", "Patch Icons", "Patch Mermaid", "PDF Export"]), `Unexpected setting order: ${names}`);
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

    await open("Navigation note.md", "reading");
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
    await plugin().setPdfExport({ outline: false, headingLinks: false }); await exportPdf("disabled");
    await plugin().setPdfExport({ outline: true, headingLinks: true });
    const pending = capture();
    await app.plugins.disablePlugin("obsidian-patch");
    assert(!leaf.view.contentEl.classList.contains("obsidian-patch-heading-levels"), "Reading style survived unload");
    assert(leaf.view.printToPdf.toString().includes("new "), "The native export method was not restored");
    await exportPdf("unloaded", pending);
    await app.plugins.enablePlugin("obsidian-patch");
    await exportPdf("reloaded");
    pass("unload restores the native exporter, including an already-open modal; reload re-enables navigation once");
  } catch (e) {
    report.error = e.stack ?? String(e);
    report.diagnostics = { file: leaf.view.file?.path, mode: leaf.view.getMode?.(), lines: [...leaf.view.contentEl.querySelectorAll(".cm-line")].slice(0,15).map(e => e.outerHTML) };
  } finally {
    app.setting.close();
    if (!plugin()) await app.plugins.enablePlugin("obsidian-patch");
    save();
  }
}
