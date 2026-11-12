import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runIntegration } from "./lib/integration-runner.mjs";

const output = process.argv[3] ? resolve(process.argv[3]) : mkdtempSync(join(tmpdir(), "obsidian-patch-recovery-"));
for (const mode of ["success", "failure", "timeout"]) {
  let failure;
  try {
    await runIntegration({ name: `recovery-${mode}`, folder: "Patch Runner Tests",
      script: new URL("./runner-recovery-integration.js", import.meta.url),
      output: join(output, mode), options: { mode }, timeoutMs: mode === "timeout" ? 1000 : 30000 });
  } catch (e) { failure = e; }
  const report = JSON.parse(readFileSync(join(output, mode, "results.json"), "utf8"));
  assert.equal(report.finished, true);
  assert.equal(report.cleanupErrors, undefined);
  for (const key of ["activeTab", "backgroundThrottling", "editorSizes", "settings"]) assert.equal(report.restored[key], true, `${mode}: ${key}`);
  if (mode === "success") assert.equal(failure, undefined);
  else {
    assert.match(failure?.message ?? "", mode === "failure" ? /Intentional recovery-check failure/ : /Integration timed out/);
    assert.equal(report.checks.length, 0, "An aborted suite continued executing");
  }
  console.log(`PASS native recovery: ${mode}`);
}
