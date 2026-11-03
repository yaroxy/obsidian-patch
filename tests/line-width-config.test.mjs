import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/line-width/config.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { parseLineWidthSettings, parseLineWidthProperty } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

test("settings default to Obsidian's 700 px with the status bar slider shown", () => {
  assert.deepEqual(parseLineWidthSettings(undefined), { enabled: true, width: 700, statusBar: true });
  assert.deepEqual(parseLineWidthSettings({ enabled: false, width: 900, statusBar: false }), { enabled: false, width: 900, statusBar: false });
});

test("stored widths outside 500-2000 px or with fractions fall back to 700", () => {
  for (const width of [500, 760, 2000]) assert.equal(parseLineWidthSettings({ width }).width, width);
  for (const width of [499, 2001, 900.5, "900", null, NaN, Infinity]) {
    assert.equal(parseLineWidthSettings({ width }).width, 700, String(width));
  }
});

test("the property takes whole pixels as a number or a string with an optional px", () => {
  for (const value of [1200, "1200", "1200px", " 1200 PX "]) {
    assert.deepEqual(parseLineWidthProperty({ "patch-line-width": value }), { status: "ready", width: 1200 }, String(value));
  }
});

test("absent or empty properties leave the default width in place", () => {
  for (const frontmatter of [undefined, null, [], {}, { "patch-line-width": "" }, { "patch-line-width": null }]) {
    assert.deepEqual(parseLineWidthProperty(frontmatter), { status: "none" });
  }
});

test("other values are reported as invalid rather than guessed", () => {
  for (const value of [499, 2001, 1200.5, "wide", "80%", "12rem", true, [1200], { width: 1200 }]) {
    assert.deepEqual(parseLineWidthProperty({ "patch-line-width": value }), { status: "invalid" }, JSON.stringify(value));
  }
});
