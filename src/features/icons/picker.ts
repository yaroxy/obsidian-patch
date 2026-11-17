import { prepareFuzzySearch, renderResults, Scope, SuggestModal, type App, type SearchResult } from "obsidian";
import { svgUrl, type IconId, type IconSource } from "./config";
import { type SimpleIconSet } from "./simple-icons";
import { ICON_PALETTE, iconColorCss, parseIconColor, type IconColor } from "./color";

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

/**
 * Lists Lucide icons at once and adds Simple Icons when the set has loaded,
 * so the picker opens instantly and still works offline.
 */
export class IconPicker extends SuggestModal<IconSuggestion> {
  private choices: IconChoice[];
  private readonly statusEl: HTMLElement;
  private readonly previewEl: HTMLElement;
  private readonly previewLabel: HTMLElement;
  private readonly brandButton: HTMLButtonElement;
  private readonly applyButton: HTMLButtonElement;
  private readonly colorButtons = new Map<IconColor | undefined, HTMLButtonElement>();
  private readonly customInput: HTMLInputElement;
  private selected?: IconChoice;
  private color?: IconColor;
  private colorTouched = false;
  private closed = false;

  constructor(
    app: App,
    lucide: IconChoice[],
    private readonly recent: IconChoice[],
    simpleIcons: Promise<SimpleIconSet>,
    private readonly options: IconPickerOptions,
  ) {
    super(app);
    this.choices = lucide;
    this.selected = options.current;
    this.color = options.color ?? (options.count === 1 ? "text" : undefined);
    this.modalEl.addClass("obsidian-patch-icon-picker");
    this.resultContainerEl.addClass("obsidian-patch-icon-results");
    this.limit = 200;
    this.setPlaceholder("Search Lucide and Simple Icons…");
    this.statusEl = this.modalEl.createDiv({ cls: "obsidian-patch-icon-picker-status", text: "Loading Simple Icons…" });
    const controls = this.modalEl.createDiv({ cls: "obsidian-patch-icon-controls" });
    const preview = controls.createDiv({ cls: "obsidian-patch-icon-selection" });
    this.previewEl = preview.createSpan({ cls: "obsidian-patch-icon-preview" });
    this.previewLabel = preview.createSpan();
    const colors = controls.createDiv({ cls: "obsidian-patch-icon-colors", attr: { "aria-label": "Icon color" } });
    const addColor = (color: IconColor | undefined, label: string): HTMLButtonElement => {
      const button = colors.createEl("button", { text: label, attr: { type: "button", "aria-pressed": "false" } });
      button.addEventListener("click", () => { this.color = color; this.colorTouched = true; this.refreshPreview(); });
      this.colorButtons.set(color, button);
      return button;
    };
    if (options.mixedColors) addColor(undefined, "Keep colors");
    addColor("text", "Follow text");
    this.brandButton = addColor("brand", "Brand color");
    for (const color of ICON_PALETTE) {
      const label = color[0]!.toUpperCase() + color.slice(1);
      const button = addColor(color, "");
      button.setAttribute("aria-label", label);
      button.addClass("obsidian-patch-icon-swatch");
      button.style.setProperty("--obsidian-patch-icon-swatch", `var(--color-${color})`);
    }
    const custom = controls.createEl("label", { cls: "obsidian-patch-icon-custom", text: "Custom color" });
    this.customInput = custom.createEl("input", { type: "color", attr: { "aria-label": "Custom icon color" } });
    this.customInput.addEventListener("input", () => {
      this.color = parseIconColor(this.customInput.value);
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
    simpleIcons.then(
      (set) => {
        if (this.closed) return;
        this.choices = [...lucide, ...set.names.map((name) => simpleIconChoice(set, name))];
        this.statusEl.setText(`${lucide.length} Lucide icons and ${set.names.length} Simple Icons ${set.version}.`);
        if (this.selected?.source === "simple-icons" && set.svg(this.selected.name)) {
          const fresh = simpleIconChoice(set, this.selected.name);
          this.selected = { ...fresh, brandColor: fresh.brandColor ?? this.selected.brandColor };
        }
        this.refreshPreview();
        this.inputEl.dispatchEvent(new this.inputEl.ownerDocument.defaultView!.Event("input"));
      },
      (error: unknown) => {
        if (this.closed) return;
        this.statusEl.setText(`Simple Icons could not be loaded, so only Lucide icons are listed: ${describeError(error)}`);
      },
    );
  }

  override getSuggestions(query: string): IconSuggestion[] {
    const trimmed = query.trim();
    this.emptyStateText = trimmed === "" ? "Type to search icons." : "No icons found.";
    if (trimmed === "") return this.recent.map((choice) => ({ choice: this.choices.find(item => item.id === choice.id) ?? choice }));
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

  override onClose(): void { this.closed = true; super.onClose(); }

  private refreshPreview(): void {
    const svg = this.selected?.svg();
    if (svg) this.previewEl.style.setProperty("--obsidian-patch-icon", svgUrl(svg));
    else this.previewEl.style.removeProperty("--obsidian-patch-icon");
    const color = iconColorCss(this.color, this.selected?.brandColor);
    if (color) this.previewEl.style.setProperty("--obsidian-patch-icon-color", color);
    else this.previewEl.style.removeProperty("--obsidian-patch-icon-color");
    this.previewLabel.setText(this.selected ? `${this.selected.name} · ${SOURCE_NAMES[this.selected.source]}${this.selected.source === "simple-icons" && !this.selected.brandColor ? " · Brand color unavailable" : ""}`
      : this.options.allHaveIcons ? `Keep existing icons (${this.options.count} items)` : "Choose an icon");
    this.brandButton.disabled = !this.selected?.brandColor;
    for (const [value, button] of this.colorButtons) button.setAttribute("aria-pressed", String(value === this.color));
    if (this.color?.startsWith("#")) this.customInput.value = this.color;
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
