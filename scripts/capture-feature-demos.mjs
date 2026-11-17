import { runIntegration } from "./lib/integration-runner.mjs";

// Captures real Obsidian UI; uses the same isolation and restoration as native tests.
await runIntegration({ name: "feature-demos", folder: "Patch Demo Captures",
  script: new URL("./feature-demos.js", import.meta.url), timeoutMs: 180000 });
