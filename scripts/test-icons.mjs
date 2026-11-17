import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "icons", folder: "Patch Icons Tests",
  script: new URL("./icons-integration.js", import.meta.url), options: { remote: process.env.PATCHES_TEST_ICONS_REMOTE === "1" }, timeoutMs: 120000 });
