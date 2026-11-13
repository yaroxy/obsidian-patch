import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "icons", folder: "Patch Icons Tests",
  script: new URL("./icons-integration.js", import.meta.url), timeoutMs: 120000 });
