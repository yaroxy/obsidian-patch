import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const output = await build({
  entryPoints: ["src/features/pdf-export.ts"], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "pdf-host", setup(builder) {
    builder.onResolve({ filter: /^(obsidian|\.\/pdf-export\/navigation)$/ }, ({ path }) => ({ path, namespace: "pdf-host" }));
    builder.onLoad({ filter: /.*/, namespace: "pdf-host" }, ({ path }) => ({ contents: path === "obsidian" ? `
      export class Modal { open() { this.opened = true; } }
      export class MarkdownView { printToPdf() { this.export(); } }
      export const Platform = { isDesktopApp: true };
      globalThis.__pdfAdapterHost = { Modal, MarkdownView };
    ` : "export function addPdfHeadingLinks(root, app, file) { root.linkFile = file; }" }));
  } }],
});
const { registerPdfExport } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
const { Modal, MarkdownView } = globalThis.__pdfAdapterHost;
delete globalThis.__pdfAdapterHost;

function fixture(t) {
  const open = Object.getOwnPropertyDescriptor(Modal.prototype, "open");
  const native = MarkdownView.prototype.printToPdf;
  const callbacks = [];
  const settings = { outline: true, headingLinks: true };
  const view = new MarkdownView();
  view.file = { path: "Navigation.md" };
  let modal;
  view.export = () => {
    modal = new Modal(); modal.file = view.file;
    modal.print = async function () { assert.equal(this, modal); return {}; };
    modal.printToPdfDesktop = async function (options) { assert.equal(this, modal); this.options = options; };
    modal.open();
  };
  registerPdfExport({ app: {}, register: callback => callbacks.push(callback) }, () => settings);
  t.after(() => { callbacks.forEach(callback => callback()); Object.defineProperty(Modal.prototype, "open", open); MarkdownView.prototype.printToPdf = native; });
  return { view, settings, open, native, modal: () => modal, dispose: () => callbacks.forEach(callback => callback()) };
}

test("PDF adapter binds instance methods and restores the exact shared open descriptor", async t => {
  const f = fixture(t);
  f.view.printToPdf();
  const modal = f.modal();
  assert.equal(modal.opened, true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Modal.prototype, "open"), f.open);
  const print = modal.print, desktop = modal.printToPdfDesktop;
  assert.equal((await print()).linkFile, f.view.file);
  await desktop({ landscape: true });
  assert.deepEqual(modal.options, { landscape: true, generateDocumentOutline: true, generateTaggedPDF: true });
  f.dispose();
  assert.equal(MarkdownView.prototype.printToPdf, f.native);
  assert.deepEqual(await print(), {});
  await desktop({ landscape: false });
  assert.deepEqual(modal.options, { landscape: false });
});

test("PDF adapter restores the shared open descriptor even when native export throws", t => {
  const f = fixture(t);
  f.view.export = () => { throw new Error("native failure"); };
  assert.throws(() => f.view.printToPdf(), /native failure/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Modal.prototype, "open"), f.open);
});

test("PDF adapter leaves a non-writable host open method on the native path", t => {
  const f = fixture(t);
  Object.defineProperty(Modal.prototype, "open", { ...f.open, writable: false });
  f.view.printToPdf();
  assert.equal(f.modal().opened, true);
  assert.equal(Object.getOwnPropertyDescriptor(Modal.prototype, "open").writable, false);
});
