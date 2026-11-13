import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { build } from "esbuild";

const state = {
  calls: [],
  bundled: { registerLayoutLoaders(layouts) { state.calls.push(["layouts", layouts]); } },
};
globalThis.__patchesMermaidRuntimeTest = state;
after(() => {
  delete globalThis.__patchesMermaidRuntimeTest;
});

async function load(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "node",
    define: { __BUNDLED_MERMAID_VERSION__: '"12.3.0"' },
    plugins: [{
      name: "runtime-dependencies",
      setup(builder) {
        builder.onResolve({ filter: /^(mermaid|@mermaid-js\/layout-elk|obsidian)$/ }, ({ path }) => ({ path, namespace: "runtime-test" }));
        builder.onLoad({ filter: /.*/, namespace: "runtime-test" }, ({ path }) => {
          const prefix = "const state = globalThis.__patchesMermaidRuntimeTest;";
          if (path === "mermaid") return { contents: `${prefix} export default state.bundled;` };
          if (path === "@mermaid-js/layout-elk") return { contents: 'export default ["elk"];' };
          throw new Error(`Community runtime must not load a network dependency: ${path}`);
        });
      },
    }],
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
  return { module, inputs: Object.keys(result.metafile.inputs) };
}

const community = await load("src/features/mermaid-runtime.ts");

beforeEach(() => {
  state.calls.length = 0;
});

test("directory runtime has no full adapter, remote loader or Obsidian network dependency", () => {
  assert.equal(community.module.REMOTE_MERMAID_ENABLED, false);
  assert.equal(community.inputs.some((input) => /mermaid-runtime\/(full|remote)\.ts|runtime-test:obsidian/.test(input)), false);
});

test("directory settings discard remote choices and cached versions", () => {
  for (const mermaidVersion of [undefined, "bundled", "latest", "12.1.0", "11.0.0", "invalid"]) {
    assert.deepEqual(community.module.parseMermaidSettings({ mermaidVersion, mermaidCachedLatest: "12.3.0" }), { mermaidVersion: "bundled" });
  }
  assert.equal(community.module.isMermaidVersionChoice("latest"), false);
  assert.equal(community.module.isMermaidVersionChoice("12.1.0"), false);
  assert.equal(community.module.isMermaidVersionChoice("bundled"), true);
});

test("directory runtime uses bundled Mermaid and ELK even when called with a remote choice", async () => {
  for (const choice of ["bundled", "latest", "12.1.0"]) {
    const runtime = await community.module.loadMermaidRuntime(choice, "12.0.0", () => assert.fail("directory build resolved a remote version"));
    assert.equal(runtime.origin, "bundled");
    assert.equal(runtime.version, "12.3.0");
    assert.equal(runtime.mermaid, state.bundled);
  }
  assert.deepEqual(state.calls, Array.from({ length: 3 }, () => ["layouts", ["elk"]]));
});
