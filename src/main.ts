import { Plugin, PluginSettingTab, Setting, type SliderComponent } from "obsidian";
import {
  registerPatchMermaid,
  type PatchMermaidController,
  type MermaidSecurityLevel,
} from "./features/patch-mermaid";
import {
  BUNDLED_MERMAID_VERSION,
  BUNDLED_VERSION,
  isMermaidVersionChoice,
  LATEST_VERSION,
  type MermaidRuntime,
  type MermaidVersionChoice,
} from "./features/mermaid-runtime";
import { DEFAULT_CALLOUT_CODE_ENABLED, registerCalloutCode } from "./features/callout-code";
import { DEFAULT_ACTIVE_LINE_ENABLED, registerActiveLine } from "./features/active-line";
import { DEFAULT_BANNER_WIDTH_PERCENT, parseBannerSettings, registerBanner, type BannerSettings } from "./features/banner";
import { registerTables } from "./features/table";
import { MATH_INDENTS, parseMathFormatSettings, registerMathFormat, type MathFormatSettings } from "./features/math-format";
import { GITHUB_PROPERTY, parseCalloutSettings, registerCallouts, type CalloutSettings } from "./features/callout";
import {
  parseIconSettings,
  registerIcons,
  type IconSettings,
  type PatchIconsController,
  type SimpleIconsStatus,
} from "./features/icons";
import {
  DEFAULT_LINE_WIDTH,
  LINE_WIDTH_PROPERTY,
  LINE_WIDTH_STEP,
  MAX_LINE_WIDTH,
  MIN_LINE_WIDTH,
  parseLineWidthSettings,
  registerLineWidth,
  type LineWidthSettings,
} from "./features/line-width";

interface ObsidianPatchSettings {
  mermaidSecurityLevel: MermaidSecurityLevel;
  mermaidVersion: MermaidVersionChoice;
  /** The version that `latest` last resolved to, for offline startups. */
  mermaidCachedLatest?: string;
  calloutCode: boolean;
  callouts: CalloutSettings;
  activeLine: boolean;
  banner: BannerSettings;
  icons: IconSettings;
  lineWidth: LineWidthSettings;
  mathFormat: MathFormatSettings;
}

/** Dropdown value that reveals the custom version field; never stored. */
const CUSTOM_CHOICE = "custom";

const DEFAULT_MERMAID_SECURITY_LEVEL: MermaidSecurityLevel = "strict";

export default class ObsidianPatchPlugin extends Plugin {
  settings: ObsidianPatchSettings = parseSettings(null);
  mermaid?: PatchMermaidController;
  icons?: PatchIconsController;
  private applyCalloutCode?: (enabled: boolean) => void;
  private applyActiveLine?: (enabled: boolean) => void;
  private applyBanner?: (settings: BannerSettings) => void;
  private applyLineWidth?: (settings: LineWidthSettings) => void;

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    this.mermaid = registerPatchMermaid(this, {
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
    this.applyCalloutCode = registerCalloutCode(this, this.settings.calloutCode);
    this.applyActiveLine = registerActiveLine(this, this.settings.activeLine);
    this.applyBanner = registerBanner(this, this.settings.banner);
    registerTables(this);
    registerMathFormat(this, () => this.settings.mathFormat);
    registerCallouts(this, () => this.settings.callouts);
    this.icons = registerIcons(this, this.settings.icons, async (icons) => {
      this.settings.icons = icons;
      await this.saveData(this.settings);
    });
    this.applyLineWidth = registerLineWidth(this, this.settings.lineWidth, (lineWidth) => this.setLineWidth(lineWidth));
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

  async setCalloutCode(calloutCode: boolean): Promise<void> {
    this.settings.calloutCode = calloutCode;
    await this.saveData(this.settings);
    this.applyCalloutCode?.(calloutCode);
  }

  async setActiveLine(activeLine: boolean): Promise<void> {
    this.settings.activeLine = activeLine;
    await this.saveData(this.settings);
    this.applyActiveLine?.(activeLine);
  }

  async setBanner(banner: BannerSettings): Promise<void> {
    this.settings.banner = banner;
    await this.saveData(this.settings);
    this.applyBanner?.(banner);
  }

  async setCallouts(callouts: CalloutSettings): Promise<void> {
    this.settings.callouts = callouts;
    await this.saveData(this.settings);
  }

  async setMathFormat(mathFormat: MathFormatSettings): Promise<void> {
    this.settings.mathFormat = mathFormat;
    await this.saveData(this.settings);
  }

  async setLineWidth(lineWidth: LineWidthSettings): Promise<void> {
    this.settings.lineWidth = lineWidth;
    await this.saveData(this.settings);
    this.applyLineWidth?.(lineWidth);
  }
}

class ObsidianPatchSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: ObsidianPatchPlugin) {
    super(plugin.app, plugin);
  }

