import { fileURLToPath } from "node:url";
import { runIntegration } from "./lib/integration-runner.mjs";

await runIntegration({ name: "home-demo", folder: "Patch Home Demo",
  script: new URL("./home-demo.js", import.meta.url),
  options: { cover: fileURLToPath(new URL("../docs/images/kyoto-cover.jpg", import.meta.url)) } });
