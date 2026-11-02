import { MarkdownView, type Plugin } from "obsidian";
import { type BannerSettings } from "./banner/config";
import { registerBannerCovers } from "./banner/cover";
import { bannerActions } from "./banner/picker";

export { DEFAULT_BANNER_WIDTH_PERCENT, parseBannerSettings, type BannerSettings } from "./banner/config";

export function registerBanner(plugin: Plugin, initial: BannerSettings): (settings: BannerSettings) => void {
  let settings = initial;
  const getSettings = (): BannerSettings => settings;
  const refresh = registerBannerCovers(plugin, getSettings);
  // Coalesce link-indexing and vault events; dispatch outside an editor update.
  let timer: number | undefined;
  const scheduleRefresh = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => { timer = undefined; refresh(); }, 50);
  };
  plugin.registerEvent(plugin.app.metadataCache.on("changed", scheduleRefresh));
  plugin.registerEvent(plugin.app.metadataCache.on("resolve", scheduleRefresh));
  plugin.registerEvent(plugin.app.vault.on("create", scheduleRefresh));
  plugin.registerEvent(plugin.app.vault.on("modify", scheduleRefresh));
  plugin.registerEvent(plugin.app.vault.on("delete", scheduleRefresh));
  plugin.registerEvent(plugin.app.vault.on("rename", scheduleRefresh));
  plugin.register(() => { if (timer !== undefined) window.clearTimeout(timer); });
  for (const [id, name, action] of [
    ["select-banner", "Select cover", "select"],
    ["remove-banner", "Remove cover", "remove"],
  ] as const) {
    plugin.addCommand({ id, name, checkCallback: (checking) => {
      const note = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file;
      if (!note || !settings.enabled) return false;
      if (!checking) bannerActions(plugin.app, note)[action]();
      return true;
    } });
  }
  plugin.registerEvent(plugin.app.workspace.on("layout-change", scheduleRefresh));
  plugin.registerEvent(plugin.app.workspace.on("file-open", scheduleRefresh));
  plugin.app.workspace.onLayoutReady(scheduleRefresh);
  return (next) => { settings = next; scheduleRefresh(); };
}
