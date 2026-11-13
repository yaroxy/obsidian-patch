import { bundledRuntime } from "./bundled";
import { importMermaid, resolveLatestVersion } from "./remote";
import {
  BUNDLED_VERSION,
  isExactMermaidVersion,
  LATEST_VERSION,
  type MermaidRuntime,
  type MermaidSettings,
  type MermaidVersionChoice,
} from "./types";

export * from "./types";
export const REMOTE_MERMAID_ENABLED = true;

export function isMermaidVersionChoice(value: unknown): value is MermaidVersionChoice {
  return value === LATEST_VERSION || value === BUNDLED_VERSION || isExactMermaidVersion(value);
}

export function parseMermaidSettings(record: Record<string, unknown>): MermaidSettings {
  return {
    mermaidVersion: isMermaidVersionChoice(record.mermaidVersion) ? record.mermaidVersion : BUNDLED_VERSION,
    mermaidCachedLatest: isExactMermaidVersion(record.mermaidCachedLatest) ? record.mermaidCachedLatest : undefined,
  };
}

/** Remote failures fall back to the bundled copy, including offline startups. */
export async function loadMermaidRuntime(
  choice: MermaidVersionChoice,
  cachedLatest: string | undefined,
  onLatestResolved: (version: string) => void,
): Promise<MermaidRuntime> {
  if (choice === BUNDLED_VERSION || !isMermaidVersionChoice(choice)) {
    return bundledRuntime();
  }

  let version = choice;
  try {
    if (choice === LATEST_VERSION) {
      version = await resolveLatestVersion().catch((error: unknown) => {
        if (!isExactMermaidVersion(cachedLatest)) throw error;
        return cachedLatest;
      });
      onLatestResolved(version);
    }

    const mermaid = await importMermaid(version);
    return { mermaid, version, origin: "cdn" };
  } catch (error) {
    console.warn(`Patches: could not load Mermaid ${version} from jsDelivr`, error);
    return bundledRuntime(error instanceof Error ? error.message : String(error));
  }
}
