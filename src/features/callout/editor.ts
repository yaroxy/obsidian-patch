import { Component, DropdownComponent, MarkdownRenderer, Modal, Notice, Scope, TextComponent, setIcon, setTooltip, type App } from "obsidian";
import type { AppearanceSettings } from "../appearance";
import { CheckReportModal } from "../../ui/check-report";
import { makeResizable } from "../../ui/resizable-modal";
import {
  calloutLines, defaultTitle, displayCalloutType, githubIssues, isValidCalloutMetadata, isValidCalloutType, toGitHub,
  type CalloutHeader, type Fold, type GitHubIssue,
} from "./model";
import {
  discoverCalloutTypes, filterCalloutCatalog, groupCalloutTypes, renderChipIcon,
  type CalloutType, type CalloutTypeCatalog, type CalloutTypeGroup,
} from "./types";

export interface CalloutDraft {
  header: CalloutHeader;
  body: string[];
}

export type Conversion = "text" | "blockquote";

export interface CalloutEditorOptions {
  title: string;
  draft: CalloutDraft;
  /** Where the callout sits, which decides whether GitHub can show it at all. */
  placement: { indent: string; depth: number };
  sourcePath: string;
  showGitHub: boolean;
  prioritizeGitHub: boolean;
  appearances: AppearanceSettings["calloutTypes"];
  save(draft: CalloutDraft, changed: { header: boolean; body: boolean }): void | Promise<void>;
  /**
   * Given for an existing callout: the editor then offers to convert it, and
   * saving it unchanged writes nothing. A new callout is always written.
   */
  convert?(draft: CalloutDraft, to: Conversion): void | Promise<void>;
}

const FOLDS: [Fold, string][] = [["", "Not foldable"], ["+", "Foldable, expanded"], ["-", "Foldable, collapsed"]];

/**
 * Edits a callout's type, title, fold state, metadata, and content, with a
 * flicker-free live preview and GitHub compatibility checks. Header controls
 * span the modal; only the content and its preview sit side by side.
 */
export class CalloutEditor extends Modal {
  private header: CalloutHeader;
  private body: string;
  private readonly initial?: string;
  private readonly catalog: CalloutTypeCatalog;
  private readonly byLower: Map<string, CalloutType>;
  private readonly filterInput: HTMLInputElement;
  private readonly typePicker: HTMLElement;
  private readonly titleText: TextComponent;
  private readonly foldDropdown: DropdownComponent;
  private readonly metadataText: TextComponent;
  private readonly bodyArea: HTMLTextAreaElement;
  private readonly previewWrap: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly github?: HTMLElement;
  private readonly saveButton: HTMLButtonElement;
  private previewComponent?: Component;
  private renderTimer = 0;
  private renderSeq = 0;
  private closed = false;
  private lastMarkdown?: string;

