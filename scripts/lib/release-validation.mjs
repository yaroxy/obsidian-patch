import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const RELEASE_FILES = ["main.js", "manifest.json", "styles.css"];
export const BUILD_TARGETS = ["community"];
const REMOTE_MERMAID_ENDPOINT = /data\.jsdelivr\.com\/v1\/packages\/npm\/mermaid|\/dist\/(?:mermaid\.esm|mermaid-layout-elk\.esm)\.min\.mjs/;
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
export const fileHash = path => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Directory review inspects source files even when esbuild does not include them. */
export function validateCommunitySource(root) {
  for (const file of ["src/features/mermaid-runtime/full.ts", "src/features/mermaid-runtime/remote.ts"]) {
    if (existsSync(join(root, file))) throw new Error(`Community tree contains Full-only source: ${file}`);
  }
  const pkg = readJson(join(root, "package.json"));
  if (["dev:full", "build:full"].some(command => Object.hasOwn(pkg.scripts ?? {}, command))) {
    throw new Error("Full build commands belong on the Full branch, not in the Community source tree");
  }
  const inspect = dir => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name) && REMOTE_MERMAID_ENDPOINT.test(readFileSync(file, "utf8"))) {
        throw new Error(`Community source contains a remote Mermaid endpoint: ${relative(root, file)}`);
      }
    }
  };
  inspect(join(root, "src"));
}

export function validateReleaseMetadata(root) {
  const manifest = readJson(join(root, "manifest.json"));
  const pkg = readJson(join(root, "package.json"));
  const lock = readJson(join(root, "package-lock.json"));
  const versions = readJson(join(root, "versions.json"));
  if (/\bobsidian\b/i.test(manifest.description ?? "")) {
    throw new Error("manifest.description must not include Obsidian");
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("manifest.version must be x.y.z");
  for (const [name, version] of [["package.json", pkg.version], ["package-lock.json", lock.version], ["lock root package", lock.packages?.[""]?.version]]) {
    if (version !== manifest.version) throw new Error(`${name} version ${version} does not match manifest ${manifest.version}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) throw new Error("manifest.minAppVersion must be x.y.z");
  if (versions[manifest.version] !== manifest.minAppVersion) {
    throw new Error(`versions.json must map ${manifest.version} to ${manifest.minAppVersion}`);
  }
  validateCommunitySource(root);
  return manifest;
}

export function validateMermaidInputs(metafile, target) {
  if (!BUILD_TARGETS.includes(target)) throw new Error(`Unknown build target: ${target}`);
  const inputs = Object.keys(metafile.inputs).map(path => path.replaceAll("\\", "/"));
  const remote = inputs.some(path => /src\/features\/mermaid-runtime\/(?:full|remote)\.ts$/.test(path));
  if (remote) throw new Error("Community build includes the remote Mermaid loader");
}

export function sourceHashes(root, metafile) {
  const paths = new Set(["manifest.json", "styles.css", "package.json", "package-lock.json", "versions.json", "esbuild.config.mjs", "scripts/lib/build-compression.mjs", "scripts/lib/release-validation.mjs"]);
  for (const input of Object.keys(metafile.inputs)) {
    const path = relative(root, resolve(root, input)).replaceAll("\\", "/");
    if (!path.startsWith("../") && !isAbsolute(path) && !path.startsWith("node_modules/") && existsSync(join(root, path))) paths.add(path);
  }
  return Object.fromEntries([...paths].sort().map(path => [path, fileHash(join(root, path))]));
}

export function validateReleaseBuild(root, target = "community", tag) {
  const manifest = validateReleaseMetadata(root);
  if (!BUILD_TARGETS.includes(target)) throw new Error(`Unknown build target: ${target}`);
  const dir = join(root, "dist", target);
  const info = readJson(join(dir, "build-info.json"));
  const metafile = readJson(join(dir, "metafile.json"));
  if (info.target !== target || info.version !== manifest.version) throw new Error("Build target or version is stale; rebuild first");
  if (info.production !== true) throw new Error("Release files must come from a production build");
  validateMermaidInputs(metafile, target);
  for (const file of RELEASE_FILES) {
    if (!info.files?.[file] || info.files[file] !== fileHash(join(dir, file))) throw new Error(`Build file changed: ${file}`);
  }
  if (fileHash(join(dir, "manifest.json")) !== fileHash(join(root, "manifest.json"))) throw new Error("Built manifest differs from the source manifest");
  if (fileHash(join(dir, "styles.css")) !== fileHash(join(root, "styles.css"))) throw new Error("Built styles differ from the source styles");
  if (JSON.stringify(info.sources) !== JSON.stringify(sourceHashes(root, metafile))) throw new Error("Build sources changed; rebuild before releasing");
  const code = readFileSync(join(dir, "main.js"), "utf8");
  if (REMOTE_MERMAID_ENDPOINT.test(code)) {
    throw new Error("Community bundle contains remote Mermaid endpoints");
  }
  if (tag !== undefined) {
    if (tag !== manifest.version) throw new Error(`Tag ${tag} must match manifest ${manifest.version} without a v prefix`);
    const heading = `## [${tag}] - `;
    if (!readFileSync(join(root, "CHANGELOG.md"), "utf8").split("\n").some(line => line.startsWith(heading))) {
      throw new Error(`Finalize the ${tag} changelog entry before tagging a release`);
    }
  }
  return { dir, manifest, target };
}
