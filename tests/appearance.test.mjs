import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/features/appearance.ts"], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "appearance-host", setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "host" }));
    builder.onLoad({ filter: /.*/, namespace: "host" }, () => ({ contents: "export function getIcon() {} export function sanitizeHTMLToDom() {}" }));
  } }],
});
const { parseAppearanceSettings, registerAppearance } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

test("appearance preferences normalize casing and keep independently set colors and icons", () => {
  assert.deepEqual(parseAppearanceSettings(null), { calloutTypes: {}, tableCodeFont: "" });
  const settings = parseAppearanceSettings({
    calloutTypes: { " RESEARCH ": { color: "#39a", icon: "lucide-flask-conical" }, Tip: { color: "cyan" },
      Review: { icon: "lucide-book" }, Reset: {}, Broken: { color: "brand", icon: "unknown" } },
    tableCodeFont: " Noto Sans Mono ",
  });
  assert.deepEqual(settings, { calloutTypes: { research: { color: "#3399AA", icon: "lucide-flask-conical" },
    tip: { color: "cyan" }, review: { icon: "lucide-book" } }, tableCodeFont: "Noto Sans Mono" });
});

test("font and callout preferences apply and clear on existing and newly opened documents", () => {
  function element() {
    const classes = new Set(), properties = new Map();
    return {
      hasClass: name => classes.has(name),
      toggleClass(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key), getPropertyValue: key => properties.get(key) },
    };
  }
  function windowFixture() {
    const callout = { ...element(), dataset: { callout: 'named "type"' } };
    return {
      callout,
      document: { body: element(), querySelectorAll: () => [callout], defaultView: { MutationObserver: class { observe() {} disconnect() {} } } },
    };
  }
  const main = windowFixture(), popout = windowFixture();
  const hooks = new Map();
  let unload;
  const plugin = {
    app: { workspace: { containerEl: { ownerDocument: main.document }, iterateAllLeaves() {}, on: (event, listener) => hooks.set(event, listener) } },
    registerEvent() {}, register(listener) { unload = listener; },
  };
  const settings = parseAppearanceSettings({ calloutTypes: { 'named "type"': { color: "green" }, "broken]": { color: "red" } }, tableCodeFont: 'Font "A", B' });
  const update = registerAppearance(plugin, settings);
  hooks.get("window-open")(null, popout);
  for (const win of [main, popout]) {
    assert.equal(win.callout.style.getPropertyValue("--obsidian-patch-callout-type-color"), "var(--color-green)");
    assert.equal(win.document.body.style.getPropertyValue("--obsidian-patch-table-code-font"), String.raw`"Font \"A\", B"`);
  }
  hooks.get("window-close")(null, popout);
  assert.equal(popout.callout.hasClass("obsidian-patch-callout-type-color"), false);
  update(parseAppearanceSettings({ tableCodeFont: "bad\nfont", calloutTypes: { a: { color: "not-a-color" } } }));
  assert.equal(main.callout.hasClass("obsidian-patch-callout-type-color"), false);
  assert.equal(main.document.body.style.getPropertyValue("--obsidian-patch-table-code-font"), undefined);
  update(settings);
  unload();
  assert.equal(main.callout.style.getPropertyValue("--obsidian-patch-callout-type-color"), undefined);
  assert.equal(main.document.body.hasClass("obsidian-patch-table-code-font"), false);
});
