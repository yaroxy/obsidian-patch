async function captureFeatureDemos(app, context) {
  const { leaf, report, wait, save } = context;
  const fs = require("fs"), path = require("path");
  const wc = require("electron").remote.getCurrentWebContents();
  const plugin = () => app.plugins.plugins.patches;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const until = async (condition, label) => {
    for (let i = 0; i < 700; i++) {
      context.checkpoint();
      if (await condition()) return;
      await wait(50);
    }
    throw new Error(`Timed out: ${label}`);
  };
  const pass = message => { report.checks.push(message); save(); };
  const root = `Patch Demo Captures/Run-${context.runId}`;
  const body = document.body;
  const original = { dark: body.classList.contains("theme-dark"), light: body.classList.contains("theme-light"),
    zoom: wc.getZoomFactor(), readable: app.vault.getConfig("readableLineLength"), inlineTitle: app.vault.getConfig("showInlineTitle") };
  const errors = [];
  const onError = event => errors.push(String(event.error?.stack ?? event.reason?.stack ?? event.message ?? event.reason));
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onError);
  report.demos = { screenshots: [], errors, fixture: root };
  const theme = async dark => {
    body.classList.toggle("theme-dark", dark);
    body.classList.toggle("theme-light", !dark);
    app.workspace.trigger("css-change");
    await wait(300);
  };
  const capture = async (name, rect, doc = document) => {
    await wait(200);
    const win = doc.defaultView;
    const contents = win === window ? wc : win.electron.remote.getCurrentWebContents();
    const box = typeof rect === "function" ? rect() : rect;
    const clip = { x: Math.max(0, Math.floor(box.x)), y: Math.max(0, Math.floor(box.y)),
      width: Math.floor(Math.min(box.width, win.innerWidth - box.x)), height: Math.floor(Math.min(box.height, win.innerHeight - box.y)) };
    assert(clip.width > 0 && clip.height > 0, `Empty capture: ${name}`);
    const shot = await contents.capturePage(clip);
    fs.writeFileSync(path.join(context.output, `${name}.png`), shot.toPNG());
    report.demos.screenshots.push({ name, clip, pixels: shot.getSize() });
    save();
  };
  const preview = () => leaf.view.previewMode.containerEl;
  const openNote = async (name, source) => {
    const file = await app.vault.create(`${root}/${name}.md`, source);
    await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "preview", source: false } });
    await until(() => preview()?.querySelector("h1"), `render ${name}`);
    return file;
  };
  const setting = name => [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")]
    .find(el => el.querySelector(".setting-item-name")?.textContent === name);
  const enter = async element => {
    element.focus();
    const win = element.ownerDocument.defaultView;
    const contents = win === window ? wc : win.electron.remote.getCurrentWebContents();
    contents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    contents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await wait(200);
  };
  try {
    await until(() => app.vault.getAbstractFileByPath("Patch Demo Captures"), "capture parent registered");
    await app.vault.createFolder(root);
    wc.setZoomFactor(1);
    app.vault.setConfig("readableLineLength", true);
    app.vault.setConfig("showInlineTitle", false);
    await theme(false);
    await plugin().setHeadingLevels(false);
    const iconNote = await openNote("Python tools", "# Python tools\n\nA recognizable icon for notebooks, scripts, and research notes.\n");
    const actions = [];
    const menu = new Proxy({ addSeparator() { return this; }, addItem(callback) {
      const action = {};
      const item = new Proxy({}, { get: (_, key) => value => {
        if (key === "setTitle") action.title = value;
        if (key === "onClick") action.click = value;
        return item;
      } });
      callback(item); actions.push(action); return this;
    } }, { get: (target, key) => key in target ? target[key] : () => menu });
    app.workspace.trigger("file-menu", menu, iconNote, "file-explorer");
    const action = actions.findLast(item => /^Change icons?$/.test(item.title));
    assert(action, "Missing Change icon action");
    action.click();
    const picker = () => document.querySelector(".obsidian-patch-icon-picker");
    await until(() => picker()?.querySelector("input"), "icon picker");
    await until(() => plugin().icons.simpleIconsStatus().status === "ready", "live Simple Icons data");
    const search = picker().querySelector("input");
    search.value = "python";
    search.dispatchEvent(new Event("input"));
    await until(() => picker().querySelector('[data-icon-id="simple-icons:python"]'), "Python brand result");
    picker().querySelector('[data-icon-id="simple-icons:python"]').click();
    const button = name => [...picker().querySelectorAll("button")].find(el => el.textContent === name);
    assert(button("Brand color").getAttribute("aria-pressed") === "true", "Brand color was not selected");
    const iconRect = () => { const r = picker().getBoundingClientRect(); return { x: r.x - 20, y: r.y - 20, width: r.width + 40, height: r.height + 40 }; };
    await capture("icons-brand", iconRect);
    picker().querySelector('button[aria-label="Green"]').click();
    await capture("icons-preset", iconRect);
    const custom = picker().querySelector('input[type="color"]');
    custom.value = "#8b5cf6";
    custom.dispatchEvent(new Event("input", { bubbles: true }));
    await capture("icons-custom", iconRect);
    button("Apply").click();
    await until(() => !picker(), "icon applied");
    assert(plugin().settings.icons.paths[iconNote.path] === "simple-icons:python" && plugin().settings.icons.colors[iconNote.path] === "#8B5CF6", "Icon/color did not persist");
    pass("Captured real brand, preset and custom color previews; Apply saved the icon and color together");

    await plugin().setLineWidth({ enabled: true, width: 900, statusBar: true });
    app.setting.open();
    app.setting.openTabById("patches");
    // Obsidian moves settings to a separate window asynchronously; ignore its old detached tab.
    await until(() => setting("Line width (px)")?.isConnected && app.setting.activeTab.containerEl.ownerDocument.defaultView !== window,
      "global line width setting in its native window");
    let row;
    await until(() => {
      row = setting("Line width (px)");
      const r = row.getBoundingClientRect(), height = row.ownerDocument.defaultView.innerHeight;
      report.demos.widthPosition = { rect: r.toJSON(), height, connected: row.isConnected };
      save();
      if (row.isConnected && r.width > 0 && r.top > 15 && r.bottom < height - 15) return true;
      row.closest(".vertical-tab-content").scrollTop += r.top - 200;
      return false;
    }, "visible settings row");
    const widthRect = () => { const r = row.getBoundingClientRect(); return { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 }; };
    const number = row.querySelector('input[type="number"]'), slider = row.querySelector('input[type="range"]');
    await capture("width-900", widthRect, row.ownerDocument);
    number.focus(); number.value = "1137"; number.dispatchEvent(new Event("input", { bubbles: true }));
    await capture("width-entering", widthRect, row.ownerDocument);
    await enter(number);
    await until(() => plugin().settings.lineWidth.width === 1137 && slider.value === "1137", "exact width applied");
    await capture("width-1137", widthRect, row.ownerDocument);
    row.querySelector(".clickable-icon").click();
    await until(() => number.value === "900" && slider.value === "900", "width reset");
    pass("Captured exact 1137 px input; Enter synchronized the slider and reset restored 900 px");
    app.setting.close();

    await plugin().setLineWidth({ enabled: true, width: 720, statusBar: true });
    const source = (mode, dark) => ["# Code backgrounds", "", `Code background **${mode ? "on" : "off"}** · ${dark ? "Dark" : "Light"} theme`, "",
      "> [!warning] Before deploying `preview`", "> Keep `dryRun` enabled while checking the output.", ">", "> ```javascript",
      "> const options = { dryRun: true };", "> await deploy(options);", "> ```", ">", "> > [!tip] Check the preview first", "> > ```python", "> > print(\"Preview ready\")", "> > ```", "",
      "Code outside the callout keeps the theme’s background:", "", "```javascript", "console.log(\"Ready to review\");", "```", ""].join("\n");
    const calloutNote = await openNote("Code backgrounds", source(false, false));
    report.demos.callouts = [];
    for (const dark of [false, true]) {
      await theme(dark);
      let baselineTokens;
      for (const enabled of [false, true]) {
        await plugin().setCalloutCode(enabled);
        await app.vault.modify(calloutNote, source(enabled, dark));
        await until(() => preview().querySelectorAll("pre code .token").length > 5 && preview().textContent.includes(`background ${enabled ? "on" : "off"}`), "highlighted callout blocks");
        preview().scrollTop = 0;
        const blocks = [...preview().querySelectorAll("pre")];
        const tokens = [...preview().querySelectorAll("pre code .token")].map(el => [el.textContent, getComputedStyle(el).color]);
        if (!enabled) baselineTokens = JSON.stringify(tokens);
        else assert(JSON.stringify(tokens) === baselineTokens, "Code tint changed syntax colors");
        const styles = blocks.map(el => ({ callout: el.closest(".callout")?.dataset.callout ?? null, background: getComputedStyle(el).backgroundColor }));
        report.demos.callouts.push({ dark, enabled, styles });
        const container = preview().querySelector(".markdown-preview-sizer");
        const first = preview().querySelector("h1").getBoundingClientRect();
        const last = blocks.at(-1).getBoundingClientRect();
        const r = container.getBoundingClientRect();
        assert(last.bottom < innerHeight, "Callout demo is clipped");
        await capture(`callout-${dark ? "dark" : "light"}-${enabled ? "on" : "off"}`, { x: r.x - 16, y: first.y - 20, width: r.width + 32, height: last.bottom - first.y + 40 });
      }
    }
    pass("Captured code backgrounds off/on in both themes; highlighted token colors stayed identical");
    assert(!errors.length, `Window errors: ${errors.join("; ")}`);
  } finally {
    app.setting.close();
    [...document.querySelectorAll(".obsidian-patch-icon-picker button")].find(button => button.textContent === "Cancel")?.click();
    document.querySelector(".modal-container .modal-close-button")?.click();
    body.classList.toggle("theme-dark", original.dark);
    body.classList.toggle("theme-light", original.light);
    app.workspace.trigger("css-change");
    app.vault.setConfig("readableLineLength", original.readable);
    app.vault.setConfig("showInlineTitle", original.inlineTitle);
    wc.setZoomFactor(original.zoom);
    await leaf.setViewState({ type: "empty" });
    const folder = app.vault.getAbstractFileByPath(root);
    if (folder) await app.vault.delete(folder, true);
    report.demos.restored = { theme: body.classList.contains("theme-dark") === original.dark && body.classList.contains("theme-light") === original.light,
      zoom: wc.getZoomFactor() === original.zoom, fixtureRemoved: !app.vault.getAbstractFileByPath(root),
      readable: app.vault.getConfig("readableLineLength") === original.readable, inlineTitle: app.vault.getConfig("showInlineTitle") === original.inlineTitle,
      dialogsClosed: !document.querySelector(".obsidian-patch-icon-picker") };
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onError);
    save();
    assert(Object.values(report.demos.restored).every(Boolean), "Demo display state was not restored");
  }
}
