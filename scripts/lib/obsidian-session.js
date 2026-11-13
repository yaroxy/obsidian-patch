// Evaluated inside Obsidian by integration-runner.mjs, not bundled into the plugin.
async function obsidianSession(app, config, suite) {
  const fs = require("fs"), path = require("path");
  const report = { runId: config.runId, checks: [], skipped: [], finished: false };
  const save = () => {
    const file = path.join(config.output, "results.json");
    fs.writeFileSync(file + ".tmp", JSON.stringify(report, null, 2));
    fs.renameSync(file + ".tmp", file);
  };
  const controller = new AbortController();
  const checkpoint = () => { if (controller.signal.aborted) throw controller.signal.reason; };
  const wait = ms => new Promise((resolve, reject) => {
    if (controller.signal.aborted) return reject(controller.signal.reason);
    const abort = () => { clearTimeout(timer); reject(controller.signal.reason); };
    const timer = setTimeout(() => { controller.signal.removeEventListener("abort", abort); resolve(); }, ms);
    controller.signal.addEventListener("abort", abort, { once: true });
  });
  const cleanupErrors = [];
  const cleanup = async (name, fn) => {
    try { await fn(); } catch (e) { cleanupErrors.push(`${name}: ${e.stack ?? e}`); }
  };
  let leaf, previous, wc, throttle, timer, sizes;
  try {
    if (fs.realpathSync(app.vault.adapter.getBasePath()) !== config.vault) throw new Error("CLI selected a different vault");
    if (globalThis.__obsidianPatchTest) throw new Error("Another integration test is running");
    if (!app.plugins.plugins["patches"]) throw new Error("Enable patches before running integration tests");
    if (app.setting.containerEl.isConnected || document.querySelector(".modal-container")) throw new Error("Close the development vault's dialogs before testing");
    globalThis.__obsidianPatchTest = { runId: config.runId, abort: reason => controller.abort(new Error(reason)) };
    wc = require("electron").remote.getCurrentWebContents();
    throttle = wc.getBackgroundThrottling();
    previous = app.workspace.getMostRecentLeaf();
    sizes = Object.fromEntries(["obsidian-patch-table-editor-size", "obsidian-patch-callout-editor-size"]
      .map(key => [key, localStorage.getItem(`${app.appId}-${key}`)]));
    wc.setBackgroundThrottling(false);
    leaf = app.workspace.getLeaf("tab");
    app.workspace.setActiveLeaf(leaf, { focus: false });
    timer = setTimeout(() => controller.abort(new Error(`Integration timed out after ${config.timeoutMs} ms`)), config.timeoutMs);
    save();
    await suite(app, { ...config, leaf, report, save, wait, checkpoint });
    checkpoint();
  } catch (e) {
    report.error ??= e.stack ?? String(e);
  } finally {
    clearTimeout(timer);
    // Only the session that acquired the window may restore it.
    if (globalThis.__obsidianPatchTest?.runId === config.runId) {
      await cleanup("dialogs", () => {
        app.setting.close();
        for (const button of document.querySelectorAll(".obsidian-patch-table-modal button,.obsidian-patch-callout-modal button")) {
          if (button.textContent === "Cancel") button.click();
        }
        document.querySelector(".modal-container .modal-close-button")?.click();
      });
      await cleanup("test tab", async () => {
        try { await leaf?.view.save?.(); } finally { leaf?.detach(); }
      });
      await cleanup("plugin settings", async () => {
        if (app.plugins.plugins["patches"]) await app.plugins.disablePlugin("patches");
        const file = path.join(config.vault, ".obsidian/plugins/patches/data.json");
        if (config.settingsExisted) fs.copyFileSync(path.join(config.output, "settings-before.json"), file);
        else fs.rmSync(file, { force: true });
        await app.plugins.enablePlugin("patches");
        if (!app.plugins.plugins["patches"]) throw new Error("Plugin did not reload");
      });
      await cleanup("editor sizes", () => {
        for (const [key, value] of Object.entries(sizes ?? {})) {
          if (value === null) localStorage.removeItem(`${app.appId}-${key}`);
          else localStorage.setItem(`${app.appId}-${key}`, value);
        }
      });
      await cleanup("active tab", () => { if (previous?.parent) app.workspace.setActiveLeaf(previous, { focus: false }); });
      await cleanup("background throttling", () => { if (wc) wc.setBackgroundThrottling(throttle); });
      report.restored = { activeTab: !previous?.parent || app.workspace.getMostRecentLeaf() === previous,
        backgroundThrottling: wc?.getBackgroundThrottling() === throttle,
        editorSizes: Object.entries(sizes ?? {}).every(([key, value]) => localStorage.getItem(`${app.appId}-${key}`) === value) };
      for (const [key, value] of Object.entries(report.restored)) if (!value) cleanupErrors.push(`${key} was not restored`);
      delete globalThis.__obsidianPatchTest;
    }
    if (cleanupErrors.length) { report.cleanupErrors = cleanupErrors; report.error ??= "Integration cleanup failed"; }
    report.finished = true;
    save();
  }
}