  override display(): void {
    this.containerEl.empty();
    this.displayMermaidSection();
    this.displayBannerSection();
    this.displayIconSection();
    this.displayLineWidthSection();
    this.displayCalloutSection();
    this.displayMathSection();
    this.displayEditorSection();
  }

  private displayMermaidSection(): void {
    new Setting(this.containerEl).setName("Patch Mermaid").setHeading();
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
      text: "Bundled, the default, works offline and runs only code shipped with this plugin. Latest and custom versions are downloaded from jsDelivr and run with full access to Obsidian, and fall back to Bundled when they cannot be loaded.",
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
        .addOption(BUNDLED_VERSION, `Bundled (${BUNDLED_MERMAID_VERSION})`)
        .addOption(LATEST_VERSION, "Latest")
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

  private displayCalloutSection(): void {
    new Setting(this.containerEl).setName("Callouts").setHeading();

    this.addToggle(
      "Inline code",
      "Tints inline code with the callout's own color instead of the page's gray, and code in a callout title takes the title's color. Applies to Reading View and Live Preview; fenced code blocks keep the theme's colors.",
      this.plugin.settings.calloutCode,
      (enabled) => this.plugin.setCalloutCode(enabled),
    );

    const settings = (): CalloutSettings => this.plugin.settings.callouts;
    this.addToggle(
      "GitHub compatibility",
      "Shows in the callout editor whether GitHub renders the callout as an alert, with a button that makes it one. Edit a callout from its hover button, the editor menu, or Edit callout in the command palette.",
      settings().github,
      (github) => this.plugin.setCallouts({ ...settings(), github }),
    );
    new Setting(this.containerEl)
      .setName("GitHub folders")
      .setDesc(`For notes in these folders, and notes whose ${GITHUB_PROPERTY} property is true, the status bar counts callouts that GitHub would show as plain blockquotes. Separate folders with commas.`)
      .addText((text) => text
        .setPlaceholder("docs, projects/site")
        .setValue(settings().githubFolders.join(", "))
        .onChange((value) => this.plugin.setCallouts({
          ...settings(),
          githubFolders: value.split(",").map((folder) => folder.trim()).filter((folder) => folder !== ""),
        })));
  }

  private displayMathSection(): void {
    new Setting(this.containerEl).setName("Math Format").setHeading();
    const settings = (): MathFormatSettings => this.plugin.settings.mathFormat;
    new Setting(this.containerEl)
      .setName("Indent")
      .setDesc("Spaces for each environment level, such as the rows of an aligned or cases environment. Run Format math block or Format all math blocks in note from the command palette, or Format math block from the editor menu.")
      .addDropdown((dropdown) => {
        for (const indent of MATH_INDENTS) dropdown.addOption(String(indent), `${indent} spaces`);
        dropdown.setValue(String(settings().indent))
          .onChange((value) => this.plugin.setMathFormat({ ...settings(), indent: Number(value) }));
      });
    this.addToggle(
      "Align ampersands",
      "Pads cells so that the & of every row line up. Exact for Latin text in the editor's monospace font; East Asian text in \\text{} lines up approximately.",
      settings().alignAmpersands,
      (alignAmpersands) => this.plugin.setMathFormat({ ...settings(), alignAmpersands }),
    );
    this.addToggle(
      "Align row ends",
      "Pads rows so that their closing \\\\ line up. Long rows push short ones far to the right, so this is off by default.",
      settings().alignRowEnds,
      (alignRowEnds) => this.plugin.setMathFormat({ ...settings(), alignRowEnds }),
    );
  }

  private displayBannerSection(): void {
    new Setting(this.containerEl).setName("Patch Banner").setHeading();
    const settings = (): BannerSettings => this.plugin.settings.banner;
    this.addToggle("Enabled", "Display vault media from the patch-banner note property in Reading View and Live Preview.", settings().enabled,
      (enabled) => this.plugin.setBanner({ ...settings(), enabled }));
    let widthSlider: SliderComponent;
    new Setting(this.containerEl)
      .setName("Cover width (%)")
      .setDesc(`10–100% of the note pane, centered. Default: ${DEFAULT_BANNER_WIDTH_PERCENT}%. The title and text keep their normal width.`)
      .addSlider((slider) => {
        widthSlider = slider;
        slider.setLimits(10, 100, 1).setValue(settings().widthPercent).setDynamicTooltip()
          .onChange((widthPercent) => this.plugin.setBanner({ ...settings(), widthPercent }));
      })
      .addExtraButton((button) => button.setIcon("rotate-ccw")
        .setTooltip(`Reset to ${DEFAULT_BANNER_WIDTH_PERCENT}%`)
        .onClick(async () => {
          widthSlider.setValue(DEFAULT_BANNER_WIDTH_PERCENT);
          await this.plugin.setBanner({ ...settings(), widthPercent: DEFAULT_BANNER_WIDTH_PERCENT });
        }));
    this.addToggle("Autoplay videos", "Play visible videos silently. Reduced motion uses click to play.", settings().autoplayVideos,
      (autoplayVideos) => this.plugin.setBanner({ ...settings(), autoplayVideos }));
  }

  private displayIconSection(): void {
    new Setting(this.containerEl).setName("Patch Icons").setHeading();
    const icons = this.plugin.icons;
    this.addToggle(
      "Enabled",
      "Show icons before file and folder names in the file explorer. Right-click a file or folder to change or remove its icon.",
      this.plugin.settings.icons.enabled,
      async (enabled) => { await icons?.setEnabled(enabled); },
    );

    const simpleIcons = new Setting(this.containerEl).setName("Simple Icons");
    simpleIcons.descEl.createDiv({
      text: "The newest release is downloaded from jsDelivr when you choose an icon. Icons in use are saved with these settings, so they display offline.",
    });
    const status = simpleIcons.descEl.createDiv({ cls: "obsidian-patch-setting-status" });
    const showStatus = (state: SimpleIconsStatus): void => {
      status.setText(
        state.status === "ready" ? `In use: Simple Icons ${state.version}, from jsDelivr.`
          : state.status === "loading" ? "Loading…"
            : state.status === "error" ? `Could not load Simple Icons: ${state.message}`
              : "Not loaded yet in this session.",
      );
    };
    showStatus(icons?.simpleIconsStatus() ?? { status: "idle" });
    simpleIcons.addButton((button) => button
      .setButtonText("Update")
      .setTooltip("Load the newest Simple Icons and refresh the icons in use")
      .onClick(async () => {
        if (!icons) return;
        button.setDisabled(true);
        showStatus({ status: "loading" });
        showStatus(await icons.updateSimpleIcons());
        button.setDisabled(false);
      }));

    const iconize = new Setting(this.containerEl)
      .setName("Import from Iconize")
      .setDesc("Copies Iconize's file and folder icons, replacing icons already set for the same paths. Lucide and Simple Icons are supported; emoji and other icon packs are skipped. Disable Iconize afterwards so icons are not shown twice.");
    const iconizeStatus = iconize.descEl.createDiv({ cls: "obsidian-patch-setting-status" });
    iconize.addButton((button) => {
      button.setButtonText("Import").setDisabled(true).onClick(async () => {
        await icons?.importIconize();
        this.display();
      });
      void icons?.countIconizeIcons().then((count) => {
        button.setDisabled(!count);
        iconizeStatus.setText(count === undefined ? "No Iconize settings in this vault." : `Iconize has ${count} file and folder icons.`);
      });
    });

    const missing = icons?.missingPaths() ?? [];
    new Setting(this.containerEl)
      .setName("Icons of missing files")
      .setDesc(missing.length === 0
        ? "Every icon belongs to an existing file or folder."
        : `${missing.length} icons belong to paths that no longer exist, for example after a rename outside Obsidian. They return if the path is created again.`)
      .addButton((button) => button
        .setButtonText("Remove")
        .setDisabled(missing.length === 0)
        .onClick(async () => {
          await icons?.removeIcons(missing);
          this.display();
        }));
  }

  private displayLineWidthSection(): void {
    new Setting(this.containerEl).setName("Line Width").setHeading();
    const settings = (): LineWidthSettings => this.plugin.settings.lineWidth;
    this.addToggle(
      "Enabled",
      `Sets the width of notes in Reading View, Live Preview and Source mode. Requires Settings > Editor > Readable line length. A note can set its own width with the ${LINE_WIDTH_PROPERTY} property.`,
      settings().enabled,
      (enabled) => this.plugin.setLineWidth({ ...settings(), enabled }),
    );
    let widthSlider: SliderComponent;
    new Setting(this.containerEl)
      .setName("Line width (px)")
      .setDesc(`${MIN_LINE_WIDTH}–${MAX_LINE_WIDTH} px, for notes without the property. Default: ${DEFAULT_LINE_WIDTH} px; Obsidian's own width is 700 px.`)
      .addSlider((slider) => {
        widthSlider = slider;
        slider.setLimits(MIN_LINE_WIDTH, MAX_LINE_WIDTH, LINE_WIDTH_STEP).setValue(settings().width).setDynamicTooltip()
          .onChange((width) => this.plugin.setLineWidth({ ...settings(), width }));
      })
      .addExtraButton((button) => button.setIcon("rotate-ccw")
        .setTooltip(`Reset to ${DEFAULT_LINE_WIDTH} px`)
        .onClick(async () => {
          widthSlider.setValue(DEFAULT_LINE_WIDTH);
          await this.plugin.setLineWidth({ ...settings(), width: DEFAULT_LINE_WIDTH });
        }));
    this.addToggle(
      "Show in status bar",
      "A slider in the status bar changes the line width as you read. Click its value to reset it. Desktop only.",
      settings().statusBar,
      (statusBar) => this.plugin.setLineWidth({ ...settings(), statusBar }),
    );
  }

  private displayEditorSection(): void {
    new Setting(this.containerEl).setName("Editor").setHeading();

    this.addToggle(
      "Active line",
      "Marks the line the cursor is on with a bar in the margin, faded while the editor is unfocused, and highlights its line number. Applies to Live Preview and Source mode.",
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
      : BUNDLED_VERSION,
    mermaidCachedLatest:
      typeof record.mermaidCachedLatest === "string" ? record.mermaidCachedLatest : undefined,
    banner: parseBannerSettings(record.banner),
    icons: parseIconSettings(record.icons),
    lineWidth: parseLineWidthSettings(record.lineWidth),
    mathFormat: parseMathFormatSettings(record.mathFormat),
    callouts: parseCalloutSettings(record.callouts),
    calloutCode:
      typeof record.calloutCode === "boolean"
        ? record.calloutCode
        : DEFAULT_CALLOUT_CODE_ENABLED,
    activeLine:
      typeof record.activeLine === "boolean"
        ? record.activeLine
        : DEFAULT_ACTIVE_LINE_ENABLED,
  };
}

function isMermaidSecurityLevel(value: unknown): value is MermaidSecurityLevel {
  return value === "strict" || value === "loose";
}
