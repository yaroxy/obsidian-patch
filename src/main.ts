import { MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
  registerMermaidLatest,
  type MermaidSecurityLevel,
} from "./features/mermaid-latest";

interface ObsidianPatchSettings {
  mermaidSecurityLevel: MermaidSecurityLevel;
}

const DEFAULT_SETTINGS: ObsidianPatchSettings = {
  mermaidSecurityLevel: "strict",
};

export default class ObsidianPatchPlugin extends Plugin {
  settings = DEFAULT_SETTINGS;
  private configureMermaidLatest?: (securityLevel: MermaidSecurityLevel) => void;

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.configureMermaidLatest = registerMermaidLatest(
      this,
      this.settings.mermaidSecurityLevel,
    );
    this.addSettingTab(new ObsidianPatchSettingTab(this));
  }

  async setMermaidSecurityLevel(securityLevel: MermaidSecurityLevel): Promise<void> {
    this.settings.mermaidSecurityLevel = securityLevel;
    await this.saveData(this.settings);
    this.configureMermaidLatest?.(securityLevel);

    let hasSourceView = false;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView) {
        leaf.view.previewMode.rerender(true);
        hasSourceView ||= leaf.view.getMode() === "source";
      }
    }

    if (hasSourceView) {
      new Notice(
        "Mermaid security level updated. Reopen source-mode notes or switch view modes to refresh their diagrams.",
      );
    }
  }
}

class ObsidianPatchSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: ObsidianPatchPlugin) {
    super(plugin.app, plugin);
  }

  override display(): void {
    this.containerEl.empty();

    const warning = this.containerEl.createEl("p", {
      cls: "obsidian-patch-warning",
      text: "Loose mode inserts unsanitized Mermaid output into Obsidian. Use it only for diagrams from sources you fully trust.",
    });
    warning.hidden = this.plugin.settings.mermaidSecurityLevel !== "loose";

    new Setting(this.containerEl)
      .setName("Mermaid security level")
      .setDesc(
        "Strict sanitizes SVG but currently hides treeView icons. Sandbox isolates diagrams in an iframe and supports icons. Loose preserves icons and interactions but trusts all diagram content.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("strict", "Strict")
          .addOption("sandbox", "Sandbox")
          .addOption("loose", "Loose")
          .setValue(this.plugin.settings.mermaidSecurityLevel)
          .onChange(async (value) => {
            if (!isMermaidSecurityLevel(value)) {
              return;
            }

            warning.hidden = value !== "loose";
            await this.plugin.setMermaidSecurityLevel(value);
          }),
      );
  }
}

function parseSettings(data: unknown): ObsidianPatchSettings {
  if (
    typeof data === "object" &&
    data !== null &&
    "mermaidSecurityLevel" in data &&
    isMermaidSecurityLevel(data.mermaidSecurityLevel)
  ) {
    return { mermaidSecurityLevel: data.mermaidSecurityLevel };
  }

  return { ...DEFAULT_SETTINGS };
}

function isMermaidSecurityLevel(value: unknown): value is MermaidSecurityLevel {
  return value === "strict" || value === "sandbox" || value === "loose";
}
