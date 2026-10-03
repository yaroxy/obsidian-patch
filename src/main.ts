import { MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
  registerMermaidLatest,
  type MermaidSecurityLevel,
} from "./features/mermaid-latest";
import {
  parseInlineStyleSettings,
  registerInlineStyles,
  type InlineStyleSettings,
} from "./features/inline-styles";
import { DEFAULT_ACTIVE_LINE_ENABLED, registerActiveLine } from "./features/active-line";

interface ObsidianPatchSettings {
  mermaidSecurityLevel: MermaidSecurityLevel;
  inlineStyles: InlineStyleSettings;
  activeLine: boolean;
}

const DEFAULT_MERMAID_SECURITY_LEVEL: MermaidSecurityLevel = "strict";

export default class ObsidianPatchPlugin extends Plugin {
  settings: ObsidianPatchSettings = parseSettings(null);
  private configureMermaidLatest?: (securityLevel: MermaidSecurityLevel) => void;
  private applyInlineStyles?: (settings: InlineStyleSettings) => void;
  private applyActiveLine?: (enabled: boolean) => void;

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.configureMermaidLatest = registerMermaidLatest(
      this,
      this.settings.mermaidSecurityLevel,
    );
    this.applyInlineStyles = registerInlineStyles(this, this.settings.inlineStyles);
    this.applyActiveLine = registerActiveLine(this, this.settings.activeLine);
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

  async setInlineStyles(inlineStyles: InlineStyleSettings): Promise<void> {
    this.settings.inlineStyles = inlineStyles;
    await this.saveData(this.settings);
    this.applyInlineStyles?.(inlineStyles);
  }

  async setActiveLine(activeLine: boolean): Promise<void> {
    this.settings.activeLine = activeLine;
    await this.saveData(this.settings);
    this.applyActiveLine?.(activeLine);
  }
}

class ObsidianPatchSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: ObsidianPatchPlugin) {
    super(plugin.app, plugin);
  }

  override display(): void {
    this.containerEl.empty();
    this.displayMermaidSection();
    this.displayInlineStyleSection();
    this.displayEditorSection();
  }

  private displayMermaidSection(): void {
    new Setting(this.containerEl).setName("Mermaid").setHeading();

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

  private displayInlineStyleSection(): void {
    new Setting(this.containerEl).setName("Inline styles").setHeading();

    this.containerEl.createEl("p", {
      cls: "obsidian-patch-setting-note",
      text: "Applies to note content only, in both Reading View and Live Preview. Colors are muted presets with a light and a dark variant; a CSS snippet can override the --obsidian-patch-* custom properties.",
    });

    // Read the settings when a toggle changes, not when the tab opens, so one
    // toggle does not undo another that was changed since.
    const styles = (): InlineStyleSettings => this.plugin.settings.inlineStyles;

    this.addToggle("Bold", "Bold text is colorized red.", styles().bold, (bold) =>
      this.plugin.setInlineStyles({ ...styles(), bold }),
    );

    this.addToggle("Italic", "Italic text is colorized green.", styles().italic, (italic) =>
      this.plugin.setInlineStyles({ ...styles(), italic }),
    );

    this.addToggle(
      "Inline code",
      "Inline code gets blue text on a gray background. Fenced code blocks keep the theme's own colors.",
      styles().inlineCode,
      (inlineCode) => this.plugin.setInlineStyles({ ...styles(), inlineCode }),
    );
  }

  private displayEditorSection(): void {
    new Setting(this.containerEl).setName("Editor").setHeading();

    this.addToggle(
      "Active line",
      "Tints the line the cursor is on and highlights its line number. Applies to Live Preview and Source mode.",
      this.plugin.settings.activeLine,
      (enabled) => this.plugin.setActiveLine(enabled),
    );
  }

  private addToggle(
    name: string,
    description: string,
    value: boolean,
    onChange: (enabled: boolean) => Promise<void>,
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addToggle((toggle) =>
        toggle.setValue(value).onChange(async (enabled) => {
          await onChange(enabled);
        }),
      );
  }
}

function parseSettings(data: unknown): ObsidianPatchSettings {
  const record: Record<string, unknown> =
    typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};

  return {
    mermaidSecurityLevel: isMermaidSecurityLevel(record.mermaidSecurityLevel)
      ? record.mermaidSecurityLevel
      : DEFAULT_MERMAID_SECURITY_LEVEL,
    inlineStyles: parseInlineStyleSettings(record.inlineStyles),
    activeLine:
      typeof record.activeLine === "boolean"
        ? record.activeLine
        : DEFAULT_ACTIVE_LINE_ENABLED,
  };
}

function isMermaidSecurityLevel(value: unknown): value is MermaidSecurityLevel {
  return value === "strict" || value === "sandbox" || value === "loose";
}
