import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "math-format", folder: "Patch Math Tests",
  script: new URL("./math-format-integration.js", import.meta.url) });
