import { prepareFuzzySearch, renderResults, Scope, SuggestModal, type App, type SearchResult } from "obsidian";
import { svgUrl, type IconId, type IconSource } from "./config";
import { type SimpleIconSet } from "./simple-icons";
import { iconColorCss, type IconColor } from "./color";
import { IconColorControls } from "./color-controls";

export interface IconChoice {
  id: IconId;
  source: IconSource;
  name: string;
  brandColor?: string;
  /** SVG markup, for the preview and for Simple Icons to keep. */
  svg(): string | undefined;
}

export interface IconPickerOptions {
  current?: IconChoice;
  color?: IconColor;
  mixedColors: boolean;
  count: number;
  allHaveIcons: boolean;
  onApply: (choice: IconChoice | undefined, color: IconColor | undefined) => Promise<void>;
}

interface IconSuggestion {
  choice: IconChoice;
  match?: SearchResult;
}

const SOURCE_NAMES: Record<IconSource, string> = { lucide: "Lucide", "simple-icons": "Simple Icons" };

export interface IconCatalog {
  lucide: IconChoice[];
  recent: IconChoice[];
  installed: Promise<SimpleIconSet | undefined>;
}

/** Search the shared local catalog. Selecting a callout icon returns it to the appearance draft. */
export class IconSearch extends SuggestModal<IconSuggestion> {
  private choices: IconChoice[];
  protected readonly statusEl: HTMLElement;
  private closed = false;

  constructor(app: App, private readonly catalog: IconCatalog, private readonly pick?: (choice: IconChoice) => void) {
    super(app);
    const { lucide, recent } = catalog;
    this.choices = [...lucide, ...recent.filter(choice => choice.source === "simple-icons")];
    this.modalEl.addClass("obsidian-patch-icon-picker");
    this.resultContainerEl.addClass("obsidian-patch-icon-results");
    this.limit = 200;
    this.setPlaceholder("Search Lucide and Simple Icons…");
    this.statusEl = this.modalEl.createDiv({ cls: "obsidian-patch-icon-picker-status", text: "Reading installed icons…" });
    catalog.installed.then(
      (set) => {
        if (this.closed) return;
        if (!set) {
          this.statusEl.setText("For more brand logos, choose Settings → Patches → Patch Icons → Simple Icons → Install.");
          return;
        }
        const installed = set.names.map(name => simpleIconChoice(set, name));
        const ids = new Set(installed.map(icon => icon.id));
        this.choices = [...this.choices.filter(icon => !ids.has(icon.id)), ...installed];
        this.statusEl.setText(`${lucide.length} Lucide icons and ${set.names.length} Simple Icons ${set.version}.`);
        this.onCatalogLoaded(set);
        this.inputEl.dispatchEvent(new this.inputEl.ownerDocument.defaultView!.Event("input"));
      },
      (error: unknown) => {
        if (this.closed) return;
        this.statusEl.setText(`Simple Icons could not be loaded, showing built-in and saved icons: ${describeError(error)}`);
      },
    );
  }

  override getSuggestions(query: string): IconSuggestion[] {
    const trimmed = query.trim();
    this.emptyStateText = trimmed === "" ? "Type to search icons." : "No icons found.";
    if (trimmed === "") return this.catalog.recent.map((choice) => ({ choice: this.choices.find(item => item.id === choice.id) ?? choice }));
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
    el.dataset.iconId = choice.id;
    const preview = el.createSpan({ cls: "obsidian-patch-icon-preview" });
    const svg = choice.svg();
    if (choice.brandColor) preview.style.setProperty("--obsidian-patch-icon-color", choice.brandColor);
    if (svg !== undefined) preview.style.setProperty("--obsidian-patch-icon", svgUrl(svg));
    const name = el.createSpan({ cls: "obsidian-patch-icon-name" });
    if (match) renderResults(name, choice.name, match);
    else name.setText(choice.name);
    el.createSpan({ cls: "obsidian-patch-icon-source", text: SOURCE_NAMES[choice.source] });
  }

  override onChooseSuggestion({ choice }: IconSuggestion): void { this.pick?.(choice); }
  protected onCatalogLoaded(_set: SimpleIconSet): void {}
  override onClose(): void { this.closed = true; super.onClose(); }
}

