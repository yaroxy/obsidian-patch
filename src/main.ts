import { registerNoteDiff } from "./features/git-diff/view";
import { renderFontSetting } from "./ui/font-setting";
import type { IconChoice } from "./features/icons/picker";
import { Plugin, PluginSettingTab, type Setting, type SettingDefinition, type SettingDefinitionGroup, type SliderComponent, type TextComponent } from "obsidian";
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
  parseMermaidSettings,
  REMOTE_MERMAID_ENABLED,
  type MermaidRuntime,
  type MermaidVersionChoice,
} from "./features/mermaid-runtime";
import { DEFAULT_CALLOUT_CODE_ENABLED, registerCalloutCode } from "./features/callout-code";
import { DEFAULT_ACTIVE_LINE_ENABLED, registerActiveLine } from "./features/active-line";
import { DEFAULT_HEADING_LEVELS_ENABLED, registerHeadingLevels } from "./features/heading-levels";
import { registerHeadingNumbering } from "./features/heading-numbering";
import { parseNumberingSettings, type NumberingSettings } from "./features/heading-numbering/model";
import { renderNumberingSetting } from "./ui/heading-numbering-setting";
import { parsePdfExportSettings, registerPdfExport, type PdfExportSettings } from "./features/pdf-export";
import { DEFAULT_BANNER_WIDTH_PERCENT, parseBannerSettings, registerBanner, type BannerSettings } from "./features/banner";
import { CalloutAppearanceModal } from "./features/callout/appearance-modal";
import { parseAppearanceSettings, registerAppearance, resolveAppearance, type AppearanceSettings } from "./features/appearance";
import { registerTables } from "./features/table";
import { MATH_INDENTS, parseMathFormatSettings, registerMathFormat, type MathFormatSettings } from "./features/math-format";
import { GITHUB_PROPERTY, parseCalloutSettings, registerCallouts, type CalloutSettings } from "./features/callout";
import { GitHubFolderSuggest } from "./features/callout/folder-suggest";
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

interface PatchesSettings {
  mermaidSecurityLevel: MermaidSecurityLevel;
  mermaidVersion: MermaidVersionChoice;
  /** The version that `latest` last resolved to, for offline startups. */
  mermaidCachedLatest?: string;
  appearance: AppearanceSettings;
  calloutCode: boolean;
  callouts: CalloutSettings;
  activeLine: boolean;
  headingLevels: boolean;
  headingNumbering: NumberingSettings;
  pdfExport: PdfExportSettings;
  banner: BannerSettings;
  icons: IconSettings;
  lineWidth: LineWidthSettings;
  mathFormat: MathFormatSettings;
}

/** Dropdown value that reveals the custom version field; never stored. */
const CUSTOM_CHOICE = "custom";

const DEFAULT_MERMAID_SECURITY_LEVEL: MermaidSecurityLevel = "strict";

export default class PatchesPlugin extends Plugin {
  settings: PatchesSettings = parseSettings(null);
  mermaid?: PatchMermaidController;
  icons?: PatchIconsController;
  private resolvedAppearance = this.settings.appearance;
  private applyAppearance?: (settings: AppearanceSettings) => void;
  private applyCalloutCode?: (enabled: boolean) => void;
  private applyActiveLine?: (enabled: boolean) => void;
  private applyBanner?: (settings: BannerSettings) => void;
  private applyLineWidth?: (settings: LineWidthSettings) => void;
  private refreshCalloutStatus?: () => void;
  private applyHeadingLevels?: (enabled: boolean) => void;
  private applyHeadingNumbering?: (settings: NumberingSettings) => void;

