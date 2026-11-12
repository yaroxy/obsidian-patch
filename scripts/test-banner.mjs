import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runIntegration } from "./lib/integration-runner.mjs";

const args = process.argv.slice(2).filter(arg => arg !== "--skip-playback");
await runIntegration({ name: "banner", folder: "Patch Banner Tests", vault: args[0], output: args[1] ?? null,
  script: new URL("./banner-integration.js", import.meta.url),
  options: { skipPlayback: process.argv.includes("--skip-playback") },
  prepare({ vault }) {
    const media = join(vault, "Patch Banner Tests/media");
    mkdirSync(media, { recursive: true });
    for (const [name, args] of [
      ["test-image.png", ["-frames:v", "1", "-threads", "1"]],
      ["test-portrait.png", ["-frames:v", "1", "-threads", "1"]],
      ["test-clip.mp4", ["-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p"]],
      ["test-clip.webm", ["-t", "2", "-c:v", "libvpx", "-b:v", "200k"]],
      ["test-animation.gif", ["-t", "2", "-vf", "fps=6"]],
    ]) {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i",
        `testsrc2=size=${name.includes("portrait") ? "160x320" : "320x160"}:rate=12`,
        "-an", ...args, join(media, name)], { timeout: 20000 });
    }
    execFileSync("gif2webp", ["-quiet", join(media, "test-animation.gif"), "-o", join(media, "test-animation.webp")], { timeout: 20000 });
  },
});
