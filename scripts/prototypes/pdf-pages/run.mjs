// PROTOTYPE: native PDF pagination experiment, not part of the plugin bundle.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const vault = resolve(process.argv[2] ?? "/Users/roxy/Documents/obsidian-vaults/dev-vault");
const output = resolve(process.argv[3] ?? "/private/tmp/obsidian-patch-pdf-prototype");
const cli = process.env.OBSIDIAN_CLI ?? "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli";
if (basename(vault) !== "dev-vault") throw new Error("This experiment is restricted to dev-vault.");
mkdirSync(output, { recursive: true });
const folder = "Patch PDF Prototype";
mkdirSync(join(vault, folder), { recursive: true });
copyFileSync(join(here, "fixtures/claude-pages.md"), join(vault, folder, "Claude Pages.md"));
copyFileSync(join(here, "fixtures/banner.png"), join(vault, folder, "banner.png"));
const repeated = "Repeated passage: the same words appear in another paragraph. 重复段落用于验证定位不会跳到另一段。 ";
const extra = ["# Mapping edge cases", "", "[Local heading](#Repeated-heading) and [[#Repeated heading]].", "", "## Repeated heading", ""];
for (let i = 0; i < 8; i++) extra.push(repeated.repeat(7), "");
extra.push("## Repeated heading", "", "Escapes: \\*literal\\*, entity &amp;, **bold text**, `inline code`, emoji 🧪, and [label](https://example.com).", "", "## Table", "", "| Item | Value |", "| --- | --- | ");
for (let i = 0; i < 55; i++) extra.push(`| Row ${i} | Value ${i}: table content |`);
extra.push("", "## Code", "", "```python");
for (let i = 0; i < 65; i++) extra.push(`print(${i})  # repeated code on source line ${i}`);
extra.push("```", "", "## Formula", "", "$$", "\\begin{aligned}");
for (let i = 0; i < 30; i++) extra.push(`f_{${i}}(x) &= x^{${i}} + ${i} \\\\`);
extra.push("\\end{aligned}", "$$", "", "> [!note]- Collapsed callout", "> The PDF can contain content hidden in Reading view.", "> " + repeated.repeat(12), "", "## Image", "", "![[banner.png|400]]", "", "## End", "", "Last paragraph.");
writeFileSync(join(vault, folder, "Edge Cases.md"), extra.join("\n") + "\n");
const runId = `${Date.now()}-${process.pid}`;
const profiles = [
  { name: "a4", pageSize: "A4", landscape: false, scale: 1, marginsType: 0 },
  { name: "letter", pageSize: "Letter", landscape: false, scale: 1, marginsType: 0 },
  { name: "a4-landscape-80", pageSize: "A4", landscape: true, scale: 0.8, marginsType: 1, margins: { top: 0, left: 0, bottom: 0, right: 0 } },
];
const jobs = [];
for (const file of ["Claude Pages.md", "Edge Cases.md"]) {
  for (const profile of (process.env.PDF_PROBE_QUICK ? profiles.slice(0, 1) : profiles)) {
    for (const instrument of [false, true]) jobs.push({ file: `${folder}/${file}`, profile, instrument });
  }
}
const fixtureHashes = Object.fromEntries(["Claude Pages.md", "Edge Cases.md", "banner.png"].map(file => [file, createHash("sha256").update(readFileSync(join(vault, folder, file))).digest("hex")]));
const config = { runId, vault, output, fixtureHashes, jobs };
writeFileSync(join(output, "config.json"), JSON.stringify(config, null, 2));
const status = join(output, "export-status.json");
const code = `void (${readFileSync(join(here, "export.js"), "utf8")})(app,${JSON.stringify(config)})`;
console.log(execFileSync(cli, ["vault=dev-vault", "eval", `code=${code}`], { encoding: "utf8", timeout: 30000 }).trim());
const start = Date.now();
let last = "";
let finished = false;
while (Date.now() - start < 300000) {
  if (existsSync(status)) {
    const report = JSON.parse(readFileSync(status, "utf8"));
    if (report.runId === runId) {
      const progress = `${report.done}/${jobs.length} exports`;
      if (last !== progress) console.log(last = progress);
      if (report.finished) {
        if (report.error) throw new Error(report.error);
        console.log(`Saved exports and DOM/source maps to ${output}`);
        finished = true;
        break;
      }
    }
  }
  await delay(500);
}
if (!finished) throw new Error("Export experiment timed out; inspect export-status.json and the development window.");
const bundledPython = "/Users/roxy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const python = process.env.PDF_PYTHON ?? (existsSync(bundledPython) ? bundledPython : "python3");
const analysis = execFileSync(python, [join(here, "analyze.py"), output], { encoding: "utf8", timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
writeFileSync(join(output, "analysis.log"), analysis);
console.log(analysis.trim());
execFileSync(process.execPath, [join(here, "map.mjs"), output], { stdio: "inherit", timeout: 180000 });
