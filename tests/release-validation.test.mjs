import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileHash, sourceHashes, validateReleaseMetadata, validateReleaseBuild, validateMermaidInputs, RELEASE_FILES } from "../scripts/lib/release-validation.mjs";

function fixture(t, target = "community") {
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

test("Community source rejects Full runtime files even when the bundle does not import them", t => {
  for (const path of ["src/features/mermaid-runtime/full.ts", "src/features/mermaid-runtime/remote.ts"]) {
    const f = fixture(t);
    f.write(path, "not imported by the Community bundle");
    assert.throws(() => validateReleaseMetadata(f.root), /Full-only source/);
    assert.throws(() => validateReleaseBuild(f.root), /Full-only source/);
  }
});

test("Community source rejects a remote Mermaid loader outside the original file paths", t => {
  const f = fixture(t);
  f.write("src/experimental/loader.ts", 'const url = "https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.esm.min.mjs";');
  assert.throws(() => validateReleaseMetadata(f.root), /remote Mermaid endpoint/);
});

test("Community source rejects Full build commands", t => {
  const f = fixture(t);
  f.write("package.json", { version: "0.3.0", scripts: { "build:full": "node esbuild.config.mjs production full" } });
  assert.throws(() => validateReleaseMetadata(f.root), /Full build commands/);
});

test("lockfile root and compatibility mapping must match the manifest", t => {
  const f = fixture(t);
  f.write("package-lock.json", { version: "0.3.0", packages: { "": { version: "0.2.0" } } });
  assert.throws(() => validateReleaseMetadata(f.root), /lock root package/);
  f.write("package-lock.json", { version: "0.3.0", packages: { "": { version: "0.3.0" } } });
  f.write("versions.json", { "0.3.0": "1.13.7" });
  assert.throws(() => validateReleaseMetadata(f.root), /must map 0.3.0 to 1.15.0/);
});

test("Community release passes with matching source and artifact metadata", t => {
  const f = fixture(t);
  assert.equal(validateReleaseBuild(f.root, "community", "0.3.0").manifest.id, "patches");
});

test("stale Full build files cannot be selected for a Community release", t => {
  const f = fixture(t, "full");
  assert.throws(() => validateReleaseBuild(f.root, "full"), /Unknown build target: full/);
});

test("community dependency graph rejects remote code even without endpoint strings", () => {
  assert.throws(() => validateMermaidInputs({ inputs: { "src/features/mermaid-runtime/remote.ts": {} } }, "community"), /remote Mermaid loader/);
  assert.throws(() => validateMermaidInputs({ inputs: { "src/features/mermaid-runtime/full.ts": {} } }, "community"), /remote Mermaid loader/);
  assert.throws(() => validateMermaidInputs({ inputs: { "src/main.ts": {} } }, "full"), /Unknown build target: full/);
});

test("modified artifacts and stale source files cannot be released", t => {
  const f = fixture(t);
  f.write("dist/community/main.js", "different build");
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

test("remote Mermaid endpoints are forbidden in community bundles", t => {
  const f = fixture(t);
  f.write("dist/community/main.js", 'fetch("https://data.jsdelivr.com/v1/packages/npm/mermaid")');
  f.seal();
  assert.throws(() => validateReleaseBuild(f.root), /remote Mermaid endpoints/);
});

test("a release tag needs an exact version and a finalized changelog entry", t => {
  const f = fixture(t);
  assert.throws(() => validateReleaseBuild(f.root, "community", "v0.3.0"), /without a v prefix/);
  f.write("CHANGELOG.md", "## [Unreleased]\n");
  assert.throws(() => validateReleaseBuild(f.root, "community", "0.3.0"), /Finalize/);
  assert.doesNotThrow(() => validateReleaseBuild(f.root));
});

test("relabeling the full build is insufficient to pass community validation", t => {
  const f = fixture(t);
  const info = JSON.parse(readFileSync(join(f.root, "dist/community/build-info.json"), "utf8"));
  f.write("dist/community/build-info.json", { ...info, target: "full" });
  assert.throws(() => validateReleaseBuild(f.root), /target or version is stale/);
});

test("development output is not accepted as a release artifact", t => {
  const f = fixture(t);
  const info = JSON.parse(readFileSync(join(f.root, "dist/community/build-info.json"), "utf8"));
  f.write("dist/community/build-info.json", { ...info, production: false });
  assert.throws(() => validateReleaseBuild(f.root), /production build/);
});
