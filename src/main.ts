import { Plugin, PluginSettingTab, Setting } from "obsidian";
import {
  registerMermaidLatest,
  type MermaidLatestController,
  type MermaidSecurityLevel,
} from "./features/mermaid-latest";
import {
  BUNDLED_MERMAID_VERSION,
  BUNDLED_VERSION,
  isMermaidVersionChoice,
  LATEST_VERSION,
  type MermaidRuntime,
  type MermaidVersionChoice,
} from "./features/mermaid-runtime";
import {
  parseInlineStyleSettings,
  registerInlineStyles,
  type InlineStyleSettings,
} from "./features/inline-styles";
import { DEFAULT_ACTIVE_LINE_ENABLED, registerActiveLine } from "./features/active-line";

interface ObsidianPatchSettings {
  mermaidSecurityLevel: MermaidSecurityLevel;
  mermaidVersion: MermaidVersionChoice;
  /** The version that `latest` last resolved to, for offline startups. */
  mermaidCachedLatest?: string;
  inlineStyles: InlineStyleSettings;
  activeLine: boolean;
}

/** Dropdown value that reveals the custom version field; never stored. */
const CUSTOM_CHOICE = "custom";

const DEFAULT_MERMAID_SECURITY_LEVEL: MermaidSecurityLevel = "strict";

export default class ObsidianPatchPlugin extends Plugin {
  settings: ObsidianPatchSettings = parseSettings(null);
  mermaid?: MermaidLatestController;
  private applyInlineStyles?: (settings: InlineStyleSettings) => void;
  private applyActiveLine?: (enabled: boolean) => void;

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.mermaid = registerMermaidLatest(this, {
      securityLevel: this.settings.mermaidSecurityLevel,
      version: this.settings.mermaidVersion,
      cachedLatest: this.settings.mermaidCachedLatest,
      onLatestResolved: (version) => {
        if (this.settings.mermaidCachedLatest !== version) {
          this.settings.mermaidCachedLatest = version;
          void this.saveData(this.settings);
        }
      },
    });
    this.applyInlineStyles = registerInlineStyles(this, this.settings.inlineStyles);
    this.applyActiveLine = registerActiveLine(this, this.settings.activeLine);
    this.addSettingTab(new ObsidianPatchSettingTab(this));
  }

  async setMermaidSecurityLevel(securityLevel: MermaidSecurityLevel): Promise<void> {
    this.settings.mermaidSecurityLevel = securityLevel;
    await this.saveData(this.settings);
    this.mermaid?.setSecurityLevel(securityLevel);
  }

  async setMermaidVersion(version: MermaidVersionChoice): Promise<MermaidRuntime | undefined> {
    this.settings.mermaidVersion = version;
    await this.saveData(this.settings);
    return this.mermaid?.setVersion(version);
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
    this.displayMermaidVersion();

    const warning = this.containerEl.createEl("p", {
      cls: "obsidian-patch-warning",
      text: "Loose mode inserts unsanitized Mermaid output into Obsidian. Use it only for diagrams from sources you fully trust.",
    });
    warning.hidden = this.plugin.settings.mermaidSecurityLevel !== "loose";

    new Setting(this.containerEl)
      .setName("Mermaid security level")
      .setDesc(
        "Strict sanitizes SVG but currently hides treeView icons. Loose preserves icons and interactions but trusts all diagram content.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("strict", "Strict")
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

  private displayMermaidVersion(): void {
    const setting = new Setting(this.containerEl).setName("Mermaid version");
    setting.descEl.createDiv({
      text: "Latest and custom versions are downloaded from jsDelivr and run with full access to Obsidian. Bundled works offline and runs only code shipped with this plugin. Remote versions fall back to Bundled when they cannot be loaded.",
    });
    const status = setting.descEl.createDiv({ cls: "obsidian-patch-setting-status" });

    const showStatus = (runtime: MermaidRuntime | undefined): void => {
      if (runtime === undefined) {
        status.setText("Loading…");
      } else if (runtime.fallbackReason !== undefined) {
        status.setText(
          `In use: bundled Mermaid ${runtime.version}. The chosen version failed to load: ${runtime.fallbackReason}`,
        );
      } else {
        const origin = runtime.origin === "cdn" ? "from jsDelivr" : "bundled";
        status.setText(`In use: Mermaid ${runtime.version}, ${origin}.`);
      }
    };

    const apply = async (version: MermaidVersionChoice): Promise<void> => {
      if (version === this.plugin.settings.mermaidVersion) {
        return;
      }
      showStatus(undefined);
      showStatus(await this.plugin.setMermaidVersion(version));
    };

    showStatus(undefined);
    void this.plugin.mermaid?.runtime().then(showStatus);

    const current = this.plugin.settings.mermaidVersion;
    const isCustom = current !== LATEST_VERSION && current !== BUNDLED_VERSION;
    let customVersion = isCustom ? current : "";

    const customSetting = new Setting(this.containerEl)
      .setName("Custom Mermaid version")
      .setDesc("An exact release from 11.0.0 on, such as 12.0.0. Applied when the field loses focus.");
    customSetting.settingEl.hidden = !isCustom;

    customSetting.addText((text) => {
      text.setPlaceholder(BUNDLED_MERMAID_VERSION).setValue(customVersion);

      const commit = (): void => {
        const value = text.getValue().trim();
        const valid = isMermaidVersionChoice(value) && /^\d/.test(value);
        text.inputEl.toggleClass("obsidian-patch-input-invalid", value !== "" && !valid);
        if (valid) {
          customVersion = value;
          void apply(value);
        }
      };

      text.inputEl.addEventListener("blur", commit);
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          commit();
        }
      });
    });

    setting.addDropdown((dropdown) =>
      dropdown
        .addOption(LATEST_VERSION, "Latest")
        .addOption(BUNDLED_VERSION, `Bundled (${BUNDLED_MERMAID_VERSION})`)
        .addOption(CUSTOM_CHOICE, "Custom")
        .setValue(isCustom ? CUSTOM_CHOICE : current)
        .onChange(async (value) => {
          customSetting.settingEl.hidden = value !== CUSTOM_CHOICE;
          if (value !== CUSTOM_CHOICE) {
            await apply(value);
          } else if (customVersion !== "") {
            // Switching back to Custom restores the version typed earlier.
            await apply(customVersion);
          }
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
    mermaidVersion: isMermaidVersionChoice(record.mermaidVersion)
      ? record.mermaidVersion
      : LATEST_VERSION,
    mermaidCachedLatest:
      typeof record.mermaidCachedLatest === "string" ? record.mermaidCachedLatest : undefined,
    inlineStyles: parseInlineStyleSettings(record.inlineStyles),
    activeLine:
      typeof record.activeLine === "boolean"
        ? record.activeLine
        : DEFAULT_ACTIVE_LINE_ENABLED,
  };
}

function isMermaidSecurityLevel(value: unknown): value is MermaidSecurityLevel {
  return value === "strict" || value === "loose";
}
