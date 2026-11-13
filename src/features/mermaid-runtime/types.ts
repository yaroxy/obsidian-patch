import type bundledMermaid from "mermaid";

export type Mermaid = typeof bundledMermaid;

/** `bundled`, or (in the full build) `latest` or an exact supported version. */
export type MermaidVersionChoice = string;

export const LATEST_VERSION = "latest";
export const BUNDLED_VERSION = "bundled";
export const BUNDLED_MERMAID_VERSION = __BUNDLED_MERMAID_VERSION__;

export interface MermaidRuntime {
  mermaid: Mermaid;
  version: string;
  origin: "cdn" | "bundled";
  /** Why the bundled copy is used although a remote version was chosen. */
  fallbackReason?: string;
}

export interface MermaidSettings {
  mermaidVersion: MermaidVersionChoice;
  mermaidCachedLatest?: string;
}

/** Icon packs and layout loaders first shipped in Mermaid 11. */
export function isExactMermaidVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value) && majorOf(value) >= 11;
}

export function majorOf(version: string): number {
  return Number.parseInt(version, 10);
}
