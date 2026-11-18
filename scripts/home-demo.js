async function captureHomeDemo(app, context) {
  const { leaf, wait, report, save } = context;
  const fs = require("fs"), path = require("path");
  const wc = require("electron").remote.getCurrentWebContents();
  const body = document.body, plugin = app.plugins.plugins.patches;
  const parent = "Patch Home Demo", root = `${parent}/Run-${context.runId}`;
  const configKeys = ["readableLineLength", "showInlineTitle", "propertiesInDocument"];
  const original = { dark: body.classList.contains("theme-dark"), light: body.classList.contains("theme-light"),
    zoom: wc.getZoomFactor(), config: Object.fromEntries(configKeys.map(key => [key, app.vault.getConfig(key)])) };
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const until = async (condition, label) => {
    for (let i = 0; i < 200; i++) { context.checkpoint(); if (condition()) return; await wait(50); }
    throw new Error(`Timed out: ${label}`);
  };
  try {
    await until(() => app.vault.getAbstractFileByPath(parent), "fixture parent");
    await app.vault.createFolder(root);
    const cover = await app.vault.createBinary(`${root}/kyoto-cover.jpg`, fs.readFileSync(context.options.cover));
    wc.setZoomFactor(1);
    body.classList.remove("theme-dark"); body.classList.add("theme-light");
    app.vault.setConfig("readableLineLength", true);
    app.vault.setConfig("showInlineTitle", false);
    app.vault.setConfig("propertiesInDocument", "hidden");
    app.workspace.trigger("css-change");
    await plugin.setHeadingLevels(false);
    await plugin.setBanner({ enabled: true, widthPercent: 70, autoplayVideos: false });
    await plugin.setLineWidth({ enabled: true, width: 780, statusBar: true });
    await plugin.setCalloutCode(true);
    const source = ["---", `patch-banner: \"[[${cover.path}]]\"`, "patch-line-width: 780", "---", "",
      "# A weekend in Kyoto", "", "Autumn walks, quiet cafés, and a plan with room to wander.", "",
      '<table><caption>Two days, at an easy pace</caption><thead><tr><th>Day</th><th>Time</th><th>Plan</th></tr></thead><tbody><tr><td rowspan="2">Saturday</td><td>Morning</td><td>Walk the Philosopher’s Path</td></tr><tr><td>Afternoon</td><td>Tea and small shops in Higashiyama</td></tr><tr><td>Sunday</td><td>Morning</td><td>Arashiyama before the crowds</td></tr></tbody></table>', "",
      "> [!tip] Keep the route handy", "> Save `kyoto-weekend` for offline use before leaving.", ">", "> ```javascript",
      '> const stops = ["Higashiyama", "Arashiyama"];', '> saveRoute("kyoto-weekend", stops);', "> ```", ""].join("\n");
    const note = await app.vault.create(`${root}/A weekend in Kyoto.md`, source);
    await leaf.setViewState({ type: "markdown", state: { file: note.path, mode: "preview", source: false } });
    const preview = () => leaf.view.previewMode.containerEl;
    const coverImage = () => preview()?.querySelector(".obsidian-patch-banner-stage")?.shadowRoot?.querySelector("img");
    await until(() => coverImage()?.complete && preview()?.querySelector("pre .token"), "banner and highlighted code");
    preview().scrollTop = 0;
    await wait(500);
    const image = coverImage();
    const first = image.getBoundingClientRect(), last = preview().querySelector(".callout").getBoundingClientRect();
    const table = preview().querySelector("table");
    assert(image.naturalWidth === 2172 && image.naturalHeight === 724, "Original cover dimensions changed");
    assert(Math.abs(first.width / first.height - 3) < 0.01, "Cover aspect ratio changed");
    assert(table.querySelector('[rowspan="2"]'), "Missing merged itinerary cells");
    assert(last.bottom < innerHeight - 12, `Demo clipped: ${last.bottom} / ${innerHeight}`);
    const x = Math.floor(Math.min(first.x, last.x) - 20), y = Math.floor(first.y - 20);
    const width = Math.ceil(Math.max(first.right, last.right) - x + 20), height = Math.ceil(last.bottom - y + 20);
    const shot = await wc.capturePage({ x, y, width, height });
    fs.writeFileSync(path.join(context.output, "home-overview.png"), shot.toPNG());
    report.capture = { pixels: shot.getSize(), cover: { width: image.naturalWidth, height: image.naturalHeight },
      codeBackground: getComputedStyle(preview().querySelector("pre")).backgroundColor };
    report.checks.push("Captured the original cover, merged itinerary table, inline code and highlighted callout block in one real note");
  } finally {
    body.classList.toggle("theme-dark", original.dark); body.classList.toggle("theme-light", original.light);
    for (const [key, value] of Object.entries(original.config)) app.vault.setConfig(key, value);
    wc.setZoomFactor(original.zoom);
    app.workspace.trigger("css-change");
    await leaf.setViewState({ type: "empty" });
    const fixture = app.vault.getAbstractFileByPath(root);
    if (fixture) await app.vault.delete(fixture, true);
    const folder = app.vault.getAbstractFileByPath(parent);
    if (folder?.children?.length === 0) await app.vault.delete(folder, true);
    report.displayRestored = body.classList.contains("theme-dark") === original.dark && body.classList.contains("theme-light") === original.light
      && wc.getZoomFactor() === original.zoom && configKeys.every(key => app.vault.getConfig(key) === original.config[key])
      && !app.vault.getAbstractFileByPath(root);
    save();
    assert(report.displayRestored, "Demo display preferences were not restored");
  }
}
