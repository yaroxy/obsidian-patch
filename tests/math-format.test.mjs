import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/math-format/model.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { DEFAULT_MATH_FORMAT, displayWidth, findMathBlocks, formatMarkdown, formatMathBlock, formatTex } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const lines = (...rows) => rows.join("\n");
const block = (source, options) => formatMathBlock(source, { ...DEFAULT_MATH_FORMAT, ...options });

test("aligns the rows of an aligned environment and drops trailing spaces", () => {
  const source = lines(
    "$$",
    "\\begin{aligned}  ",
    "\\text{Minimize:}\\quad & \\frac{1}{2}\\|\\omega\\|^2+C_1\\sum_{i=1}^{N}\\delta_i+C_2\\sum_{i=1}^{N}\\delta_i^2\\\\  ",
    "\\text{Subject to:}\\quad & \\delta_i\\ge 0,\\quad i=1,2,\\dots,N\\\\  ",
    "& y_i\\big[\\omega^T\\varphi(x_i)+b\\big]\\ge 1-\\delta_i  ",
    "\\end{aligned}  ",
    "$$",
  );
  const expected = lines(
    "$$",
    "\\begin{aligned}",
    "  \\text{Minimize:}\\quad   & \\frac{1}{2}\\|\\omega\\|^2+C_1\\sum_{i=1}^{N}\\delta_i+C_2\\sum_{i=1}^{N}\\delta_i^2 \\\\",
    "  \\text{Subject to:}\\quad & \\delta_i\\ge 0,\\quad i=1,2,\\dots,N \\\\",
    "                          & y_i\\big[\\omega^T\\varphi(x_i)+b\\big]\\ge 1-\\delta_i",
    "\\end{aligned}",
    "$$",
  );
  assert.deepEqual(block(source), { text: expected, status: "changed" });
  assert.deepEqual(block(expected), { text: expected, status: "unchanged" });
});

test("expands a one-line block, moves the delimiters to their own lines, and keeps relations after &", () => {
  assert.equal(block("$$\\begin{aligned}a&=b\\\\c+d&\\le e\\end{aligned}$$").text, lines(
    "$$", "\\begin{aligned}", "  a   &=b \\\\", "  c+d &\\le e", "\\end{aligned}", "$$",
  ));
});

test("keeps blockquote markers and list indentation", () => {
  const quoted = lines("> $$", "> \\begin{cases}x&x>0\\\\-x&x\\le 0\\end{cases}", ">$$");
  assert.equal(block(quoted).text, lines("> $$", "> \\begin{cases}", ">   x  & x>0 \\\\", ">   -x & x\\le 0", "> \\end{cases}", "> $$"));
  const listed = lines("  $$", "\\begin{matrix}a&b\\\\c&d\\end{matrix}", "  $$");
  assert.equal(block(listed).text, lines("  $$", "  \\begin{matrix}", "    a & b \\\\", "    c & d", "  \\end{matrix}", "  $$"));
});

test("leaves an environment written inside a line as it is", () => {
  const source = lines("$$", "f(x)=\\left\\{\\begin{matrix} a & b \\\\ c & d \\end{matrix}\\right.", "$$");
  assert.deepEqual(block(source), { text: source, status: "unchanged" });
  assert.deepEqual(block("$$ x = \\begin{pmatrix} 1 & 2 \\end{pmatrix} $$"), { text: "$$ x = \\begin{pmatrix} 1 & 2 \\end{pmatrix} $$", status: "unchanged" });
});

test("indents an environment that opens after text and keeps what follows its end", () => {
  const source = lines("$$", "f(x) = \\left\\{\\begin{matrix}", "a & bb \\\\", "ccc & d", "\\end{matrix}\\right.", "$$");
  assert.equal(block(source).text, lines("$$", "f(x) = \\left\\{\\begin{matrix}", "  a   & bb \\\\", "  ccc & d", "\\end{matrix}\\right.", "$$"));
});

test("only re-indents an environment that has comments", () => {
  const source = lines("$$", "\\begin{aligned}", "a&=b \\\\ % note", "c&=d", "\\end{aligned}", "$$");
  assert.equal(block(source).text, lines("$$", "\\begin{aligned}", "  a&=b \\\\ % note", "  c&=d", "\\end{aligned}", "$$"));
});

