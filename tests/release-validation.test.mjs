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
  const manifest = { id: "patches", name: "Patches", version: "0.3.0", minAppVersion: "1.15.0" };
  write("manifest.json", manifest);
  write("package.json", { version: "0.3.0" });
  write("package-lock.json", { version: "0.3.0", packages: { "": { version: "0.3.0" } } });
  write("versions.json", { "0.3.0": "1.15.0" });
  write("CHANGELOG.md", "## [Unreleased]\n\n## [0.3.0] - 2026-11-13\n");
  for (const file of ["styles.css", "esbuild.config.mjs", "scripts/lib/release-validation.mjs", "src/main.ts"]) write(file, "original");
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

test("lockfile root and compatibility mapping must match the manifest", t => {
  const f = fixture(t);
  f.write("package-lock.json", { version: "0.3.0", packages: { "": { version: "0.2.0" } } });
  assert.throws(() => validateReleaseMetadata(f.root), /lock root package/);
  f.write("package-lock.json", { version: "0.3.0", packages: { "": { version: "0.3.0" } } });
  f.write("versions.json", { "0.3.0": "1.13.7" });
  assert.throws(() => validateReleaseMetadata(f.root), /must map 0.3.0 to 1.15.0/);
});

test("both distributable variants pass with matching source and artifact metadata", t => {
  for (const target of ["community", "full"]) {
    const f = fixture(t, target);
    assert.equal(validateReleaseBuild(f.root, target, "0.3.0").manifest.id, "patches");
  }
});

test("community dependency graph rejects remote code even without endpoint strings", () => {
  assert.throws(() => validateMermaidInputs({ inputs: { "src/features/mermaid-runtime/remote.ts": {} } }, "community"), /remote Mermaid loader/);
  assert.throws(() => validateMermaidInputs({ inputs: { "src/main.ts": {} } }, "full"), /missing/);
});

test("modified artifacts and stale source files cannot be released", t => {
  const f = fixture(t);
  f.write("dist/community/main.js", "different build");
  assert.throws(() => validateReleaseBuild(f.root), /Build file changed: main.js/);
  f.seal();
  f.write("src/main.ts", "changed after build");
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
