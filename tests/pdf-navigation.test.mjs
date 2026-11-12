import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/pdf-export/model.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { headingLink, headingSlugs, parsePdfExportSettings } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

test("heading targets accept local Unicode paths and decode the fragment independently", () => {
  assert.deepEqual(headingLink("#中文 标题"), { path: "", subpath: "#中文 标题" });
  assert.deepEqual(headingLink("folder/My%20Note.md#C%23%20and%20%E4%B8%AD%E6%96%87"), { path: "folder/My Note.md", subpath: "#C# and 中文" });
  assert.deepEqual(headingLink("#100% coverage"), { path: "", subpath: "#100% coverage" });
  assert.deepEqual(headingLink("#Parent#Child"), { path: "", subpath: "#Parent#Child" });
});

test("external URLs, block references and empty fragments are not heading targets", () => {
  for (const link of ["https://example.com/#Heading", "obsidian://open#Heading", "#^block-id", "Note#", "Note"])
    assert.equal(headingLink(link), undefined, link);
});

test("Markdown heading fragments preserve Unicode and distinguish repeated headings", () => {
  assert.deepEqual(headingSlugs(["Target Heading", "中文 标题", "Bold & code!", "Repeat", "Repeat", "Repeat-1"]),
    ["target-heading", "中文-标题", "bold--code", "repeat", "repeat-1", "repeat-1-1"]);
  assert.deepEqual(headingSlugs(["A", "A-1", "A", "under_score"]), ["a", "a-1", "a-2", "under_score"]);
});

test("PDF features default on and preserve independent disabled choices", () => {
  assert.deepEqual(parsePdfExportSettings(undefined), { outline: true, headingLinks: true });
  assert.deepEqual(parsePdfExportSettings({ outline: false, headingLinks: true }), { outline: false, headingLinks: true });
  assert.deepEqual(parsePdfExportSettings({ outline: "off", headingLinks: false }), { outline: true, headingLinks: false });
});