  override async onload(): Promise<void> {
    const storedSettings: unknown = await this.loadData();
    const storedRecord = settingsRecord(storedSettings);
    this.settings = parseSettings(storedSettings);
    if (!REMOTE_MERMAID_ENABLED && (
      (storedRecord.mermaidVersion !== undefined && storedRecord.mermaidVersion !== BUNDLED_VERSION)
      || storedRecord.mermaidCachedLatest !== undefined
    )) {
      await this.saveData(this.settings);
    }
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
    this.resolvedAppearance = resolveAppearance(this.settings.appearance, this.settings.icons);
    this.applyAppearance = registerAppearance(this, this.resolvedAppearance);
    this.applyCalloutCode = registerCalloutCode(this, this.settings.calloutCode);
    this.applyActiveLine = registerActiveLine(this, this.settings.activeLine);
    this.applyHeadingLevels = registerHeadingLevels(this, this.settings.headingLevels);
    this.applyHeadingNumbering = registerHeadingNumbering(this, this.settings.headingNumbering);
    registerPdfExport(this, () => this.settings.pdfExport);
    this.applyBanner = registerBanner(this, this.settings.banner);
    registerTables(this);
    await registerNoteDiff(this);
    registerMathFormat(this, () => this.settings.mathFormat);
    this.refreshCalloutStatus = registerCallouts(this, () => this.settings.callouts, () => this.resolvedAppearance.calloutTypes);
    this.icons = registerIcons(this, this.settings.icons, async (icons) => {
      const previous = this.settings.icons;
      this.settings.icons = icons;
      try { await this.saveData(this.settings); }
      catch (error) {
        if (this.settings.icons === icons) this.settings.icons = previous;
        throw error;
      }
      this.refreshAppearance();
    }, () => Object.values(this.settings.appearance.calloutTypes).flatMap(entry => entry.icon?.startsWith("simple-icons:") ? [entry.icon] : []));
    this.applyLineWidth = registerLineWidth(this, this.settings.lineWidth, (lineWidth) => this.setLineWidth(lineWidth));
    this.addSettingTab(new PatchesSettingTab(this));
  }

  async setMermaidSecurityLevel(securityLevel: MermaidSecurityLevel): Promise<void> {
    this.settings.mermaidSecurityLevel = securityLevel;
    await this.saveData(this.settings);
    this.mermaid?.setSecurityLevel(securityLevel);
  }

  async setMermaidVersion(version: MermaidVersionChoice): Promise<MermaidRuntime | undefined> {
    const settings = parseMermaidSettings({
      mermaidVersion: version,
      mermaidCachedLatest: this.settings.mermaidCachedLatest,
    });
    this.settings.mermaidVersion = settings.mermaidVersion;
    this.settings.mermaidCachedLatest = settings.mermaidCachedLatest;
    await this.saveData(this.settings);
    return this.mermaid?.setVersion(settings.mermaidVersion);
  }

  async setCalloutCode(calloutCode: boolean): Promise<void> {
    this.settings.calloutCode = calloutCode;
    await this.saveData(this.settings);
    this.applyCalloutCode?.(calloutCode);
  }

  private refreshAppearance(): void {
    this.resolvedAppearance = resolveAppearance(this.settings.appearance, this.settings.icons);
    this.applyAppearance?.(this.resolvedAppearance);
  }

  async setAppearance(appearance: AppearanceSettings, choice?: IconChoice): Promise<void> {
    const previous = this.settings.appearance;
    const next = parseAppearanceSettings(appearance);
    this.settings.appearance = next;
    try {
      if (this.icons && appearance.calloutTypes !== previous.calloutTypes) await this.icons.saveUsedIcons(choice);
      else {
        await this.saveData(this.settings);
        this.refreshAppearance();
      }
    } catch (error) {
      if (this.settings.appearance === next) this.settings.appearance = previous;
      this.refreshAppearance();
      throw error;
    }
  }

  async setActiveLine(activeLine: boolean): Promise<void> {
    this.settings.activeLine = activeLine;
    await this.saveData(this.settings);
    this.applyActiveLine?.(activeLine);
  }

  async setHeadingLevels(headingLevels: boolean): Promise<void> {
    this.settings.headingLevels = headingLevels;
    await this.saveData(this.settings);
    this.applyHeadingLevels?.(headingLevels);
  }

