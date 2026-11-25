import { Compartment, RangeSet, StateEffect, StateField } from "@codemirror/state";
import { EditorView, gutter, GutterMarker, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { editorInfoField, type Plugin } from "obsidian";
import type { NoteHead } from "./head";
import type { StructuredPatchHunk } from "diff";
import { changedLines, type ChangedLine } from "./model";

function consecutive(before?: ChangedLine, after?: ChangedLine): boolean {
  return !!before && !!after && before.kind !== "deleted" && before.kind === after.kind
    && before.hunk === after.hunk && before.line + 1 === after.line;
}

class ChangeMark extends GutterMarker {
  constructor(readonly change: ChangedLine, readonly joinedStart: boolean, readonly joinedEnd: boolean) { super(); }
  override eq(other: ChangeMark): boolean {
    return this.change.line === other.change.line && this.change.kind === other.change.kind
      && this.change.hunk === other.change.hunk && this.change.atEnd === other.change.atEnd
      && this.joinedStart === other.joinedStart && this.joinedEnd === other.joinedEnd;
  }
  override toDOM(view: EditorView): HTMLElement {
    const el = view.dom.ownerDocument.defaultView!.createSpan({ cls: "obsidian-patch-git-mark" });
    el.dataset.kind = this.change.kind;
    el.dataset.gitLine = String(this.change.line);
    el.toggleClass("is-at-end", !!this.change.atEnd);
    el.toggleClass("is-joined-start", this.joinedStart);
    el.toggleClass("is-joined-end", this.joinedEnd);
    el.title = { added: "Added line", modified: "Modified line", deleted: "Deleted lines" }[this.change.kind] + " · Open Git diff";
    return el;
  }
}

/** Link each gutter cell to its rendered source row, even while edits move the diff's original lines. */
function alignGitMarks(view: EditorView, field: StateField<RangeSet<ChangeMark>>): void {
  view.requestMeasure({
    key: alignGitMarks,
    read(view) {
      const marks = view.scrollDOM.querySelectorAll<HTMLElement>(".obsidian-patch-git-gutter .obsidian-patch-git-mark:not([data-kind=deleted])");
      const positions = new Map<number, number>();
      view.state.field(field).between(view.viewport.from, view.viewport.to, (from, _to, mark) => {
        positions.set(mark.change.line, from);
      });
      const scale = view.scaleY || 1;
      return Array.from(marks, mark => {
        const pos = positions.get(Number(mark.dataset.gitLine));
        const node = pos === undefined ? undefined : view.domAtPos(pos).node;
        const row = (node?.nodeType === 1 ? node as Element : node?.parentElement)?.closest(".cm-line");
        if (!row || row.parentElement !== view.contentDOM) return { mark, start: "", end: "", lineHeight: "" };
        const bounds = row.getBoundingClientRect(), css = view.dom.win.getComputedStyle(row);
        const cell = mark.parentElement!.getBoundingClientRect();
        const topPadding = mark.classList.contains("is-joined-start") ? 0 : parseFloat(css.paddingBlockStart);
        const bottomPadding = mark.classList.contains("is-joined-end") ? 0 : parseFloat(css.paddingBlockEnd);
        const start = (bounds.top - cell.top) / scale + topPadding;
        const end = (cell.bottom - bounds.bottom) / scale + bottomPadding;
        return { mark, start: start + "px", end: end + "px", lineHeight: css.lineHeight };
      });
    },
    write(measured) {
      for (const { mark, start, end, lineHeight } of measured) {
        if (mark.style.getPropertyValue("--obsidian-patch-git-row-start") !== start) mark.style.setProperty("--obsidian-patch-git-row-start", start);
        if (mark.style.getPropertyValue("--obsidian-patch-git-row-end") !== end) mark.style.setProperty("--obsidian-patch-git-row-end", end);
        if (mark.style.lineHeight !== lineHeight) mark.style.lineHeight = lineHeight;
      }
    },
  });
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
      if (update.geometryChanged || update.transactions.some(tr => tr.reconfigured || tr.effects.some(e => e.is(set)))) this.refreshGeometry();
    }
    docViewUpdate(): void { this.refreshGeometry(); }
    refreshGeometry(): void { if (this.visible) alignGitMarks(this.view, field); }
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
          markers = RangeSet.of(changes.map((change, i) => {
            const mark = new ChangeMark(change, consecutive(changes[i - 1], change), consecutive(change, changes[i + 1]));
            return mark.range(doc.line(change.line).from);
          }), true);
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
  plugin.registerEvent(plugin.app.workspace.on("css-change", () => {
    for (const editor of editors) editor.refreshGeometry();
  }));
  return path => { for (const editor of editors) if (path === undefined || editor.path === path) editor.schedule(); };
}
