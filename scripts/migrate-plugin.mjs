import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_TARGETS, validateReleaseBuild } from "./lib/release-validation.mjs";

const OLD_ID = "obsidian-patch";
const NEW_ID = "patches";
const INSTALL_FILES = ["main.js", "manifest.json", "styles.css"];
const json = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const optionalFile = file => fs.existsSync(file) ? fs.readFileSync(file) : null;

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Resolve all inputs before any write. A plan also holds the original bytes for rollback. */
export function planMigration(vault, { build = "community", buildDirectory } = {}) {
  if (!vault || !isAbsolute(vault)) throw new Error("Supply an absolute vault path");
  if (!BUILD_TARGETS.includes(build)) throw new Error(`Build must be ${BUILD_TARGETS.join(" or ")} in this checkout`);
  vault = fs.realpathSync(vault);
  const config = join(vault, ".obsidian");
  if (!fs.existsSync(config)) throw new Error("The vault has no .obsidian configuration directory");
  const plugins = join(config, "plugins");
  const oldDirectory = join(plugins, OLD_ID), newDirectory = join(plugins, NEW_ID);
  if (!fs.existsSync(oldDirectory)) throw new Error("No obsidian-patch installation exists in this vault");
  if (fs.existsSync(newDirectory)) throw new Error("A patches directory already exists; refusing to overwrite it");
  const oldManifest = JSON.parse(fs.readFileSync(join(oldDirectory, "manifest.json"), "utf8"));
  if (oldManifest.id !== OLD_ID) throw new Error("The old plugin manifest has an unexpected ID");

  const directory = buildDirectory ?? validateReleaseBuild(fileURLToPath(new URL("../", import.meta.url)), build).dir;
  const files = Object.fromEntries(INSTALL_FILES.map(name => [name, fs.readFileSync(join(directory, name))]));
  const manifest = JSON.parse(files["manifest.json"]);
  if (manifest.id !== NEW_ID || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error("The selected build must contain a valid patches manifest");
  }

  const snapshots = {
    data: { path: join(oldDirectory, "data.json"), backup: "obsidian-patch-data.json" },
    enabled: { path: join(config, "community-plugins.json"), backup: "community-plugins.json" },
    hotkeys: { path: join(config, "hotkeys.json"), backup: "hotkeys.json" },
  };
  for (const item of Object.values(snapshots)) item.before = optionalFile(item.path);
  const enabled = snapshots.enabled.before === null ? [] : JSON.parse(snapshots.enabled.before);
  if (!Array.isArray(enabled) || enabled.some(id => typeof id !== "string")) throw new Error("Invalid community-plugins.json");
  if (enabled.includes(NEW_ID)) throw new Error("patches already appears in the enabled plugin list; resolve it before migrating");
  const hotkeys = snapshots.hotkeys.before === null ? {} : JSON.parse(snapshots.hotkeys.before);
  if (!plainObject(hotkeys)) throw new Error("Invalid hotkeys.json");
  const commands = Object.keys(hotkeys).filter(id => id.startsWith(`${OLD_ID}:`));
  for (const command of commands) {
    const destination = NEW_ID + command.slice(OLD_ID.length);
    if (Object.hasOwn(hotkeys, destination)) throw new Error(`Shortcut conflict: ${destination} already exists`);
  }
  const migratedHotkeys = Object.fromEntries(Object.entries(hotkeys).map(([id, keys]) => [
    id.startsWith(`${OLD_ID}:`) ? NEW_ID + id.slice(OLD_ID.length) : id, keys,
  ]));
  snapshots.enabled.after = enabled.includes(OLD_ID)
    ? json(enabled.map(id => id === OLD_ID ? NEW_ID : id)) : snapshots.enabled.before;
  snapshots.hotkeys.after = commands.length ? json(migratedHotkeys) : snapshots.hotkeys.before;
  return { vault, config, oldDirectory, newDirectory, build, version: manifest.version, files, snapshots,
    enabled: enabled.includes(OLD_ID), shortcuts: commands.length };
}

export function assertObsidianClosed(processList) {
  if (processList === undefined) {
    try {
      processList = process.platform === "win32"
        ? execFileSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8" })
        : execFileSync("ps", ["-A", "-o", "comm="], { encoding: "utf8" });
    } catch {
      throw new Error("Could not check running applications; close Obsidian and make process listing available before applying");
    }
  }
  if (processList.split(/\r?\n/).some(line => {
    const name = basename(line.trim().replace(/^"([^"]+)".*$/, "$1"));
    return /^obsidian(?:$|\.exe$| helper\b|[- ]\d)/i.test(name);
  })) throw new Error("Close Obsidian completely before applying the migration");
}

function unchanged(snapshot) {
  const current = optionalFile(snapshot.path);
  return snapshot.before === null ? current === null : current !== null && current.equals(snapshot.before);
}

function installationUnchanged(plan) {
  const expected = { ...plan.files };
  if (plan.snapshots.data.before !== null) expected["data.json"] = plan.snapshots.data.before;
  const names = fs.readdirSync(plan.newDirectory);
  return names.length === Object.keys(expected).length && names.every(name =>
    Object.hasOwn(expected, name) && fs.lstatSync(join(plan.newDirectory, name)).isFile()
      && fs.readFileSync(join(plan.newDirectory, name)).equals(expected[name]));
}

