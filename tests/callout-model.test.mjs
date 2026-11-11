import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/callout/model.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const {
  calloutAt, calloutLines, defaultTitle, findCallouts, formatHeader, githubIssues, parseHeader, toGitHub, unwrapToBlockquote, unwrapToText, wrapLines,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const lines = (...rows) => rows.join("\n");
const header = (type, more = {}) => ({ type, metadata: "", fold: "", title: "", ...more });
const errors = (callout) => githubIssues(callout).filter(({ level }) => level === "error").length;

test("parses callout headers with fold, metadata, title, nesting and list indent", () => {
  assert.deepEqual(parseHeader("> [!note]"), { indent: "", depth: 1, header: header("note") });
  assert.deepEqual(parseHeader(">[!NOTE]- Read me"), { indent: "", depth: 1, header: header("NOTE", { fold: "-", title: "Read me" }) });
  assert.deepEqual(parseHeader("> > [!tip|wide]+ Title "), { indent: "", depth: 2, header: header("tip", { metadata: "wide", fold: "+", title: "Title" }) });
  assert.deepEqual(parseHeader("  >   [!info]"), { indent: "  ", depth: 1, header: header("info") });
  assert.equal(parseHeader("> text"), undefined);
  assert.equal(parseHeader("[!note]"), undefined);
  assert.equal(formatHeader(header("tip", { metadata: "wide", fold: "+", title: "Title" })), "[!tip|wide]+ Title");
});

// Measured in Obsidian 1.15.0 Reading View.
test("derives the title Obsidian shows for a callout without one", () => {
  assert.equal(defaultTitle("note"), "Note");
  assert.equal(defaultTitle("NOTE"), "Note");
  assert.equal(defaultTitle("tldr"), "Tldr");
  assert.equal(defaultTitle("my-type"), "My type");
  assert.equal(defaultTitle("to-do list"), "To do list");
  assert.equal(defaultTitle("my_type"), "My_type");
  assert.equal(defaultTitle(""), "");
});

test("finds callouts outside frontmatter and code, with blank, lazy and nested lines", () => {
  const note = lines(
    "---", "x: 1", "---",
    "```", "> [!note] in code", "```",
    "> [!info] Title",
    "> first",
    "lazy line",
    ">",
    "> ```",
    "> > [!tip] in a fence",
    "> ```",
    "> > [!tip] Inner",
    "> > inner body",
    "",
    "After",
  );
  const found = findCallouts(note);
  assert.deepEqual(found.map(({ line, depth, header: { type } }) => [line, depth, type]), [[6, 1, "info"], [13, 2, "tip"]]);
  const [outer, inner] = found;
  assert.deepEqual(outer.body, ["first", "lazy line", "", "```", "> [!tip] in a fence", "```", "> [!tip] Inner", "> inner body"]);
  assert.equal(note.slice(outer.from, outer.to).split("\n").length, 9);
  assert.deepEqual(inner.body, ["inner body"]);
  assert.equal(calloutAt(found, note.indexOf("inner body")), inner);
  assert.equal(calloutAt(found, note.indexOf("first")), outer);
  assert.equal(calloutAt(found, note.indexOf("After")), undefined);
});

test("does not continue a callout lazily after a heading or into a new block", () => {
  const note = lines("> [!note]", "> # Heading", "not lazy", "", "> [!note]", "> text", "- a list item");
  assert.deepEqual(findCallouts(note).map(({ body }) => body), [["# Heading"], ["text"]]);
});

test("wraps lines at their common indent and nests quotes inside", () => {
  assert.deepEqual(wrapLines(["Text", "", "> quoted"], header("note", { title: "T" })), ["> [!note] T", "> Text", ">", "> > quoted"]);
  assert.deepEqual(wrapLines(["  - item", "    more"], header("tip")), ["  > [!tip]", "  > - item", "  >   more"]);
});

test("unwraps a callout to text or a blockquote, keeping outer markers and nested callouts", () => {
  const [outer, inner] = findCallouts(lines("> [!info] Title", "> body", "> > [!tip]", "> > nested"));
  assert.deepEqual(unwrapToText(outer), ["**Title**", "", "body", "> [!tip]", "> nested"]);
  assert.deepEqual(unwrapToText(inner), ["> nested"]);
  assert.deepEqual(unwrapToBlockquote(outer), ["> **Title**", "> body", "> > [!tip]", "> > nested"]);
  const [plain] = findCallouts("> [!note]");
  assert.deepEqual(unwrapToText(plain), []);
  assert.deepEqual(unwrapToBlockquote(plain), [">"]);
});

test("rebuilds a callout from its parts with canonical markers", () => {
  const source = lines(">[!note]- T", ">a", "lazy", ">  indented", ">", "after a blank quote line, not lazy");
  const [callout] = findCallouts(source);
  assert.deepEqual(calloutLines(callout.indent, callout.depth, callout.header, callout.body), ["> [!note]- T", "> a", "> lazy", ">  indented", ">"]);
  assert.deepEqual(wrapLines(unwrapToText({ ...callout, header: { ...callout.header, title: "" } }), callout.header),
    calloutLines(callout.indent, callout.depth, callout.header, callout.body));
});

test("checks GitHub compatibility with the rules measured on GitHub's renderer", () => {
  const check = (source) => {
    const [callout] = findCallouts(source);
    return githubIssues(callout);
  };
  assert.equal(errors(findCallouts("> [!NOTE]\n> Body.")[0]), 0);
  assert.equal(errors(findCallouts("> [!warning]\n> Body.")[0]), 0);
  for (const source of [
    "> [!info]\n> Body.", "> [!NOTE] Title\n> Body.", "> [!NOTE]-\n> Body.", "> [!NOTE|wide]\n> Body.",
    "> [!NOTE]", "- item\n\n  > [!NOTE]\n  > Body.", "> Outer\n>\n> > [!NOTE]\n> > Body.",
  ]) {
    const callouts = findCallouts(source);
    assert.ok(errors(callouts[callouts.length - 1]) > 0, source);
  }
  assert.deepEqual(check("> [!NOTE]\n> Outer\n>\n> > [!TIP]\n> > Inner.").map(({ level }) => level), ["warning"]);
  assert.deepEqual(check("> [!TIP]\n> See [[Note]].").map(({ level }) => level), ["warning"]);
  assert.deepEqual(check("> [!caution]\n> Body.").map(({ level }) => level), ["info"]);
});

test("converts a callout to its closest GitHub alert", () => {
  assert.deepEqual(toGitHub(header("danger", { title: "Stop", fold: "-", metadata: "wide" }), ["Body."]), {
    header: header("CAUTION"), body: ["**Stop**", "Body."],
  });
  assert.equal(toGitHub(header("my-type"), ["x"]).header.type, "NOTE");
  assert.equal(toGitHub(header("Success"), ["x"]).header.type, "TIP");
});
