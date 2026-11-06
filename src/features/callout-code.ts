import type { Plugin } from "obsidian";

export const DEFAULT_CALLOUT_CODE_ENABLED = true;

const BODY_CLASS = "obsidian-patch-callout-code";

export function registerCalloutCode(
  plugin: Plugin,
  enabled: boolean,
): (enabled: boolean) => void {
  plugin.register(() => document.body.classList.remove(BODY_CLASS));
  applyCalloutCode(enabled);
  return applyCalloutCode;
}

function applyCalloutCode(enabled: boolean): void {
  document.body.classList.toggle(BODY_CLASS, enabled);
}
