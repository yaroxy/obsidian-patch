import { FuzzySuggestModal, getIconIds, Modal, Notice, setIcon, Setting, type App, type FuzzyMatch } from "obsidian";
import type { CalloutAppearance } from "../appearance";
import { ICON_PALETTE, iconColorCss, parseIconColor } from "../icons/color";
import { displayCalloutType, isValidCalloutType } from "./model";
import { discoverCalloutTypes, renderChipIcon } from "./types";

class CalloutIconPicker extends FuzzySuggestModal<string> {
  constructor(app: App, private readonly selectIcon: (icon: string) => void) {
    super(app);
    this.setPlaceholder("Search Lucide icons…");
  }

  getItems(): string[] { return getIconIds().filter(id => id.startsWith("lucide-")); }
  getItemText(id: string): string { return id.slice("lucide-".length); }

  override renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement): void {
    setIcon(el.createSpan({ cls: "obsidian-patch-callout-icon-option" }), match.item);
    const label = el.createSpan();
    super.renderSuggestion(match, label);
  }
  onChooseItem(id: string): void { this.selectIcon(id); }
}

export class CalloutAppearanceModal extends Modal {
  constructor(app: App, private readonly entries: Record<string, CalloutAppearance>,
    private readonly saveEntry: (type: string, entry: CalloutAppearance) => Promise<void>) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle("Callout appearance");
    this.modalEl.addClass("obsidian-patch-callout-appearance");
    const host = this.contentEl;
    const types = discoverCalloutTypes(host.ownerDocument, this.entries, true);
    const known = new Map(types.map(type => [type.name.toLowerCase(), type]));
    const typeRow = new Setting(host).setName("Callout type").setDesc("Choose a type or enter a new name.");
    const typeInput = typeRow.controlEl.createEl("input", { type: "text", attr: { "aria-label": "Callout type", placeholder: "RESEARCH" } });
    const names = host.createEl("datalist");
    names.id = `obsidian-patch-callout-names-${crypto.randomUUID()}`;
    typeInput.setAttribute("list", names.id);
    for (const type of types) {
      names.createEl("option", { value: displayCalloutType(type.name) });
    }
    const typeName = (): string => typeInput.value.trim().toLowerCase();

    const draftPreview = host.createDiv({ cls: "obsidian-patch-callout-appearance-preview" });
    const previewIcon = draftPreview.createSpan();
    const previewLabel = draftPreview.createSpan();
    const iconRow = new Setting(host).setName("Icon");
    let icon: string | undefined;
    let color: CalloutAppearance["color"];
    const updatePreview = (): void => {
      const current = known.get(typeName()) ?? known.get("note");
      previewIcon.empty();
      renderChipIcon(previewIcon, icon ?? current?.icon ?? "");
      draftPreview.style.color = iconColorCss(color) ?? current?.color ?? "";
      previewLabel.setText(displayCalloutType(typeInput.value.trim()) || "Callout");
      apply.disabled = !isValidCalloutType(typeName());
    };
    iconRow.addButton(button => button.setButtonText("Choose icon").onClick(() => {
      new CalloutIconPicker(this.app, id => { icon = id; updatePreview(); }).open();
    }));
    iconRow.addButton(button => button.setButtonText("Use theme icon").onClick(() => { icon = undefined; updatePreview(); }));
    const colorRow = new Setting(host).setName("Color");
    const select = colorRow.controlEl.createEl("select", { attr: { "aria-label": "Callout color" } });
    select.createEl("option", { text: "Use theme color", value: "" });
    for (const preset of ICON_PALETTE) select.createEl("option", { value: preset, text: preset[0]!.toUpperCase() + preset.slice(1) });
    select.createEl("option", { text: "Custom color", value: "custom" });
    const custom = colorRow.controlEl.createEl("input", { type: "color", attr: { "aria-label": "Custom callout color" } });
    const readColor = (): void => {
      custom.hidden = select.value !== "custom";
      const next = parseIconColor(custom.hidden ? select.value : custom.value);
      color = next === "brand" || next === "text" ? undefined : next;
      updatePreview();
    };
    select.onchange = readColor;
    custom.oninput = readColor;

    const actions = host.createDiv({ cls: "modal-button-container" });
    actions.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    const apply = actions.createEl("button", { text: "Apply", cls: "mod-cta" });
    apply.onclick = async () => {
      if (apply.disabled) return;
      apply.disabled = true;
      try {
        await this.saveEntry(typeName(), { icon, color });
        this.close();
      } catch (error) {
        new Notice(`Could not save the callout appearance: ${String(error)}`);
        updatePreview();
      }
    };
    const loadType = (): void => {
      const key = typeName();
      const entry = Object.prototype.hasOwnProperty.call(this.entries, key) ? this.entries[key] : undefined;
      icon = entry?.icon;
      color = entry?.color;
      select.value = color?.startsWith("#") ? "custom" : color ?? "";
      custom.value = color?.startsWith("#") ? color : "#808080";
      custom.hidden = select.value !== "custom";
      updatePreview();
    };
    typeInput.oninput = loadType;
    typeInput.value = displayCalloutType(Object.keys(this.entries)[0] ?? "");
    loadType();
  }

  override onClose(): void { this.contentEl.empty(); }
}
