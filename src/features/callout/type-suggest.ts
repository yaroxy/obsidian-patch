import { EditorSuggest, MarkdownView, prepareFuzzySearch, renderResults, type App, type Editor, type EditorPosition, type EditorSuggestContext, type EditorSuggestTriggerInfo, type SearchResult, type TFile } from "obsidian";
import type { AppearanceSettings } from "../appearance";
import { calloutSuggestTrigger, displayCalloutType } from "./model";
import { discoverCalloutTypes, filterCalloutCatalog, groupCalloutTypes, renderChipIcon, type CalloutType } from "./types";

export interface CalloutTypeSuggestion {
  type: CalloutType;
  badge?: string;
  match?: SearchResult;
}

const TRIGGER_LINE = /^[ \t]*(?:>[ \t]?)+[ \t]*\[!([^\]|]*)$/;

/** Provides grouped, searchable callout type completion directly when typing `> [!`. */
export class CalloutTypeSuggest extends EditorSuggest<CalloutTypeSuggestion> {
  constructor(
    app: App,
    private readonly appearances: () => AppearanceSettings["calloutTypes"],
    private readonly prioritizeGitHub: (file: TFile | null) => boolean,
  ) {
    super(app);
  }

  override onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!TRIGGER_LINE.test(editor.getLine(cursor.line).slice(0, cursor.ch))) return null;
    const trigger = calloutSuggestTrigger(editor.getValue(), cursor.line, cursor.ch);
    if (!trigger) return null;
    return { start: { line: cursor.line, ch: trigger.startCh }, end: cursor, query: trigger.query };
  }

  override getSuggestions(context: EditorSuggestContext): CalloutTypeSuggestion[] {
    const doc = this.app.workspace.getActiveViewOfType(MarkdownView)?.contentEl.ownerDocument ?? activeDocument;
    const catalog = groupCalloutTypes(discoverCalloutTypes(doc, this.appearances()));
    const prioritizeGitHub = this.prioritizeGitHub(context.file);
    const byLower = new Map(catalog.all.map((type) => [type.name.toLowerCase(), type]));
    const githubSet = new Set(catalog.github.map((type) => type.name.toLowerCase()));
    const parentOf = new Map<string, string>();
    const customSet = new Set<string>();
    for (const group of [...catalog.builtin, ...catalog.custom]) {
      for (const alias of group.aliases) {
        if (alias.toLowerCase() !== group.primary.toLowerCase()) parentOf.set(alias.toLowerCase(), group.primary);
        if (!group.builtin) customSet.add(alias.toLowerCase());
      }
    }
    const badgeFor = (name: string): string | undefined => {
      const lower = name.toLowerCase();
      if (prioritizeGitHub && githubSet.has(lower)) return "GitHub";
      const parent = parentOf.get(lower);
      if (parent) return displayCalloutType(parent);
      if (customSet.has(lower)) return "Custom";
      return undefined;
    };

    const trimmed = context.query.trim();
    if (trimmed === "") {
      const items: CalloutTypeSuggestion[] = [];
      const seen = new Set<string>();
      if (prioritizeGitHub) {
        for (const type of catalog.github) {
          seen.add(type.name.toLowerCase());
          items.push({ type, badge: "GitHub" });
        }
      }
      for (const group of catalog.builtin) {
        if (seen.has(group.primary.toLowerCase())) continue;
        seen.add(group.primary.toLowerCase());
        const type = byLower.get(group.primary.toLowerCase()) ?? { name: group.primary, icon: group.icon, color: group.color };
        items.push({ type });
      }
      for (const group of catalog.custom) {
        if (seen.has(group.primary.toLowerCase())) continue;
        seen.add(group.primary.toLowerCase());
        const type = byLower.get(group.primary.toLowerCase()) ?? { name: group.primary, icon: group.icon, color: group.color };
        items.push({ type, badge: "Custom" });
      }
      return items;
    }

    const { directMatches, customError } = filterCalloutCatalog(catalog, trimmed);
    if (customError) return [];
    if (directMatches.length > 0) return directMatches.map((type) => ({ type, badge: badgeFor(type.name) }));

    const search = prepareFuzzySearch(trimmed);
    const fuzzy: Array<Required<CalloutTypeSuggestion>> = [];
    for (const type of catalog.all) {
      const match = search(displayCalloutType(type.name));
      if (match) fuzzy.push({ type, badge: badgeFor(type.name) ?? "", match });
    }
    return fuzzy
      .sort((a, b) => b.match.score - a.match.score)
      .map(({ type, badge, match }) => ({ type, badge: badge || undefined, match }));
  }

  override renderSuggestion({ type, badge, match }: CalloutTypeSuggestion, el: HTMLElement): void {
    el.addClass("obsidian-patch-callout-suggest-item");
    const icon = el.createSpan({ cls: "obsidian-patch-callout-chip-icon" });
    if (type.color) icon.style.setProperty("--obsidian-patch-chip-color", type.color);
    renderChipIcon(icon, type.icon);
    const name = el.createSpan({ cls: "obsidian-patch-callout-suggest-name" });
    const label = displayCalloutType(type.name);
    if (match) renderResults(name, label, match);
    else name.setText(label);
    if (badge) el.createSpan({ cls: "obsidian-patch-callout-suggest-badge", text: badge });
  }

  override selectSuggestion(item: CalloutTypeSuggestion): void {
    const ctx = this.context;
    if (!ctx) return;
    const line = ctx.editor.getLine(ctx.start.line);
    const token = /^[^\]|\s]*/.exec(line.slice(ctx.start.ch))?.[0] ?? "";
    const liveEndCh = Math.max(ctx.end.ch, ctx.start.ch + token.length);
    const chosen = displayCalloutType(item.type.name);
    const after = line.slice(liveEndCh);
    const end = { line: ctx.start.line, ch: liveEndCh };
    if (after === "]") {
      ctx.editor.replaceRange(`${chosen}] `, ctx.start, { line: ctx.start.line, ch: liveEndCh + 1 });
      ctx.editor.setCursor({ line: ctx.start.line, ch: ctx.start.ch + chosen.length + 2 });
    } else if (after.startsWith("]") || after.startsWith("|")) {
      ctx.editor.replaceRange(chosen, ctx.start, end);
      ctx.editor.setCursor({ line: ctx.start.line, ch: ctx.start.ch + chosen.length + (after.startsWith("]") ? 1 : 0) });
    } else {
      ctx.editor.replaceRange(`${chosen}] `, ctx.start, end);
      ctx.editor.setCursor({ line: ctx.start.line, ch: ctx.start.ch + chosen.length + 2 });
    }
    this.close();
  }
}
