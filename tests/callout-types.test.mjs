import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/features/callout/types.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [{
    name: "callout-types-host",
    setup(builder) {
      builder.onResolve({ filter: /^obsidian$/ }, ({ path }) => ({ path, namespace: "callout-types-host" }));
      builder.onLoad({ filter: /.*/, namespace: "callout-types-host" }, () => ({ contents: "export function setIcon() {}" }));
    },
  }],
});
const { BUILTIN_TYPE_NAMES, discoverCalloutTypes, filterCalloutCatalog, groupCalloutTypes } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

test("configured types and partial overrides participate in discovery, while the settings preview can read theme defaults", () => {
  let localColor = "";
  const probe = {
    dataset: {},
    addClass(name) { assert.equal(name, "obsidian-patch-callout-theme-probe"); },
    style: { setProperty(prop, value) { assert.equal(prop, "--callout-color"); localColor = value; } },
    remove() {},
  };
  const doc = {
    styleSheets: [{ cssRules: [{ selectorText: '.callout[data-callout="Custom"]' }] }],
    body: { createDiv: () => probe },
    defaultView: { getComputedStyle: () => ({ getPropertyValue: prop => prop === "--callout-icon" ? "theme-icon" : localColor || "#123456" }) },
  };
  const configured = { custom: { icon: "lucide-heart" }, research: { color: "#AABBCC" } };
  const types = discoverCalloutTypes(doc, configured);
  assert.deepEqual(types.filter(type => type.name.toLowerCase() === "custom"), [{ name: "Custom", icon: "lucide-heart", color: "#123456" }]);
  assert.deepEqual(types.find(type => type.name === "research"), { name: "research", icon: "theme-icon", color: "#AABBCC" });
  const baseline = discoverCalloutTypes(doc, configured, true);
  assert.deepEqual(baseline.find(type => type.name === "research"), { name: "research", icon: "theme-icon", color: "#123456" });
  assert.equal(baseline.find(type => type.name === "Custom").icon, "theme-icon");
});

test("groups the 27 built-in types into 13 canonical families and separates custom types", () => {
  const catalog = groupCalloutTypes([
    ...BUILTIN_TYPE_NAMES.map((name) => ({ name, icon: "", color: "" })),
    { name: "theorem", icon: "lucide-sigma", color: "rgb(100, 120, 200)" },
  ]);
  assert.equal(catalog.builtin.length, 13);
  assert.deepEqual(catalog.github.map((type) => type.name), ["note", "tip", "important", "warning", "caution"]);
  const abstractGroup = catalog.builtin.find((group) => group.primary === "abstract");
  assert.deepEqual(abstractGroup?.aliases, ["abstract", "summary", "tldr"]);
  assert.equal(catalog.custom.length, 1);
  assert.equal(catalog.custom[0]?.primary, "theorem");
});

test("keeps a theme-customized alias in its own group when its icon or color differs", () => {
  const types = BUILTIN_TYPE_NAMES.map((name) => {
    if (name === "warning" || name === "attention") return { name, icon: "lucide-alert-triangle", color: "#e9973f" };
    if (name === "caution") return { name, icon: "lucide-flame", color: "#fb464c" };
    return { name, icon: `lucide-${name}`, color: "#111111" };
  });
  const catalog = groupCalloutTypes(types);
  const warningGroup = catalog.builtin.find((group) => group.primary === "warning");
  const cautionGroup = catalog.builtin.find((group) => group.primary === "caution");
  assert.deepEqual(warningGroup?.aliases, ["warning", "attention"]);
  assert.deepEqual(cautionGroup?.aliases, ["caution"]);
});

test("filters aliases directly, offers custom creation for unknown valid types, and rejects invalid header syntax", () => {
  const catalog = groupCalloutTypes(BUILTIN_TYPE_NAMES.map((name) => ({ name, icon: "", color: "" })));
  const tldr = filterCalloutCatalog(catalog, "tldr");
  assert.equal(tldr.directMatches[0]?.name, "tldr");
  assert.equal(tldr.canUseCustom, false);

  const caution = filterCalloutCatalog(catalog, "caution");
  assert.equal(caution.directMatches[0]?.name, "caution");

  const custom = filterCalloutCatalog(catalog, "Decision");
  assert.equal(custom.directMatches.length, 0);
  assert.equal(custom.canUseCustom, true);
  assert.equal(custom.customError, undefined);

  const invalid = filterCalloutCatalog(catalog, "bad|type");
  assert.equal(invalid.canUseCustom, false);
  assert.ok(invalid.customError);

  const bracket = filterCalloutCatalog(catalog, "bad]type");
  assert.equal(bracket.canUseCustom, false);
  assert.ok(bracket.customError);
});
