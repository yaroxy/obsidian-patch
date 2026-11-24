import { ICON_PALETTE, parseIconColor, type IconColor } from "./color";

/** Shared by explorer icons and per-type callout appearance. */
export class IconColorControls {
  private readonly buttons = new Map<IconColor | undefined, HTMLButtonElement>();
  private readonly brand: HTMLButtonElement;
  private readonly custom: HTMLInputElement;

  constructor(host: HTMLElement, label: string, inheritLabel: string, mixed: boolean, onChange: (color?: IconColor) => void) {
    const colors = host.createDiv({ cls: "obsidian-patch-icon-colors", attr: { role: "group", "aria-label": label } });
    const add = (value: IconColor | undefined, name: string): HTMLButtonElement => {
      const button = colors.createEl("button", { text: name, attr: { type: "button", "aria-pressed": "false" } });
      button.onclick = () => onChange(value);
      this.buttons.set(value, button);
      return button;
    };
    if (mixed) add(undefined, "Keep colors");
    add("text", inheritLabel);
    this.brand = add("brand", "Brand color");
    for (const color of ICON_PALETTE) {
      const name = color[0]!.toUpperCase() + color.slice(1);
      const button = add(color, "");
      button.setAttrs({ "aria-label": name, title: name });
      button.addClass("obsidian-patch-icon-swatch");
      button.style.setProperty("--obsidian-patch-icon-swatch", `var(--color-${color})`);
    }
    const custom = host.createEl("label", { cls: "obsidian-patch-icon-custom", text: "Custom color" });
    this.custom = custom.createEl("input", { type: "color", attr: { "aria-label": "Custom " + label.toLowerCase() } });
    this.custom.oninput = () => onChange(parseIconColor(this.custom.value));
  }

  update(color: IconColor | undefined, brandColor?: string): void {
    this.brand.disabled = !brandColor;
    for (const [value, button] of this.buttons) button.setAttribute("aria-pressed", String(value === color));
    this.custom.value = color?.startsWith("#") ? color : "#808080";
  }
}
