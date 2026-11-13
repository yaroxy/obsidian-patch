import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { integrationBuild, obsidianCli, runIntegration } from "../scripts/lib/integration-runner.mjs";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../scripts/lib/obsidian-session.js", import.meta.url), "utf8");

test("integration builds default to community and require an explicit valid full selection", () => {
  assert.equal(integrationBuild({}), "community");
  assert.equal(integrationBuild({ PATCHES_BUILD: "full" }), "full");
  assert.throws(() => integrationBuild({ PATCHES_BUILD: "../other" }), /community or full/);
});

test("CLI override wins; macOS uses the native CLI without relying on PATH", () => {
  assert.equal(obsidianCli({ OBSIDIAN_CLI: "/custom/cli" }, "darwin", () => true), "/custom/cli");
  assert.equal(obsidianCli({}, "darwin", () => true), "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli");
  assert.equal(obsidianCli({}, "darwin", () => false), "obsidian");
  assert.equal(obsidianCli({}, "linux", () => true), "obsidian");
});

test("a personal vault is refused before launching the CLI or preparing fixtures", async t => {
  const vault = mkdtempSync(join(tmpdir(), "obsidian-personal-"));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  let prepared = false;
  await assert.rejects(runIntegration({ vault, name: "guard", prepare() { prepared = true; } }), /restricted to dev-vault/);
  assert.equal(prepared, false);
});

function fixture(t, reloadFailure = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "obsidian-session-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vault = join(root, "dev-vault"), output = join(root, "output");
  mkdirSync(join(vault, ".obsidian/plugins/patches"), { recursive: true });
  mkdirSync(output);
  const settings = join(vault, ".obsidian/plugins/patches/data.json");
  const original = '{\n  "custom": "preserve whitespace too"\n}\n';
  writeFileSync(settings, original); writeFileSync(join(output, "settings-before.json"), original);
  const storage = new Map([["test-obsidian-patch-table-editor-size", '{"width":900}']]);
  let throttled = false; // Preserve a caller's false as well as the usual true.
  const previous = { parent: {}, view: {} };
  const leaf = { parent: {}, view: { save: async () => {} }, detach() { this.parent = null; } };
  let active = previous;
  const app = { appId: "test", vault: { adapter: { getBasePath: () => vault } },
    setting: { containerEl: { isConnected: false }, close() {} },
    plugins: { plugins: { "patches": {} },
      async disablePlugin(id) { delete this.plugins[id]; },
      async enablePlugin(id) { if (reloadFailure) throw new Error("Reload failed"); this.plugins[id] = {}; } },
    workspace: { getMostRecentLeaf: () => active, getLeaf: () => leaf, setActiveLeaf: value => { active = value; } } };
  const session = runInNewContext(`(${source})`, { AbortController, setTimeout, clearTimeout,
    require: name => name === "electron" ? { remote: { getCurrentWebContents: () => ({
      getBackgroundThrottling: () => throttled, setBackgroundThrottling: value => { throttled = value; },
    }) } } : require(name),
    document: { querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  return { app, leaf, session, settings, storage,
    config: { runId: "test", vault, output, timeoutMs: 1000, settingsExisted: true },
    mutate() { writeFileSync(settings, '{"changed":true}'); storage.set("test-obsidian-patch-table-editor-size", "changed"); storage.set("test-obsidian-patch-callout-editor-size", "new"); },
    result: () => JSON.parse(readFileSync(join(output, "results.json"), "utf8")),
    restored() {
      assert.equal(readFileSync(settings, "utf8"), original);
      assert.equal(active, previous); assert.equal(leaf.parent, null); assert.equal(throttled, false);
      assert.equal(storage.get("test-obsidian-patch-table-editor-size"), '{"width":900}');
      assert.equal(storage.has("test-obsidian-patch-callout-editor-size"), false);
    },
  };
}

test("successful suites restore settings bytes, sizes, active tab and background state", async t => {
  const f = fixture(t);
  await f.session(f.app, f.config, async (_app, context) => { f.mutate(); context.report.checks.push("sample"); });
  f.restored();
  assert.equal(f.result().finished, true); assert.equal(f.result().error, undefined);
});

test("a failing suite preserves its error and still restores state", async t => {
  const f = fixture(t);
  await f.session(f.app, f.config, async () => { f.mutate(); throw new Error("Intentional assertion failure"); });
  f.restored(); assert.match(f.result().error, /Intentional assertion failure/);
});

test("timeout interrupts a wait before later writes and performs cleanup", async t => {
  const f = fixture(t);
  let resumed = false;
  await f.session(f.app, { ...f.config, timeoutMs: 20 }, async (_app, context) => {
    f.mutate(); await context.wait(1000); resumed = true;
  });
  f.restored(); assert.equal(resumed, false); assert.match(f.result().error, /timed out/);
});

test("cleanup failures are reported alongside the original assertion failure", async t => {
  const f = fixture(t, true);
  await f.session(f.app, f.config, async () => { f.mutate(); throw new Error("Original failure"); });
  f.restored(); assert.match(f.result().error, /Original failure/);
  assert.match(f.result().cleanupErrors.join("\n"), /Reload failed/);
});

test("a failed test-note save still closes its tab and restores other state", async t => {
  const f = fixture(t);
  f.leaf.view.save = async () => { throw new Error("Save failed"); };
  await f.session(f.app, f.config, async () => { f.mutate(); });
  f.restored(); assert.match(f.result().cleanupErrors.join("\n"), /Save failed/);
});

test("a different live vault is rejected before creating a test tab", async t => {
  const f = fixture(t);
  await f.session(f.app, { ...f.config, vault: f.config.output }, async () => { throw new Error("Must not run"); });
  assert.match(f.result().error, /different vault/);
  assert.notEqual(f.leaf.parent, null);
});
