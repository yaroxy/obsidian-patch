import assert from "node:assert/strict";
import { after, test } from "node:test";
import { build } from "esbuild";

const previousDocument = globalThis.document;
after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
const bundled = await build({
  entryPoints: ["src/features/icons.ts"], bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "icons-rendering-host", setup(builder) {
    builder.onResolve({ filter: /^(obsidian|\.\/icons\/(picker|simple-icons))$/ }, ({ path }) => ({ path, namespace: "icons-host" }));
    builder.onLoad({ filter: /.*/, namespace: "icons-host" }, ({ path }) => ({ contents: path === "obsidian" ? `
      export const getIcon = name => ({outerHTML:'<svg data-icon="'+name+'"><path d="M0 0h24v24H0z"/></svg>'});
      export const getIconIds = () => ['lucide-book-open'];
      export const normalizePath = path => path;
      export class Notice {}
    ` : path.endsWith("picker") ? "export class IconPicker {}"
      : 'export function loadSimpleIcons() { throw new Error("Unexpected network request"); }' }));
  } }],
});
const { registerIcons } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
const CLASS = "obsidian-patch-icons-has-icon", PROPERTY = "--obsidian-patch-icon";
const CACHED_SVG = '<svg viewBox="0 0 24 24"><script>neverInline()</script><path d="M0 0h24v24H0z"/></svg>';
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