test("skips blocks it cannot read with certainty", () => {
  for (const source of [
    lines("$$", "a", "", "b", "$$"),
    lines("$$", "\\frac{a}{b", "$$"),
    lines("$$", "\\begin{aligned} a \\end{align}", "$$"),
    lines("$$", "a $ b", "$$"),
  ]) {
    assert.deepEqual(block(source), { text: source, status: "skipped" }, source);
  }
});

test("keeps row spacing, rules and star with their row break", () => {
  assert.equal(formatTex("\\begin{aligned}a&=b\\\\[2pt]c&=d\\\\*e&=f\\end{aligned}"),
    lines("\\begin{aligned}", "  a &=b \\\\[2pt]", "  c &=d \\\\*", "  e &=f", "\\end{aligned}"));
  // After whitespace, MathJax reads a bracket as the next row's text, not as spacing.
  assert.equal(formatTex("\\begin{aligned}a&=b\\\\\n[x]&=c\\\\ [y]&=d\\end{aligned}"),
    lines("\\begin{aligned}", "  a   &=b \\\\", "  [x] &=c \\\\", "  [y] &=d", "\\end{aligned}"));
  assert.equal(formatTex("\\begin{gathered}a\\\\ *b\\end{gathered}"), lines("\\begin{gathered}", "  a \\\\", "  *b", "\\end{gathered}"));
  assert.equal(formatTex("\\begin{array}{c|c}\na & b \\\\ \\hline\ncc & d\n\\end{array}"),
    lines("\\begin{array}{c|c}", "  a  & b \\\\", "  \\hline", "  cc & d", "\\end{array}"));
});

test("counts East Asian characters as two columns", () => {
  assert.equal(displayWidth("\\text{中文}"), 11);
  assert.equal(formatTex("\\begin{aligned}\\text{中文}&=x\\\\ab&=y\\end{aligned}"),
    lines("\\begin{aligned}", "  \\text{中文} &=x \\\\", "  ab          &=y", "\\end{aligned}"));
});

test("follows the indent and alignment options", () => {
  const tex = "\\begin{aligned}a&=bbb\\\\cc&=d\\end{aligned}";
  assert.equal(formatTex(tex, { indent: 4, alignAmpersands: false, alignRowEnds: false }),
    lines("\\begin{aligned}", "    a &=bbb \\\\", "    cc &=d", "\\end{aligned}"));
  assert.equal(formatTex("\\begin{aligned}a&=bbb\\\\cc&=d\\\\e&=f\\end{aligned}", { ...DEFAULT_MATH_FORMAT, alignRowEnds: true }),
    lines("\\begin{aligned}", "  a  &=bbb \\\\", "  cc &=d   \\\\", "  e  &=f", "\\end{aligned}"));
});

test("lays out a row that holds a multi-line environment and aligns the rest", () => {
  const tex = lines("\\begin{cases}", "\\begin{aligned}", "a&=b\\\\", "c&=d", "\\end{aligned} & x>0 \\\\", "0 & \\text{otherwise}", "\\end{cases}");
  assert.equal(formatTex(tex), lines(
    "\\begin{cases}", "  \\begin{aligned}", "    a &=b \\\\", "    c &=d", "  \\end{aligned} & x>0 \\\\", "  0 & \\text{otherwise}", "\\end{cases}",
  ));
});

test("finds blocks outside frontmatter and code, and skips inconsistent ones whole", () => {
  const note = lines(
    "---", "title: \"$$ not math $$\"", "---",
    "```", "$$", "code", "$$", "```",
    "$$", "a", "$$",
    "> $$", "lazy line", "> $$",
    "$$", "x", "$$ trailing",
    "$$b$$",
  );
  const found = findMathBlocks(note).map(({ from, to }) => note.slice(from, to));
  assert.deepEqual(found, [lines("$$", "a", "$$"), "$$b$$"]);
});

test("formats every block in a note and reports what it skipped", () => {
  const note = lines("Text", "$$", "\\begin{aligned}a&=b\\\\cc&=d\\end{aligned}", "$$", "", "$$", "a", "", "b", "$$");
  const result = formatMarkdown(note);
  assert.equal(result.changed, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.text, lines("Text", "$$", "\\begin{aligned}", "  a  &=b \\\\", "  cc &=d", "\\end{aligned}", "$$", "", "$$", "a", "", "b", "$$"));
  assert.equal(formatMarkdown(result.text).changed, 0);
});
