import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/features/callout/model.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const {
  bodyCursorPosition, calloutAt, calloutLines, calloutSuggestTrigger, defaultTitle, findCallouts, formatCalloutPaste,
  formatHeader, githubIssues, isValidCalloutMetadata, isValidCalloutType, parseHeader, displayCalloutType, toGitHub,
  matchCalloutSource, replaceCalloutLines, unwrapToBlockquote, unwrapToText, wrapLines,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const lines = (...rows) => rows.join("\n");
const header = (type, more = {}) => ({ type, metadata: "", fold: "", title: "", ...more });
const errors = (callout) => githubIssues(callout).filter(({ level }) => level === "error").length;

test("saved callout edits preserve delimiters outside the replaced lines and reject a stale section", () => {
  const section = "> [!info] Old\n>body\n> second";
  const source = "Before\r\n\r> [!info] Old\n>body\r\n> second\r\rAfter\n";
  assert.equal(replaceCalloutLines(source, 2, section, 1, "> [!note] New"), source.replace("> [!info] Old", "> [!note] New"));
  assert.equal(replaceCalloutLines(source, 2, section, 3, "> one\n> two"), "Before\r\n\r> one\n> two\r\rAfter\n");
  assert.equal(replaceCalloutLines(source.replace(">body", ">concurrent edit"), 2, section, 1, "> [!note] New"), undefined);
  assert.equal(replaceCalloutLines("Before\r\n> [!note]", 1, "> [!note]", 1, "> [!note]\n> Added"), "Before\r\n> [!note]\r\n> Added");
});

test("save checks the entire live callout and permits unrelated edits outside its range", () => {
  const callout = "> [!NOTE]\n> old";
  for (const extra of [" text", "\n> new", "\nlazy", "\n> > [!TIP]\n> > nested"]) {
    assert.equal(matchCalloutSource(callout + extra, 0, callout), undefined);
    assert.equal(replaceCalloutLines((callout + extra).replaceAll("\n", "\r\n"), 0, callout, 2, "old"), undefined);
  }
  const current = "Longer introduction\n\n" + callout + "\n\nChanged elsewhere.";
  const found = matchCalloutSource(current, 2, callout);
  assert.equal(found.from, current.indexOf("> [!NOTE]"));
  assert.equal(found.to, current.indexOf("> old") + "> old".length);
  assert.equal(replaceCalloutLines(current, 2, callout, 2, "old"), "Longer introduction\n\nold\n\nChanged elsewhere.");
  assert.equal(matchCalloutSource("> [!NOTE]\n> > [!TIP]\n> > nested\n> outer", 1, "> > [!TIP]\n> > nested")?.body.length, 1);
});

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

test("records exact header end offsets and validates type and metadata", () => {
  const note = lines("> [!NOTE] Top", ">body", "", "  > > [!tip|wide] Nested", "  > > line");
  const [top, nested] = findCallouts(note);
  assert.equal(note.slice(top.from, top.headerTo), "> [!NOTE] Top");
  assert.equal(note.slice(nested.from, nested.headerTo), "  > > [!tip|wide] Nested");
  assert.equal(isValidCalloutType("note"), true);
  assert.equal(isValidCalloutType("my-type"), true);
  assert.equal(isValidCalloutType(""), false);
  assert.equal(isValidCalloutType("   "), false);
  assert.equal(isValidCalloutType("a]b"), false);
  assert.equal(isValidCalloutType("a|b"), false);
  assert.equal(isValidCalloutType("a\nb"), false);
  assert.equal(isValidCalloutMetadata("wide"), true);
  assert.equal(isValidCalloutMetadata(""), true);
  assert.equal(isValidCalloutMetadata("bad]meta"), false);
  assert.equal(isValidCalloutMetadata("a\nb"), false);
});

test("new type labels and markers use uppercase while keeping custom type identities", () => {
  assert.equal(displayCalloutType("note"), "NOTE");
  assert.equal(displayCalloutType("tLdR"), "TLDR");
  assert.equal(displayCalloutType("my-research"), "MY-RESEARCH");
  assert.equal(displayCalloutType("étude"), "ÉTUDE");
  assert.equal(displayCalloutType("straße"), "straße");
});

test("computes body cursor positions across prefixed, unspaced, lazy, nested, and empty callouts", () => {
  const spaced = lines("> [!note] Title", "> body");
  assert.deepEqual(bodyCursorPosition(spaced, findCallouts(spaced)[0]), { line: 1, ch: 2 });

  const unspaced = lines("> [!note] Title", ">body");
  assert.deepEqual(bodyCursorPosition(unspaced, findCallouts(unspaced)[0]), { line: 1, ch: 1 });

  const nested = lines("  > > [!tip] Nested", "  > > inner");
  assert.deepEqual(bodyCursorPosition(nested, findCallouts(nested)[0]), { line: 1, ch: 6 });

  const lazy = lines("> [!note] Title", "lazy line");
  assert.deepEqual(bodyCursorPosition(lazy, findCallouts(lazy)[0]), { line: 1, ch: 0 });

  const empty = "> [!note] Empty";
  assert.deepEqual(bodyCursorPosition(empty, findCallouts(empty)[0]), { line: 0, ch: empty.length });
});

test("formats multi-line pastes inside callouts without corrupting headers, fences, or copied markers", () => {
  const applyPaste = (note, marker, pasted, endMarker) => {
    const from = note.indexOf(marker);
    const to = endMarker ? note.indexOf(endMarker) : from;
    const clean = note.replace(marker, "").replace(endMarker ?? "", "");
    const cleanTo = endMarker ? to - marker.length : from;
    const replacement = formatCalloutPaste(clean, from, cleanTo, pasted);
    return replacement === undefined ? undefined : clean.slice(0, from) + replacement + clean.slice(cleanTo);
  };

  assert.equal(formatCalloutPaste("> [!note]\n> hello", 12, 12, "single line"), undefined);
  assert.equal(formatCalloutPaste("> [!note]\n> hello", 4, 4, "two\nlines"), undefined);
  assert.equal(formatCalloutPaste("> [!note]\n> hello\n\nAfter", 12, 22, "two\nlines"), undefined);

  assert.equal(
    applyPaste("> [!note]\n> |", "|", "first\n\nsecond"),
    "> [!note]\n> first\n>\n> second",
  );
  assert.equal(
    applyPaste("> [!note]\n> |existing", "|", "first\n"),
    "> [!note]\n> first\n> existing",
  );
  assert.equal(
    applyPaste("> [!note]\n|> existing", "|", "first\n"),
    "> [!note]\n> first\n> existing",
  );
  assert.equal(
    applyPaste("  > > [!TIP]\n|  > > existing", "|", "first\n> nested"),
    "  > > [!TIP]\n  > > first\n  > > > nested\n  > > existing",
  );
  assert.equal(
    applyPaste("> [!NOTE]\n|> existing", "|", "> quoted\n> > nested"),
    "> [!NOTE]\n> quoted\n> > nested\n> existing",
  );
  assert.equal(
    applyPaste("> [!NOTE]\n|> existing", "|", "> quoted\n> > nested\n"),
    undefined,
  );
  assert.equal(
    applyPaste("> [!NOTE]\n> first |old\n~> last", "|", "new\nline\n", "~"),
    "> [!NOTE]\n> first new\n> line\n> last",
  );
  assert.equal(
    applyPaste("> [!note]\n>|", "|", "first\nsecond"),
    "> [!note]\n> first\n> second",
  );
  assert.equal(
    applyPaste("  > > [!tip]\n  > > |", "|", "one\n\ntwo"),
    "  > > [!tip]\n  > > one\n  > >\n  > > two",
  );
  assert.equal(
    applyPaste("> [!note]\n> |", "|", "```js\nconst a = 1;\n\nconst b = 2;\n```"),
    "> [!note]\n> ```js\n> const a = 1;\n>\n> const b = 2;\n> ```",
  );
  assert.equal(
    applyPaste("> [!note]\n> |", "|", "> [!tip]\n> nested"),
    "> [!note]\n> > [!tip]\n> > nested",
  );
  assert.equal(
    applyPaste("> [!note]\n> first\n|lazy", "|", "second\nthird"),
    "> [!note]\n> first\n> second\n> thirdlazy",
  );
  assert.equal(
    applyPaste("> [!note]\n> first\n|lazy", "|", "> second\n> third"),
    undefined,
  );
  assert.equal(
    applyPaste("> [!note]\n> first\nla|zy", "|", "AA\nBB"),
    "> [!note]\n> first\nlaAA\n> BBzy",
  );
  assert.equal(
    applyPaste("> [!note]\n> |", "|", "one\r\ntwo\rthree"),
    "> [!note]\n> one\n> two\n> three",
  );
});

test("triggers callout type suggestions only on unclosed header brackets outside frontmatter and fences", () => {
  assert.deepEqual(calloutSuggestTrigger("> [!wa", 0, 6), { startCh: 4, query: "wa" });
  assert.deepEqual(calloutSuggestTrigger("  > > [!ti", 0, 10), { startCh: 8, query: "ti" });
  assert.deepEqual(calloutSuggestTrigger("> [!note]", 0, 9), undefined);
  assert.deepEqual(calloutSuggestTrigger("> [!note|wide", 0, 13), undefined);
  assert.deepEqual(calloutSuggestTrigger("---\n> [!note\n---\n> [!tip", 1, 12), undefined);
  assert.deepEqual(calloutSuggestTrigger("---\n> [!note\n---\n> [!tip", 3, 7), { startCh: 4, query: "tip" });
  assert.deepEqual(calloutSuggestTrigger("```\n> [!tip\n```", 1, 7), undefined);
  assert.deepEqual(calloutSuggestTrigger("> ```\n> [!tip\n> ```", 1, 7), undefined);
});
