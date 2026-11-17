import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2] && resolve(process.argv[2]);
if (!source) throw new Error("Supply the output directory from capture-feature-demos.mjs");
const report = JSON.parse(readFileSync(join(source, "results.json"), "utf8"));
if (!report.finished || report.error || !report.restored?.settings || !Object.values(report.demos.restored).every(Boolean)) {
  throw new Error("Use a completed capture with restored state");
}
const destination = fileURLToPath(new URL("../docs/images/", import.meta.url));
mkdirSync(destination, { recursive: true });
const sequences = {
  "icons-colors": [["icons-brand", 2], ["icons-preset", 2], ["icons-custom", 2.5]],
  "line-width-settings": [["width-900", 1.5], ["width-entering", 1.5], ["width-1137", 3]],
  "callout-code-blocks": [["callout-light-off", 2], ["callout-light-on", 3], ["callout-dark-off", 2], ["callout-dark-on", 3]],
};
const temporary = mkdtempSync(join(tmpdir(), "patches-demo-encode-"));
try {
  for (const [name, frames] of Object.entries(sequences)) {
    const lines = [];
    for (const [frame, duration] of [...frames, [frames.at(-1)[0], 0]]) {
      const file = join(source, `${frame}.png`);
      if (!existsSync(file)) throw new Error(`Missing captured frame: ${file}`);
      lines.push(`file '${file.replaceAll("'", "'\\''")}'`);
      if (duration) lines.push(`duration ${duration}`);
    }
    const list = join(temporary, `${name}.txt`);
    writeFileSync(list, lines.join("\n") + "\n");
    const output = join(destination, `${name}.gif`);
    // Preserve the real interface; only scale and palette-encode the captured states.
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list,
      "-filter_complex", "[0:v]scale=1000:-1:flags=lanczos,fps=10,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
      "-t", String(frames.reduce((total, [, duration]) => total + duration, 0)), "-loop", "0", output], { stdio: "inherit" });
    console.log(output);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
