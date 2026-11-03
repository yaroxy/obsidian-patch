import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { MarkdownView, editorInfoField, editorLivePreviewField, getFrontMatterInfo, parseYaml, type Plugin } from "obsidian";
import { resolveBanner, type BannerSettings, type BannerState } from "./config";
import { BannerMedia } from "./media";
import { bannerActions } from "./picker";
import { measureScrollFromText } from "./scroll-offset";

/**
 * The only dependency on Obsidian's note-header DOM. There is no public cover
 * slot. Keep our node inside the header, outside rendered sections / CM content,
 * and observe replacement rather than patching the host's reconciliation methods.
 */
export function registerBannerCovers(plugin: Plugin, settings: () => BannerSettings): () => void {
  const covers = new Map<MarkdownView, Cover>();
  const editors = new Set<EditorView>();
  let disposed = false;

  function viewFor(editor: EditorView): MarkdownView | undefined {
    const info = editor.state.field(editorInfoField, false);
    return plugin.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView && view.editor === info?.editor);
  }

  class Cover {
    readonly element: HTMLElement;
    private readonly add: HTMLButtonElement;
    private readonly media: BannerMedia;
    private readonly observer: MutationObserver;
    private readonly boundsObserver: ResizeObserver;
    private readonly win: Window & typeof globalThis;
    private viewport?: HTMLElement;
    private host?: HTMLElement;
    private header?: HTMLElement;
    private frame = 0;
    private editor?: EditorView;
    private editorState: BannerState = { status: "none" };
    private measured?: EditorView;
    private restoreScroll?: () => void;

    constructor(private readonly view: MarkdownView) {
      const doc = view.contentEl.ownerDocument;
      this.win = doc.defaultView!;
      this.element = doc.createElement("div");
      this.element.className = "obsidian-patch-banner-cover";
      const select = (): void => { if (view.file) bannerActions(plugin.app, view.file).select(); };
      this.add = this.element.createEl("button", {
        text: "Add cover", cls: "obsidian-patch-banner-add", attr: { type: "button" },
      });
      this.add.addEventListener("click", select);
      this.media = new BannerMedia(this.element.createDiv(), plugin.app, settings(), {
        select,
        remove: () => { if (view.file) bannerActions(plugin.app, view.file).remove(); },
      }, () => this.editor?.requestMeasure());
      this.boundsObserver = new this.win.ResizeObserver(() => this.resize());
      this.observer = new this.win.MutationObserver(records => {
        const changed = records.some(record => {
          if (this.element.contains(record.target)) return false;
          if (Array.from(record.removedNodes).includes(this.element)) return true;
          return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => {
            if (!(node instanceof this.win.HTMLElement) || node === this.element) return false;
            return node.matches(".cm-sizer, .mod-header, .inline-title, .metadata-container") ||
              node.querySelector(".cm-sizer, .mod-header") !== null;
          });
        });
        if (changed && !this.frame) this.frame = this.win.requestAnimationFrame(() => {
          this.frame = 0;
          this.refresh();
        });
      });
      this.observer.observe(view.contentEl, { childList: true, subtree: true });
    }

    updateEditor(editor: EditorView, state: BannerState): void {
      this.editor = editor;
      this.editorState = state;
      this.refresh();
    }

    releaseEditor(editor: EditorView): void {
      if (this.editor === editor) this.editor = undefined;
      if (this.measured === editor) this.measureFrom(undefined);
    }

    refresh(): void {
      const file = this.view.file;
      const reading = this.view.getMode() === "preview";
      const livePreview = this.editor?.state.field(editorLivePreviewField, false) === true;
      const enabled = !!file && settings().enabled && (reading || livePreview);
      this.element.hidden = !enabled;
      if (!enabled || !file) {
        this.measureFrom(undefined);
        this.media.update({ status: "none" }, settings());
        return;
      }
      const host = reading
        ? this.readingHeader()
        : this.view.contentEl.querySelector<HTMLElement>(":scope > .markdown-source-view .cm-sizer");
      if (!host) {
        this.measureFrom(undefined);
        this.element.remove();
        this.media.update({ status: "none" }, settings());
        return;
      }
      if (host.firstElementChild !== this.element) host.prepend(this.element);
      const viewport = reading ? host.closest<HTMLElement>(".markdown-preview-view") : this.editor?.scrollDOM;
      if (viewport && (this.viewport !== viewport || this.host !== host)) {
        this.boundsObserver.disconnect();
        this.viewport = viewport;
        this.host = host;
        this.boundsObserver.observe(viewport);
        this.boundsObserver.observe(host);
      }
      this.element.dataset.bannerNote = file.path;
      const state = reading
        ? resolveBanner(plugin.app, file, plugin.app.metadataCache.getFileCache(file)?.frontmatter)
        : this.editorState;
      this.add.hidden = state.status !== "none";
      this.measureFrom(!reading && state.status !== "none" ? this.editor : undefined);
      this.resize();
      this.media.update(state, settings());
    }

    /** Only the editor a cover sits above measures its scroll from the text. */
    private measureFrom(editor: EditorView | undefined): void {
      if (this.measured === editor) return;
      this.restoreScroll?.();
      this.measured = editor;
      this.restoreScroll = editor ? measureScrollFromText(editor) : undefined;
    }

    /**
     * Reading View detaches its header, like any section, while it is outside the
     * render window, and measures it again when it returns. Stay in that node, as
     * the native title and Properties do: leaving shrinks the header behind the
     * renderer's back, and it then clamps the scroll position to the end of the note.
     */
    private readingHeader(): HTMLElement | undefined {
      const attached = this.view.previewMode.containerEl.querySelector<HTMLElement>(
        ":scope > .markdown-preview-view > .markdown-preview-sizer > .mod-header");
      if (attached) this.header = attached;
      else if (this.header?.isConnected) this.header = undefined;
      return this.header;
    }

    /** Break out of the text column without changing the host's layout styles. */
    private resize(): void {
      if (!this.add.hidden) {
        this.element.style.removeProperty("--obsidian-patch-cover-width");
        this.element.style.removeProperty("--obsidian-patch-cover-offset");
        return;
      }
      if (!this.viewport || !this.host || this.element.hidden || !this.element.isConnected) return;
      const available = this.viewport.clientWidth;
      if (!available) return; // Hidden tabs are measured after they become visible.
      const width = available * settings().widthPercent / 100;
      const viewport = this.viewport.getBoundingClientRect();
      const cover = this.element.getBoundingClientRect();
      const start = viewport.left + this.viewport.clientLeft + (available - width) / 2;
      const previous = parseFloat(this.element.style.getPropertyValue("--obsidian-patch-cover-offset")) || 0;
      const rtl = this.win.getComputedStyle(this.host).direction === "rtl";
      const offset = previous + (rtl ? cover.right - (start + width) : start - cover.left);
      for (const [property, value] of [
        ["--obsidian-patch-cover-width", `${width}px`],
        ["--obsidian-patch-cover-offset", `${Math.round(offset * 100) / 100}px`],
      ]) if (this.element.style.getPropertyValue(property!) !== value) {
        this.element.style.setProperty(property!, value!);
      }
    }

    destroy(): void {
      this.observer.disconnect();
      this.boundsObserver.disconnect();
      this.win.cancelAnimationFrame(this.frame);
      this.media.destroy();
      this.element.remove();
      this.measureFrom(undefined);
      this.editor = undefined;
    }
  }

  function coverFor(view: MarkdownView): Cover {
    let cover = covers.get(view);
    if (!cover) { cover = new Cover(view); covers.set(view, cover); }
    return cover;
  }

  function publish(editor: EditorView): number {
    if (disposed) return 0;
    const view = viewFor(editor);
    const info = getFrontMatterInfo(editor.state.doc.toString());
    if (!view || !view.file) return info.contentStart;
    let state: BannerState;
    try {
      state = resolveBanner(plugin.app, view.file, info.exists ? parseYaml(info.frontmatter) : undefined);
    } catch {
      state = { status: "error", message: "Could not parse cover properties. Check the YAML frontmatter." };
    }
    coverFor(view).updateEditor(editor, state);
    return info.contentStart;
  }

  plugin.registerEditorExtension(ViewPlugin.define(editor => {
    editors.add(editor);
    let headerEnd = publish(editor);
    let file = editor.state.field(editorInfoField, false)?.file?.path;
    let live = editor.state.field(editorLivePreviewField, false);
    return {
      update(update: ViewUpdate) {
        const nextFile = update.state.field(editorInfoField, false)?.file?.path;
        const nextLive = update.state.field(editorLivePreviewField, false);
        let headerChanged = false;
        update.changes.iterChangedRanges(from => { if (from <= headerEnd) headerChanged = true; });
        if (headerChanged || file !== nextFile || live !== nextLive) headerEnd = publish(editor);
        file = nextFile;
        live = nextLive;
      },
      destroy() {
        editors.delete(editor);
        for (const cover of covers.values()) cover.releaseEditor(editor);
      },
    };
  }));

  const refresh = (): void => {
    if (disposed) return;
    const visible = new Set<MarkdownView>();
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView) {
        visible.add(leaf.view);
        coverFor(leaf.view).refresh();
      }
    }
    for (const [view, cover] of covers) if (!visible.has(view)) {
      cover.destroy();
      covers.delete(view);
    }
    for (const editor of editors) publish(editor);
  };
  plugin.register(() => {
    disposed = true;
    for (const cover of covers.values()) cover.destroy();
    covers.clear();
    editors.clear();
  });
  refresh();
  return refresh;
}
