import { Component, DropdownComponent, MarkdownRenderer, Modal, Scope, TextComponent, setIcon, setTooltip, type App } from "obsidian";
import { makeResizable } from "../../ui/resizable-modal";
import { calloutLines, defaultTitle, githubIssues, toGitHub, type CalloutHeader, type Fold, type GitHubIssue } from "./model";

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
  save(draft: CalloutDraft, changed: { header: boolean; body: boolean }): void;
  /**
   * Given for an existing callout: the editor then offers to convert it, and
   * saving it unchanged writes nothing. A new callout is always written.
   */
  convert?(draft: CalloutDraft, to: Conversion): void;
}

export interface CalloutType {
  name: string;
  icon: string;
  /** A CSS color. Obsidian 1.14 gives `--callout-color` as hex; older versions and some themes as an `r, g, b` triple. */
  color: string;
}

const cssColor = (value: string): string => (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(value) ? `rgb(${value})` : value);

/** Rules from every stylesheet, including those nested in media queries. */
function* styleRules(doc: Document): Generator<CSSStyleRule> {
  const walk = function* (rules: CSSRuleList): Generator<CSSStyleRule> {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) yield rule;
      else if (rule instanceof CSSGroupingRule) yield* walk(rule.cssRules);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // A cross-origin sheet hides its rules.
    }
    yield* walk(rules);
  }
}

/**
 * The callout types the loaded styles define, in their order: Obsidian's own
 * with their aliases, then any from the theme and CSS snippets. Each type's
 * icon and color come from the same variables Obsidian draws callouts with.
 */
export function calloutTypes(doc: Document): CalloutType[] {
  const names = ["note"];
  for (const rule of styleRules(doc)) {
    for (const match of rule.selectorText.matchAll(/\.callout\[data-callout=["']?([^"'\]]+)["']?\]/g)) {
      const name = match[1];
      if (name && !names.includes(name)) names.push(name);
    }
  }
  const probe = doc.body.createDiv({ cls: "callout", attr: { style: "display: none" } });
  const types = names.map((name) => {
    probe.dataset.callout = name;
    const style = getComputedStyle(probe);
    return { name, icon: style.getPropertyValue("--callout-icon").trim(), color: cssColor(style.getPropertyValue("--callout-color").trim()) };
  });
  probe.remove();
  return types;
}

const FOLDS: [Fold, string][] = [["", "Not foldable"], ["+", "Foldable, expanded"], ["-", "Foldable, collapsed"]];

/**
 * Edits a callout's type, title, fold state and content, with a rendered
 * preview and, when asked for, how GitHub would show it. The header controls
 * span the modal; only the content and its preview sit side by side, since
 * those are what one compares while typing.
 */
export class CalloutEditor extends Modal {
  private header: CalloutHeader;
  private body: string;
  private readonly initial?: string;
  private readonly component = new Component();
  private readonly chips = new Map<string, HTMLElement>();
  private readonly otherType: TextComponent;
  private readonly titleText: TextComponent;
  private readonly foldDropdown: DropdownComponent;
  private readonly metadataText: TextComponent;
  private readonly bodyArea: HTMLTextAreaElement;
  private readonly preview: HTMLElement;
  private readonly github?: HTMLElement;
  private renderTimer = 0;

  constructor(app: App, private readonly options: CalloutEditorOptions) {
    super(app);
    this.header = { ...options.draft.header };
    this.body = options.draft.body.join("\n");
    if (options.convert) this.initial = JSON.stringify([this.header, this.body]);
    this.setTitle(options.title);
    this.modalEl.addClass("obsidian-patch-callout-modal");
    const { contentEl } = this;

    const types = contentEl.createDiv({ cls: "obsidian-patch-callout-section" });
    types.createDiv({ cls: "obsidian-patch-callout-label", text: "Type" });
    const grid = types.createDiv({ cls: "obsidian-patch-callout-types" });
    for (const type of calloutTypes(contentEl.doc)) {
      const chip = grid.createEl("button", { cls: "obsidian-patch-callout-chip", attr: { type: "button", "aria-label": type.name } });
      if (type.color) chip.style.setProperty("--obsidian-patch-chip-color", type.color);
      const icon = chip.createSpan({ cls: "obsidian-patch-callout-chip-icon" });
      if (type.icon) setIcon(icon, type.icon);
      chip.createSpan({ text: type.name });
      chip.addEventListener("click", () => {
        this.otherType.setValue("");
        this.update({ type: type.name });
      });
      this.chips.set(type.name.toLowerCase(), chip);
    }
    // Any other name goes at the end of the chips, as one more choice of type.
    this.otherType = new TextComponent(grid).setPlaceholder("Other type").onChange((value) => {
      if (value.trim()) this.update({ type: value.trim() });
    });
    this.otherType.inputEl.addClass("obsidian-patch-callout-other");
    setTooltip(this.otherType.inputEl, "Any type name. Types without styles look like note.");
    if (!this.chips.has(this.header.type.toLowerCase())) this.otherType.setValue(this.header.type);

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
    this.preview = result.createDiv({ cls: "obsidian-patch-callout-preview markdown-rendered" });
    // Below both panes, so a long list of issues does not squeeze the preview.
    if (options.showGitHub) this.github = contentEl.createDiv({ cls: "obsidian-patch-callout-github" });

    // Outside the content, which scrolls, so the buttons stay in view.
    const footer = this.modalEl.createDiv({ cls: "modal-button-container" });
    if (options.convert) {
      const group = footer.createDiv({ cls: "obsidian-patch-callout-convert" });
      const convert = (text: string, tooltip: string, to: Conversion): void => {
        const button = group.createEl("button", { text });
        setTooltip(button, tooltip);
        button.addEventListener("click", () => this.convert(to));
      };
      convert("Convert to text", "Replace the callout with its content as normal text, with the title as a bold first line.", "text");
      convert("Convert to blockquote", "Keep the content as a plain blockquote, with the title as a bold first line.", "blockquote");
    }
    footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    footer.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", () => this.commit());
    makeResizable(this, "obsidian-patch-callout-editor-size");

    this.scope = new Scope(this.scope);
    this.scope.register(["Mod"], "Enter", () => {
      this.commit();
      return false;
    });
  }

