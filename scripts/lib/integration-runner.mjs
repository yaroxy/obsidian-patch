import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BUILD_TARGETS } from "./release-validation.mjs";

export function obsidianCli(env = process.env, platform = process.platform, exists = existsSync) {
  if (env.OBSIDIAN_CLI) return env.OBSIDIAN_CLI;
  const native = "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli";
  return platform === "darwin" && exists(native) ? native : "obsidian";
}

export function integrationBuild(env = process.env) {
  const build = env.PATCHES_BUILD ?? "community";
  if (!BUILD_TARGETS.includes(build)) throw new Error(`PATCHES_BUILD must be ${BUILD_TARGETS.join(" or ")} in this checkout`);
  return build;
}

/** All mutating suites share vault verification, deployment, completion and cleanup. */
export async function runIntegration({ name, folder, script, prepare, verify, options = {},
  vault = process.argv[2], output = process.argv[3], timeoutMs = 120000 }) {
  if (!vault) throw new Error("Supply the path to an open dev-vault");
  vault = realpathSync(resolve(vault));
  if (basename(vault) !== "dev-vault") throw new Error("Mutating integration tests are restricted to dev-vault");
  const build = integrationBuild();
  const buildDir = new URL(`../../dist/${build}/`, import.meta.url);
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    if (!existsSync(new URL(file, buildDir))) throw new Error(`Build ${build} before testing: missing dist/${build}/${file}`);
  }
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", buildDir), "utf8"));
  if (manifest.id !== "patches") throw new Error("The integration build must use plugin ID patches");
  const cli = (command, ...args) => {
    const result = execFileSync(obsidianCli(), [`vault=${basename(vault)}`, command, ...args], { encoding: "utf8", timeout: 30000 }).trim();
    // Obsidian sometimes returns CLI errors with exit code zero (e.g. during startup).
    if (/^Error:/m.test(result)) throw new Error(result);
    return result;
  };
  const preflight = JSON.parse(cli("eval", 'code=JSON.stringify({path:app.vault.adapter.getBasePath(),enabled:!!app.plugins.plugins["patches"],legacyEnabled:!!app.plugins.plugins["obsidian-patch"],busy:!!globalThis.__obsidianPatchTest,modal:app.setting.containerEl.isConnected||!!document.querySelector(".modal-container")})').replace(/^=>\s*/, ""));
  if (realpathSync(preflight.path) !== vault) throw new Error("The CLI selected a different vault; no files were changed");
  if (!preflight.enabled || preflight.legacyEnabled || preflight.busy || preflight.modal) throw new Error("Enable patches, disable obsidian-patch, close dialogs, and finish any running test in dev-vault first");
  const lock = join(tmpdir(), `obsidian-patch-test-${createHash("sha256").update(vault).digest("hex").slice(0, 16)}.lock`);
  const lockFd = openSync(lock, "wx");
  closeSync(lockFd);
  const runId = randomUUID();
  let launched = false, finished = false, interrupted;
  const cancel = signal => {
    interrupted = signal;
    if (launched) {
      try { cli("eval", `code=globalThis.__obsidianPatchTest?.runId===${JSON.stringify(runId)}&&globalThis.__obsidianPatchTest.abort(${JSON.stringify(signal)})`); }
      catch (e) { console.error(`Could not signal Obsidian; its session timeout remains active: ${e.message}`); }
    }
  };
  const onInt = () => cancel("SIGINT"), onTerm = () => cancel("SIGTERM");
  try {
    output = output ? resolve(output) : mkdtempSync(join(tmpdir(), `obsidian-patch-${name}-`));
    mkdirSync(output, { recursive: true });
    writeFileSync(lock, JSON.stringify({ pid: process.pid, runId, output }));
    const settings = join(vault, ".obsidian/plugins/patches/data.json");
    const settingsExisted = existsSync(settings);
    if (settingsExisted) copyFileSync(settings, join(output, "settings-before.json"));
    const config = { runId, vault, output, timeoutMs, settingsExisted, options, build };
    writeFileSync(join(output, "run.json"), JSON.stringify(config, null, 2));
    console.log(`Results: ${output}`);
    mkdirSync(join(vault, folder), { recursive: true });
    await prepare?.({ vault, output });
    for (const file of ["main.js", "manifest.json", "styles.css"]) {
      copyFileSync(new URL(file, buildDir), join(vault, ".obsidian/plugins/patches", file));
    }
    console.log(cli("plugin:reload", "id=patches"));
    const host = readFileSync(new URL("./obsidian-session.js", import.meta.url), "utf8");
    const suite = readFileSync(script, "utf8");
    process.on("SIGINT", onInt); process.on("SIGTERM", onTerm);
    launched = true;
    cli("eval", `code=void (${host})(app,${JSON.stringify(config)},${suite})`);
    const deadline = Date.now() + timeoutMs + 15000;
    while (Date.now() < deadline) {
      const file = join(output, "results.json");
      if (existsSync(file)) {
        const report = JSON.parse(readFileSync(file, "utf8"));
        if (report.runId === runId && report.finished) {
          finished = true;
          report.restored ??= {};
          report.restored.settings = settingsExisted
            ? existsSync(settings) && readFileSync(settings).equals(readFileSync(join(output, "settings-before.json")))
            : !existsSync(settings);
          const save = () => { writeFileSync(file + ".tmp", JSON.stringify(report, null, 2)); renameSync(file + ".tmp", file); };
          if (interrupted) report.interrupted = interrupted;
          save();
          for (const check of report.checks) console.log(`PASS ${check}`);
          for (const skipped of report.skipped) console.log(`SKIP ${skipped}`);
          if (report.error || report.cleanupErrors?.length || !report.restored.settings || interrupted) {
            throw new Error([report.error, ...(report.cleanupErrors ?? []), !report.restored.settings && "Settings were not restored", interrupted].filter(Boolean).join("\n"));
          }
          try { await verify?.({ vault, output }); }
          catch (e) { report.verificationError = e.stack ?? String(e); save(); throw e; }
          console.log(`PASS ${name} integration (${report.checks.length} checks, ${report.skipped.length} skipped groups); state restored`);
          return report;
        }
      }
      await delay(100);
    }
    throw new Error(`No completed cleanup report. Inspect ${output}; Obsidian may be unresponsive. The lock is retained while the app may still be running this test.`);
  } finally {
    process.removeListener("SIGINT", onInt); process.removeListener("SIGTERM", onTerm);
    if (!launched || finished) rmSync(lock, { force: true });
  }
}
