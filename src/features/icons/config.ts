/** `lucide:<name>` for Obsidian's built-in Lucide icons, or `simple-icons:<slug>`. */
export type IconId = string;
export type IconSource = "lucide" | "simple-icons";

export interface IconSettings {
  enabled: boolean;
  /** The icon of each file or folder, by vault path. */
  paths: Record<string, IconId>;
  /** SVG of each Simple Icons icon in use, so it displays offline and without loading the set. */
  svgs: Record<IconId, string>;
  /** The @iconify-json/simple-icons version that `latest` last resolved to. */
  cachedLatest?: string;
}

export interface IconizeImport {
  paths: Record<string, IconId>;
  /** Emoji, icons from other packs, and Lucide icons this Obsidian version lacks. */
  skipped: Array<{ path: string; icon: string }>;
}

export const DEFAULT_ICON_SETTINGS: IconSettings = { enabled: true, paths: {}, svgs: {} };

export function parseIconSettings(data: unknown): IconSettings {
  const value = isRecord(data) ? data : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_ICON_SETTINGS.enabled,
    paths: stringEntries(value.paths, (path, id) => path !== "" && parseIconId(id) !== undefined),
    svgs: stringEntries(value.svgs, (id, svg) => parseIconId(id)?.source === "simple-icons" && svg.startsWith("<svg")),
    cachedLatest: typeof value.cachedLatest === "string" ? value.cachedLatest : undefined,
  };
}

export function parseIconId(id: string): { source: IconSource; name: string } | undefined {
  const match = /^(lucide|simple-icons):([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(id);
  return match ? { source: match[1] as IconSource, name: match[2]! } : undefined;
}

/** Iconize's name for an icon: `calendar-days` becomes `CalendarDays`. */
export function iconizeName(name: string): string {
  return name.split(/[ _-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

/**
 * Converts Iconize's data.json, which stores `LiCalendarDays` or
 * `{ iconName: "LiCalendarDays" }` per path, the prefix naming the icon pack.
 * `lucideNames` maps Iconize's Lucide names back to Lucide names, because
 * `Building2` alone cannot tell `building-2` from `building2`.
 */
export function convertIconize(data: unknown, lucideNames: ReadonlyMap<string, string>): IconizeImport {
  const result: IconizeImport = { paths: {}, skipped: [] };
  if (!isRecord(data)) return result;
  for (const [path, value] of Object.entries(data)) {
    const icon = typeof value === "string" ? value : isRecord(value) ? value.iconName : undefined;
    if (path === "settings" || typeof icon !== "string" || icon === "") continue;
    const id = iconizeIconId(icon, lucideNames);
    if (id !== undefined) result.paths[path] = id;
    else result.skipped.push({ path, icon });
  }
  return result;
}

/** Moves the icons of a renamed file or folder, including a folder's descendants. */
export function renameIconPaths(
  paths: Readonly<Record<string, IconId>>,
  oldPath: string,
  newPath: string,
): Record<string, IconId> | undefined {
  const kept: Record<string, IconId> = {};
  const moved: Record<string, IconId> = {};
  for (const [path, id] of Object.entries(paths)) {
    if (path === oldPath) moved[newPath] = id;
    else if (path.startsWith(`${oldPath}/`)) moved[newPath + path.slice(oldPath.length)] = id;
    else kept[path] = id;
  }
  // A moved icon replaces one left behind at its new path by a deleted file.
  return Object.keys(moved).length > 0 ? { ...kept, ...moved } : undefined;
}

export function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function iconizeIconId(icon: string, lucideNames: ReadonlyMap<string, string>): IconId | undefined {
  // Iconize ends the pack prefix before the next capital letter or digit.
  const split = icon.slice(1).search(/[A-Z0-9]/) + 1;
  if (split === 0) return undefined;
  const prefix = icon.slice(0, split);
  const name = icon.slice(split);
  if (prefix === "Li") {
    const lucide = lucideNames.get(name);
    return lucide === undefined ? undefined : `lucide:${lucide}`;
  }
  // Simple Icons slugs are lowercase letters and digits; Iconize capitalizes the first.
  return prefix === "Si" && /^[A-Za-z0-9]+$/.test(name) ? `simple-icons:${name.toLowerCase()}` : undefined;
}

function stringEntries(data: unknown, keep: (key: string, value: string) => boolean): Record<string, string> {
  const entries: Record<string, string> = {};
  if (!isRecord(data)) return entries;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && keep(key, value)) entries[key] = value;
  }
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
