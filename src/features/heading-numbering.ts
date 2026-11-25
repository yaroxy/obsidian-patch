import { StateEffect } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { editorInfoField, editorLivePreviewField, getFrontMatterInfo, MarkdownRenderChild, MarkdownView, parseYaml, type Plugin } from "obsidian";
import { editorLines } from "./note-check-source";
import { columnProperty, numberedLineClass, numberColumn } from "./heading-numbering/column";
import { bodyHeadings, notePreset, numberHeadings, NUMBERING_PROPERTY, type Numbering, type NumberingSettings } from "./heading-numbering/model";

const refresh = StateEffect.define<null>();
const prefixClass = "obsidian-patch-heading-number";
const headingSelector = ":scope > :is(h1,h2,h3,h4,h5,h6)[data-heading]";

/** Index the exact snapshot displayed by this pane, including unsaved property edits. */
export function numberingForSource(source: string, settings: NumberingSettings): Numbering | undefined {
  if (!settings.enabled && !source.includes(NUMBERING_PROPERTY)) return undefined;
  const text = editorLines(source);
  const info = getFrontMatterInfo(text);
  let property: unknown;
  if (info.exists && info.frontmatter.includes(NUMBERING_PROPERTY)) {
    try { property = parseYaml(info.frontmatter)?.[NUMBERING_PROPERTY]; }
    catch { return undefined; }
  }
  const preset = notePreset(settings, property);
  if (!preset) return undefined;
  const firstLine = text.slice(0, info.contentStart).split("\n").length - 1;
  return numberHeadings(bodyHeadings(text.slice(info.contentStart), firstLine), settings, preset);
}

function prefixElement(doc: Document, prefix: string): HTMLSpanElement {
  const el = doc.createElement("span");
  el.className = prefixClass;
  el.dataset.prefix = prefix;
  el.setAttribute("aria-hidden", "true");
  return el;
}

class NumberWidget extends WidgetType {
  constructor(private readonly prefix: string) { super(); }
  override eq(other: NumberWidget): boolean { return this.prefix === other.prefix; }
  override toDOM(view: EditorView): HTMLElement { return prefixElement(view.dom.ownerDocument, this.prefix); }
}

interface ReadingDocument {
  path: string;
  sections: Set<() => void>;
  text?: string;
  numbers?: Numbering;
  column?: string;
  pending?: boolean;
}