  override onOpen(): void {
    this.component.load();
    this.render();
  }

  override onClose(): void {
    window.clearTimeout(this.renderTimer);
    this.component.unload();
  }

  private update(change: Partial<CalloutHeader>): void {
    this.header = { ...this.header, ...change };
    this.refresh();
  }

  /** Re-renders the preview shortly after typing stops. */
  private refresh(): void {
    window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => this.render(), 150);
    this.showType();
    this.showGitHubIssues();
  }

  /** Marks the chosen type, and shows in the empty title what Obsidian shows instead. */
  private showType(): void {
    const type = this.header.type.toLowerCase();
    for (const [name, chip] of this.chips) {
      chip.toggleClass("is-active", name === type);
      chip.setAttribute("aria-pressed", String(name === type));
    }
    this.otherType.inputEl.toggleClass("is-active", !this.chips.has(type));
    this.titleText.setPlaceholder(defaultTitle(this.header.type));
  }

  private lines(): string[] {
    return this.body === "" ? [] : this.body.split("\n");
  }

  private render(): void {
    this.showType();
    this.showGitHubIssues();
    this.preview.empty();
    const markdown = calloutLines("", 1, this.header, this.lines()).join("\n");
    void MarkdownRenderer.render(this.app, markdown, this.preview, this.options.sourcePath, this.component);
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
    this.titleText.setValue("");
    this.foldDropdown.setValue("");
    this.metadataText.setValue("");
    this.otherType.setValue(this.chips.has(header.type.toLowerCase()) ? "" : header.type);
    this.bodyArea.value = this.body;
    this.render();
  }

  private commit(): void {
    const current = JSON.stringify([this.header, this.body]);
    if (current !== this.initial) {
      const [header, body] = this.initial ? (JSON.parse(this.initial) as [CalloutHeader, string]) : [undefined, undefined];
      this.options.save(
        { header: this.header, body: this.lines() },
        { header: JSON.stringify(header) !== JSON.stringify(this.header), body: body !== this.body },
      );
    }
    this.close();
  }

  /** Converts the callout as it stands in the editor, edits included. */
  private convert(to: Conversion): void {
    this.options.convert?.({ header: this.header, body: this.lines() }, to);
    this.close();
  }
}

/** Lists the callouts of a note with how GitHub would show each. */
export class GitHubReport extends Modal {
  constructor(app: App, entries: { line: number; label: string; issues: GitHubIssue[] }[], goTo: (line: number) => void) {
    super(app);
    this.setTitle("Callouts on GitHub");
    this.modalEl.addClass("obsidian-patch-callout-report");
    const failing = entries.filter(({ issues }) => issues.some(({ level }) => level === "error")).length;
    this.contentEl.createEl("p", {
      text: failing === 0 ? `GitHub shows all ${entries.length} callouts as alerts.`
        : `GitHub shows ${failing} of ${entries.length} callouts as plain blockquotes.`,
    });
    for (const { line, label, issues } of entries) {
      const row = this.contentEl.createDiv({ cls: "obsidian-patch-callout-report-row" });
      const head = row.createDiv({ cls: "obsidian-patch-callout-report-head" });
      const error = issues.some(({ level }) => level === "error");
      setIcon(head.createSpan({ cls: error ? "is-error" : "is-ok" }), error ? "alert-triangle" : "check-circle-2");
      head.createSpan({ text: `Line ${line + 1}: ${label}` });
      const button = head.createEl("button", { text: "Go to" });
      button.addEventListener("click", () => {
        this.close();
        goTo(line);
      });
      if (issues.length > 0) {
        const ul = row.createEl("ul");
        for (const { message } of issues) ul.createEl("li", { text: message });
      }
    }
  }
}