// A small DOM contract, including asynchronous observer delivery. Native CSS
// painting and Obsidian's actual explorer lifecycle remain integration checks.
class Element {
  constructor(document, tag = "div", classes = [], attributes = {}) {
    this.ownerDocument = document; this.nodeType = 1; this.tagName = tag.toUpperCase();
    this.parentElement = null; this.children = []; this.attributes = new Map(Object.entries(attributes));
    this.classes = new Set(classes); this.properties = new Map();
    this.classList = {
      contains: value => this.classes.has(value),
      add: value => { if (!this.classes.has(value)) { this.classes.add(value); this.changed("class"); } },
      remove: value => { if (this.classes.delete(value)) this.changed("class"); },
    };
    this.style = {
      getPropertyValue: key => this.properties.get(key) ?? "",
      setProperty: (key, value) => { if (this.properties.get(key) !== value) { this.properties.set(key, value); this.changed("style"); } },
      removeProperty: key => { if (this.properties.delete(key)) this.changed("style"); },
    };
  }
  changed(attributeName) { this.ownerDocument.notify({ type: "attributes", target: this, attributeName }); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { if (this.getAttribute(name) !== value) { this.attributes.set(name, value); this.changed(name); } }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector) {
    return selector.split(",").some(part => {
      const classes = [...part.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
      const attributes = [...part.matchAll(/\[([\w-]+)\]/g)].map(match => match[1]);
      return classes.every(name => this.classes.has(name)) && attributes.every(name => this.attributes.has(name));
    });
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  append(...children) {
    for (const child of children) {
      child.remove(); child.parentElement = this; this.children.push(child);
      this.ownerDocument.notify({ type: "childList", target: this, addedNodes: [child], removedNodes: [] });
    }
  }
  remove() {
    const parent = this.parentElement;
    if (!parent) return;
    parent.children.splice(parent.children.indexOf(this), 1); this.parentElement = null;
    this.ownerDocument.notify({ type: "childList", target: parent, addedNodes: [], removedNodes: [this] });
  }
  createEl(tag) { this.ownerDocument.created.push(tag); throw new Error(`Icon rendering must not create <${tag}>`); }
  set innerHTML(_html) { throw new Error("Icon rendering must not insert HTML"); }
}

function document() {
  const doc = { observers: new Set(), created: [] };
  doc.notify = record => {
    for (const observer of doc.observers) {
      if (!observer.root?.contains(record.target)) continue;
      if (record.type === "attributes" && (!observer.options.attributes || !observer.options.attributeFilter.includes(record.attributeName))) continue;
      if (record.type === "childList" && !observer.options.childList) continue;
      observer.records.push(record);
      if (observer.queued) continue;
      observer.queued = true;
      queueMicrotask(() => {
        observer.queued = false;
        const records = observer.records.splice(0);
        if (observer.root && records.length) observer.callback(records);
      });
    }
  };
  doc.defaultView = { MutationObserver: class {
    constructor(callback) { this.callback = callback; this.records = []; }
    observe(root, options) { this.root = root; this.options = options; doc.observers.add(this); }
    disconnect() { this.root = null; this.records.length = 0; doc.observers.delete(this); }
  } };
  doc.head = new Element(doc, "head"); doc.body = new Element(doc, "body");
  return doc;
}

function emitter() {
  const callbacks = new Map();
  return {
    on(name, callback) { const set = callbacks.get(name) ?? new Set(); callbacks.set(name, set); set.add(callback); return () => set.delete(callback); },
    emit(name, ...args) { for (const callback of callbacks.get(name) ?? []) callback(...args); },
  };
}
function row(doc, path, folder = false) { return new Element(doc, "div", [folder ? "nav-folder-title" : "nav-file-title"], { "data-path": path }); }
function fixture({ documents = [document()], ready = true } = {}) {
  const leaves = documents.map(doc => { const root = new Element(doc); doc.body.append(root); return { view: { containerEl: root } }; });
  const workspace = { ...emitter(), getLeavesOfType(type) { assert.equal(type, "file-explorer"); return leaves; }, onLayoutReady(callback) { this.ready = callback; if (ready) callback(); } };
  const cleanups = [], saved = [], vault = { ...emitter(), getFiles() { throw new Error("Vault enumeration is unnecessary"); }, getMarkdownFiles() { throw new Error("Vault enumeration is unnecessary"); } };
  const plugin = { app: { workspace, vault }, registerEvent(fn) { cleanups.push(fn); }, register(fn) { cleanups.push(fn); } };
  globalThis.document = documents[0];
  return { documents, leaves, workspace, vault, saved,
    start(paths, svgs = { "simple-icons:fixture": CACHED_SVG }) { return registerIcons(plugin, { enabled: true, paths, svgs }, async settings => { saved.push(settings); }); },
    unload() { for (const cleanup of cleanups) cleanup(); },
  };
}
function painted(element, expected) {
  assert.equal(element.classList.contains(CLASS), expected);
  if (expected) assert.match(element.style.getPropertyValue(PROPERTY), /^url\("data:image\/svg\+xml,%3Csvg/);
  else assert.equal(element.style.getPropertyValue(PROPERTY), "");
}

test("explorer rows receive image masks without creating stylesheets or inline SVG", async () => {
  const f = fixture(), [doc] = f.documents, root = f.leaves[0].view.containerEl;
  const folder = row(doc, "Notes", true), unusual = row(doc, 'Notes/Say "hi"\\日本語.md'), outside = row(doc, "Notes", true);
  root.append(folder, unusual); doc.body.append(outside);
  const controller = f.start({ Notes: "lucide:book-open", [unusual.getAttribute("data-path")]: "simple-icons:fixture" });
  painted(folder, true); painted(unusual, true); painted(outside, false);
  assert.match(decodeURIComponent(folder.style.getPropertyValue(PROPERTY)), /lucide-book-open/);
  assert.match(decodeURIComponent(unusual.style.getPropertyValue(PROPERTY)), /<script>neverInline\(\)<\/script>/);
  assert.deepEqual(doc.created, []);
  assert.equal(controller.simpleIconsStatus().status, "idle");
  await controller.setEnabled(false); painted(folder, false); painted(unusual, false);
  await controller.setEnabled(true); painted(folder, true); painted(unusual, true);
  await controller.removeIcons([unusual.getAttribute("data-path")]); painted(folder, true); painted(unusual, false);
  assert.deepEqual(f.saved.at(-1).svgs, {});
  f.unload(); painted(folder, false); assert.equal(doc.observers.size, 0);
});

test("lazy folders, rebuilt rows and recycled data-path values reconcile without stale icons", async () => {
  const f = fixture(), [doc] = f.documents, root = f.leaves[0].view.containerEl;
  f.start({ "Notes/Later.md": "lucide:book-open" });
  const branch = new Element(doc), first = row(doc, "Notes/Later.md"); branch.append(first); root.append(branch);
  await flush(); painted(first, true);
  first.setAttribute("data-path", "Notes/Other.md"); await flush(); painted(first, false);
  first.setAttribute("data-path", "Notes/Later.md"); await flush(); painted(first, true);
  const replacement = row(doc, "Notes/Later.md"); branch.remove(); root.append(replacement);
  await flush(); painted(first, false); painted(replacement, true);
  replacement.remove(); await flush(); painted(replacement, false);
  // Reopening a collapsed folder reuses its existing row object safely.
  root.append(branch); await flush(); painted(first, true);
  f.unload(); painted(first, false);
});

test("folder renames retain descendant icons regardless of DOM/event ordering", async () => {
  const f = fixture(), [doc] = f.documents, root = f.leaves[0].view.containerEl;
  const folder = row(doc, "Notes", true), child = row(doc, "Notes/Child.md"), sibling = row(doc, "Notes Archive", true);
  root.append(folder, child, sibling);
  f.start({ Notes: "lucide:book-open", "Notes/Child.md": "simple-icons:fixture", "Notes Archive": "lucide:book-open" });
  folder.setAttribute("data-path", "Knowledge");
  f.vault.emit("rename", { path: "Knowledge" }, "Notes");
  child.setAttribute("data-path", "Knowledge/Child.md");
  await flush();
  for (const title of [folder, child, sibling]) painted(title, true);
  assert.deepEqual(f.saved.at(-1).paths, { "Notes Archive": "lucide:book-open", Knowledge: "lucide:book-open", "Knowledge/Child.md": "simple-icons:fixture" });
  f.unload();
});

test("existing and new windows use their own observers, then clear detached views and unload", async () => {
  const f = fixture({ documents: [document(), document()] });
  const rows = f.documents.map((doc, index) => { const title = row(doc, "Note.md"); f.leaves[index].view.containerEl.append(title); return title; });
  f.start({ "Note.md": "lucide:book-open" });
  rows.forEach(title => painted(title, true));
  f.documents.forEach(doc => assert.equal(doc.observers.size, 1));
  const extra = document(), root = new Element(extra), title = row(extra, "Note.md"); root.append(title); extra.body.append(root);
  f.leaves.push({ view: { containerEl: root } }); f.workspace.emit("window-open", {}, { document: extra });
  painted(title, true); assert.equal(extra.observers.size, 1);
  f.leaves.pop(); f.workspace.emit("window-close", {}, { document: extra });
  painted(title, false); assert.equal(extra.observers.size, 0);
  f.leaves.splice(1, 1); f.workspace.emit("layout-change");
  painted(rows[1], false); assert.equal(f.documents[1].observers.size, 0);
  const pending = row(f.documents[0], "Note.md"); f.leaves[0].view.containerEl.append(pending);
  f.unload(); await flush();
  painted(rows[0], false); painted(pending, false);
  f.documents.forEach(doc => assert.equal(doc.observers.size, 0));
});

test("a delayed layout-ready callback cannot recreate observers after unloading", () => {
  const f = fixture({ ready: false }), [doc] = f.documents, title = row(doc, "Note.md");
  f.leaves[0].view.containerEl.append(title); f.start({ "Note.md": "lucide:book-open" });
  painted(title, true); f.unload(); f.workspace.ready();
  painted(title, false); assert.equal(doc.observers.size, 0);
});

test("moving a row between explorers cannot let the old view clear its new icon", async () => {
  const f = fixture(), [doc] = f.documents, first = f.leaves[0].view.containerEl;
  const second = new Element(doc), title = row(doc, "Note.md"); doc.body.append(second); second.append(title);
  f.leaves.push({ view: { containerEl: second } });
  const controller = f.start({ "Note.md": "lucide:book-open" }); painted(title, true);
  first.append(title);
  // Reconcile settings before queued removal records are delivered. The old
  // view must not undo the new view's painting in the same update.
  const update = controller.setEnabled(true); painted(title, true);
  await update; await flush(); painted(title, true);
  f.leaves.pop(); f.workspace.emit("layout-change"); painted(title, true);
  f.unload(); painted(title, false);
});
