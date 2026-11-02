import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

if (!process.argv[2]) throw new Error("Usage: node scripts/test-banner.mjs /path/to/test-vault");
const base = resolve(process.argv[2]);
const vault = basename(base);
const fixtures = join(base, "Patch Banner Tests");
const media = join(fixtures, "media");
mkdirSync(media, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  copyFileSync(new URL(`../${file}`, import.meta.url), join(base, ".obsidian/plugins/obsidian-patch", file));
}
copyFileSync(join(base, "banner.png"), join(media, "test-image.png"));
for (const [name, args] of [
  ["test-portrait.png", ["-frames:v", "1", "-threads", "1"]],
  ["test-clip.mp4", ["-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p"]],
  ["test-clip.webm", ["-t", "2", "-c:v", "libvpx", "-b:v", "200k"]],
  ["test-animation.gif", ["-t", "2", "-vf", "fps=6"]],
]) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i",
    `testsrc2=size=${name.endsWith("png") ? "160x320" : "320x160"}:rate=12`, "-an", ...args, join(media, name)], { timeout: 20000 });
}
execFileSync("gif2webp", ["-quiet", join(media, "test-animation.gif"), "-o", join(media, "test-animation.webp")]);
function cli(command, ...args) {
  return execFileSync("obsidian", [`vault=${vault}`, command, ...args], { encoding: "utf8", timeout: 20000 }).trim();
}
console.log(cli("plugin:reload", "id=obsidian-patch"));
const runId = `${Date.now()}-${process.pid}`;
const source = readFileSync(new URL("./banner-integration.js", import.meta.url), "utf8");
// One evaluation runs every check inside the existing window. Results are written
// through the vault so the runner need not launch another app process to poll.
cli("eval", `code=void ${source}(app,${JSON.stringify(runId)})`);
const deadline = Date.now() + 90000;
while (Date.now() < deadline) {
  const path = join(fixtures, "results.json");
  if (existsSync(path)) {
    const report = JSON.parse(readFileSync(path, "utf8"));
    if (report.runId === runId) {
      for (const check of report.checks) console.log(`PASS ${check}`);
      if (report.error) throw new Error(report.error);
      console.log("PASS full-image banner integration");
      process.exit(0);
    }
  }
  await delay(100);
}
throw new Error("Timed out waiting for Obsidian integration results.");
