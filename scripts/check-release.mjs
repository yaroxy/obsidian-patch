import { fileURLToPath } from "node:url";
import { validateReleaseBuild } from "./lib/release-validation.mjs";

try {
  let target = "full", tag;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--build=")) target = arg.slice(8);
    else if (arg.startsWith("--tag=")) tag = arg.slice(6);
    else throw new Error(`Unknown option: ${arg}`);
  }
  const { dir, manifest } = validateReleaseBuild(fileURLToPath(new URL("../", import.meta.url)), target, tag);
  console.log(`PASS ${manifest.name} ${manifest.version} (${target}); release files verified in ${dir}`);
} catch (error) {
  console.error(`Release check failed: ${error.message}`);
  process.exitCode = 1;
}
