import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/banner/config.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { parseBannerConfig, parseBannerSettings, resolveBanner, mediaKind } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

test("persisted width percentages keep valid values and default invalid data to 90", () => {
  assert.equal(parseBannerSettings(undefined).widthPercent, 90);
  for (const widthPercent of [10, 50, 60, 75, 90, 100]) {
    assert.equal(parseBannerSettings({ widthPercent }).widthPercent, widthPercent);
  }
  for (const widthPercent of [undefined, null, "75", 0, 9, 101, 50.5, NaN, Infinity]) {
    assert.equal(parseBannerSettings({ widthPercent }).widthPercent, 90);
  }
});

test("absent banners do not create a configuration", () => {
  for (const value of [undefined, null, {}, { "patch-banner": "", tags: ["note"] }]) {
    assert.deepEqual(parseBannerConfig(value), { status: "none" });
  }
});

test("quoted wikilink values preserve Unicode and spaces", () => {
  assert.deepEqual(parseBannerConfig({ "patch-banner": "[[assets/旅行 banner.PNG]]" }), {
    status: "ready", config: { linkpath: "assets/旅行 banner.PNG" },
  });
});

test("YAML arrays, remote sources and other link protocols are rejected", () => {
  for (const value of [[["image.png"]], null, 12, "image.png", "![[image.png]]", "[[image.png|alias]]",
    "[[image.png#section]]", "https://example.com/image.png", "[[https://example.com/image.png]]",
    "[[file:///image.png]]", "[[/image.png]]", "[image](image.png)", "[[]]"]) {
    assert.equal(parseBannerConfig({ "patch-banner": value }).status, "error", JSON.stringify(value));
  }
});

test("native resolution receives the owning note path", () => {
  const file = { path: "assets/同名 image.webp", extension: "webp", stat: { mtime: 10, size: 20 } };
  const calls = [];
  const app = { metadataCache: { getFirstLinkpathDest: (...args) => { calls.push(args); return file; } } };
  const state = resolveBanner(app, { path: "notes/source.md" }, { "patch-banner": "[[同名 image.webp]]" });
  assert.deepEqual(calls, [["同名 image.webp", "notes/source.md"]]);
  assert.equal(state.banner.file, file);
  assert.equal(state.banner.kind, "image");
});

test("missing or unsupported files produce errors instead of another source", () => {
  const note = { path: "note.md" };
  assert.equal(resolveBanner({ metadataCache: { getFirstLinkpathDest: () => null } }, note, { "patch-banner": "[[missing.png]]" }).status, "error");
  assert.equal(resolveBanner({ metadataCache: { getFirstLinkpathDest: () => ({ extension: "md" }) } }, note, { "patch-banner": "[[note.md]]" }).status, "error");
});

test("image and video allowlists are case insensitive", () => {
  for (const ext of ["JPG", "png", "gif", "webp", "svg", "avif", "apng"]) assert.equal(mediaKind(ext), "image");
  for (const ext of ["MP4", "webm", "mov"]) assert.equal(mediaKind(ext), "video");
  assert.equal(mediaKind("html"), undefined);
});
