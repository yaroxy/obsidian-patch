import { syntaxTree } from "@codemirror/language";
import { StateEffect } from "@codemirror/state";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { MarkdownView, type Plugin } from "obsidian";

export const DEFAULT_HEADING_LEVELS_ENABLED = true;
const CLASS = "obsidian-patch-heading-levels";
const refresh = StateEffect.define<null>();

class HeadingLevel extends WidgetType {
  constructor(private readonly level: number) { super(); }
  override eq(other: HeadingLevel): boolean { return this.level === other.level; }
  override toDOM(view: EditorView): HTMLElement {
    return view.dom.ownerDocument.defaultView!.createSpan({
      cls: "obsidian-patch-heading-level", text: `H${this.level}`, attr: { "aria-hidden": "true" },
    });
  }
  override ignoreEvent(): boolean { return true; }
}

/** Labels belong to the view; they never become Markdown or printed content. */
export function registerHeadingLevels(plugin: Plugin, initial: boolean): (enabled: boolean) => void {
  let enabled = initial;
  const editors = new Set<EditorView>();
  let styled = new Set<HTMLElement>();

  const decorate = (view: EditorView): DecorationSet => {
    if (!enabled) return Decoration.none;
    const headings = new Map<number, number>();
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({ from, to, enter(node) {
        if (/codeblock|frontmatter/.test(node.name)) return;
        // Obsidian's Markdown lexer emits header tokens, including formatted spans.
        const level = node.name.match(/(?:^|_)header-([1-6])(?:_|$)/)?.[1];
        if (!level) return;
        const line = view.state.doc.lineAt(node.from);
        // A Setext underline carries the heading style, but isn't a second title.
        if (/^(?:\s*>\s*)*\s*(?:=+|-+)\s*$/.test(line.text)) return;
        headings.set(line.to, Number(level));
      } });
    }
    return Decoration.set([...headings].map(([pos, level]) =>
      Decoration.widget({ widget: new HeadingLevel(level), side: 1 }).range(pos)), true);
  };

  plugin.registerEditorExtension(ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(private readonly view: EditorView) { editors.add(view); this.decorations = decorate(view); }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)
        || update.transactions.some(t => t.effects.some(e => e.is(refresh)))) this.decorations = decorate(update.view);
    }
    destroy(): void {
      editors.delete(this.view);
    }
  }, { decorations: value => value.decorations }));

  const apply = (): void => {
    const current = new Set<HTMLElement>();
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      leaf.view.contentEl.toggleClass(CLASS, enabled);
      if (enabled) current.add(leaf.view.contentEl);
    }
    for (const el of styled) if (!current.has(el)) el.removeClass(CLASS);
    styled = current;
  };
  plugin.registerEvent(plugin.app.workspace.on("layout-change", apply));
  plugin.registerEvent(plugin.app.workspace.on("file-open", apply));
  plugin.app.workspace.onLayoutReady(apply);
  plugin.register(() => { for (const el of styled) el.removeClass(CLASS); editors.clear(); });
  return next => {
    enabled = next;
    apply();
    for (const view of editors) view.dispatch({ effects: refresh.of(null) });
  };
}
