import { Plugin } from "obsidian";
import { registerMermaidLatest } from "./features/mermaid-latest";

export default class ObsidianPatchPlugin extends Plugin {
  override onload(): void {
    registerMermaidLatest(this);
  }
}
