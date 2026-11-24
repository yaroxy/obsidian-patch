import { Component, DropdownComponent, MarkdownRenderer, Modal, Notice, Scope, setIcon, type App } from "obsidian";
import { tableReferences } from "./markdown";
import {
  auditHtmlTable, convertHtmlTableToMarkdown, DEFAULT_HTML_TO_MARKDOWN_OPTIONS, verifyRenderedMarkdownTable,
  type CaptionMode, type ConversionIssue, type ConvertedMarkdownTable, type HeaderlessMode,
  type HtmlTableAudit, type HtmlToMarkdownOptions, type MergedCellMode,
} from "./to-markdown";

export interface HtmlToMarkdownEntry {
  tableEl: HTMLTableElement;
  extraAudit?: HtmlTableAudit;
}

export interface HtmlToMarkdownModalOptions {
  entries: HtmlToMarkdownEntry[];
  sourcePath: string;
  noteText: string;
  title: string;
  onConfirm(markdowns: string[]): Promise<boolean | void> | boolean | void;
}

interface VerifiedEntry {
  result: ConvertedMarkdownTable;
  issues: ConversionIssue[];
  verified: boolean;
  verifyError?: string;
  previewNodes: Node[];
}

/**
 * Previews HTML-to-Markdown table conversion with explicit options for merged
 * cells, headerless tables, and captions, verifying every table against
 * Obsidian's own Markdown renderer before allowing confirmation.
 */
export class HtmlToMarkdownModal extends Modal {
  private readonly convOptions: HtmlToMarkdownOptions = { ...DEFAULT_HTML_TO_MARKDOWN_OPTIONS };
  private readonly references: string;
  private readonly hasMerged: boolean;
  private readonly isHeaderless: boolean;
  private readonly hasCaption: boolean;
  private current = 0;
  private results: VerifiedEntry[] = [];
  private renderComponent?: Component;
  private renderSeq = 0;
  private closed = false;
  private verifying = true;
  private navPrev?: HTMLButtonElement;
  private navNext?: HTMLButtonElement;
  private navPos?: HTMLSpanElement;
  private readonly statusEl: HTMLElement;
  private readonly issuesEl: HTMLUListElement;
  private readonly sourceEl: HTMLPreElement;
  private readonly previewEl: HTMLElement;
  private readonly previewBufferHost: HTMLElement;
  private readonly confirmButton: HTMLButtonElement;

