import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: 'export { CalloutEditor } from "./src/features/callout/editor"; export { MarkdownRenderer, notices } from "obsidian";',
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{
    name: "callout-editor-host",
    setup(builder) {
      builder.onResolve({ filter: /^obsidian$/ }, ({ path }) => ({ path, namespace: "callout-host" }));
      builder.onLoad({ filter: /.*/, namespace: "callout-host" }, () => ({ contents: `
        export const MarkdownRenderer = {}, Platform = {}, notices = [];
        export class Component { load() {} unload() { this.unloaded = true; } }
        export class Notice { constructor(message) { notices.push(message); } }
        export class Modal {} export class Scope {} export class DropdownComponent {} export class TextComponent {}
        export function setIcon() {} export function setTooltip() {}
      ` }));
    },
  }],
});
const { CalloutEditor, MarkdownRenderer, notices } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

function editor() {
  return Object.assign(Object.create(CalloutEditor.prototype), {
    header: { type: "note", metadata: "", fold: "", title: "A" },
    body: "", renderSeq: 0, closed: false, modalEl: {},
    options: { sourcePath: "Example.md" },
    syncHeader() {},
    close() { this.closed = true; },
  });
}

test("a slow preview cannot replace A after a user edits A to B and back to A", async () => {
  const modal = editor();
  const pending = Promise.withResolvers();
  const components = [];
  let shown;
  let debounce;
  modal.modalEl.win = {
    clearTimeout() {},
    setTimeout(callback) { debounce = callback; return 1; },
  };
  modal.previewWrap = { createDiv: () => ({ childNodes: [], remove() {} }) };
  modal.preview = { replaceChildren(text) { shown = text; } };
  MarkdownRenderer.render = async (_app, markdown, buffer, _path, component) => {
    components.push(component);
    if (markdown.endsWith(" B")) await pending.promise;
    buffer.childNodes = [markdown];
  };

  await modal.render();
  modal.header.title = "B";
  const middle = modal.render();
  modal.update({ title: "A" });
  pending.resolve();
  await middle;
  assert.equal(shown, "> [!note] A", "a stale render should be discarded even during the debounce delay");
  debounce();
  assert.equal(components.length, 2, "the existing A preview should be reused");
  assert.ok(components[1].unloaded);
  assert.ok(!components[0].unloaded);
});

test("a rejected save keeps the draft editable, suppresses duplicate writes and supports retry", async () => {
  const modal = editor();
  const pending = Promise.withResolvers();
  const drafts = [];
  modal.body = "edited\nbody";
  modal.options.save = (draft) => {
    drafts.push(draft);
    if (drafts.length === 1) return pending.promise;
  };

  const first = modal.commit();
  await modal.commit();
  assert.equal(drafts.length, 1);
  assert.equal(modal.closed, false);
  pending.reject(new Error("Write failed"));
  await first;
  assert.equal(notices.at(-1), "Write failed");
  assert.equal(modal.closed, false);
  assert.equal(modal.modalEl.inert, false);
  await modal.commit();
  assert.equal(modal.closed, true);
  assert.deepEqual(drafts[1], { header: modal.header, body: ["edited", "body"] });
});
