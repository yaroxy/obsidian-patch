import { readFileSync } from "node:fs";
import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "table-conversion", folder: "Patch Table Conversion Tests",
  script: new URL("./table-conversion-integration.js", import.meta.url),
  options: { fixture: readFileSync(new URL("../tests/fixtures/markdown-tables.md", import.meta.url), "utf8") },
});
