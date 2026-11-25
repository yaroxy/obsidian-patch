import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { after } from "node:test";
import { build } from "esbuild";

const previousWindow = globalThis.window;
globalThis.window = globalThis;
after(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  delete globalThis.mermaidIconRequest;
});
const bundle = await build({
  entryPoints: ["src/features/mermaid-icon-packs.ts"], bundle: true, write: false, format: "esm",
  plugins: [{ name: "obsidian", setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents:
      "export const normalizePath = path => path; export const requestUrl = options => globalThis.mermaidIconRequest(options.url);" }));
  } }],
});
const { MermaidIconPack } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));

const icons = { prefix: "logos", icons: { example: { body: "<path/>" } } };
const raw = new TextEncoder().encode(JSON.stringify(icons));
const source = { name: "logos", label: "Logos", version: "1.2.3", sha256: createHash("sha256").update(raw).digest("hex") };
const path = ".config/plugins/patches/mermaid-logos-1.2.3.json.gz";
function fixture() {
  const files = new Map();
  const adapter = {
    exists: async name => files.has(name),
    readBinary: async name => {
      if (!files.has(name)) throw Error("Missing cache");
      return files.get(name);
    },
    writeBinary: async (name, bytes) => { files.set(name, bytes); },
    remove: async name => { files.delete(name); },
    rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
  };
  const open = () => new MermaidIconPack(source, adapter, ".config/plugins/patches");
  return { files, adapter, open };
}

test("a missing diagram cache stays offline; one explicit installation survives a reload", async () => {
  const { open, files } = fixture(), pack = open(), urls = [];
  globalThis.mermaidIconRequest = async url => { urls.push(url); return { status: 200, arrayBuffer: raw.buffer }; };
  await assert.rejects(pack.load(), /Missing cache/);
  assert.deepEqual(urls, []);
  const [first, second] = await Promise.all([pack.install(), pack.install()]);
  assert.deepEqual(first, icons);
  assert.deepEqual(second, icons);
  assert.deepEqual([...files.keys()], [path]);
  globalThis.mermaidIconRequest = () => assert.fail("An installed pack must work offline");
  assert.deepEqual(await open().load(), icons);
  assert.deepEqual(await open().install(), icons);
  assert.deepEqual(urls, ["https://cdn.jsdelivr.net/npm/@iconify-json/logos@1.2.3/icons.json"]);
});

test("repair verifies the network bytes before replacing a bad cache and cleans up partial writes", async () => {
  const { open, files, adapter } = fixture(), pack = open();
  const damaged = new ArrayBuffer(2);
  files.set(path, damaged);
  globalThis.mermaidIconRequest = async () => ({ status: 200, arrayBuffer: damaged });
  await assert.rejects(pack.install(), /Unexpected data/);
  assert.deepEqual([...files], [[path, damaged]]);
  globalThis.mermaidIconRequest = async () => ({ status: 200, arrayBuffer: raw.buffer });
  const write = adapter.writeBinary;
  adapter.writeBinary = async (name, bytes) => { await write(name, bytes); throw Error("Disk full"); };
  await assert.rejects(pack.install(), /Disk full/);
  assert.deepEqual([...files], [[path, damaged]]);
  adapter.writeBinary = write;
  assert.deepEqual(await pack.install(), icons);
  assert.deepEqual(await open().load(), icons);
  assert.deepEqual([...files.keys()], [path]);
});

test("a concurrent installation can supply the verified cache before rename", async () => {
  const { open, files, adapter } = fixture();
  globalThis.mermaidIconRequest = async () => ({ status: 200, arrayBuffer: raw.buffer });
  adapter.rename = async (from, to) => {
    files.set(to, files.get(from));
    throw Error("Destination already exists");
  };
  assert.deepEqual(await open().install(), icons);
  assert.deepEqual([...files.keys()], [path]);
});
