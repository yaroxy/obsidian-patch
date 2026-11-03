import { prepareFuzzySearch, renderResults, SuggestModal, type App, type SearchResult } from "obsidian";
import { svgUrl, type IconId, type IconSource } from "./config";
import { type SimpleIconSet } from "./simple-icons";

export interface IconChoice {
  id: IconId;
  source: IconSource;
  name: string;
  /** SVG markup, for the preview and for Simple Icons to keep. */
  svg(): string | undefined;
}

interface IconSuggestion {
  choice: IconChoice;
  match?: SearchResult;
}

const SOURCE_NAMES: Record<IconSource, string> = { lucide: "Lucide", "simple-icons": "Simple Icons" };

/**
 * Lists Lucide icons at once and adds Simple Icons when the set has loaded,
 * so the picker opens instantly and still works offline.
 */
export class IconPicker extends SuggestModal<IconSuggestion> {
  private choices: IconChoice[];
  private readonly statusEl: HTMLElement;

  constructor(
    app: App,
    lucide: IconChoice[],
    private readonly recent: IconChoice[],
    simpleIcons: Promise<SimpleIconSet>,
    private readonly onChoose: (choice: IconChoice) => void,
  ) {
    super(app);
    this.choices = lucide;
    this.limit = 200;
    this.setPlaceholder("Search Lucide and Simple Icons…");
    this.statusEl = this.modalEl.createDiv({ cls: "obsidian-patch-icon-picker-status", text: "Loading Simple Icons…" });
    simpleIcons.then(
      (set) => {
        this.choices = [...lucide, ...set.names.map((name) => simpleIconChoice(set, name))];
        this.statusEl.setText(`${lucide.length} Lucide icons and ${set.names.length} Simple Icons ${set.version}.`);
        this.inputEl.dispatchEvent(new Event("input"));
      },
      (error: unknown) => {
        this.statusEl.setText(`Simple Icons could not be loaded, so only Lucide icons are listed: ${describeError(error)}`);
      },
    );
  }

  override getSuggestions(query: string): IconSuggestion[] {
    const trimmed = query.trim();
    this.emptyStateText = trimmed === "" ? "Type to search icons." : "No icons found.";
    if (trimmed === "") return this.recent.map((choice) => ({ choice }));
    const search = prepareFuzzySearch(trimmed);
    const suggestions: Array<Required<IconSuggestion>> = [];
    for (const choice of this.choices) {
      const match = search(choice.name);
      if (match) suggestions.push({ choice, match });
    }
    return suggestions.sort((a, b) => b.match.score - a.match.score).slice(0, this.limit);
  }

  override renderSuggestion({ choice, match }: IconSuggestion, el: HTMLElement): void {
    el.addClass("obsidian-patch-icon-suggestion");
    const preview = el.createSpan({ cls: "obsidian-patch-icon-preview" });
    const svg = choice.svg();
    if (svg !== undefined) preview.style.setProperty("--obsidian-patch-icon", svgUrl(svg));
    const name = el.createSpan({ cls: "obsidian-patch-icon-name" });
    if (match) renderResults(name, choice.name, match);
    else name.setText(choice.name);
    el.createSpan({ cls: "obsidian-patch-icon-source", text: SOURCE_NAMES[choice.source] });
  }

  override onChooseSuggestion({ choice }: IconSuggestion): void {
    this.onChoose(choice);
  }
}

function simpleIconChoice(set: SimpleIconSet, name: string): IconChoice {
  return { id: `simple-icons:${name}`, source: "simple-icons", name, svg: () => set.svg(name) };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
