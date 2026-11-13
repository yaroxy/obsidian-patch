import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { build } from "esbuild";

// Exercise the real setting definitions and callbacks without loading feature DOMs.
async function loadTab(remote) {
  const source = readFileSync("src/main.ts", "utf8") + "\nexport { PatchesSettingTab };";
  const output = await build({
    stdin: { contents: source, resolveDir: resolve("src"), loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{ name: "settings-dependencies", setup(builder) {
      builder.onResolve({ filter: /^(obsidian|\.\/features\/)/ }, ({ path }) => ({ path, namespace: "settings-test" }));
      builder.onLoad({ filter: /.*/, namespace: "settings-test" }, ({ path }) => {
        if (path === "obsidian") return { contents: `
          export class Plugin {
            saved = [];
            async loadData() { return this.stored; }
            async saveData(value) { this.saved.push(value); }
            addSettingTab(tab) { this.tab = tab; }
          }
          export class PluginSettingTab {
            updates = 0; refreshes = 0;
            update() { this.updates += 1; }
            refreshDomState() { this.refreshes += 1; }
          }` };
        return { contents: `
          export const BUNDLED_VERSION = 'bundled', LATEST_VERSION = 'latest', BUNDLED_MERMAID_VERSION = '12.3.0';
          export const REMOTE_MERMAID_ENABLED = ${remote};
          export const isMermaidVersionChoice = value => value === 'bundled' || value === 'latest' || /^\\d+\\.\\d+\\.\\d+$/.test(value);
          export const DEFAULT_CALLOUT_CODE_ENABLED = true, DEFAULT_ACTIVE_LINE_ENABLED = true, DEFAULT_HEADING_LEVELS_ENABLED = true;
          export const DEFAULT_BANNER_WIDTH_PERCENT = 90, DEFAULT_LINE_WIDTH = 900, MIN_LINE_WIDTH = 500, MAX_LINE_WIDTH = 2000, LINE_WIDTH_STEP = 10;
          export const LINE_WIDTH_PROPERTY = 'patch-line-width', GITHUB_PROPERTY = 'github', MATH_INDENTS = [2,4];
          export const parseMermaidSettings = x => ${remote}
            ? { mermaidVersion: x.mermaidVersion ?? 'bundled', mermaidCachedLatest: x.mermaidCachedLatest }
            : { mermaidVersion: 'bundled' };
          export const parsePdfExportSettings = x => x, parseBannerSettings = x => x;
          export const parseMathFormatSettings = x => x, parseCalloutSettings = x => x, parseIconSettings = x => x, parseLineWidthSettings = x => x;
          export const registerPatchMermaid = () => {}, registerCalloutCode = () => {}, registerActiveLine = () => {}, registerHeadingLevels = () => {};
          export const registerPdfExport = () => {}, registerBanner = () => {}, registerTables = () => {}, registerMathFormat = () => {};
          export const registerCallouts = () => {}, registerIcons = () => {}, registerLineWidth = () => {};` };
      });
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
}
const { PatchesSettingTab: CommunityTab, default: CommunityPlugin } = await loadTab(false);
const { PatchesSettingTab: FullTab, default: FullPlugin } = await loadTab(true);

function plugin() {
  const p = {
    app: {}, calls: [],
    settings: {
      mermaidVersion: "bundled", mermaidSecurityLevel: "strict", calloutCode: true, activeLine: true, headingLevels: true,
      banner: { enabled: true, widthPercent: 90, autoplayVideos: true },
      callouts: { github: true, githubFolders: [] },
      mathFormat: { indent: 2, alignAmpersands: true, alignRowEnds: false },
      icons: { enabled: true }, lineWidth: { enabled: true, width: 900, statusBar: true },
      pdfExport: { outline: true, headingLinks: true },
    },
    mermaid: { runtime: async () => ({ origin: "bundled", version: "12.3.0" }) },
  };
  for (const [method, key] of Object.entries({ setActiveLine: "activeLine", setHeadingLevels: "headingLevels", setBanner: "banner", setLineWidth: "lineWidth", setCallouts: "callouts", setMathFormat: "mathFormat", setPdfExport: "pdfExport", setCalloutCode: "calloutCode", setMermaidSecurityLevel: "mermaidSecurityLevel", setMermaidVersion: "mermaidVersion" })) {
    p[method] = async (value) => { p.calls.push([method, value]); p.settings[key] = value; return { version: value, origin: "bundled" }; };
  }
  return p;
}
function row() {
  const element = () => ({ hidden: false, text: "", setText(text) { this.text = text; }, createDiv: () => element() });
  const r = { controls: {}, descEl: element(), setDesc(value) { this.description = value; return this; } };
  for (const type of ["Toggle", "Slider", "ExtraButton", "Dropdown", "Text", "Button"]) {
    r[`add${type}`] = (callback) => {
      const c = { options: {}, inputEl: { events: {}, toggleClass() {}, addEventListener(event, callback) { this.events[event] = callback; } } };
      for (const name of ["setValue", "setTooltip", "setIcon", "setPlaceholder", "setButtonText", "setDisabled"]) {
        c[name] = (value) => { c[name.slice(3).toLowerCase()] = value; return c; };
      }
      c.getValue = () => c.value;
      c.setLimits = (...limits) => { c.limits = limits; return c; };
      c.addOption = (value, label) => { c.options[value] = label; return c; };
      c.onChange = (callback) => { c.change = callback; return c; };
      c.onClick = (callback) => { c.click = callback; return c; };
      r.controls[type] = c;
      callback(c);
      return r;
    };
  }
  return r;
}
const find = (tab, group, name) => tab.getSettingDefinitions().find(x => x.heading === group).items.find(x => x.name === name);

test("Community startup saves normalized remote preferences while Full keeps them", async () => {
  for (const [Plugin, saveCount, version] of [[CommunityPlugin, 1, "bundled"], [FullPlugin, 0, "latest"]]) {
    const p = new Plugin();
    p.stored = { mermaidVersion: "latest", mermaidCachedLatest: "12.3.0", activeLine: false };
    await p.onload();
    assert.equal(p.settings.mermaidVersion, version);
    assert.equal(p.settings.activeLine, false);
    assert.equal(p.saved.length, saveCount);
    if (saveCount) {
      assert.equal(p.saved[0].mermaidCachedLatest, undefined);
      assert.equal(p.stored.mermaidVersion, "latest");
    }
  }
});

test("startup treats non-record saved values as empty settings", async () => {
  for (const stored of [undefined, null, "invalid", [], Object.assign([], { mermaidVersion: "latest" })]) {
    const p = new CommunityPlugin();
    p.stored = stored;
    await p.onload();
    assert.equal(p.settings.activeLine, true);
    assert.equal(p.saved.length, 0);
  }
});

test("settings registration exposes every community row for search without DOM or I/O", () => {
  const p = plugin();
  p.icons = new Proxy({}, { get() { assert.fail("Search indexing accessed the icon controller"); } });
  const tab = new CommunityTab(p);
  const groups = tab.getSettingDefinitions();
  assert.deepEqual(groups.map(x => x.heading), ["Callouts", "Editor", "Line Width", "Math Format", "Patch Banner", "Patch Icons", "Patch Mermaid", "PDF Export"]);
  assert.equal(groups.flatMap(x => x.items).length, 22);
  assert.equal(groups.flatMap(x => x.items).every(x => typeof x.name === "string" && x.name.length > 0 && typeof x.desc === "string"), true);
  assert.deepEqual(p.calls, []);
  assert.equal(groups.find(x => x.heading === "Patch Mermaid").items.some(x => x.name === "Custom Mermaid version"), false);
  const version = row();
  find(tab, "Patch Mermaid", "Mermaid version").render(version);
  assert.deepEqual(version.controls, {});
});

test("declarative controls retain feature setters and slider reset behavior", async () => {
  const p = plugin(), tab = new CommunityTab(p);
  const active = row();
  find(tab, "Editor", "Active line").render(active);
  await active.controls.Toggle.change(false);
  assert.equal(p.settings.activeLine, false);
  const banner = row();
  find(tab, "Patch Banner", "Cover width (%)").render(banner);
  await banner.controls.Slider.change(70);
  assert.equal(p.settings.banner.widthPercent, 70);
  await banner.controls.ExtraButton.click();
  assert.equal(p.settings.banner.widthPercent, 90);
  assert.equal(banner.controls.Slider.value, 90);
  assert.equal(p.settings.banner.autoplayVideos, true);
  const folders = row();
  find(tab, "Callouts", "GitHub folders").render(folders);
  await folders.controls.Text.change(" docs, , project/site ");
  assert.deepEqual(p.settings.callouts.githubFolders, ["docs", "project/site"]);
});

test("Full custom version selection preserves the remembered value and updates visibility", async () => {
  const p = plugin(), tab = new FullTab(p);
  const version = row(), custom = row();
  const customDefinition = find(tab, "Patch Mermaid", "Custom Mermaid version");
  find(tab, "Patch Mermaid", "Mermaid version").render(version);
  customDefinition.render(custom);
  assert.equal(customDefinition.visible(), false);
  await version.controls.Dropdown.change("custom");
  assert.equal(customDefinition.visible(), true);
  assert.equal(p.settings.mermaidVersion, "bundled");
  custom.controls.Text.value = "12.4.0";
  custom.controls.Text.inputEl.events.blur();
  await Promise.resolve();
  assert.equal(p.settings.mermaidVersion, "12.4.0");
  await version.controls.Dropdown.change("bundled");
  assert.equal(customDefinition.visible(), false);
  await version.controls.Dropdown.change("custom");
  assert.equal(p.settings.mermaidVersion, "12.4.0");
  assert.equal(tab.refreshes, 3);
});

test("Full definitions follow version changes made while the settings tab is closed", () => {
  const p = plugin(), tab = new FullTab(p);
  p.settings.mermaidVersion = "12.4.0";
  const custom = find(tab, "Patch Mermaid", "Custom Mermaid version"), rendered = row();
  assert.equal(custom.visible(), true);
  custom.render(rendered);
  assert.equal(rendered.controls.Text.value, "12.4.0");
  p.settings.mermaidVersion = "bundled";
  assert.equal(find(tab, "Patch Mermaid", "Custom Mermaid version").visible(), false);
});

test("icon mutations request a declarative update instead of rebuilding the legacy display", async () => {
  const p = plugin(), tab = new CommunityTab(p);
  const actions = [];
  p.icons = { countIconizeIcons: async () => 2, importIconize: async () => actions.push("import"), missingPaths: () => ["gone.md"], removeIcons: async paths => actions.push(paths) };
  const imported = row();
  find(tab, "Patch Icons", "Import from Iconize").render(imported);
  await imported.controls.Button.click();
  const missing = row();
  find(tab, "Patch Icons", "Icons of missing files").render(missing);
  await missing.controls.Button.click();
  assert.deepEqual(actions, ["import", ["gone.md"]]);
  assert.equal(tab.updates, 2);
});