export class IconPicker extends IconSearch {
  private readonly previewEl: HTMLElement;
  private readonly previewLabel: HTMLElement;
  private readonly applyButton: HTMLButtonElement;
  private readonly palette: IconColorControls;
  private selected?: IconChoice;
  private color?: IconColor;
  private colorTouched = false;

  constructor(app: App, catalog: IconCatalog, private readonly options: IconPickerOptions) {
    super(app, catalog);
    this.selected = options.current;
    this.color = options.color ?? (options.count === 1 ? "text" : undefined);
    const controls = this.modalEl.createDiv({ cls: "obsidian-patch-icon-controls" });
    const preview = controls.createDiv({ cls: "obsidian-patch-icon-selection" });
    this.previewEl = preview.createSpan({ cls: "obsidian-patch-icon-preview" });
    this.previewLabel = preview.createSpan();
    this.palette = new IconColorControls(controls, "Icon color", "Follow text", options.mixedColors, color => {
      this.color = color;
      this.colorTouched = true;
      this.refreshPreview();
    });
    const actions = controls.createDiv({ cls: "modal-button-container" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    this.applyButton = actions.createEl("button", { text: "Apply", cls: "mod-cta" });
    this.applyButton.addEventListener("click", () => { void this.apply(); });
    // Let footer controls own Enter; search and navigation retain SuggestModal's scope.
    this.scope = new Scope(this.scope);
    this.scope.register(null, null, (event) => {
      const focused = controls.ownerDocument.activeElement;
      if (event.key !== "Enter" || event.isComposing || !focused || !controls.contains(focused)) return;
      const button = focused.closest("button");
      if (button) { button.click(); return false; }
      return true;
    });
    this.refreshPreview();
  }

  protected override onCatalogLoaded(set: SimpleIconSet): void {
    if (this.selected?.source === "simple-icons" && set.svg(this.selected.name)) {
      const fresh = simpleIconChoice(set, this.selected.name);
      this.selected = { ...fresh, brandColor: fresh.brandColor ?? this.selected.brandColor };
      this.refreshPreview();
    }
  }

  override selectSuggestion(value: IconSuggestion): void {
    // SuggestModal normally closes after a selection; keep it open for color and Apply.
    this.onChooseSuggestion(value);
  }

  override onChooseSuggestion({ choice }: IconSuggestion): void {
    this.selected = choice;
    if (!this.colorTouched && !this.options.mixedColors && this.options.color === undefined) this.color = choice.source === "simple-icons" && choice.brandColor ? "brand" : "text";
    if (choice.source === "lucide" && this.color === "brand") this.color = "text";
    this.refreshPreview();
  }

  private refreshPreview(): void {
    const svg = this.selected?.svg();
    if (svg) this.previewEl.style.setProperty("--obsidian-patch-icon", svgUrl(svg));
    else this.previewEl.style.removeProperty("--obsidian-patch-icon");
    const color = iconColorCss(this.color, this.selected?.brandColor);
    if (color) this.previewEl.style.setProperty("--obsidian-patch-icon-color", color);
    else this.previewEl.style.removeProperty("--obsidian-patch-icon-color");
    this.previewLabel.setText(this.selected ? `${this.selected.name} · ${SOURCE_NAMES[this.selected.source]}${this.selected.source === "simple-icons" && !this.selected.brandColor ? " · Brand color unavailable" : ""}`
      : this.options.allHaveIcons ? `Keep existing icons (${this.options.count} items)` : "Choose an icon");
    this.palette.update(this.color, this.selected?.brandColor);
    this.applyButton.disabled = !this.selected && !this.options.allHaveIcons;
  }

  private async apply(): Promise<void> {
    this.applyButton.disabled = true;
    try { await this.options.onApply(this.selected, this.color); this.close(); }
    catch (error) { this.statusEl.setText(`Could not save icon: ${describeError(error)}`); this.refreshPreview(); }
  }
}

function simpleIconChoice(set: SimpleIconSet, name: string): IconChoice {
  return { id: `simple-icons:${name}`, source: "simple-icons", name, brandColor: set.color(name), svg: () => set.svg(name) };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
