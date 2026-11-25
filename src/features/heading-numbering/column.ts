import type { NumberedHeading } from "./model";

export const columnProperty = "--obsidian-patch-heading-number-width";
export const numberedLineClass = "obsidian-patch-heading-number-line";

/** Measure complete prefixes with the vault's text face, including kerning and fallback fonts. */
export function numberColumn(host: HTMLElement, headings: Iterable<NumberedHeading>): string {
  const doc = host.ownerDocument;
  const style = doc.defaultView!.getComputedStyle(host.isConnected ? host : doc.body);
  const family = style.getPropertyValue("--font-text").trim() || style.fontFamily;
  const context = doc.defaultView!.createEl("canvas").getContext("2d");
  if (context) context.font = "100px " + family;
  let widest = 0;
  for (const { prefix, handwritten } of headings) {
    if (!handwritten) widest = Math.max(widest, context ? context.measureText(prefix).width / 100 : prefix.length);
  }
  return `calc(var(--font-text-size, 1rem) * ${Math.ceil(widest * 100) / 100})`;
}
