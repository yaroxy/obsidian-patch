export const ICON_PALETTE = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"] as const;
export type IconColor = "text" | "brand" | typeof ICON_PALETTE[number] | `#${string}`;

export function parseIconColor(value: unknown): IconColor | undefined {
  if (value === "text" || value === "brand" || ICON_PALETTE.some(color => color === value)) return value as IconColor;
  if (typeof value !== "string") return undefined;
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase() as IconColor;
  if (/^#[0-9a-f]{3}$/i.test(hex)) return `#${[...hex.slice(1)].map(char => char + char).join("").toUpperCase()}`;
  return undefined;
}

/** Undefined inherits the existing text/snippet color rather than overriding it. */
export function iconColorCss(color: IconColor | undefined, brandColor?: string): string | undefined {
  if (color === undefined || color === "text") return undefined;
  if (color === "brand") return brandColor;
  return color.startsWith("#") ? color : `var(--color-${color})`;
}
