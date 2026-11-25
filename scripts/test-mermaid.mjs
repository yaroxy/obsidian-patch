import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { runIntegration } from "./lib/integration-runner.mjs";
import { mermaidIconPacks } from "./lib/mermaid-icon-packs.mjs";

const liveIcons = process.env.PATCHES_TEST_ICONS_REMOTE === "1";
const require = createRequire(import.meta.url);
await runIntegration({ name: "mermaid", folder: "Patch Mermaid Tests",
  script: new URL("./mermaid-integration.js", import.meta.url),
  options: { remote: process.env.PATCHES_TEST_REMOTE === "1", liveIcons }, timeoutMs: 240000,
  prepare({ output }) {
    if (liveIcons) return;
    for (const pack of mermaidIconPacks) {
      const raw = readFileSync(require.resolve(`@iconify-json/${pack.name}/icons.json`));
      writeFileSync(join(output, pack.name + ".fixture.gz"), gzipSync(raw));
    }
  },
});
