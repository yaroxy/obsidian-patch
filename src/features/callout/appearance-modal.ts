import { AbstractInputSuggest, Modal, Notice, Setting, type App } from "obsidian";
import type { CalloutAppearance } from "../appearance";
import { iconColorCss } from "../icons/color";
import { IconColorControls } from "../icons/color-controls";
import { svgUrl, type IconSettings } from "../icons/config";
import { type IconChoice } from "../icons/picker";
import { makeResizable } from "../../ui/resizable-modal";
import { displayCalloutType, isValidCalloutType } from "./model";
import { discoverCalloutTypes, renderChipIcon } from "./types";

class AppearanceTypeSuggest extends AbstractInputSuggest<string> {
  constructor(app: App, private readonly input: HTMLInputElement, private readonly names: string[]) {
    super(app, input);
  }
  protected override getSuggestions(query: string): string[] {
    const text = query.trim().toLowerCase();
    return this.names.filter(name => name.toLowerCase().includes(text));
  }
  override renderSuggestion(name: string, el: HTMLElement): void {
    el.addClass("obsidian-patch-callout-type-option");
    el.setText(displayCalloutType(name));
  }
  override selectSuggestion(name: string): void {
    this.input.value = displayCalloutType(name);
    this.input.dispatchEvent(new this.input.ownerDocument.defaultView!.Event("input", { bubbles: true }));
    this.close();
  }
}

export class CalloutAppearanceModal extends Modal {
  private typeSuggest?: AppearanceTypeSuggest;

  constructor(app: App, private readonly calloutTypes: Record<string, CalloutAppearance>, private readonly icons: IconSettings,
    private readonly chooseIcon: (select: (choice: IconChoice) => void) => void,
    private readonly saveEntry: (type: string, entry: CalloutAppearance, choice?: IconChoice) => Promise<void>) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle("Callout appearance");
    this.modalEl.addClass("obsidian-patch-callout-appearance");
    makeResizable(this, "obsidian-patch-callout-appearance-size");
    const host = this.contentEl;
    const { calloutTypes } = this;
    const types = discoverCalloutTypes(host.ownerDocument, calloutTypes, true);
    const known = new Map(types.map(type => [type.name.toLowerCase(), type]));
    const typeRow = new Setting(host).setName("Callout type").setDesc("Choose a type or enter a new name.");
    const typeInput = typeRow.controlEl.createEl("input", { type: "text", cls: "obsidian-patch-callout-type-input", attr: { "aria-label": "Callout type", placeholder: "RESEARCH" } });
    this.typeSuggest = new AppearanceTypeSuggest(this.app, typeInput, types.map(type => type.name));
    const typeName = (): string => typeInput.value.trim().toLowerCase();

    const draftPreview = host.createDiv({ cls: "obsidian-patch-callout-appearance-preview" });
    const previewIcon = draftPreview.createSpan();
    const previewLabel = draftPreview.createSpan();
    const iconRow = new Setting(host).setName("Icon");
    let choice: IconChoice | undefined;
    let icon: string | undefined;
    let color: CalloutAppearance["color"];
    const updatePreview = (): void => {
      const current = known.get(typeName()) ?? known.get("note");
      const svg = icon?.startsWith("simple-icons:") ? choice?.svg() ?? this.icons.svgs[icon] : undefined;
      const brand = icon ? choice?.brandColor ?? this.icons.brandColors[icon] : undefined;
      previewIcon.empty();
      renderChipIcon(previewIcon, svg ? svgUrl(svg) : (icon?.startsWith("lucide-") ? icon : current?.icon ?? ""));
      draftPreview.style.color = iconColorCss(color, brand) ?? current?.color ?? "";
      previewLabel.setText(displayCalloutType(typeInput.value.trim()) || "Callout");
      palette.update(color ?? "text", brand);
      apply.disabled = !isValidCalloutType(typeName());
    };
    iconRow.addButton(button => button.setButtonText("Choose icon").onClick(() => {
      this.typeSuggest?.close();
      this.chooseIcon(selected => {
        choice = selected;
        icon = choice.source === "lucide" ? "lucide-" + choice.name : choice.id;
        if (color === "brand" && !choice.brandColor) color = undefined;
        updatePreview();
      });
    }));
    iconRow.addButton(button => button.setButtonText("Use theme icon").onClick(() => {
      icon = undefined;
      choice = undefined;
      if (color === "brand") color = undefined;
      updatePreview();
    }));
    const colorRow = new Setting(host).setName("Color");
    const palette = new IconColorControls(colorRow.controlEl.createDiv(), "Callout color", "Use theme color", false, next => {
      color = next === "text" ? undefined : next;
      updatePreview();
    });

    const actions = this.modalEl.createDiv({ cls: "modal-button-container" });
    actions.createEl("button", { text: "Cancel" }).onclick = () => this.close();
    const apply = actions.createEl("button", { text: "Apply", cls: "mod-cta" });
    apply.onclick = async () => {
      if (apply.disabled) return;
      this.modalEl.inert = true;
      apply.disabled = true;
      try {
        await this.saveEntry(typeName(), { icon, color }, choice);
        this.close();
      } catch (error) {
        this.modalEl.inert = false;
        new Notice(`Could not save the callout appearance: ${String(error)}`);
        updatePreview();
      }
    };
    const loadType = (): void => {
      const key = typeName();
      const entry = Object.prototype.hasOwnProperty.call(calloutTypes, key) ? calloutTypes[key] : undefined;
      icon = entry?.icon;
      color = entry?.color;
      choice = undefined;
      updatePreview();
    };
    typeInput.oninput = loadType;
    typeInput.value = displayCalloutType(Object.keys(calloutTypes)[0] ?? "");
    loadType();
  }

  override onClose(): void { this.typeSuggest?.close(); this.contentEl.empty(); }
}
