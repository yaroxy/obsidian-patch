import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const result = await build({
  stdin: { contents: 'export { Platform } from "obsidian"; export * from "./src/features/git-diff/head"; export * from "./src/features/git-diff/model";', resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "desktop-host", setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "host" }));
    builder.onLoad({ filter: /.*/, namespace: "host" }, () => ({ contents: "export const Platform = {isDesktopApp:true}; export class MarkdownView {}" }));
  } }],
  banner: { js: 'import { createRequire } from "node:module"; const window = { require: createRequire(process.cwd() + "/package.json") };' },
});
const { Platform, readNoteHead, isGitWorkTree, noteChanges, hunkLines, changedLines } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));

test("mobile skips Git discovery and refuses to read desktop Git objects", async t => {
  Platform.isDesktopApp = false;
  t.after(() => { Platform.isDesktopApp = true; });
  assert.equal(await isGitWorkTree(process.cwd()), false);
  await assert.rejects(readNoteHead("sample.md"), /require the desktop app/);
});

test("Git features require the vault root to belong to a working tree", async t => {
  const root = mkdtempSync(join(tmpdir(), "patches-vault-git-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nested = join(root, "nested"), bare = join(root, "bare.git");
  execFileSync("git", ["init", "-q", "--template=", nested]);
  assert.equal(await isGitWorkTree(root), false);
  assert.equal(await isGitWorkTree(nested), true);
  mkdirSync(join(nested, "notes"));
  assert.equal(await isGitWorkTree(join(nested, "notes")), true);
  assert.equal(await isGitWorkTree(join(nested, ".git")), false);
  execFileSync("git", ["init", "-q", "--bare", "--template=", bare]);
  assert.equal(await isGitWorkTree(bare), false);
  writeFileSync(join(root, ".git"), "gitdir: missing\n");
  assert.equal(await isGitWorkTree(root), false);
});

test("the upstream revision is read locally for a nested note with literal Git path characters", async t => {
  const dir = mkdtempSync(join(tmpdir(), "patches-diff-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = args => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  mkdirSync(join(dir, "notes"));
  const name = "notes/--[test] café.md", path = join(dir, name);
  writeFileSync(path, "baseline\n");
  await assert.rejects(readNoteHead(path), /outside a Git working tree/);
  git(["init", "-q", "--template="]);
  assert.deepEqual(await readNoteHead(path), { text: "", tracked: false });
  git(["--literal-pathspecs", "add", "--", name]);
  git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-qm", "Fixture"]);
  writeFileSync(path, "staged\n");
  git(["--literal-pathspecs", "add", "--", name]);
  writeFileSync(path, "working\n");
  const state = git(["status", "--porcelain"]);
  const commit = git(["rev-parse", "HEAD"]).trim();
  assert.deepEqual(await readNoteHead(path), { text: "baseline\n", commit, tracked: true });
  assert.deepEqual(await readNoteHead(join(dir, "notes", "new.md")), { text: "", commit, tracked: false });
  assert.equal(git(["status", "--porcelain"]), state);
});

test("stacked panes share a hunk and retain line numbers and missing final newline markers", () => {
  assert.deepEqual(noteChanges("a\r\nb\r\n", "a\nb\n"), []);
  assert.deepEqual(noteChanges("\uFEFFa\r\n", "a\n"), []);
  const [change] = noteChanges("one\ntwo", "one\nthree\n");
  const old = hunkLines(change, "before"), current = hunkLines(change, "current");
  assert.deepEqual(old.map(row => row.mark), [" ", "-", "\\"]);
  assert.deepEqual(current.map(row => row.mark), [" ", "+"]);
  assert.deepEqual(current.map(row => row.line), [1, 2]);
  assert.deepEqual(hunkLines(noteChanges("", "new")[0], "before"), []);
  assert.deepEqual(hunkLines(noteChanges("old", "")[0], "current"), []);
});

test("gutter markers use current line numbers and link to the same hunk as the comparison", () => {
  const old = Array.from({ length: 22 }, (_, i) => "Line " + (i + 1));
  const current = [...old];
  current.splice(17, 1);
  current.splice(1, 1, "Changed", "Extra");
  const marks = changedLines(noteChanges(old.join("\n"), current.join("\n")), current.length);
  assert.deepEqual(marks, [
    { line: 2, kind: "modified", hunk: 0 },
    { line: 3, kind: "added", hunk: 0 },
    { line: 19, kind: "deleted", hunk: 1, atEnd: false },
  ]);
});

test("the gutter anchors a deletion at either document boundary and skips unchanged lines", () => {
  const marks = (before, after) => changedLines(noteChanges(before, after), after.split("\n").length);
  assert.deepEqual(marks("old\nkept", "kept"), [{ line: 1, kind: "deleted", hunk: 0, atEnd: false }]);
  assert.deepEqual(marks("kept\nold\n", "kept\n"), [{ line: 2, kind: "deleted", hunk: 0, atEnd: false }]);
  assert.deepEqual(marks("a\nb\nc", "a\nb"), [{ line: 2, kind: "deleted", hunk: 0, atEnd: true }]);
  assert.deepEqual(marks("old", ""), [{ line: 1, kind: "deleted", hunk: 0, atEnd: false }]);
  assert.deepEqual(marks("", "new\n"), [{ line: 1, kind: "added", hunk: 0 }]);
  assert.deepEqual(marks("a\r\nb", "a\nb"), []);
});
