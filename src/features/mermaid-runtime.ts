import bundledElkLayouts from "@mermaid-js/layout-elk";
import bundledMermaid from "mermaid";
import { requestUrl } from "obsidian";

export type Mermaid = typeof bundledMermaid;
type LayoutLoaders = typeof bundledElkLayouts;

/** `latest`, `bundled`, or an exact Mermaid version such as `12.1.0`. */
export type MermaidVersionChoice = string;

export const LATEST_VERSION: MermaidVersionChoice = "latest";
export const BUNDLED_VERSION: MermaidVersionChoice = "bundled";
export const BUNDLED_MERMAID_VERSION = __BUNDLED_MERMAID_VERSION__;

/** registerIconPacks and registerLayoutLoaders first shipped in Mermaid 11. */
const MIN_SUPPORTED_MAJOR = 11;

const CDN_URL = "https://cdn.jsdelivr.net/npm";
const PACKAGE_API_URL = "https://data.jsdelivr.com/v1/packages/npm/mermaid";
const LOAD_TIMEOUT_MS = 15_000;

/**
 * Each layout-elk major line declares a peer dependency on one Mermaid major.
 * A Mermaid major that is newer than this table uses the newest layout-elk.
 */
const ELK_RANGE_BY_MERMAID_MAJOR: Record<number, string> = {
  11: "0.2",
  12: "1",
};

export interface MermaidRuntime {
  mermaid: Mermaid;
  version: string;
  origin: "cdn" | "bundled";
  /** Why the bundled copy is used although a remote version was chosen. */
  fallbackReason?: string;
}

/**
 * esbuild turns `import()` into `require()` for CommonJS output, which cannot
 * load a URL. Building the call at runtime keeps a native ES module import.
 */
const importModule = new Function("url", "return import(url)") as (
  url: string,
) => Promise<{ default: unknown }>;

/**
 * Loads the chosen Mermaid version. Remote versions come from jsDelivr, and
 * any failure falls back to the bundled copy so diagrams still render offline.
 * `cachedLatest` is the last version that `latest` resolved to; the browser
 * usually still has it cached when the version lookup itself fails.
 */
export async function loadMermaidRuntime(
  choice: MermaidVersionChoice,
  cachedLatest: string | undefined,
  onLatestResolved: (version: string) => void,
): Promise<MermaidRuntime> {
  if (choice === BUNDLED_VERSION) {
    return bundledRuntime();
  }

  let version = choice;
  try {
    if (choice === LATEST_VERSION) {
      version = await resolveLatestVersion().catch((error: unknown) => {
        if (cachedLatest === undefined) {
          throw error;
        }
        return cachedLatest;
      });
      onLatestResolved(version);
    }

    const mermaid = await importMermaid(version);
    return { mermaid, version, origin: "cdn" };
  } catch (error) {
    console.warn(`Obsidian Patch: could not load Mermaid ${version} from jsDelivr`, error);
    return bundledRuntime(describeError(error));
  }
}

export function isMermaidVersionChoice(value: unknown): value is MermaidVersionChoice {
  return (
    value === LATEST_VERSION ||
    value === BUNDLED_VERSION ||
    (typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value) && majorOf(value) >= MIN_SUPPORTED_MAJOR)
  );
}

function bundledRuntime(fallbackReason?: string): MermaidRuntime {
  bundledMermaid.registerLayoutLoaders(bundledElkLayouts);
  return {
    mermaid: bundledMermaid,
    version: BUNDLED_MERMAID_VERSION,
    origin: "bundled",
    fallbackReason,
  };
}

async function resolveLatestVersion(): Promise<string> {
  const response = await withTimeout(
    requestUrl(`${PACKAGE_API_URL}/resolved?specifier=latest`),
  );
  const { version } = response.json as { version?: unknown };

  if (typeof version !== "string") {
    throw new Error("jsDelivr did not resolve the latest Mermaid version");
  }
  return version;
}

async function importMermaid(version: string): Promise<Mermaid> {
  const module = await withTimeout(
    importModule(`${CDN_URL}/mermaid@${version}/dist/mermaid.esm.min.mjs`),
  );
  const mermaid = module.default as Mermaid;

  // ELK is optional: without it only diagrams that ask for the ELK layout fail.
  const elkRange = ELK_RANGE_BY_MERMAID_MAJOR[majorOf(version)] ?? "latest";
  try {
    const elk = await withTimeout(
      importModule(`${CDN_URL}/@mermaid-js/layout-elk@${elkRange}/dist/mermaid-layout-elk.esm.min.mjs`),
    );
    mermaid.registerLayoutLoaders(elk.default as LayoutLoaders);
  } catch (error) {
    console.warn(`Obsidian Patch: could not load the ELK layout for Mermaid ${version}`, error);
  }

  return mermaid;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`Timed out after ${LOAD_TIMEOUT_MS / 1000} seconds`)),
      LOAD_TIMEOUT_MS,
    );
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

function majorOf(version: string): number {
  return Number.parseInt(version, 10);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
