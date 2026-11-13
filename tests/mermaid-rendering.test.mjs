import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { build } from "esbuild";

const state = { calls: [], fragment: {}, svg: "", error: undefined, supported: true };
const originals = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
globalThis.__patchesMermaidRenderingTest = state;
globalThis.document = { body: { classList: { contains: () => false } } };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "Test font" });
after(() => {
  delete globalThis.__patchesMermaidRenderingTest;
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

const result = await build({
  entryPoints: ["src/features/patch-mermaid.ts"], bundle: true, write: false,
  format: "esm", platform: "node",
  plugins: [{
    name: "mermaid-rendering-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /^(obsidian|dompurify|gzip:.*|\.\/mermaid-runtime)$/ }, ({ path }) => ({ path, namespace: "rendering-test" }));
      builder.onLoad({ filter: /.*/, namespace: "rendering-test" }, ({ path }) => {
        const prefix = "const state = globalThis.__patchesMermaidRenderingTest;";
        if (path.startsWith("gzip:")) return { contents: 'export default "";' };
        if (path === "obsidian") return { contents: "export class MarkdownRenderChild { register() {} }" };
        if (path === "dompurify") return { contents: `${prefix}
          export default function createDOMPurify() { return {
            isSupported: state.supported,
            sanitize(svg) { state.calls.push(["sanitize", svg]); return state.fragment; }
          } }` };
        return { contents: `${prefix}
          export async function loadMermaidRuntime() {
            return { mermaid: {
              registerIconPacks() {}, initialize() {},
              async render() {
                if (state.error) throw state.error;
                return { svg: state.svg, bindFunctions(container) {
                  state.calls.push(["bind", container.children]);
                } };
              }
            } };
          }` };
      });
    },
  }],
});
const { registerPatchMermaid } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);

beforeEach(() => {
  state.calls.length = 0;
  state.fragment = { sanitizedFragment: true, querySelectorAll: () => [] };
  state.svg = '<svg onload="unsafe()"><script>unsafe()</script><text>Diagram</text></svg>';
  state.error = undefined;
  state.supported = true;
});

async function render(securityLevel) {
  let processor;
  const container = {
    children: [], isConnected: true,
    ownerDocument: { defaultView: {}, importNode: node => node },
    classList: { add() {}, remove() {} },
    set innerHTML(value) { state.calls.push(["raw-html", value]); },
    replaceChildren(...children) { this.children = children; state.calls.push(["replace", [...children]]); },
    createEl(tag, options) { this.children.push({ tag, text: options?.text }); },
  };
  const plugin = {
    app: { workspace: { on() {} } },
    registerEvent() {},
    registerMarkdownCodeBlockProcessor(_language, callback) { processor = callback; },
  };
  registerPatchMermaid(plugin, {
    securityLevel, version: "bundled", cachedLatest: undefined, onLatestResolved() {},
  });
  await processor("test diagram", { createDiv: () => container }, { addChild() {} });
  return container;
}

test("both security modes insert only the sanitizer result before binding diagram interactions", async () => {
  // This exercises the renderer's trust boundary, not the implementation of
  // DOMPurify; hostile SVG handling also requires a real-DOM check.
  for (const mode of ["strict", "loose"]) {
    state.calls.length = 0;
    const container = await render(mode);
    assert.deepEqual(state.calls, [
      ["sanitize", state.svg], ["replace", [state.fragment]], ["bind", [state.fragment]],
    ]);
    assert.deepEqual(container.children, [state.fragment]);
  }
});

test("render failures use the target container's DOM helpers and plain error text", async () => {
  state.error = new Error('<img src="x" onerror="unsafe()">');
  const container = await render("strict");
  assert.deepEqual(container.children, [
    { tag: "strong", text: "Mermaid rendering failed" },
    { tag: "pre", text: state.error.message },
  ]);
  assert.deepEqual(state.calls, [["replace", []]]);
});

test("an unavailable sanitizer fails closed instead of displaying raw SVG", async () => {
  state.supported = false;
  const container = await render("loose");
  assert.deepEqual(container.children, [
    { tag: "strong", text: "Mermaid rendering failed" },
    { tag: "pre", text: "SVG sanitization is unavailable" },
  ]);
  assert.deepEqual(state.calls, [["replace", []]]);
});