  constructor(app: App, private readonly options: HtmlToMarkdownModalOptions) {
    super(app);
    this.references = tableReferences(options.noteText);
    const audits = options.entries.map((entry) => auditHtmlTable(entry.tableEl, options.noteText));
    this.hasMerged = audits.some((a) => a.hasMerged);
    this.isHeaderless = audits.some((a) => a.isHeaderless);
    this.hasCaption = audits.some((a) => a.hasCaption);

    this.setTitle(options.title);
    this.containerEl.addClass("obsidian-patch-report-container");
    this.modalEl.addClass("obsidian-patch-table-md-modal");

    if (options.entries.length > 1) {
      const nav = this.contentEl.createDiv({ cls: "obsidian-patch-table-navigation" });
      this.navPrev = nav.createEl("button", { text: "Previous table", attr: { type: "button" } });
      this.navPos = nav.createSpan({ attr: { "aria-live": "polite" } });
      this.navNext = nav.createEl("button", { text: "Next table", attr: { type: "button" } });
      this.navPrev.addEventListener("click", () => this.move(-1));
      this.navNext.addEventListener("click", () => this.move(1));
    }

    if (this.hasMerged || this.isHeaderless || this.hasCaption) {
      const bar = this.contentEl.createDiv({ cls: "obsidian-patch-table-md-options" });
      const addOption = <K extends keyof HtmlToMarkdownOptions>(
        label: string,
        key: K,
        choices: [HtmlToMarkdownOptions[K], string][],
      ): void => {
        const field = bar.createEl("label", { cls: "obsidian-patch-table-md-option" });
        field.createSpan({ text: label });
        const dropdown = new DropdownComponent(field);
        for (const [value, text] of choices) dropdown.addOption(value, text);
        dropdown.setValue(this.convOptions[key]).onChange((value) => {
          this.convOptions[key] = value as HtmlToMarkdownOptions[K];
          void this.recompute();
        });
      };
      if (this.hasMerged) {
        addOption<MergedCellMode extends HtmlToMarkdownOptions["mergedCells"] ? "mergedCells" : never>(
          "Merged cells",
          "mergedCells",
          [["blank", "Keep first, blank rest"], ["repeat", "Repeat across slots"]],
        );
      }
      if (this.isHeaderless) {
        addOption<HeaderlessMode extends HtmlToMarkdownOptions["headerless"] ? "headerless" : never>(
          "Headerless table",
          "headerless",
          [["empty-header", "Add empty header row"], ["promote-first", "Use Row 1 as header"]],
        );
      }
      if (this.hasCaption) {
        addOption<CaptionMode extends HtmlToMarkdownOptions["caption"] ? "caption" : never>(
          "Caption",
          "caption",
          [["bold", "Bold line above table"], ["drop", "Discard caption"]],
        );
      }
    }

    this.statusEl = this.contentEl.createDiv({ cls: "obsidian-patch-table-md-status", attr: { role: "status" } });
    this.issuesEl = this.contentEl.createEl("ul", { cls: "obsidian-patch-table-md-issues" });

    const panes = this.contentEl.createDiv({ cls: "obsidian-patch-table-md-panes" });
    const left = panes.createDiv({ cls: "obsidian-patch-table-md-pane" });
    left.createDiv({ cls: "obsidian-patch-table-md-label", text: "Markdown source" });
    this.sourceEl = left.createEl("pre", { cls: "obsidian-patch-table-md-source" });

    const right = panes.createDiv({ cls: "obsidian-patch-table-md-pane" });
    right.createDiv({ cls: "obsidian-patch-table-md-label", text: "Rendered preview" });
    const previewWrap = right.createDiv({ cls: "obsidian-patch-table-md-preview-wrap" });
    this.previewEl = previewWrap.createDiv({ cls: "obsidian-patch-table-md-preview markdown-rendered" });
    this.previewBufferHost = previewWrap.createDiv({ cls: "obsidian-patch-table-md-buffer markdown-rendered" });

    const footer = this.modalEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: "Cancel", attr: { type: "button" } }).addEventListener("click", () => this.close());
    const label = options.entries.length > 1 ? `Convert all ${options.entries.length} tables` : "Convert to Markdown";
    this.confirmButton = footer.createEl("button", { text: label, cls: "mod-cta", attr: { type: "button" } });
    this.confirmButton.disabled = true;
    this.confirmButton.addEventListener("click", () => { void this.commit(); });

    this.scope = new Scope(this.scope);
    this.scope.register(["Mod"], "Enter", () => {
      if (!this.confirmButton.disabled) void this.commit();
      return false;
    });
  }

  override onOpen(): void {
    void this.recompute();
  }

  override onClose(): void {
    this.closed = true;
    this.renderSeq++;
    this.renderComponent?.unload();
    this.renderComponent = undefined;
  }

  private move(step: number): void {
    const next = this.current + step;
    if (next < 0 || next >= this.options.entries.length) return;
    this.current = next;
    this.showCurrent();
  }

  private async recompute(): Promise<void> {
    const seq = ++this.renderSeq;
    this.verifying = true;
    this.confirmButton.disabled = true;
    const component = new Component();
    component.load();

    const computed: VerifiedEntry[] = [];
    for (const entry of this.options.entries) {
      const result = convertHtmlTableToMarkdown(
        entry.tableEl,
        this.convOptions,
        this.options.noteText,
        entry.extraAudit,
      );
      const issues: ConversionIssue[] = [...result.issues];
      for (const target of result.internalLinks) {
        const cleanTarget = target.split("#")[0]?.trim() ?? "";
        if (cleanTarget && !this.app.metadataCache.getFirstLinkpathDest(cleanTarget, this.options.sourcePath)) {
          issues.push({ kind: "broken-link", message: `Unresolved wiki-link target "${target}".` });
        }
      }
      if (result.blocking.length > 0) {
        computed.push({ result, issues, verified: false, verifyError: result.blocking[0], previewNodes: [] });
        continue;
      }
      const scratch = this.previewBufferHost.createDiv();
      const inputMd = this.references ? `${result.markdown}\n\n${this.references}` : result.markdown;
      try {
        await MarkdownRenderer.render(this.app, inputMd, scratch, this.options.sourcePath, component);
      } catch (error) {
        scratch.remove();
        computed.push({
          result, issues, verified: false,
          verifyError: `Round-trip render failed: ${error instanceof Error ? error.message : String(error)}`,
          previewNodes: [],
        });
        continue;
      }
      if (this.closed || seq !== this.renderSeq) {
        scratch.remove();
        component.unload();
        return;
      }
      const check = verifyRenderedMarkdownTable(scratch, result);
      const previewNodes = Array.from(scratch.childNodes);
      scratch.remove();
      computed.push({
        result, issues,
        verified: check.ok,
        verifyError: check.ok ? undefined : check.reason,
        previewNodes,
      });
    }

    if (this.closed || seq !== this.renderSeq) {
      component.unload();
      return;
    }
    this.renderComponent?.unload();
    this.renderComponent = component;
    this.results = computed;
    this.verifying = false;
    this.showCurrent();
  }

  private showCurrent(): void {
    const entry = this.results[this.current];
    if (!entry) return;
    if (this.navPrev && this.navNext && this.navPos) {
      this.navPos.setText(`Table ${this.current + 1} of ${this.results.length}`);
      this.navPrev.disabled = this.current === 0;
      this.navNext.disabled = this.current === this.results.length - 1;
    }

    this.sourceEl.setText(entry.result.markdown);
    this.previewEl.replaceChildren(...entry.previewNodes.map((n) => n.cloneNode(true)));

    this.statusEl.empty();
    this.statusEl.removeClass("is-ok", "is-warning", "is-error");
    this.issuesEl.empty();

    const firstFailed = this.results.findIndex((item) => !item.verified);
    if (!entry.verified) {
      this.statusEl.addClass("is-error");
      setIcon(this.statusEl.createSpan(), "alert-triangle");
      this.statusEl.createSpan({ text: `Verification blocked: ${entry.verifyError ?? "Rendered output differs from HTML source."}` });
    } else if (firstFailed !== -1) {
      this.statusEl.addClass("is-error");
      setIcon(this.statusEl.createSpan(), "alert-triangle");
      this.statusEl.createSpan({ text: `Table ${firstFailed + 1} failed verification: ${this.results[firstFailed]!.verifyError ?? "Rendered output differs."}` });
    } else if (entry.issues.length > 0) {
      this.statusEl.addClass("is-warning");
      setIcon(this.statusEl.createSpan(), "alert-triangle");
      this.statusEl.createSpan({ text: `Verified with ${entry.issues.length} format/structure notice${entry.issues.length === 1 ? "" : "s"}.` });
    } else {
      this.statusEl.addClass("is-ok");
      setIcon(this.statusEl.createSpan(), "check-circle-2");
      this.statusEl.createSpan({ text: "Lossless round-trip verified." });
    }

    for (const issue of entry.issues) {
      this.issuesEl.createEl("li", { text: issue.message });
    }
    this.issuesEl.hidden = entry.issues.length === 0;

    this.confirmButton.disabled = this.verifying || this.results.length === 0 || firstFailed !== -1;
  }

  private async commit(): Promise<void> {
    if (this.confirmButton.disabled) return;
    this.confirmButton.disabled = true;
    try {
      const keepOpen = await this.options.onConfirm(this.results.map((r) => r.result.markdown)) === false;
      if (!keepOpen && !this.closed) this.close();
      else if (!this.closed) this.confirmButton.disabled = false;
    } catch (error) {
      new Notice(`Could not convert the table: ${error instanceof Error ? error.message : String(error)}`);
      if (!this.closed) this.confirmButton.disabled = false;
    }
  }
}
