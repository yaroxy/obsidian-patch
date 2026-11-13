import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "mermaid", folder: "Patch Mermaid Tests",
  script: new URL("./mermaid-integration.js", import.meta.url), timeoutMs: 180000 });
