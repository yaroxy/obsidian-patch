import { createRequire } from "node:module";
import { fileHash } from "./release-validation.mjs";

const require = createRequire(import.meta.url);

/** Pin downloads to the exact bytes in the release's npm installation. */
export const mermaidIconPacks = [
  { name: "logos", label: "Logos" },
  { name: "material-icon-theme", label: "Material Icon Theme" },
].map(({ name, label }) => ({
  name, label,
  version: require(`@iconify-json/${name}/package.json`).version,
  sha256: fileHash(require.resolve(`@iconify-json/${name}/icons.json`)),
}));
