// PROTOTYPE: rerun view mapping without re-exporting PDFs.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2] ?? "/private/tmp/obsidian-patch-pdf-prototype");
const analysis = JSON.parse(readFileSync(join(output, "pdf-analysis.json"), "utf8"));
if (!analysis.every(r => r.paginationAndLinesPreserved)) throw new Error("Token instrumentation changed pagination or line layout; mapping results would be invalid.");
const cli = process.env.OBSIDIAN_CLI ?? "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli";
const runId = `${Date.now()}-${process.pid}`;
const code = `void (${readFileSync(join(here, "map-views.js"), "utf8")})(app,${JSON.stringify({ output, runId })})`;
execFileSync(cli, ["vault=dev-vault", "eval", `code=${code}`], { encoding: "utf8", timeout: 30000 });
const target = join(output, "view-mapping.json");
for (let i = 0; i < 300; i++) {
  if (existsSync(target)) {
    const report = JSON.parse(readFileSync(target, "utf8"));
    if (report.runId === runId && report.finished) {
      if (report.error) throw new Error(report.error);
      const counts = {};
      for (const r of report.results) { const key = `${r.mode}: ${r.status}`; counts[key] = (counts[key] ?? 0) + 1; }
      console.log(JSON.stringify(counts, null, 2));
      process.exit(0);
    }
  }
  await delay(500);
}
throw new Error("Timed out while mapping PDF boundaries into Obsidian views.");
