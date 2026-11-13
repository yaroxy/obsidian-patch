import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileHash, sourceHashes, validateReleaseMetadata, validateReleaseBuild, validateMermaidInputs, RELEASE_FILES } from "../scripts/lib/release-validation.mjs";

function fixture(t, target = "full") {
  const root = mkdtempSync(join(tmpdir(), "patches-release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => {
    const file = join(root, path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  };
  const manifest = { id: "patches", name: "Patches", version: "0.3.0", minAppVersion: "1.15.0", description: "Edit notes with visual tools and newer diagrams." };
  write("manifest.json", manifest);
  write("package.json", { version: "0.3.0" });
  write("package-lock.json", { version: "0.3.0", packages: { "": { version: "0.3.0" } } });
  write("versions.json", { "0.3.0": "1.15.0" });
  write("CHANGELOG.md", "## [Unreleased]\n\n## [0.3.0] - 2026-11-13\n");
  for (const file of ["styles.css", "esbuild.config.mjs", "scripts/lib/release-validation.mjs", "scripts/lib/build-compression.mjs", "src/main.ts"]) write(file, "original");
  const metafile = { inputs: { "src/main.ts": {} } };
  if (target === "full") {
    write("src/features/mermaid-runtime/remote.ts", "remote");
    metafile.inputs["src/features/mermaid-runtime/remote.ts"] = {};
  }
  write(`dist/${target}/main.js`, "bundle");
  write(`dist/${target}/manifest.json`, manifest);
  write(`dist/${target}/styles.css`, "original");
  write(`dist/${target}/metafile.json`, metafile);
  const seal = () => write(`dist/${target}/build-info.json`, {
    target, production: true, version: "0.3.0", sources: sourceHashes(root, metafile),
    files: Object.fromEntries(RELEASE_FILES.map(file => [file, fileHash(join(root, "dist", target, file))])),
  });
  seal();
  return { root, write, seal, manifest };
}

test("a package-only version bump is rejected before building", t => {
  const f = fixture(t);
  f.write("manifest.json", { ...f.manifest, version: "0.1.0" });
  assert.throws(() => validateReleaseMetadata(f.root), /package.json version 0.3.0 does not match manifest 0.1.0/);
});

test("directory metadata rejects a redundant product name in the description", t => {
  const f = fixture(t);
  for (const description of ["Focused enhancements for Obsidian.", "Improve OBSIDIAN notes."]) {
    f.write("manifest.json", { ...f.manifest, description });
    assert.throws(() => validateReleaseMetadata(f.root), /description must not include Obsidian/);
  }
});

test("lockfile root and compatibility mapping must match the manifest", t => {
  const f = fixture(t);
  f.write("package-lock.json", { version: "0.3.0", packages: { "": { version: "0.2.0" } } });
  assert.throws(() => validateReleaseMetadata(f.root), /lock root package/);
  f.write("package-lock.json", { version: "0.3.0", packages: { "": { version: "0.3.0" } } });
  f.write("versions.json", { "0.3.0": "1.13.7" });
  assert.throws(() => validateReleaseMetadata(f.root), /must map 0.3.0 to 1.15.0/);
});

test("Full distribution passes with matching source and artifact metadata", t => {
  const f = fixture(t);
  assert.equal(validateReleaseBuild(f.root).target, "full");
  assert.equal(validateReleaseBuild(f.root, "full", "0.3.0").manifest.id, "patches");
  assert.throws(() => validateReleaseBuild(f.root, "community"), /Unknown build target/);
});

test("Full dependency graph requires its remote loader and rejects another distribution", () => {
  assert.throws(() => validateMermaidInputs({ inputs: { "src/features/mermaid-runtime/remote.ts": {} } }, "community"), /Unknown build target/);
  assert.throws(() => validateMermaidInputs({ inputs: { "src/main.ts": {} } }, "full"), /missing/);
});

test("modified artifacts and stale source files cannot be released", t => {
  const f = fixture(t);
  f.write("dist/full/main.js", "different build");
  assert.throws(() => validateReleaseBuild(f.root), /Build file changed: main.js/);
  f.seal();
  f.write("src/main.ts", "changed after build");
  assert.throws(() => validateReleaseBuild(f.root), /Build sources changed/);
});

test("changing the build compressor invalidates previously built release files", t => {
  const f = fixture(t);
  f.write("scripts/lib/build-compression.mjs", "different compression");
  assert.throws(() => validateReleaseBuild(f.root), /Build sources changed/);
});

test("Full bundles may contain their documented remote Mermaid endpoints", t => {
  const f = fixture(t);
  f.write("dist/full/main.js", 'const endpoint = "https://data.jsdelivr.com/v1/packages/npm/mermaid";');
  f.seal();
  assert.doesNotThrow(() => validateReleaseBuild(f.root));
});

test("a release tag needs an exact version and a finalized changelog entry", t => {
  const f = fixture(t);
  assert.throws(() => validateReleaseBuild(f.root, "full", "v0.3.0"), /without a v prefix/);
  f.write("CHANGELOG.md", "## [Unreleased]\n");
  assert.throws(() => validateReleaseBuild(f.root, "full", "0.3.0"), /Finalize/);
  assert.doesNotThrow(() => validateReleaseBuild(f.root));
});

test("a Community artifact is not accepted as the Full distribution", t => {
  const f = fixture(t);
  const info = JSON.parse(readFileSync(join(f.root, "dist/full/build-info.json"), "utf8"));
  f.write("dist/full/build-info.json", { ...info, target: "community" });
  assert.throws(() => validateReleaseBuild(f.root), /target or version is stale/);
});

test("development output is not accepted as a release artifact", t => {
  const f = fixture(t);
  const info = JSON.parse(readFileSync(join(f.root, "dist/full/build-info.json"), "utf8"));
  f.write("dist/full/build-info.json", { ...info, production: false });
  assert.throws(() => validateReleaseBuild(f.root), /production build/);
});
