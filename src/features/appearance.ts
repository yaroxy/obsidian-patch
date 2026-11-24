import { getIcon, sanitizeHTMLToDom, type Plugin } from "obsidian";
import { isValidCalloutType } from "./callout/model";
import { iconColorCss, parseIconColor, type IconColor } from "./icons/color";
import { parseIconId, svgUrl, type IconSettings } from "./icons/config";

export interface CalloutAppearance {
  icon?: string;
  color?: Exclude<IconColor, "text">;
}

export interface AppearanceSettings {
  calloutTypes: Record<string, CalloutAppearance>;
  tableCodeFont: string;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function parseAppearanceSettings(value: unknown): AppearanceSettings {
  const stored = record(value);
  const entries: [string, CalloutAppearance][] = [];
  for (const [key, value] of Object.entries(record(stored.calloutTypes))) {
    const type = key.trim().toLowerCase();
    if (!isValidCalloutType(type) || /\p{Cc}/u.test(type)) continue;
    const { icon, color } = record(value);
    const entry: CalloutAppearance = {};
    const brand = typeof icon === "string" && parseIconId(icon)?.source === "simple-icons";
    if (typeof icon === "string" && (brand || /^lucide-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(icon))) entry.icon = icon;
    const parsedColor = parseIconColor(color);
    if (parsedColor && parsedColor !== "text" && (parsedColor !== "brand" || brand)) entry.color = parsedColor;
    if (entry.icon || entry.color) entries.push([type, entry]);
  }
  const font = stored.tableCodeFont;
  return {
    calloutTypes: Object.fromEntries(entries),
    tableCodeFont: typeof font === "string" && !/\p{Cc}/u.test(font) ? font.trim() : "",
  };
}

/** Resolve stored brand IDs to inert CSS images for notes, type chips and completion. */
export function resolveAppearance(settings: AppearanceSettings, icons: IconSettings): AppearanceSettings {
  const calloutTypes = Object.fromEntries(Object.entries(settings.calloutTypes).map(([type, entry]): [string, CalloutAppearance] => {
    if (!entry.icon?.startsWith("simple-icons:")) return [type, entry];
    const svg = icons.svgs[entry.icon];
    const color = entry.color === "brand" ? parseIconColor(icons.brandColors[entry.icon]) : entry.color;
    return [type, { icon: svg ? svgUrl(svg) : undefined, color: color === "text" ? undefined : color }];
  }));
  return { ...settings, calloutTypes };
}

const FONT = "obsidian-patch-table-code-font";
const ICON = "obsidian-patch-callout-type-icon";
const BRAND = "obsidian-patch-callout-brand-image";
const COLOR = "obsidian-patch-callout-type-color";
const CALLOUT = ".callout[data-callout]";

/** Keep the theme's original declarations intact when preferences are changed or cleared. */
function setPreference(el: HTMLElement, name: string, value: string | undefined): void {
  el.toggleClass(name, !!value);
  if (value) el.style.setProperty("--" + name, value);
  else el.style.removeProperty("--" + name);
}

export function cssFontFamily(font: string): string {
  // A family name is a single CSS string token, including when it contains quotes or commas.
  return '"' + font.replace(/["\\]/g, "\\$&") + '"';
}

function setTableFont(body: HTMLElement, font: string): void {
  setPreference(body, FONT, font ? cssFontFamily(font) : undefined);
}

/** Obsidian's default icon may be a Lucide ID or an SVG supplied by a theme. */
function restoreThemeIcon(callout: HTMLElement, container: HTMLElement): void {
  const value = callout.win.getComputedStyle(callout).getPropertyValue("--callout-icon").trim().replace(/^(['"])(.*)\1$/, "$2");
  if (value.startsWith("<svg")) {
    const svg = sanitizeHTMLToDom(value).querySelector("svg");
    if (svg) {
      svg.setAttrs({ width: 16, height: 16, fill: "currentColor", stroke: "currentColor" });
      container.replaceChildren(svg);
    }
  } else {
    const svg = getIcon(value);
    container.replaceChildren(...(svg ? [svg] : []));
  }
}

/** Apply overrides to callouts rendered by Obsidian, including those in Live Preview and popouts. */
export function registerAppearance(plugin: Plugin, initial: AppearanceSettings): (settings: AppearanceSettings) => void {
  let settings = initial;
  const windows = new Map<Document, MutationObserver>();
  const icons = new WeakMap<HTMLElement, { id: string; svg: SVGSVGElement }>();
  const apply = (callout: HTMLElement, types: AppearanceSettings["calloutTypes"]): void => {
    if (callout.hasClass("obsidian-patch-callout-theme-probe")) return;
    const name = callout.dataset.callout?.toLowerCase();
    const entry = name && Object.prototype.hasOwnProperty.call(types, name) ? types[name] : undefined;
    const hadIcon = callout.hasClass(ICON);
    const hadColor = callout.hasClass(COLOR);
    if (!entry && !hadIcon && !hadColor && !callout.hasClass(BRAND)) return;
    setPreference(callout, COLOR, iconColorCss(entry?.color));
    const brand = entry?.icon?.startsWith("url(");
    const icon = brand ? undefined : entry?.icon;
    setPreference(callout, BRAND, brand ? entry?.icon : undefined);
    setPreference(callout, ICON, icon);
    if ((!hadIcon && !icon) || callout.getAttribute("data-callout-icon")) return;
    const container = callout.querySelector<HTMLElement>(":scope > .callout-title > .callout-icon");
    if (!container) return;
    const previous = icons.get(container);
    if (icon) {
      if (previous?.id === icon && previous.svg === container.firstElementChild) return;
      const svg = getIcon(icon);
      if (svg) {
        container.replaceChildren(svg);
        icons.set(container, { id: icon, svg });
      }
    } else {
      icons.delete(container);
      restoreThemeIcon(callout, container);
    }
  };
  const update = (doc: Document, observer: MutationObserver): void => {
    setTableFont(doc.body, settings.tableCodeFont);
    if (Object.keys(settings.calloutTypes).length) {
      observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-callout", "data-callout-icon"] });
    } else observer.disconnect();
    for (const callout of doc.querySelectorAll<HTMLElement>(CALLOUT)) apply(callout, settings.calloutTypes);
  };
  const attach = (doc: Document): void => {
    if (windows.has(doc) || !doc.defaultView) return;
    const observer = new doc.defaultView.MutationObserver(records => {
      const changed = new Set<HTMLElement>();
      for (const record of records) {
        const target = record.target as HTMLElement;
        const ancestor = target.closest<HTMLElement>(CALLOUT);
        if (ancestor) changed.add(ancestor);
        // A recycled widget can lose its old type before receiving its new one.
        if (record.type === "attributes" && (target.hasClass(ICON) || target.hasClass(COLOR) || target.hasClass(BRAND))) changed.add(target);
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          const added = node as HTMLElement;
          if (added.matches(CALLOUT)) changed.add(added);
          for (const callout of added.querySelectorAll<HTMLElement>(CALLOUT)) changed.add(callout);
        }
      }
      for (const callout of changed) if (doc.body.contains(callout)) apply(callout, settings.calloutTypes);
    });
    windows.set(doc, observer);
    update(doc, observer);
  };
  const detach = (doc: Document): void => {
    windows.get(doc)?.disconnect();
    windows.delete(doc);
    setTableFont(doc.body, "");
    for (const callout of doc.querySelectorAll<HTMLElement>(`.${ICON}, .${COLOR}, .${BRAND}`)) apply(callout, {});
  };
  attach(plugin.app.workspace.containerEl.ownerDocument);
  plugin.app.workspace.iterateAllLeaves(leaf => attach(leaf.view.containerEl.ownerDocument));
  plugin.registerEvent(plugin.app.workspace.on("window-open", (_container, win) => attach(win.document)));
  plugin.registerEvent(plugin.app.workspace.on("window-close", (_container, win) => detach(win.document)));
  plugin.register(() => { for (const doc of windows.keys()) detach(doc); });
  return next => {
    settings = next;
    for (const [doc, observer] of windows) update(doc, observer);
  };
}