function replaceFile(file, contents) {
  const temporary = `${file}.patches-${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** Call only while Obsidian is closed. Original files and a recovery report remain in the backup. */
export function applyMigration(plan) {
  if (fs.existsSync(plan.newDirectory)) throw new Error("A patches directory now exists; refusing to overwrite it");
  if (!Object.values(plan.snapshots).every(unchanged)) throw new Error("Vault settings changed after the preview; create a new migration plan");
  const lock = join(plan.config, "patches-migration.lock");
  const fd = fs.openSync(lock, "wx");
  fs.closeSync(fd);
  const token = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
  const backup = join(plan.config, "patches-migration-backups", token);
  const staging = join(plan.config, "plugins", `.patches-migration-${token}`);
  let installed = false, keepLock = false;
  const changed = [];
  const report = { vault: plan.vault, build: plan.build, version: plan.version,
    oldDirectory: plan.oldDirectory, newDirectory: plan.newDirectory,
    absentFiles: Object.values(plan.snapshots).filter(item => item.before === null).map(item => item.path),
    status: "preparing" };
  const saveReport = () => replaceFile(join(backup, "migration.json"), json(report));
  try {
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, backup }));
    for (const snapshot of Object.values(plan.snapshots)) {
      if (snapshot.before !== null) fs.writeFileSync(join(backup, snapshot.backup), snapshot.before, { flag: "wx", mode: 0o600 });
    }
    saveReport();
    fs.mkdirSync(staging);
    for (const [name, contents] of Object.entries(plan.files)) fs.writeFileSync(join(staging, name), contents);
    if (plan.snapshots.data.before !== null) fs.writeFileSync(join(staging, "data.json"), plan.snapshots.data.before, { mode: 0o600 });
    if (!Object.values(plan.snapshots).every(unchanged)) throw new Error("Vault settings changed during migration");
    if (fs.existsSync(plan.newDirectory)) throw new Error("A patches directory appeared during migration");
    fs.renameSync(staging, plan.newDirectory);
    installed = true;
    for (const snapshot of [plan.snapshots.enabled, plan.snapshots.hotkeys]) {
      if (snapshot.after !== snapshot.before) {
        if (!unchanged(snapshot)) throw new Error("Vault settings changed during migration");
        replaceFile(snapshot.path, snapshot.after);
        changed.push(snapshot);
      }
    }
    report.status = "complete";
    saveReport();
    return { backup, ...report };
  } catch (error) {
    const recoveryErrors = [];
    for (const snapshot of changed.reverse()) {
      try {
        const current = optionalFile(snapshot.path);
        if (current === null || !current.equals(snapshot.after)) throw new Error(`Cannot restore a file changed by another process: ${snapshot.path}`);
        if (snapshot.before === null) fs.rmSync(snapshot.path, { force: true });
        else replaceFile(snapshot.path, snapshot.before);
      } catch (failure) { recoveryErrors.push(failure.message); }
    }
    // If restoring the enable list failed, keep the new files available until manual recovery.
    if (installed && recoveryErrors.length === 0) {
      try {
        if (!installationUnchanged(plan)) throw new Error("The new installation was changed by another process; retained for manual recovery");
        fs.rmSync(plan.newDirectory, { recursive: true });
      } catch (failure) { recoveryErrors.push(failure.message); }
    }
    keepLock = recoveryErrors.length > 0;
    report.status = keepLock ? "recovery-required" : "rolled-back";
    report.error = error.message;
    report.recoveryErrors = recoveryErrors;
    if (fs.existsSync(backup)) {
      try { saveReport(); } catch { /* Original backups remain even when the report cannot be updated. */ }
    }
    throw new Error(`${error.message}. ${keepLock ? "Manual recovery is required" : "Migration changes were rolled back"}. Backup: ${backup}`, { cause: error });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    if (!keepLock) fs.rmSync(lock, { force: true });
  }
}

function main(args) {
  const vault = args.find(arg => !arg.startsWith("--"));
  if (args.includes("--help") || !vault) {
    console.log(`Usage: node scripts/migrate-plugin.mjs /absolute/vault/path [--build=${BUILD_TARGETS.join("|")}] [--apply]\nWithout --apply, only previews the migration. Close Obsidian before applying. The old plugin directory is retained.`);
    return;
  }
  const flags = args.filter(arg => arg.startsWith("--"));
  if (args.filter(arg => !arg.startsWith("--")).length !== 1 || flags.some(arg => arg !== "--apply" && !(arg.startsWith("--build=") && BUILD_TARGETS.includes(arg.slice("--build=".length))))) {
    throw new Error(`Expected one absolute vault path, optional --build=${BUILD_TARGETS.join("|")}, and optional --apply`);
  }
  const build = flags.find(arg => arg.startsWith("--build="))?.slice("--build=".length) ?? "community";
  if (args.includes("--apply")) assertObsidianClosed();
  const plan = planMigration(vault, { build });
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "apply" : "preview", vault: plan.vault,
    build, version: plan.version, from: OLD_ID, to: NEW_ID, enabled: plan.enabled, shortcuts: plan.shortcuts,
    settings: plan.snapshots.data.before !== null, oldDirectoryRetained: true }, null, 2));
  if (args.includes("--apply")) console.log(JSON.stringify(applyMigration(plan), null, 2));
  else console.log("No files changed. Close Obsidian and repeat with --apply to migrate.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
