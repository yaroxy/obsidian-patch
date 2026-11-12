import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "table", folder: "Patch Table Tests",
  script: new URL("./table-integration.js", import.meta.url) });
