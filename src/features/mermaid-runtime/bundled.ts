import bundledMermaid from "mermaid";
import { BUNDLED_MERMAID_VERSION, type MermaidRuntime } from "./types";

export function bundledRuntime(fallbackReason?: string): MermaidRuntime {
  return {
    mermaid: bundledMermaid,
    version: BUNDLED_MERMAID_VERSION,
    origin: "bundled",
    fallbackReason,
  };
}
