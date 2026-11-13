import { bundledRuntime } from "./bundled";
import { BUNDLED_VERSION, type MermaidRuntime, type MermaidSettings, type MermaidVersionChoice } from "./types";

export * from "./types";
export const REMOTE_MERMAID_ENABLED = false;

export function isMermaidVersionChoice(value: unknown): value is MermaidVersionChoice {
  return value === BUNDLED_VERSION;
}

/** Settings carried over from Full cannot enable remote code in Community. */
export function parseMermaidSettings(_record: Record<string, unknown>): MermaidSettings {
  return { mermaidVersion: BUNDLED_VERSION };
}

export async function loadMermaidRuntime(
  _choice: MermaidVersionChoice,
  _cachedLatest: string | undefined,
  _onLatestResolved: (version: string) => void,
): Promise<MermaidRuntime> {
  return bundledRuntime();
}
