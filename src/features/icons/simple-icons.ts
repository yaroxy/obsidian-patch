/**
 * Simple Icons come from Iconify's JSON package of the set, which follows each
 * Simple Icons release. It is data, so loading it never runs remote code.
 */
const PACKAGE = "@iconify-json/simple-icons";
const PACKAGE_API_URL = `https://data.jsdelivr.com/v1/packages/npm/${PACKAGE}/resolved?specifier=latest`;
const CDN_URL = `https://cdn.jsdelivr.net/npm/${PACKAGE}`;
const LOAD_TIMEOUT_MS = 30_000;

export interface SimpleIconSet {
  /** The Simple Icons release, such as 16.36.0. */
  version: string;
  /** The @iconify-json/simple-icons release that packages it. */
  packageVersion: string;
  /** Slugs offered in the picker, without deprecated icons and aliases. */
  names: string[];
  svg(name: string): string | undefined;
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
 * Loads the newest set from jsDelivr. The versioned file is cached by the
 * browser, so `cachedLatest`, the version `latest` last resolved to, usually
 * still loads when the version lookup itself fails offline.
 */
export async function loadSimpleIcons(
  cachedLatest: string | undefined,
  onLatestResolved: (packageVersion: string) => void,
): Promise<SimpleIconSet> {
  const packageVersion = await resolveLatestVersion().catch((error: unknown) => {
    if (cachedLatest === undefined) throw error;
    return cachedLatest;
  });
  onLatestResolved(packageVersion);
  const [icons, info] = await Promise.all([
    fetchJson(`${CDN_URL}@${packageVersion}/icons.json`),
    fetchJson(`${CDN_URL}@${packageVersion}/info.json`).catch(() => undefined),
  ]);
  const version = isRecord(info) && typeof info.version === "string" ? info.version : packageVersion;
  return parseIconifySet(icons, version, packageVersion);
}

export function parseIconifySet(json: unknown, version: string, packageVersion: string): SimpleIconSet {
  if (!isRecord(json) || !isRecord(json.icons)) throw new Error("jsDelivr returned an invalid icon set");
  const icons = new Map<string, IconifyIcon>();
  for (const [name, icon] of Object.entries(json.icons)) {
    if (isRecord(icon) && typeof icon.body === "string") icons.set(name, icon as unknown as IconifyIcon);
  }
  const aliases = new Map<string, string>();
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
    names: [...icons].filter(([, icon]) => icon.hidden !== true).map(([name]) => name).sort(),
    svg(name) {
      const icon = icons.get(name) ?? icons.get(aliases.get(name) ?? "");
      if (icon === undefined) return undefined;
      const viewBox = [size("left", icon, 0), size("top", icon, 0), size("width", icon, 16), size("height", icon, 16)];
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(" ")}">${icon.body}</svg>`;
    },
  };
}

async function resolveLatestVersion(): Promise<string> {
  const { version } = (await fetchJson(PACKAGE_API_URL)) as { version?: unknown };
  if (typeof version !== "string") throw new Error("jsDelivr did not resolve the latest Simple Icons version");
  return version;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return await response.json();
  } catch (error) {
    throw controller.signal.aborted ? new Error(`Timed out after ${LOAD_TIMEOUT_MS / 1000} seconds`) : error;
  } finally {
    window.clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
