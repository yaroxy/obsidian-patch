import type { DataAdapter } from "obsidian";
import { downloadIconData } from "./download";

/**
 * Simple Icons come from Iconify's JSON package of the set, which follows each
 * Simple Icons release. It is data, so loading it never runs remote code.
 */
const PACKAGE = "@iconify-json/simple-icons";
const PACKAGE_API_URL = `https://data.jsdelivr.com/v1/packages/npm/${PACKAGE}/resolved?specifier=latest`;
const CDN_URL = `https://cdn.jsdelivr.net/npm/${PACKAGE}`;

export interface SimpleIconSet {
  /** The Simple Icons release, such as 16.36.0. */
  version: string;
  /** The @iconify-json/simple-icons release that packages it. */
  packageVersion: string;
  /** Slugs offered in the picker, without deprecated icons and aliases. */
  names: string[];
  svg(name: string): string | undefined;
  color(name: string): string | undefined;
  data: { icons: unknown; metadata?: unknown; version: string; packageVersion: string };
}

interface IconifyIcon {
  body: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  hidden?: boolean;
}

/**
 * Loads the newest set from jsDelivr, using the last resolved package version
 * if only the latest-version lookup fails. Icons already in use are saved by
 * the caller and remain available without a network request.
 */
export async function loadSimpleIcons(
  cachedLatest: string | undefined,
  onLatestResolved?: (packageVersion: string) => void,
): Promise<SimpleIconSet> {
  const packageVersion = await resolveLatestVersion().catch((error: unknown) => {
    if (cachedLatest === undefined) throw error;
    return cachedLatest;
  });
  onLatestResolved?.(packageVersion);
  const [icons, info] = await Promise.all([
    fetchJson(`${CDN_URL}@${packageVersion}/icons.json`),
    fetchJson(`${CDN_URL}@${packageVersion}/info.json`).catch(() => undefined),
  ]);
  const version = isRecord(info) && typeof info.version === "string" ? info.version : packageVersion;
  // Color metadata is data from the same upstream release, never a remote JS import.
  const metadata = isRecord(info) && typeof info.version === "string" && /^\d+\.\d+\.\d+$/.test(info.version)
    ? await fetchJson(`https://cdn.jsdelivr.net/npm/simple-icons@${info.version}/data/simple-icons.json`).catch(() => undefined)
    : undefined;
  return parseIconifySet(icons, version, packageVersion, metadata);
}

export function parseIconifySet(json: unknown, version: string, packageVersion: string, metadata?: unknown): SimpleIconSet {
  if (!isRecord(json) || !isRecord(json.icons)) throw new Error("jsDelivr returned an invalid icon set");
  const icons = new Map<string, IconifyIcon>();
  for (const [name, icon] of Object.entries(json.icons)) {
    if (isRecord(icon) && typeof icon.body === "string") icons.set(name, icon as unknown as IconifyIcon);
  }
  const aliases = new Map<string, string>();
  const colors = new Map<string, string>();
  if (Array.isArray(metadata)) {
    for (const item of metadata) {
      if (!isRecord(item) || typeof item.title !== "string" || typeof item.hex !== "string" || !/^[0-9a-f]{6}$/i.test(item.hex)) continue;
      const slug = typeof item.slug === "string" ? item.slug : brandSlug(item.title);
      colors.set(slug, `#${item.hex.toUpperCase()}`);
    }
  }
  for (const [name, alias] of Object.entries(isRecord(json.aliases) ? json.aliases : {})) {
    if (isRecord(alias) && typeof alias.parent === "string") aliases.set(name, alias.parent);
  }
  const size = (key: "left" | "top" | "width" | "height", icon: IconifyIcon, fallback: number): number => {
    const value = icon[key] ?? json[key];
    return typeof value === "number" ? value : fallback;
  };
  return {
    version,
    packageVersion,
    data: { icons: json, metadata, version, packageVersion },
    names: [...icons].filter(([, icon]) => icon.hidden !== true).map(([name]) => name).sort(),
    color: name => colors.get(aliases.get(name) ?? name),
    svg(name) {
      const icon = icons.get(name) ?? icons.get(aliases.get(name) ?? "");
      if (icon === undefined) return undefined;
      const viewBox = [size("left", icon, 0), size("top", icon, 0), size("width", icon, 16), size("height", icon, 16)];
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(" ")}">${icon.body}</svg>`;
    },
  };
}

/** Keep the previous catalog until the new compressed file and its settings pointer are saved. */
export async function writeSimpleIconPack(adapter: DataAdapter, path: string, set: SimpleIconSet): Promise<void> {
  const stream = new Blob([JSON.stringify(set.data)]).stream().pipeThrough(new CompressionStream("gzip"));
  await adapter.writeBinary(path, await new Response(stream).arrayBuffer());
}

export async function readSimpleIconPack(adapter: DataAdapter, path: string): Promise<SimpleIconSet> {
  const stream = new Blob([await adapter.readBinary(path)]).stream().pipeThrough(new DecompressionStream("gzip"));
  const data: unknown = await new Response(stream).json();
  if (!isRecord(data) || typeof data.version !== "string" || typeof data.packageVersion !== "string") {
    throw new Error("Invalid installed Simple Icons catalog. Select Update to replace it.");
  }
  return parseIconifySet(data.icons, data.version, data.packageVersion, data.metadata);
}

// Simple Icons' title-to-slug convention (CC0): explicit slugs take precedence.
// https://github.com/simple-icons/simple-icons/blob/develop/sdk.mjs
function brandSlug(title: string): string {
  const replacements: Record<string, string> = { "+": "plus", ".": "dot", "&": "and", "đ": "d", "ħ": "h", "ı": "i", "ĸ": "k", "ŀ": "l", "ł": "l", "ß": "ss", "ŧ": "t", "ø": "o" };
  return title.toLowerCase().replace(/[+.&đħıĸŀłßŧø]/g, char => replacements[char]!).normalize("NFD").replace(/[^a-z\d]/g, "");
}

async function resolveLatestVersion(): Promise<string> {
  const response = await fetchJson(PACKAGE_API_URL);
  if (!isRecord(response) || typeof response.version !== "string" || !/^\d+\.\d+\.\d+$/.test(response.version)) {
    throw new Error("jsDelivr did not resolve the latest Simple Icons version");
  }
  return response.version;
}

async function fetchJson(url: string): Promise<unknown> {
  return JSON.parse((await downloadIconData(url)).text) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
