import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

if (!process.argv[2]) throw new Error("Usage: node scripts/test-math-format.mjs /path/to/test-vault");
const base = resolve(process.argv[2]);
const vault = basename(base);
mkdirSync(join(base, "Patch Math Tests"), { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  copyFileSync(new URL(`../${file}`, import.meta.url), join(base, ".obsidian/plugins/obsidian-patch", file));
}
function cli(command, ...args) {
  return execFileSync("obsidian", [`vault=${vault}`, command, ...args], { encoding: "utf8", timeout: 20000 }).trim();
}
console.log(cli("plugin:reload", "id=obsidian-patch"));
const runId = `${Date.now()}-${process.pid}`;
const source = readFileSync(new URL("./math-format-integration.js", import.meta.url), "utf8");
// One evaluation runs every check and reports through the vault.
cli("eval", `code=void ${source}(app,${JSON.stringify(runId)})`);
const results = join(base, "Patch Math Tests", "results.json");
const deadline = Date.now() + 90000;
while (Date.now() < deadline) {
  if (existsSync(results)) {
    const report = JSON.parse(readFileSync(results, "utf8"));
    if (report.runId === runId) {
      for (const check of report.checks) console.log(`PASS ${check}`);
      if (report.error) throw new Error(report.error);
      console.log("PASS math format integration");
      process.exit(0);
    }
  }
  await delay(100);
}
throw new Error("Timed out waiting for Obsidian integration results.");
