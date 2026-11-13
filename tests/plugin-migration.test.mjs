import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyMigration, assertObsidianClosed, planMigration } from "../scripts/migrate-plugin.mjs";

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "patches-migration-test-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const vault = join(root, "vault"), config = join(vault, ".obsidian"), buildDirectory = join(root, "build");
  const oldDirectory = join(config, "plugins/obsidian-patch"), newDirectory = join(config, "plugins/patches");
  fs.mkdirSync(oldDirectory, { recursive: true });
  fs.mkdirSync(buildDirectory);
  const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
  writeJSON(join(oldDirectory, "manifest.json"), { id: "obsidian-patch", version: "0.1.0" });
  fs.writeFileSync(join(oldDirectory, "main.js"), "old plugin remains available");
  const settings = '{\n "mermaidVersion": "latest", "icons": {"paths":{"Project":"book"}}\n}\n';
  fs.writeFileSync(join(oldDirectory, "data.json"), settings);
  writeJSON(join(config, "community-plugins.json"), ["calendar", "obsidian-patch", "other"]);
  const shortcuts = {
    "obsidian-patch:edit-html-table": [{ modifiers: ["Mod", "Shift"], key: "T" }],
    "other:command": [{ modifiers: ["Alt"], key: "X" }],
  };
  writeJSON(join(config, "hotkeys.json"), shortcuts);
  writeJSON(join(buildDirectory, "manifest.json"), { id: "patches", version: "0.3.0", minAppVersion: "1.15.0" });
  fs.writeFileSync(join(buildDirectory, "main.js"), "new plugin build");
  fs.writeFileSync(join(buildDirectory, "styles.css"), "/* unchanged selectors */");
  return { vault, config, oldDirectory, newDirectory, buildDirectory, settings, shortcuts, writeJSON,
    plan: () => planMigration(vault, { buildDirectory }),
    readJSON: file => JSON.parse(fs.readFileSync(file, "utf8")) };
}

test("preview does not write, while migration preserves settings bytes and unrelated plugin state", t => {
  const f = fixture(t);
  const beforeEnabled = fs.readFileSync(join(f.config, "community-plugins.json"));
  const beforeHotkeys = fs.readFileSync(join(f.config, "hotkeys.json"));
  const plan = f.plan();
  assert.equal(fs.existsSync(f.newDirectory), false);
  assert.equal(fs.existsSync(join(f.config, "patches-migration-backups")), false);
  const result = applyMigration(plan);
  assert.equal(result.status, "complete");
  assert.equal(fs.readFileSync(join(f.newDirectory, "data.json"), "utf8"), f.settings);
  assert.equal(fs.readFileSync(join(f.oldDirectory, "data.json"), "utf8"), f.settings);
  assert.equal(fs.readFileSync(join(f.oldDirectory, "main.js"), "utf8"), "old plugin remains available");
  assert.deepEqual(f.readJSON(join(f.config, "community-plugins.json")), ["calendar", "patches", "other"]);
  assert.deepEqual(f.readJSON(join(f.config, "hotkeys.json")), {
    "patches:edit-html-table": f.shortcuts["obsidian-patch:edit-html-table"], "other:command": f.shortcuts["other:command"],
  });
  assert.equal(fs.readFileSync(join(result.backup, "obsidian-patch-data.json"), "utf8"), f.settings);
  assert.deepEqual(fs.readFileSync(join(result.backup, "community-plugins.json")), beforeEnabled);
  assert.deepEqual(fs.readFileSync(join(result.backup, "hotkeys.json")), beforeHotkeys);
  assert.equal(fs.existsSync(join(f.config, "patches-migration.lock")), false);
  assert.throws(() => f.plan(), /already exists/);
});

test("migration does not enable a previously disabled plugin or create absent settings", t => {
  const f = fixture(t);
  fs.rmSync(join(f.oldDirectory, "data.json"));
  fs.rmSync(join(f.config, "hotkeys.json"));
  f.writeJSON(join(f.config, "community-plugins.json"), ["calendar"]);
  const result = applyMigration(f.plan());
  assert.deepEqual(f.readJSON(join(f.config, "community-plugins.json")), ["calendar"]);
  assert.equal(fs.existsSync(join(f.newDirectory, "data.json")), false);
  assert.equal(fs.existsSync(join(f.config, "hotkeys.json")), false);
  assert.equal(result.absentFiles.length, 2);
});

test("an existing installation or destination shortcut is never overwritten", t => {
  const f = fixture(t);
  fs.mkdirSync(f.newDirectory);
  assert.throws(() => f.plan(), /already exists/);
  fs.rmdirSync(f.newDirectory);
  f.writeJSON(join(f.config, "hotkeys.json"), { ...f.shortcuts, "patches:edit-html-table": [] });
  assert.throws(() => f.plan(), /Shortcut conflict/);
  assert.equal(fs.existsSync(join(f.config, "patches-migration-backups")), false);
});

test("a stale preview is rejected without overwriting later vault edits", t => {
  const f = fixture(t), plan = f.plan();
  const changed = '{"new":"setting"}';
  fs.writeFileSync(join(f.oldDirectory, "data.json"), changed);
  assert.throws(() => applyMigration(plan), /changed after the preview/);
  assert.equal(fs.readFileSync(join(f.oldDirectory, "data.json"), "utf8"), changed);
  assert.equal(fs.existsSync(f.newDirectory), false);
});

