import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/heading-numbering/model.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { bodyHeadings, numberHeadings, notePreset, parseNumberingSettings } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));
const defaults = parseNumberingSettings();
function count(source, preset = "decimal", patch = {}) {
  return numberHeadings(bodyHeadings(source, 0), { ...defaults, ...patch }, preset);
}
const prefixes = result => Array.from(result.headings.values(), item => item.prefix);
const note = "# Report\n## Methods\n#### Data\n### Validation\n## Results";

test("four presets share the actual heading hierarchy and reset at siblings", () => {
  assert.deepEqual(prefixes(count(note)), ["1", "1.1", "1.2", "2"]);
  assert.deepEqual(prefixes(count(note, "continuous")), ["1", "2", "3", "4"]);
  assert.deepEqual(prefixes(count(note, "zh-report")), ["一、", "（一）", "（二）", "二、"]);
  assert.deepEqual(prefixes(count(note, "en-outline")), ["I.", "A.", "B.", "II."]);
  assert.deepEqual(prefixes(count(note.replace("#### Data", "### Setup\n#### Data"))), ["1", "1.1", "1.1.1", "1.2", "2"]);
});

test("Setext and formatted titles have source positions while containers and literal blocks do not count", () => {
  const source = ["Title", "=====", "", "## **Methods** and `code`", "> ### Quote", "> [!note]", "> ## Callout", "",
    "~~~md", "# Fence", "~~~", "", "$$", "# Math", "$$", "", "%%", "# Comment", "%%", "",
    "<pre>", "# HTML", "</pre>", "", "- list", "  ### Nested", "", "![[Other]]", "", "Setext", "------"].join("\n");
  assert.deepEqual(bodyHeadings(source, 3), [
    { level: 1, line: 3, title: "Title" }, { level: 2, line: 6, title: "Methods and code" }, { level: 2, line: 32, title: "Setext" },
  ]);
});

test("the title rule, fixed start level, depth and first number are independent", () => {
  assert.deepEqual(prefixes(count("## First\n# Higher\n## Child")), ["1", "2", "2.1"]);
  assert.deepEqual(prefixes(count("# First\n## A\n# Second")), ["1", "1.1", "2"]);
  assert.deepEqual(prefixes(count("# First\n## A\n### Deep\n# Second\n### B", "decimal", { startLevel: 2, maxDepth: 1, startAt: 8 })), ["8", "9"]);
  assert.deepEqual(prefixes(count(note, "continuous", { startAt: 5, maxDepth: 1 })), ["5", "6"]);
});

test("expected handwritten numbers occupy a place and clear conflicts point to the source line", () => {
  const result = count("## One\n### **1.1** Existing\n### 7.3 Background\n## 2026 年度计划\n## I/O 模型\n## 3D 打印");
  assert.equal(result.headings.get(1).handwritten, true);
  assert.deepEqual([result.conflict.heading.line, result.conflict.actual, result.conflict.heading.prefix], [2, "7.3", "1.2"]);
  assert.equal(count("## 2026 年度计划\n## I/O 模型\n## 3D 打印").conflict, undefined);
  assert.equal(count("## 一、引言\n### （一）背景", "zh-report").headings.get(1).handwritten, true);
  assert.equal(count("## Dr. Smith\n### (see) below", "en-outline").conflict, undefined);
});

test("handwritten numbers use wiki aliases and document reference labels", () => {
  const source = "## [[方案|1 方法]]\n## [2 结果][ref]\n## 普通标题\n\n[ref]: result.md";
  const rows = [...count(source).headings.values()];
  assert.deepEqual(rows.map(h => [h.title, h.handwritten]), [["1 方法", true], ["2 结果", true], ["普通标题", false]]);
  assert.equal(count(source.replace("1 方法", "7.3 方法")).conflict.actual, "7.3");
  assert.equal(count("## `[[方案|1 方法]]`").headings.get(0).handwritten, false);
  assert.equal(count("## [1 方法][unknown]").headings.get(0).handwritten, false);
});

test("alphabetic, Chinese and Roman ordinals cover their formatting boundaries", () => {
  const rows = ["十", "十一", "二十", "一百零一", "一千零一", "一万零一", "一亿零一"];
  [10, 11, 20, 101, 1001, 10001, 100000001].forEach((startAt, i) => {
    assert.deepEqual(prefixes(count("## A", "zh-report", { startAt })), [rows[i] + "、"]);
  });
  const many = "## Main\n" + Array.from({ length: 27 }, (_, i) => "### Child " + i).join("\n");
  assert.equal(prefixes(count(many, "en-outline")).at(-1), "AA.");
  assert.deepEqual(prefixes(count("## A\n## B", "en-outline", { startAt: 3999 })), ["MMMCMXCIX.", "4000."]);
  assert.equal(count("## A", "en-outline", { startAt: 4000 }).romanFallback, true);
  assert.deepEqual(prefixes(count("## A\n## B\n## C", "decimal", { startAt: Number.MAX_SAFE_INTEGER })), ["9007199254740991", "9007199254740992", "9007199254740993"]);
});

test("old settings default to off and individual notes can opt in or opt out", () => {
  assert.deepEqual(defaults, { enabled: false, preset: "decimal", startLevel: 0, maxDepth: 6, startAt: 1 });
  assert.deepEqual(parseNumberingSettings({ enabled: "true", preset: "__proto__", startLevel: -2, maxDepth: 28, startAt: 1.2 }), defaults);
  assert.equal(notePreset(defaults), undefined);
  assert.equal(notePreset(defaults, "zh-report"), "zh-report");
  const on = { ...defaults, enabled: true, preset: "en-outline" };
  assert.equal(notePreset(on, false), undefined);
  assert.equal(notePreset(on, "unknown"), "en-outline");
});
