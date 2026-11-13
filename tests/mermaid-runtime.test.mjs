import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { build } from "esbuild";

const state = {
  calls: [],
  latest: "12.3.0",
  latestError: undefined,
  importError: undefined,
  response: { version: "12.3.0" },
  bundled: { registerLayoutLoaders(layouts) { state.calls.push(["layouts", layouts]); } },
  remote: { name: "remote Mermaid" },
};
globalThis.__patchesMermaidRuntimeTest = state;
const previousWindow = globalThis.window;
globalThis.window = globalThis;
after(() => {
  delete globalThis.__patchesMermaidRuntimeTest;
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

async function load(entryPoint, mockRemote = false) {
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
        if (mockRemote) {
          builder.onResolve({ filter: /^\.\/remote$/ }, () => ({ path: "remote", namespace: "runtime-test" }));
        }
        builder.onLoad({ filter: /.*/, namespace: "runtime-test" }, ({ path }) => {
          const prefix = "const state = globalThis.__patchesMermaidRuntimeTest;";
          if (path === "mermaid") return { contents: `${prefix} export default state.bundled;` };
          if (path === "@mermaid-js/layout-elk") return { contents: 'export default ["elk"];' };
          if (path === "obsidian") return { contents: `${prefix} export async function requestUrl(url) { state.calls.push(["request", url]); return { json: state.response }; }` };
          return { contents: `${prefix}
            export async function resolveLatestVersion() {
              state.calls.push(["latest"]);
              if (state.latestError) throw state.latestError;
              return state.latest;
            }
            export async function importMermaid(version) {
              state.calls.push(["import", version]);
              if (state.importError) throw state.importError;
              return state.remote;
            }` };
        });
      },
    }],
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
  return { module, inputs: Object.keys(result.metafile.inputs) };
}

const community = await load("src/features/mermaid-runtime/community.ts");
const fullEntry = await load("src/features/mermaid-runtime.ts");
const full = (await load("src/features/mermaid-runtime.ts", true)).module;
const remote = (await load("src/features/mermaid-runtime/remote.ts")).module;

beforeEach(() => {
  state.calls.length = 0;
  state.latest = "12.3.0";
  state.latestError = undefined;
  state.importError = undefined;
  state.response = { version: "12.3.0" };
});

test("the Full branch default entry includes its remote adapter", () => {
  assert.equal(fullEntry.module.REMOTE_MERMAID_ENABLED, true);
  assert.equal(fullEntry.inputs.some(input => /mermaid-runtime\/remote\.ts$/.test(input)), true);
});

test("the isolated directory adapter has no full adapter, remote loader or Obsidian network dependency", () => {
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

test("full settings preserve supported choices but reject malformed or unsupported versions", () => {
  assert.equal(full.REMOTE_MERMAID_ENABLED, true);
  for (const mermaidVersion of ["bundled", "latest", "11.0.0", "12.3.0"]) {
    assert.deepEqual(full.parseMermaidSettings({ mermaidVersion, mermaidCachedLatest: "12.1.0" }), { mermaidVersion, mermaidCachedLatest: "12.1.0" });
  }
  for (const value of [undefined, null, "10.9.0", "v12.3.0", "12.3", "12.3.0/extra", "12.3.0-beta.1"]) {
    assert.deepEqual(full.parseMermaidSettings({ mermaidVersion: value, mermaidCachedLatest: value }), { mermaidVersion: "bundled", mermaidCachedLatest: undefined });
  }
});

test("full bundled mode stays offline", async () => {
  assert.equal((await full.loadMermaidRuntime("bundled", undefined, () => assert.fail())).origin, "bundled");
  assert.deepEqual(state.calls, [["layouts", ["elk"]]]);
});

test("full latest mode resolves, remembers and loads the selected release", async () => {
  const resolved = [];
  const runtime = await full.loadMermaidRuntime("latest", undefined, (version) => resolved.push(version));
  assert.deepEqual(resolved, ["12.3.0"]);
  assert.deepEqual(state.calls, [["latest"], ["import", "12.3.0"]]);
  assert.equal(runtime.mermaid, state.remote);
  assert.equal(runtime.origin, "cdn");
  assert.equal(runtime.version, "12.3.0");
});

test("full custom mode loads the requested release without looking up latest", async () => {
  const runtime = await full.loadMermaidRuntime("11.16.0", undefined, () => assert.fail("custom version resolved latest"));
  assert.equal(runtime.version, "11.16.0");
  assert.deepEqual(state.calls, [["import", "11.16.0"]]);
});

test("full latest mode uses the last resolved version when the lookup fails", async () => {
  state.latestError = new Error("lookup unavailable");
  const runtime = await full.loadMermaidRuntime("latest", "12.1.0", () => {});
  assert.equal(runtime.version, "12.1.0");
  assert.deepEqual(state.calls, [["latest"], ["import", "12.1.0"]]);
});

test("full remote failure falls back to bundled Mermaid with the reason", async (t) => {
  t.mock.method(console, "warn", () => {});
  state.importError = new Error("download unavailable");
  const runtime = await full.loadMermaidRuntime("12.1.0", undefined, () => {});
  assert.equal(runtime.origin, "bundled");
  assert.equal(runtime.mermaid, state.bundled);
  assert.equal(runtime.fallbackReason, "download unavailable");
  assert.deepEqual(state.calls, [["import", "12.1.0"], ["layouts", ["elk"]]]);
});

test("full latest mode rejects an invalid cache when offline", async (t) => {
  t.mock.method(console, "warn", () => {});
  state.latestError = new Error("lookup unavailable");
  const runtime = await full.loadMermaidRuntime("latest", "../../other-code", () => assert.fail());
  assert.equal(runtime.origin, "bundled");
  assert.deepEqual(state.calls, [["latest"], ["layouts", ["elk"]]]);
});

test("remote version lookup validates the server response before importing code", async () => {
  assert.equal(await remote.resolveLatestVersion(), "12.3.0");
  for (const version of ["latest", "10.0.0", "12.3.0/other.mjs", null]) {
    state.response = { version };
    await assert.rejects(remote.resolveLatestVersion(), /supported Mermaid version/);
  }
  await assert.rejects(remote.importMermaid("../../other-code"), /Unsupported Mermaid version/);
  assert.equal(state.calls.every(([kind]) => kind === "request"), true);
});
