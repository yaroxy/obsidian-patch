import { Compartment, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { EditorView, gutter, GutterMarker, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { editorInfoField, type Plugin } from "obsidian";
import type { NoteHead } from "./head";
import type { StructuredPatchHunk } from "diff";
import { changedLines, type ChangedLine } from "./model";

class ChangeMark extends GutterMarker {
  constructor(readonly change: ChangedLine) { super(); }
  override eq(other: ChangeMark): boolean {
    return this.change.kind === other.change.kind && this.change.hunk === other.change.hunk && this.change.atEnd === other.change.atEnd;
  }
  override toDOM(view: EditorView): HTMLElement {
    const el = view.dom.ownerDocument.createElement("span");
    el.className = "obsidian-patch-git-mark";
    el.dataset.kind = this.change.kind;
    el.toggleClass("is-at-end", !!this.change.atEnd);
    el.title = { added: "Added line", modified: "Modified line", deleted: "Deleted lines" }[this.change.kind] + " · Open Git diff";
    return el;
  }
}

/** Compare visible Markdown editors and reuse their committed text while typing. */
export function registerGitGutter(plugin: Plugin, enabled: () => boolean, head: (path: string) => Promise<NoteHead>,
  differences: (head: NoteHead, current: string) => StructuredPatchHunk[],
  open: (view: EditorView, path: string, hunk: number) => void): (path?: string) => void {
  const compartment = new Compartment();
  const empty = RangeSet.of<ChangeMark>([]);
  const set = StateEffect.define<RangeSet<ChangeMark>>();
  const field = StateField.define<RangeSet<ChangeMark>>({
    create: () => empty,
    update(value, tr) {
      for (const effect of tr.effects) if (effect.is(set)) return effect.value;
      return tr.docChanged ? value.map(tr.changes) : value;
    },
  });
  const notePath = (view: EditorView): string => view.state.field(editorInfoField, false)?.file?.path ?? "";
  const column = [EditorView.editorAttributes.of({ class: "obsidian-patch-git-enabled" }), gutter({
    class: "obsidian-patch-git-gutter", markers: view => view.state.field(field),
    domEventHandlers: { mousedown(view, line, event) {
      if ((event as MouseEvent).button !== 0) return false;
      const cursor = view.state.field(field).iter(line.from);
      if (!cursor.value || cursor.from !== line.from) return false;
      open(view, notePath(view), cursor.value.change.hunk);
      return true;
    } },
  })];
  const editors = new Set<Tracker>();
  class Tracker {
    private revision = 0;
    private timer?: number;
    private visible = false;
    private inViewport = false;
    private readonly observer: IntersectionObserver;
    path = "";

    constructor(private readonly view: EditorView) {
      editors.add(this);
      this.observer = new view.dom.ownerDocument.defaultView!.IntersectionObserver(([entry]) => {
        this.inViewport = !!entry?.isIntersecting;
        this.schedule();
      });
      this.observer.observe(view.dom);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || notePath(this.view) !== this.path) this.schedule(update.docChanged ? 180 : 0);
    }
    schedule(delay = 0): void {
      const view = this.view;
      this.path = notePath(view);
      const show = this.inViewport && enabled() && this.path.toLowerCase().endsWith(".md")
        && !!view.dom.closest('.workspace-leaf-content[data-type="markdown"]') && !view.dom.parentElement?.closest(".cm-editor, .markdown-embed");
      const revision = ++this.revision;
      view.dom.win.clearTimeout(this.timer);
      if (!show && !this.visible) return;
      this.timer = view.dom.win.setTimeout(() => { void this.paint(revision, show); }, delay);
    }
    private async paint(revision: number, show: boolean): Promise<void> {
      const view = this.view, doc = view.state.doc;
      let markers = empty;
      if (show) {
        try {
          const base = await head(this.path);
          if (revision !== this.revision || doc !== view.state.doc) return;
          const changes = changedLines(differences(base, doc.toString()), doc.lines);
          markers = RangeSet.of(changes.map(change => new ChangeMark(change).range(doc.line(change.line).from)), true);
        } catch { /* The comparison view reports unavailable Git or a missing baseline. */ }
      }
      if (revision !== this.revision) return;
      const effects: StateEffect<unknown>[] = [set.of(markers)];
      if (show !== this.visible) effects.push(compartment.reconfigure(show ? column : []));
      this.visible = show;
      view.dispatch({ effects });
    }
    destroy(): void { this.revision++; this.observer.disconnect(); this.view.dom.win.clearTimeout(this.timer); editors.delete(this); }
  }
  plugin.registerEditorExtension([field, compartment.of([]), ViewPlugin.fromClass(Tracker)]);
  return path => { for (const editor of editors) if (path === undefined || editor.path === path) editor.schedule(); };
}