test("a write failure rolls back the enabled list and installation while keeping the backup", t => {
  const f = fixture(t), plan = f.plan();
  const originalRename = fs.renameSync;
  let fail = true;
  t.mock.method(fs, "renameSync", (from, to) => {
    if (to === join(f.config, "hotkeys.json") && fail) { fail = false; throw new Error("Simulated disk error"); }
    return originalRename(from, to);
  });
  assert.throws(() => applyMigration(plan), /rolled back/);
  assert.deepEqual(fs.readFileSync(join(f.config, "community-plugins.json")), plan.snapshots.enabled.before);
  assert.deepEqual(fs.readFileSync(join(f.config, "hotkeys.json")), plan.snapshots.hotkeys.before);
  assert.equal(fs.readFileSync(join(f.oldDirectory, "data.json"), "utf8"), f.settings);
  assert.equal(fs.existsSync(f.newDirectory), false);
  assert.equal(fs.existsSync(join(f.config, "patches-migration.lock")), false);
  const backups = fs.readdirSync(join(f.config, "patches-migration-backups"));
  assert.equal(backups.length, 1);
  assert.equal(f.readJSON(join(f.config, "patches-migration-backups", backups[0], "migration.json")).status, "rolled-back");
});

test("a failed rollback retains the new installation and lock for explicit recovery", t => {
  const f = fixture(t), plan = f.plan();
  const originalRename = fs.renameSync;
  let enabledWrites = 0;
  t.mock.method(fs, "renameSync", (from, to) => {
    if (to === join(f.config, "hotkeys.json")) throw new Error("Cannot update hotkeys");
    if (to === join(f.config, "community-plugins.json") && ++enabledWrites === 2) throw new Error("Cannot restore enabled list");
    return originalRename(from, to);
  });
  assert.throws(() => applyMigration(plan), /Manual recovery is required/);
  assert.equal(fs.existsSync(f.newDirectory), true);
  assert.equal(fs.readFileSync(join(f.oldDirectory, "data.json"), "utf8"), f.settings);
  const { backup } = f.readJSON(join(f.config, "patches-migration.lock"));
  assert.equal(f.readJSON(join(backup, "migration.json")).status, "recovery-required");
  assert.deepEqual(fs.readFileSync(join(backup, "community-plugins.json")), plan.snapshots.enabled.before);
  assert.throws(() => f.plan(), /already exists/);
});

test("concurrent configuration edits are not overwritten during migration or rollback", t => {
  const f = fixture(t), plan = f.plan();
  const originalRename = fs.renameSync;
  const editedEnabled = '["calendar", "patches", "new-plugin"]\n';
  const editedHotkeys = '{"new-plugin:command": []}\n';
  t.mock.method(fs, "renameSync", (from, to) => {
    const result = originalRename(from, to);
    if (to === join(f.config, "community-plugins.json")) {
      fs.writeFileSync(to, editedEnabled);
      fs.writeFileSync(join(f.config, "hotkeys.json"), editedHotkeys);
    }
    return result;
  });
  assert.throws(() => applyMigration(plan), /Manual recovery is required/);
  assert.equal(fs.readFileSync(join(f.config, "community-plugins.json"), "utf8"), editedEnabled);
  assert.equal(fs.readFileSync(join(f.config, "hotkeys.json"), "utf8"), editedHotkeys);
  assert.equal(fs.existsSync(join(f.config, "patches-migration.lock")), true);
  assert.equal(fs.readFileSync(join(f.oldDirectory, "data.json"), "utf8"), f.settings);
});

test("rollback does not delete new installation data changed by another process", t => {
  const f = fixture(t), plan = f.plan();
  const originalRename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from, to) => {
    if (to === join(f.config, "hotkeys.json")) {
      fs.writeFileSync(join(f.newDirectory, "data.json"), '{"new":"user setting"}');
      throw new Error("Simulated disk error");
    }
    return originalRename(from, to);
  });
  assert.throws(() => applyMigration(plan), /Manual recovery is required/);
  assert.equal(fs.readFileSync(join(f.newDirectory, "data.json"), "utf8"), '{"new":"user setting"}');
  assert.deepEqual(fs.readFileSync(join(f.config, "community-plugins.json")), plan.snapshots.enabled.before);
  assert.equal(fs.existsSync(join(f.config, "patches-migration.lock")), true);
});

test("validation rejects relative paths, unsupported builds, missing assets and wrong plugin IDs", t => {
  const f = fixture(t);
  assert.throws(() => planMigration("relative/vault"), /absolute vault path/);
  assert.throws(() => planMigration(f.vault, { build: "../other" }), /must be community/);
  assert.throws(() => planMigration(f.vault, { build: "full", buildDirectory: f.buildDirectory }), /must be community/);
  f.writeJSON(join(f.buildDirectory, "manifest.json"), { id: "obsidian-patch", version: "0.3.0" });
  assert.throws(() => f.plan(), /valid patches manifest/);
  fs.rmSync(join(f.buildDirectory, "main.js"));
  assert.throws(() => f.plan(), /ENOENT/);
});

test("process guard detects Obsidian on supported platforms without mistaking its CLI for the app", () => {
  for (const list of ["/Applications/Obsidian.app/Contents/MacOS/Obsidian", "obsidian", '"Obsidian.exe","1234","Console"', "obsidian-1.15.0.AppImage"]) {
    assert.throws(() => assertObsidianClosed(list), /Close Obsidian completely/);
  }
  assert.doesNotThrow(() => assertObsidianClosed("/usr/bin/node\n/Applications/Obsidian.app/Contents/MacOS/obsidian-cli"));
});