export function registerHeadingNumbering(plugin: Plugin, initial: NumberingSettings): (next: NumberingSettings) => void {
  let settings = initial, disposed = false;
  const editors = new Set<EditorView>(), documents = new Map<string, ReadingDocument>();

  const editorNumbers = (view: EditorView): DecorationSet => {
    const { state } = view;
    if (!state.field(editorLivePreviewField, false) || !state.field(editorInfoField, false)?.file) return Decoration.none;
    if (!settings.enabled && state.doc.line(1).text.trim() !== "---") return Decoration.none;
    const index = numberingForSource(state.doc.toString(), settings);
    if (!index || index.conflict) return Decoration.none;
    const column = numberColumn(view.dom, index.headings.values());
    const lineStyle = Decoration.line({ attributes: { class: numberedLineClass, style: columnProperty + ":" + column } });
    const ranges = [];
    for (const item of index.headings.values()) {
      if (item.handwritten) continue;
      const line = state.doc.line(item.line + 1);
      ranges.push(lineStyle.range(line.from), Decoration.widget({ widget: new NumberWidget(item.prefix), side: -1 }).range(line.from));
    }
    return Decoration.set(ranges);
  };

  plugin.registerEditorExtension(ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    private timer?: number;
    constructor(private readonly view: EditorView) { editors.add(view); this.decorations = editorNumbers(view); }
    update(update: ViewUpdate): void {
      const { startState, state } = update;
      const live = state.field(editorLivePreviewField, false);
      if (live !== startState.field(editorLivePreviewField, false)
        || state.field(editorInfoField, false)?.file !== startState.field(editorInfoField, false)?.file
        || update.transactions.some(tr => tr.effects.some(effect => effect.is(refresh)))) {
        this.view.dom.win.clearTimeout(this.timer);
        this.decorations = editorNumbers(this.view);
      } else if (update.docChanged && live) {
        this.view.dom.win.clearTimeout(this.timer);
        if (!settings.enabled && state.doc.line(1).text.trim() !== "---") { this.decorations = Decoration.none; return; }
        // Keep the existing widgets with their text during typing, then parse the latest snapshot once.
        this.decorations = this.decorations.map(update.changes);
        this.timer = this.view.dom.win.setTimeout(() => this.view.dispatch({ effects: refresh.of(null) }), 60);
      }
    }
    destroy(): void { this.view.dom.win.clearTimeout(this.timer); editors.delete(this.view); }
  }, { decorations: value => value.decorations }));

  function queueSections(doc: ReadingDocument): void {
    if (doc.pending) return;
    doc.pending = true;
    queueMicrotask(() => {
      doc.pending = false;
      if (!disposed) for (const draw of doc.sections) draw();
    });
  }

  plugin.registerMarkdownPostProcessor((el, context) => {
    if (!el.querySelector(headingSelector)) return;
    let doc = documents.get(context.docId);
    if (!doc) {
      doc = { path: context.sourcePath, sections: new Set() };
      documents.set(context.docId, doc);
    }
    const docState = doc;
    const inserted = new Map<HTMLElement, HTMLElement>();
    function remove(heading: HTMLElement, span: HTMLElement): void {
      span.remove();
      heading.classList.remove(numberedLineClass);
      heading.style.removeProperty(columnProperty);
      inserted.delete(heading);
    }
    const draw = (): void => {
      if (disposed) { for (const [heading, span] of inserted) remove(heading, span); return; }
      const section = context.getSectionInfo(el);
      if (section && docState.text !== section.text) {
        docState.text = section.text;
        docState.numbers = numberingForSource(section.text, settings);
        docState.column = docState.numbers && numberColumn(el, docState.numbers.headings.values());
      }
      const index = docState.numbers;
      const targets = Array.from(el.querySelectorAll<HTMLElement>(headingSelector));
      const allowed = section && index && !index.conflict && !el.closest(".markdown-embed, .internal-embed, .print");
      const wanted = new Map<HTMLElement, string>();
      if (allowed) {
        let target = 0;
        for (let line = section.lineStart; line <= section.lineEnd && target < targets.length; line++) {
          const item = index.headings.get(line);
          if (!item || targets[target]!.tagName !== "H" + item.level) continue;
          const heading = targets[target++]!;
          if (!item.handwritten) wanted.set(heading, item.prefix);
        }
      }
      for (const [heading, span] of inserted) {
        if (!wanted.has(heading) || span.parentElement !== heading) remove(heading, span);
      }
      for (const [heading, prefix] of wanted) {
        heading.classList.add(numberedLineClass);
        heading.style.setProperty(columnProperty, docState.column!);
        const span = inserted.get(heading);
        if (span) span.dataset.prefix = prefix;
        else {
          const number = prefixElement(heading.ownerDocument, prefix);
          const fold = heading.querySelector(":scope > .heading-collapse-indicator");
          heading.insertBefore(number, fold ? fold.nextSibling : heading.firstChild);
          inserted.set(heading, number);
        }
      }
    };
    const child = new MarkdownRenderChild(el);
    child.register(() => {
      for (const [heading, span] of inserted) remove(heading, span);
      docState.sections.delete(draw);
      if (!docState.sections.size) documents.delete(context.docId);
    });
    context.addChild(child);
    docState.sections.add(draw);
    const previous = docState.text;
    draw();
    // Obsidian can retain earlier heading elements when another section changes.
    if (previous !== docState.text) queueSections(docState);
  });

  const refreshLayout = () => {
    if (disposed) return;
    for (const view of editors) view.dispatch({ effects: refresh.of(null) });
    for (const doc of documents.values()) { doc.text = undefined; queueSections(doc); }
  };
  const observeFonts = (doc: Document) => doc.fonts.addEventListener("loadingdone", refreshLayout);
  const stopObservingFonts = (doc: Document) => doc.fonts.removeEventListener("loadingdone", refreshLayout);
  const workspace = plugin.app.workspace;
  const fontDocs = new Set<Document>([workspace.containerEl.ownerDocument]);
  workspace.iterateAllLeaves(leaf => fontDocs.add(leaf.view.containerEl.ownerDocument));
  for (const doc of fontDocs) observeFonts(doc);
  plugin.registerEvent(workspace.on("window-open", (_win, window) => { fontDocs.add(window.document); observeFonts(window.document); }));
  plugin.registerEvent(workspace.on("window-close", (_win, window) => { stopObservingFonts(window.document); fontDocs.delete(window.document); }));
  plugin.register(() => { for (const doc of fontDocs) stopObservingFonts(doc); });
  plugin.registerEvent(workspace.on("css-change", refreshLayout));
  plugin.registerEvent(plugin.app.metadataCache.on("changed", file => {
    for (const doc of documents.values()) if (doc.path === file.path) queueSections(doc);
  }));
  plugin.app.workspace.onLayoutReady(() => {
    if (disposed) return;
    for (const { view } of plugin.app.workspace.getLeavesOfType("markdown")) {
      if (view instanceof MarkdownView && view.getMode() === "preview") view.previewMode.rerender(true);
    }
  });
  plugin.register(() => {
    disposed = true;
    for (const doc of documents.values()) for (const draw of doc.sections) draw();
    documents.clear();
  });
  return next => {
    settings = next;
    refreshLayout();
  };
}