  async setHeadingNumbering(value: NumberingSettings): Promise<void> {
    const settings = parseNumberingSettings(value);
    this.settings.headingNumbering = settings;
    this.applyHeadingNumbering?.(settings);
    await this.saveData(this.settings);
  }

  async setPdfExport(pdfExport: PdfExportSettings): Promise<void> {
    this.settings.pdfExport = pdfExport;
    await this.saveData(this.settings);
  }

  async setBanner(banner: BannerSettings): Promise<void> {
    this.settings.banner = banner;
    await this.saveData(this.settings);
    this.applyBanner?.(banner);
  }

  async setCallouts(callouts: CalloutSettings): Promise<void> {
    this.settings.callouts = callouts;
    this.refreshCalloutStatus?.();
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

class PatchesSettingTab extends PluginSettingTab {
  private customSelected: boolean;
  private customVersion: string;
  private observedMermaidVersion: MermaidVersionChoice;
  private showMermaidStatus?: (runtime: MermaidRuntime | undefined) => void;

  constructor(private readonly plugin: PatchesPlugin) {
    super(plugin.app, plugin);
    const version = plugin.settings.mermaidVersion;
    this.observedMermaidVersion = version;
    this.customSelected = version !== LATEST_VERSION && version !== BUNDLED_VERSION;
    this.customVersion = this.customSelected ? version : "";
  }

  override getSettingDefinitions(): SettingDefinitionGroup[] {
    const version = this.plugin.settings.mermaidVersion;
    if (version !== this.observedMermaidVersion) {
      this.observedMermaidVersion = version;
      this.customSelected = version !== LATEST_VERSION && version !== BUNDLED_VERSION;
      if (this.customSelected) this.customVersion = version;
    }
    const groups: SettingDefinitionGroup[] = [
      { type: "group", heading: "Patch Mermaid", items: this.mermaidDefinitions() },
      { type: "group", heading: "Patch Banner", items: this.bannerDefinitions() },
      { type: "group", heading: "Patch Icons", items: this.iconDefinitions() },
      { type: "group", heading: "HTML Tables", items: [{
        name: "Inline code font",
        desc: "Installed font family for inline code in HTML table cells. Leave empty to use the theme font.",
        render: setting => renderFontSetting(setting, this.plugin.app, this.plugin.settings.appearance.tableCodeFont,
          tableCodeFont => this.plugin.setAppearance({ ...this.plugin.settings.appearance, tableCodeFont }), "text · conversation · content"),
      }] },
      { type: "group", heading: "Line Width", items: this.lineWidthDefinitions() },
      { type: "group", heading: "Callouts", items: this.calloutDefinitions() },
      { type: "group", heading: "Math Format", items: this.mathDefinitions() },
      { type: "group", heading: "Editor", items: this.editorDefinitions() },
      { type: "group", heading: "PDF Export", items: this.pdfDefinitions() },
    ];
    return groups.sort((a, b) => (a.heading ?? "").localeCompare(b.heading ?? "", "en"));
  }

  private mermaidDefinitions(): SettingDefinition[] {
    const definitions: SettingDefinition[] = [{
      name: "Mermaid version",
      desc: REMOTE_MERMAID_ENABLED
        ? "Bundled works offline and runs code shipped with this plugin. Latest and custom versions are downloaded from jsDelivr and run with full access to Obsidian; failed loads fall back to Bundled."
        : `Bundled Mermaid ${BUNDLED_MERMAID_VERSION}. Works offline and updates with Patches releases.`,
      render: (setting) => { if (REMOTE_MERMAID_ENABLED) this.renderMermaidVersion(setting); },
    }];
    if (REMOTE_MERMAID_ENABLED) definitions.push({
      name: "Custom Mermaid version",
      desc: "An exact release from 11.0.0 on, such as 12.0.0. Applied when the field loses focus.",
      visible: () => this.customSelected,
      render: (setting) => {
        setting.addText((text) => {
          text.setPlaceholder(BUNDLED_MERMAID_VERSION).setValue(this.customVersion);
          const commit = (): void => {
            const value = text.getValue().trim();
            const valid = isMermaidVersionChoice(value) && /^\d/.test(value);
            text.inputEl.toggleClass("obsidian-patch-input-invalid", value !== "" && !valid);
            if (valid) {
              this.customVersion = value;
              void this.applyMermaidVersion(value);
            }
          };
          text.inputEl.addEventListener("blur", commit);
          text.inputEl.addEventListener("keydown", (event) => { if (event.key === "Enter") commit(); });
        });
      },
    });
    definitions.push({
      name: "Mermaid security level",
      desc: "Strict is recommended. Loose allows additional diagram content and interactions; use it only with diagrams you trust. Rendered output is sanitized before display.",
      render: (setting) => {
        const warning = setting.descEl.createDiv({
          cls: "obsidian-patch-warning",
          text: "Loose mode permits additional content while Mermaid renders. Use it only for diagrams from sources you fully trust.",
        });
        warning.hidden = this.plugin.settings.mermaidSecurityLevel !== "loose";
        setting.addDropdown((dropdown) => dropdown
          .addOption("strict", "Strict")
          .addOption("loose", "Loose")
          .setValue(this.plugin.settings.mermaidSecurityLevel)
          .onChange(async (value) => {
            if (!isMermaidSecurityLevel(value)) return;
            warning.hidden = value !== "loose";
            await this.plugin.setMermaidSecurityLevel(value);
          }));
      },
    });
    const mermaid = this.plugin.mermaid;
    if (!mermaid) return definitions;
    for (const pack of mermaid.iconPacks) {
      definitions.push({
        name: `${pack.source.label} diagram icons`,
        desc: `Download from jsDelivr for offline diagrams that use the ${pack.source.name}: prefix.`,
        render: setting => {
          const status = setting.descEl.createDiv({ cls: "obsidian-patch-setting-status" });
          setting.addButton(button => {
            const show = (installed: boolean): void => {
              status.setText(installed ? `Installed: ${pack.source.version}.` : "Optional pack not installed.");
              button.setButtonText(installed ? "Check or repair" : "Install").setDisabled(false);
            };
            button.setButtonText("Install").setDisabled(true).onClick(async () => {
              button.setDisabled(true);
              status.setText("Verifying or downloading icon pack…");
              try {
                await mermaid.installIconPack(pack);
                show(true);
              } catch (error) {
                status.setText(`Could not install ${pack.source.label}: ${error instanceof Error ? error.message : String(error)}`);
                button.setButtonText("Retry").setDisabled(false);
              }
            });
            void pack.exists().then(show, () => show(false));
          });
        },
      });
    }
    return definitions;
  }

  private renderMermaidVersion(setting: Setting): void {
    const status = setting.descEl.createDiv({ cls: "obsidian-patch-setting-status" });
    const showStatus = (runtime: MermaidRuntime | undefined): void => {
      if (runtime === undefined) status.setText("Loading…");
      else if (runtime.fallbackReason !== undefined) {
        status.setText(`In use: bundled Mermaid ${runtime.version}. The chosen version failed to load: ${runtime.fallbackReason}`);
      } else {
        const origin = runtime.origin === "cdn" ? "from jsDelivr" : "bundled";
        status.setText(`In use: Mermaid ${runtime.version}, ${origin}.`);
      }
    };
    this.showMermaidStatus = showStatus;
    showStatus(undefined);
    void this.plugin.mermaid?.runtime().then(showStatus);
    setting.addDropdown((dropdown) => dropdown
      .addOption(BUNDLED_VERSION, `Bundled (${BUNDLED_MERMAID_VERSION})`)
      .addOption(LATEST_VERSION, "Latest")
      .addOption(CUSTOM_CHOICE, "Custom")
      .setValue(this.customSelected ? CUSTOM_CHOICE : this.plugin.settings.mermaidVersion)
      .onChange(async (value) => {
        this.customSelected = value === CUSTOM_CHOICE;
        this.refreshDomState();
        if (!this.customSelected) await this.applyMermaidVersion(value);
        else if (this.customVersion !== "") await this.applyMermaidVersion(this.customVersion);
      }));
  }

  private async applyMermaidVersion(version: MermaidVersionChoice): Promise<void> {
    if (version === this.plugin.settings.mermaidVersion) return;
    this.showMermaidStatus?.(undefined);
    this.showMermaidStatus?.(await this.plugin.setMermaidVersion(version));
  }

  private calloutDefinitions(): SettingDefinition[] {
    const settings = (): CalloutSettings => this.plugin.settings.callouts;
    return [
      {
        name: "Type appearance",
        desc: "Choose a Lucide or installed Simple Icons graphic and a color for each callout type.",
        render: setting => {
          setting.addButton(button => button.setButtonText("Customize").onClick(() => {
            const icons = this.plugin.icons;
            if (!icons) return;
            new CalloutAppearanceModal(this.plugin.app, this.plugin.settings.appearance.calloutTypes, this.plugin.settings.icons,
              select => icons.chooseCalloutIcon(select), async (type, entry, choice) => {
                const current = this.plugin.settings.appearance;
                const calloutTypes = { ...current.calloutTypes, [type]: entry };
                await this.plugin.setAppearance({ ...current, calloutTypes }, choice);
              }).open();
          }));
        },
      },
      this.toggle("Code background", "Tints inline code and code block backgrounds with the callout's own color, preserving syntax highlighting. Code in a callout title takes the title's color. Applies to Reading View and Live Preview.",
        () => this.plugin.settings.calloutCode, (value) => this.plugin.setCalloutCode(value)),
      this.toggle("GitHub compatibility", "Shows in the callout editor whether GitHub renders the callout as an alert, with a button that makes it one. Edit a callout from its hover button, the editor menu, or Edit callout in the command palette.",
        () => settings().github, (github) => this.plugin.setCallouts({ ...settings(), github })),
      {
        name: "GitHub folders",
        desc: `Count callouts GitHub would show as plain quotes in these folders and their subfolders. Type to find a folder. Separate paths with commas, or set ${GITHUB_PROPERTY}: true on one note.`,
        render: (setting) => {
          setting.addText((text) => {
            text.setPlaceholder("docs, projects/site").setValue(settings().githubFolders.join(", "))
              .onChange((value) => this.plugin.setCallouts({
                ...settings(), githubFolders: value.split(",").map((folder) => folder.trim()).filter(Boolean),
              }));
            new GitHubFolderSuggest(this.plugin.app, text.inputEl);
          });
        },
      },
    ];
  }

  private mathDefinitions(): SettingDefinition[] {
    const settings = (): MathFormatSettings => this.plugin.settings.mathFormat;
    return [
      {
        name: "Indent",
        desc: "Spaces for each environment level, such as the rows of an aligned or cases environment. Run Format math block or Format all math blocks in note from the command palette, or Format math block from the editor menu.",
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            for (const indent of MATH_INDENTS) dropdown.addOption(String(indent), `${indent} spaces`);
            dropdown.setValue(String(settings().indent)).onChange((value) => this.plugin.setMathFormat({ ...settings(), indent: Number(value) }));
          });
        },
      },
      this.toggle("Align ampersands", "Pads cells so that the & of every row line up. Exact for Latin text in the editor's monospace font; East Asian text in \\text{} lines up approximately.",
        () => settings().alignAmpersands, (alignAmpersands) => this.plugin.setMathFormat({ ...settings(), alignAmpersands })),
      this.toggle("Align row ends", "Pads rows so that their closing \\\\ line up. Long rows push short ones far to the right, so this is off by default.",
        () => settings().alignRowEnds, (alignRowEnds) => this.plugin.setMathFormat({ ...settings(), alignRowEnds })),
    ];
  }

  private bannerDefinitions(): SettingDefinition[] {
    const settings = (): BannerSettings => this.plugin.settings.banner;
    return [
      this.toggle("Enabled", "Display vault media from the patch-banner note property in Reading View and Live Preview.",
        () => settings().enabled, (enabled) => this.plugin.setBanner({ ...settings(), enabled })),
      this.slider("Cover width (%)", `Covers use 10–100% of the note pane (default ${DEFAULT_BANNER_WIDTH_PERCENT}%). Set patch-banner-width on a note to override this.`,
        () => settings().widthPercent, 10, 100, 1, DEFAULT_BANNER_WIDTH_PERCENT, `${DEFAULT_BANNER_WIDTH_PERCENT}%`,
        (widthPercent) => this.plugin.setBanner({ ...settings(), widthPercent })),
      this.toggle("Autoplay videos", "Play visible videos silently. Reduced motion uses click to play.",
        () => settings().autoplayVideos, (autoplayVideos) => this.plugin.setBanner({ ...settings(), autoplayVideos })),
    ];
  }

  private iconDefinitions(): SettingDefinition[] {
    return [
      this.toggle("Enabled", "Show icons before file and folder names in the file explorer. Right-click a file or folder to change or remove its icon.",
        () => this.plugin.settings.icons.enabled, async (enabled) => { await this.plugin.icons?.setEnabled(enabled); }),
      {
        name: "Icon sources",
        desc: "Lucide provides general-purpose outline icons built into Obsidian, matching the app and working offline. Simple Icons adds recognizable brand logos and their brand colors.",
        render: (setting) => {
          setting.descEl.createEl("br");
          setting.descEl.createEl("a", { text: "Lucide", href: "https://lucide.dev/" });
          setting.descEl.appendText(" · ");
          setting.descEl.createEl("a", { text: "Simple Icons", href: "https://simpleicons.org/" });
        },
      },
      {
        name: "Simple Icons",
        desc: "Optional download from jsDelivr. Once installed, you can search brand logos offline for callouts, files and folders.",
        render: (setting) => this.renderSimpleIcons(setting),
      },
      {
        name: "Import from Iconize",
        desc: "Copies Iconize's file and folder icons, replacing icons already set for the same paths. Lucide and Simple Icons are supported; emoji and other icon packs are skipped. Disable Iconize afterwards so icons are not shown twice.",
        render: (setting) => {
          const icons = this.plugin.icons;
          const status = setting.descEl.createDiv({ cls: "obsidian-patch-setting-status" });
          setting.addButton((button) => {
            button.setButtonText("Import").setDisabled(true).onClick(async () => {
              await icons?.importIconize();
              this.update();
            });
            void icons?.countIconizeIcons().then((count) => {
              button.setDisabled(!count);
              status.setText(count === undefined ? "No Iconize settings in this vault." : `Iconize has ${count} file and folder icons.`);
            });
          });
        },
      },
      {
        name: "Icons of missing files",
        desc: "Remove icons whose files or folders no longer exist, for example after a rename outside Obsidian.",
        render: (setting) => {
          const icons = this.plugin.icons;
          const missing = (icons?.missingPaths() ?? []).sort();
          setting.setDesc(missing.length === 0 ? "Every icon belongs to an existing file or folder."
            : `${missing.length} missing ${missing.length === 1 ? "path" : "paths"}. Remove clears the saved icon and color for each path listed below.`);
          if (missing.length) {
            const list = setting.descEl.createEl("ul", { cls: "obsidian-patch-icons-missing-paths" });
            for (const path of missing) list.createEl("li", { text: path });
          }
          setting.addButton((button) => button.setButtonText("Remove").setDisabled(missing.length === 0).onClick(async () => {
            const stillMissing = new Set(icons?.missingPaths());
            const paths = missing.filter(path => stillMissing.has(path));
            if (paths.length) await icons?.removeIcons(paths);
            this.update();
          }));
        },
      },
    ];
  }

  private renderSimpleIcons(setting: Setting): void {
    const icons = this.plugin.icons;
    const status = setting.descEl.createDiv({ cls: "obsidian-patch-setting-status" });
    const showStatus = (state: SimpleIconsStatus): void => {
      status.setText(state.status === "ready" ? `Installed: Simple Icons ${state.version}.`
        : state.status === "loading" ? "Loading…"
          : state.status === "error" ? `Could not load Simple Icons: ${state.message}` : "Optional catalog not installed.");
    };
    showStatus(icons?.simpleIconsStatus() ?? { status: "idle" });
    setting.addButton(button => {
      const label = (): void => {
        button.setButtonText(this.plugin.settings.icons.installedPack ? "Update" : "Install");
      };
      label();
      button.setTooltip("Download the latest Simple Icons catalog from jsDelivr").onClick(async () => {
        if (!icons) return;
        button.setDisabled(true);
        showStatus({ status: "loading" });
        try { showStatus(await icons.updateSimpleIcons()); }
        finally { label(); button.setDisabled(false); }
      });
    });
  }

  private lineWidthDefinitions(): SettingDefinition[] {
    const settings = (): LineWidthSettings => this.plugin.settings.lineWidth;
    return [
      this.toggle("Enabled", `Keeps at least 500 px between the sidebars in the main desktop window. For the reading column, enable Settings > Editor > Readable line length. A note can set its own width with the ${LINE_WIDTH_PROPERTY} property.`,
        () => settings().enabled, (enabled) => this.plugin.setLineWidth({ ...settings(), enabled })),
      {
        name: "Line width (px)",
        desc: `${MIN_LINE_WIDTH}–${MAX_LINE_WIDTH} px, for notes without the property. Type a value and press Enter or leave the field to apply, or drag the slider. The column shrinks to fit the pane and theme padding. Patches defaults to ${DEFAULT_LINE_WIDTH} px.`,
        render: (setting) => {
          let input: TextComponent;
          let slider: SliderComponent;
          const sync = (width: number): void => {
            input.setValue(String(width));
            input.inputEl.removeAttribute("aria-invalid");
            slider.setValue(width);
          };
          const save = async (width: number): Promise<void> => {
            sync(width);
            if (width !== settings().width) await this.plugin.setLineWidth({ ...settings(), width });
          };
          setting.addText((text) => {
            input = text;
            text.setValue(String(settings().width));
            const el = text.inputEl;
            el.type = "number";
            el.min = String(MIN_LINE_WIDTH);
            el.max = String(MAX_LINE_WIDTH);
            el.step = "1";
            el.required = true;
            el.title = `Use a whole number from ${MIN_LINE_WIDTH} to ${MAX_LINE_WIDTH}.`;
            el.addClass("obsidian-patch-line-width-input");
            el.setAttribute("aria-label", "Line width in pixels");
            el.addEventListener("input", () => el.removeAttribute("aria-invalid"));
            const commit = (report = false): void => {
              if (!el.checkValidity()) {
                el.setAttribute("aria-invalid", "true");
                if (report) el.reportValidity();
                return;
              }
              void save(el.valueAsNumber);
            };
            el.addEventListener("blur", () => commit());
            el.addEventListener("keydown", (event) => {
              if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault();
                commit(true);
              }
            });
          }).addSlider((control) => {
            slider = control;
            control.setLimits(MIN_LINE_WIDTH, MAX_LINE_WIDTH, LINE_WIDTH_STEP)
              .setValue(settings().width).setDisplayFormat(() => "").onChange(save);
          }).addExtraButton((button) => button.setIcon("rotate-ccw")
            .setTooltip(`Reset to ${DEFAULT_LINE_WIDTH} px`).onClick(() => save(DEFAULT_LINE_WIDTH)));
        },
      },
      this.toggle("Show in status bar", "A slider in the status bar changes the line width as you read. Click its value to reset it. Desktop only.",
        () => settings().statusBar, (statusBar) => this.plugin.setLineWidth({ ...settings(), statusBar })),
    ];
  }

  private editorDefinitions(): SettingDefinition[] {
    return [
      this.toggle("Active line", "Marks the line the cursor is on with a bar in the margin, faded while the editor is unfocused, and highlights its line number. Applies to Live Preview and Source mode.",
        () => this.plugin.settings.activeLine, (enabled) => this.plugin.setActiveLine(enabled)),
      this.toggle("Heading levels", "Shows right-aligned H1–H6 labels beside headings in Reading View, Live Preview, and Source mode. Labels are not saved in your notes or included in PDF exports.",
        () => this.plugin.settings.headingLevels, (enabled) => this.plugin.setHeadingLevels(enabled)),
      { name: "Heading numbering", desc: "Display section numbers in Live Preview and Reading View. A note can choose its own style with the patch-heading-numbering property.",
        render: setting => renderNumberingSetting(setting, this.plugin.app, () => this.plugin.settings.headingNumbering,
          value => this.plugin.setHeadingNumbering(value)) },
    ];
  }

  private pdfDefinitions(): SettingDefinition[] {
    const settings = (): PdfExportSettings => this.plugin.settings.pdfExport;
    return [
      this.toggle("Document outline", "Adds a hierarchy of heading bookmarks to Obsidian's Export to PDF on desktop. Open the PDF reader's outline or bookmarks panel to navigate.",
        () => settings().outline, (outline) => this.plugin.setPdfExport({ ...settings(), outline })),
      this.toggle("Heading links", "Makes links to headings in the exported note jump within the PDF. Links to other notes and block references are not converted.",
        () => settings().headingLinks, (headingLinks) => this.plugin.setPdfExport({ ...settings(), headingLinks })),
    ];
  }

  private toggle(name: string, desc: string, value: () => boolean, onChange: (value: boolean) => Promise<void>): SettingDefinition {
    return { name, desc, render: (setting) => {
      setting.addToggle((toggle) => toggle.setValue(value()).onChange(onChange));
    } };
  }

  private slider(
    name: string, desc: string, value: () => number, min: number, max: number, step: number,
    defaultValue: number, resetLabel: string, onChange: (value: number) => Promise<void>,
  ): SettingDefinition {
    return { name, desc, render: (setting) => {
      let widthSlider: SliderComponent;
      setting.addSlider((slider) => {
        widthSlider = slider;
        slider.setLimits(min, max, step).setValue(value()).onChange(onChange);
      }).addExtraButton((button) => button.setIcon("rotate-ccw").setTooltip(`Reset to ${resetLabel}`).onClick(async () => {
        widthSlider.setValue(defaultValue);
        await onChange(defaultValue);
      }));
    } };
  }
}

function parseSettings(data: unknown): PatchesSettings {
  const record = settingsRecord(data);

  return {
    mermaidSecurityLevel: isMermaidSecurityLevel(record.mermaidSecurityLevel)
      ? record.mermaidSecurityLevel
      : DEFAULT_MERMAID_SECURITY_LEVEL,
    ...parseMermaidSettings(record),
    appearance: parseAppearanceSettings(record.appearance),
    banner: parseBannerSettings(record.banner),
    icons: parseIconSettings(record.icons),
    lineWidth: parseLineWidthSettings(record.lineWidth),
    mathFormat: parseMathFormatSettings(record.mathFormat),
    callouts: parseCalloutSettings(record.callouts),
    pdfExport: parsePdfExportSettings(record.pdfExport),
    headingLevels: typeof record.headingLevels === "boolean" ? record.headingLevels : DEFAULT_HEADING_LEVELS_ENABLED,
    headingNumbering: parseNumberingSettings(record.headingNumbering),
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

function settingsRecord(data: unknown): Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : {};
}
