import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "mermaid", folder: "Patch Mermaid Tests",
  script: new URL("./mermaid-integration.js", import.meta.url),
  options: { remote: process.env.PATCHES_TEST_REMOTE === "1" }, timeoutMs: 240000 });
