import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "callout", folder: "Patch Callout Tests",
  script: new URL("./callout-integration.js", import.meta.url) });