  constructor(app: App, private readonly options: CalloutEditorOptions) {
    super(app);
    this.header = { ...options.draft.header };
    this.body = options.draft.body.join("\n");
    if (options.convert) this.initial = JSON.stringify([this.header, this.body]);
    this.setTitle(options.title);
    this.modalEl.addClass("obsidian-patch-callout-modal");
    const { contentEl } = this;

    this.catalog = groupCalloutTypes(discoverCalloutTypes(contentEl.doc, options.appearances));
    this.byLower = new Map(this.catalog.all.map((type) => [type.name.toLowerCase(), type]));

    const typesSection = contentEl.createDiv({ cls: "obsidian-patch-callout-section" });
    const typeHead = typesSection.createDiv({ cls: "obsidian-patch-callout-type-head" });
    typeHead.createSpan({ cls: "obsidian-patch-callout-label", text: "Type" });
    this.filterInput = typeHead.createEl("input", {
      cls: "obsidian-patch-callout-filter",
      attr: { type: "search", placeholder: "Filter or enter custom type…", "aria-label": "Filter callout types" },
    });
    this.filterInput.addEventListener("input", () => this.renderTypePicker());
    this.filterInput.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter" || evt.isComposing) return;
      evt.preventDefault();
      this.typePicker.querySelector<HTMLButtonElement>("button.obsidian-patch-callout-chip")?.click();
    });
    this.typePicker = typesSection.createDiv({ cls: "obsidian-patch-callout-type-picker" });

    const fields = contentEl.createDiv({ cls: "obsidian-patch-callout-fields" });
    const field = (name: string): HTMLElement => {
      const el = fields.createEl("label", { cls: "obsidian-patch-callout-field" });
      el.createSpan({ cls: "obsidian-patch-callout-label", text: name });
      return el;
    };
    this.titleText = new TextComponent(field("Title")).setValue(this.header.title)
      .onChange((value) => this.update({ title: value.trim() }));
    setTooltip(this.titleText.inputEl, "Shown in the callout's header. Empty shows the type's name.");
    this.foldDropdown = new DropdownComponent(field("Fold"));
    for (const [fold, label] of FOLDS) this.foldDropdown.addOption(fold, label);
    this.foldDropdown.setValue(this.header.fold).onChange((value) => this.update({ fold: value as Fold }));
    this.metadataText = new TextComponent(field("Metadata")).setPlaceholder("Optional").setValue(this.header.metadata)
      .onChange((value) => this.update({ metadata: value.trim() }));
    setTooltip(this.metadataText.inputEl, "Text after | in the brackets, which some themes and snippets read.");

    for (const input of [this.titleText.inputEl, this.metadataText.inputEl]) {
      input.addEventListener("keydown", (evt) => {
        if (evt.key !== "Enter" || evt.isComposing) return;
        evt.preventDefault();
        void this.commit();
      });
    }

    const panes = contentEl.createDiv({ cls: "obsidian-patch-callout-panes" });
    const source = panes.createEl("label", { cls: "obsidian-patch-callout-pane" });
    source.createSpan({ cls: "obsidian-patch-callout-label", text: "Content" });
    this.bodyArea = source.createEl("textarea", {
      cls: "obsidian-patch-callout-body",
      attr: { spellcheck: "false", placeholder: "Markdown, without the > markers" },
    });
    this.bodyArea.value = this.body;
    this.bodyArea.addEventListener("input", () => {
      this.body = this.bodyArea.value;
      this.refresh();
    });
    const result = panes.createDiv({ cls: "obsidian-patch-callout-pane" });
    result.createSpan({ cls: "obsidian-patch-callout-label", text: "Preview" });
    this.previewWrap = result.createDiv({ cls: "obsidian-patch-callout-preview-wrap" });
    this.preview = this.previewWrap.createDiv({ cls: "obsidian-patch-callout-preview markdown-rendered" });

    // Below both panes, so a long list of issues does not squeeze the preview.
    if (options.showGitHub) this.github = contentEl.createDiv({ cls: "obsidian-patch-callout-github" });

    // Outside the content, which scrolls, so the buttons stay in view.
    const footer = this.modalEl.createDiv({ cls: "modal-button-container" });
    if (options.convert) {
      const group = footer.createDiv({ cls: "obsidian-patch-callout-convert" });
      const convert = (text: string, tooltip: string, to: Conversion): void => {
        const button = group.createEl("button", { text });
        setTooltip(button, tooltip);
        button.addEventListener("click", () => { void this.commit(to); });
      };
      convert("Convert to text", "Replace the callout with its content as normal text, with the title as a bold first line.", "text");
      convert("Convert to blockquote", "Keep the content as a plain blockquote, with the title as a bold first line.", "blockquote");
    }
    footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    this.saveButton = footer.createEl("button", { text: "Save", cls: "mod-cta" });
    this.saveButton.addEventListener("click", () => { void this.commit(); });
    makeResizable(this, "obsidian-patch-callout-editor-size");

    this.scope = new Scope(this.scope);
    this.scope.register(["Mod"], "Enter", () => {
      void this.commit();
      return false;
    });
  }

  override onOpen(): void {
    void this.render();
  }

  override onClose(): void {
    this.closed = true;
    this.renderSeq++;
    this.modalEl.win.clearTimeout(this.renderTimer);
    this.previewComponent?.unload();
    this.previewComponent = undefined;
  }

  private update(change: Partial<CalloutHeader>): void {
    this.header = { ...this.header, ...change };
    this.refresh();
  }

  private selectType(chosen: string): void {
    this.update({ type: displayCalloutType(chosen) });
  }

  private syncHeader(): void {
    this.renderTypePicker();
    this.titleText.setPlaceholder(defaultTitle(this.header.type));
    const metaValid = isValidCalloutMetadata(this.header.metadata);
    const typeValid = isValidCalloutType(this.header.type);
    this.metadataText.inputEl.toggleClass("obsidian-patch-input-invalid", !metaValid);
    this.saveButton.disabled = !metaValid || !typeValid;
    this.showGitHubIssues();
  }

  /** Re-renders the preview shortly after typing stops. */
  private refresh(): void {
    this.modalEl.win.clearTimeout(this.renderTimer);
    const seq = ++this.renderSeq;
    this.renderTimer = this.modalEl.win.setTimeout(() => { void this.render(seq); }, 150);
    this.syncHeader();
  }

  private lines(): string[] {
    return this.body === "" ? [] : this.body.split("\n");
  }

  private async render(seq = ++this.renderSeq): Promise<void> {
    this.modalEl.win.clearTimeout(this.renderTimer);
    this.syncHeader();
    if (this.closed) return;
    const markdown = calloutLines("", 1, this.header, this.lines()).join("\n");
    if (markdown === this.lastMarkdown && this.previewComponent) return;
    const nextComponent = new Component();
    nextComponent.load();
    const buffer = this.previewWrap.createDiv({ cls: "obsidian-patch-callout-preview-buffer markdown-rendered" });
    try {
      await MarkdownRenderer.render(this.app, markdown, buffer, this.options.sourcePath, nextComponent);
    } catch {
      nextComponent.unload();
      buffer.remove();
      return;
    }
    if (this.closed || seq !== this.renderSeq) {
      nextComponent.unload();
      buffer.remove();
      return;
    }
    const { scrollTop, scrollLeft } = this.preview;
    this.preview.replaceChildren(...Array.from(buffer.childNodes));
    buffer.remove();
    this.previewComponent?.unload();
    this.previewComponent = nextComponent;
    this.lastMarkdown = markdown;
    this.preview.scrollTop = scrollTop;
    this.preview.scrollLeft = scrollLeft;
  }

  private renderTypePicker(): void {
    this.typePicker.empty();
    const activeLower = this.header.type.toLowerCase();
    const query = this.filterInput.value;

    const groupTooltip = (group: CalloutTypeGroup): string | undefined => group.aliases.length > 1
      ? `${displayCalloutType(group.primary)} (aliases: ${group.aliases.slice(1).map(displayCalloutType).join(", ")})` : undefined;
    const makeChip = (
      parent: HTMLElement,
      type: CalloutType,
      active: boolean,
      tooltip: string | undefined,
      onClick: () => void,
    ): HTMLButtonElement => {
      const label = displayCalloutType(type.name);
      const chip = parent.createEl("button", {
        cls: "obsidian-patch-callout-chip",
        attr: { type: "button", "data-callout-type": type.name.toLowerCase(), "aria-label": label, "aria-pressed": String(active) },
      });
      if (active) chip.addClass("is-active");
      if (type.color) chip.style.setProperty("--obsidian-patch-chip-color", type.color);
      const icon = chip.createSpan({ cls: "obsidian-patch-callout-chip-icon" });
      renderChipIcon(icon, type.icon);
      chip.createSpan({ text: label });
      if (tooltip) setTooltip(chip, tooltip);
      chip.addEventListener("click", onClick);
      return chip;
    };

    if (query.trim() === "") {
      if (this.options.prioritizeGitHub) {
        this.typePicker.createDiv({ cls: "obsidian-patch-callout-group-label", text: "GitHub alerts" });
        const ghGrid = this.typePicker.createDiv({ cls: "obsidian-patch-callout-types" });
        for (const type of this.catalog.github) {
          makeChip(ghGrid, type, activeLower === type.name.toLowerCase(), undefined, () => this.selectType(type.name));
        }
        this.typePicker.createDiv({ cls: "obsidian-patch-callout-group-label", text: "Built-in" });
      }

      const grid = this.typePicker.createDiv({ cls: "obsidian-patch-callout-types" });
      let activeGroup: CalloutTypeGroup | undefined;
      for (const group of this.catalog.builtin) {
        const isGroupActive = group.aliases.some((alias) => alias.toLowerCase() === activeLower);
        if (isGroupActive) activeGroup = group;
        makeChip(grid, { name: group.primary, icon: group.icon, color: group.color }, isGroupActive, groupTooltip(group),
          () => this.selectType(group.primary));
      }

      if (this.catalog.custom.length > 0) {
        this.typePicker.createDiv({ cls: "obsidian-patch-callout-group-label", text: "Custom types" });
        const customGrid = this.typePicker.createDiv({ cls: "obsidian-patch-callout-types" });
        for (const group of this.catalog.custom) {
          const isGroupActive = group.aliases.some((alias) => alias.toLowerCase() === activeLower);
          if (isGroupActive && !activeGroup) activeGroup = group;
          makeChip(customGrid, { name: group.primary, icon: group.icon, color: group.color }, isGroupActive, groupTooltip(group),
            () => this.selectType(group.primary));
        }
      }

      if (!this.byLower.has(activeLower) && this.header.type.trim() !== "") {
        this.typePicker.createDiv({ cls: "obsidian-patch-callout-group-label", text: "Current type" });
        const unknownGrid = this.typePicker.createDiv({ cls: "obsidian-patch-callout-types" });
        makeChip(unknownGrid, { name: this.header.type, icon: "", color: "" }, true, undefined,
          () => this.selectType(this.header.type));
      }

      if (activeGroup && activeGroup.aliases.length > 1) {
        const row = this.typePicker.createDiv({ cls: "obsidian-patch-callout-aliases" });
        row.createSpan({ text: "Aliases:" });
        for (const alias of activeGroup.aliases) {
          const active = alias.toLowerCase() === activeLower;
          const button = row.createEl("button", {
            cls: "obsidian-patch-callout-alias",
            text: displayCalloutType(alias),
            attr: { type: "button", "aria-pressed": String(active) },
          });
          if (active) button.addClass("is-active");
          button.addEventListener("click", () => this.selectType(alias));
        }
      }
      return;
    }

    const trimmed = query.trim();
    const { directMatches, canUseCustom, customError } = filterCalloutCatalog(this.catalog, trimmed);
    if (customError) {
      this.typePicker.createDiv({ cls: "obsidian-patch-callout-error", text: customError });
      return;
    }
    const grid = this.typePicker.createDiv({ cls: "obsidian-patch-callout-types" });
    for (const type of directMatches) {
      makeChip(grid, type, type.name.toLowerCase() === activeLower, undefined, () => {
        this.filterInput.value = "";
        this.selectType(type.name);
      });
    }
    if (canUseCustom) {
      const custom = grid.createEl("button", {
        cls: "obsidian-patch-callout-chip obsidian-patch-callout-custom-chip",
        text: `Use "${displayCalloutType(trimmed)}"`,
        attr: { type: "button" },
      });
      custom.addEventListener("click", () => {
        this.filterInput.value = "";
        this.selectType(trimmed);
      });
    }
  }

  private showGitHubIssues(): void {
    const panel = this.github;
    if (!panel) return;
    panel.empty();
    const issues = githubIssues({ ...this.options.placement, header: this.header, body: this.lines() });
    const errors = issues.filter(({ level }) => level === "error");
    const head = panel.createDiv({ cls: "obsidian-patch-callout-github-head" });
    const status = head.createDiv({ cls: `obsidian-patch-callout-github-status ${errors.length ? "is-error" : "is-ok"}` });
    setIcon(status.createSpan(), errors.length ? "alert-triangle" : "check-circle-2");
    status.createSpan({ text: errors.length ? "GitHub shows this callout as a plain blockquote." : "GitHub shows this callout as an alert." });
    // Placement cannot be fixed from here; everything else can.
    if (errors.some(({ message }) => !message.includes("top level"))) {
      head.createEl("button", { text: "Make GitHub-compatible" }).addEventListener("click", () => this.makeCompatible());
    }
    if (issues.length > 0) {
      const ul = panel.createEl("ul");
      for (const { message } of issues) ul.createEl("li", { text: message });
    }
  }

  private makeCompatible(): void {
    const { header, body } = toGitHub(this.header, this.lines());
    this.header = header;
    this.body = body.join("\n");
    this.bodyArea.value = this.body;
    this.titleText.setValue("");
    this.foldDropdown.setValue("");
    this.metadataText.setValue("");
    this.filterInput.value = "";
    void this.render();
  }

  /** Close only after the selected operation successfully writes this draft. */
  private async commit(to?: Conversion): Promise<void> {
    if (this.closed || this.modalEl.inert) return;
    if (!to && (!isValidCalloutType(this.header.type) || !isValidCalloutMetadata(this.header.metadata))) return;
    const draft = { header: this.header, body: this.lines() };
    this.modalEl.inert = true;
    try {
      if (to) {
        await this.options.convert?.(draft, to);
        this.shouldRestoreSelection = false;
      } else if (JSON.stringify([this.header, this.body]) !== this.initial) {
        const [header, body] = this.initial ? JSON.parse(this.initial) as [CalloutHeader, string] : [undefined, undefined];
        await this.options.save(draft, { header: JSON.stringify(this.header) !== JSON.stringify(header), body: this.body !== body });
      }
      if (!this.closed) this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    } finally {
      this.modalEl.inert = false;
    }
  }
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Lists the callouts of a note with how GitHub would show each. */
export class GitHubReport extends CheckReportModal {
  constructor(app: App, entries: { line: number; label: string; issues: GitHubIssue[] }[], goTo: (line: number) => void) {
    super(app, "Callouts on GitHub", "obsidian-patch-callout-report");
    const failing = entries.filter(({ issues }) => issues.some(({ level }) => level === "error")).length;
    const alerts = entries.length - failing;
    this.summaryEl.setText(`${countLabel(entries.length, "callout")} checked · ${countLabel(alerts, "alert")} · ${countLabel(failing, "plain blockquote")}`);
    const list = this.addList("Callouts in this note");
    for (const { line, label: header, issues } of entries) {
      const error = issues.some(({ level }) => level === "error");
      const { row, label, actions } = this.addRow(list, `Jump to the callout on line ${line + 1}`, () => {
        this.shouldRestoreSelection = false;
        this.close();
        goTo(line);
      });
      row.addClass("obsidian-patch-callout-report-row");
      label.addClass("obsidian-patch-callout-report-head");
      const icon = label.createSpan({ cls: error ? "is-error" : "is-ok", attr: { "aria-hidden": "true" } });
      setIcon(icon, error ? "alert-triangle" : "check-circle-2");
      label.createEl("strong", { text: `Line ${line + 1}` });
      label.createSpan({ cls: "obsidian-patch-callout-report-marker", text: header, attr: { title: header } });
      label.createSpan({ cls: "obsidian-patch-callout-report-outcome", text: error ? "Plain blockquote" : "Alert" });
      if (issues.length > 0) {
        const details = row.createEl("ul");
        for (const { message } of issues) details.createEl("li", { text: message });
        const caption = `Details (${issues.length})`;
        this.addDetails(actions, details, `${caption} for the callout on line ${line + 1}`, caption);
      }
    }
  }
}
