import type { Plugin } from "obsidian";

export const DEFAULT_ACTIVE_LINE_ENABLED = true;

const BODY_CLASS = "obsidian-patch-active-line";

export function registerActiveLine(
  plugin: Plugin,
  enabled: boolean,
): (enabled: boolean) => void {
  plugin.register(() => document.body.classList.remove(BODY_CLASS));
  applyActiveLine(enabled);
  return applyActiveLine;
}

function applyActiveLine(enabled: boolean): void {
  document.body.classList.toggle(BODY_CLASS, enabled);
}
