import type bundledElkLayouts from "@mermaid-js/layout-elk";
import { requestUrl } from "obsidian";
import { isExactMermaidVersion, majorOf, type Mermaid } from "./types";

type LayoutLoaders = typeof bundledElkLayouts;
const CDN_URL = "https://cdn.jsdelivr.net/npm";
const PACKAGE_API_URL = "https://data.jsdelivr.com/v1/packages/npm/mermaid";
const LOAD_TIMEOUT_MS = 15_000;

/** Each layout-elk major line declares a peer dependency on one Mermaid major. */
const ELK_RANGE_BY_MERMAID_MAJOR: Record<number, string> = { 11: "0.2", 12: "1" };

/** The ES2021 build preserves native URL imports, including in CommonJS output. */
const importModule = (url: string): Promise<{ default: unknown }> => import(url);

export async function resolveLatestVersion(): Promise<string> {
  const response = await withTimeout(requestUrl(`${PACKAGE_API_URL}/resolved?specifier=latest`));
  const { version } = response.json as { version?: unknown };
  if (!isExactMermaidVersion(version)) throw new Error("jsDelivr did not resolve a supported Mermaid version");
  return version;
}

export async function importMermaid(version: string): Promise<Mermaid> {
  if (!isExactMermaidVersion(version)) throw new Error("Unsupported Mermaid version");
  const module = await withTimeout(importModule(`${CDN_URL}/mermaid@${version}/dist/mermaid.esm.min.mjs`));
  const mermaid = module.default as Mermaid;

  // ELK is optional: without it only diagrams requesting this layout fail.
  const elkRange = ELK_RANGE_BY_MERMAID_MAJOR[majorOf(version)] ?? "latest";
  try {
    const elk = await withTimeout(importModule(`${CDN_URL}/@mermaid-js/layout-elk@${elkRange}/dist/mermaid-layout-elk.esm.min.mjs`));
    mermaid.registerLayoutLoaders(elk.default as LayoutLoaders);
  } catch (error) {
    console.warn(`Patches: could not load the ELK layout for Mermaid ${version}`, error);
  }
  return mermaid;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Timed out after ${LOAD_TIMEOUT_MS / 1000} seconds`)), LOAD_TIMEOUT_MS);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}
