import type { Plugin } from "obsidian";

export interface InlineStyleSettings {
  bold: boolean;
  italic: boolean;
  inlineCode: boolean;
}

export const DEFAULT_INLINE_STYLE_SETTINGS: InlineStyleSettings = {
  bold: true,
  italic: true,
  inlineCode: true,
};

/** Each style is a body class that styles.css keys its selectors off. */
const BODY_CLASSES: Record<keyof InlineStyleSettings, string> = {
  bold: "obsidian-patch-bold",
  italic: "obsidian-patch-italic",
  inlineCode: "obsidian-patch-inline-code",
};

export function registerInlineStyles(
  plugin: Plugin,
  settings: InlineStyleSettings,
): (settings: InlineStyleSettings) => void {
  plugin.register(clearInlineStyles);
  applyInlineStyles(settings);
  return applyInlineStyles;
}

export function parseInlineStyleSettings(data: unknown): InlineStyleSettings {
  const record: Record<string, unknown> =
    typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};

  return {
    bold: parseEnabled(record.bold, DEFAULT_INLINE_STYLE_SETTINGS.bold),
    italic: parseEnabled(record.italic, DEFAULT_INLINE_STYLE_SETTINGS.italic),
    inlineCode: parseEnabled(record.inlineCode, DEFAULT_INLINE_STYLE_SETTINGS.inlineCode),
  };
}

function applyInlineStyles(settings: InlineStyleSettings): void {
  const { classList } = document.body;

  for (const [style, bodyClass] of Object.entries(BODY_CLASSES)) {
    classList.toggle(bodyClass, settings[style as keyof InlineStyleSettings]);
  }
}

function clearInlineStyles(): void {
  for (const bodyClass of Object.values(BODY_CLASSES)) {
    document.body.classList.remove(bodyClass);
  }
}

function parseEnabled(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
