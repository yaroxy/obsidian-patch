import type bundledMermaid from "mermaid";

export type Mermaid = typeof bundledMermaid;

/** Persisted choices are normalized to `bundled` by the Community runtime. */
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
