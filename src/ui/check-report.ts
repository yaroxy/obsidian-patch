import { Modal, type App } from "obsidian";

let nextDetailsId = 0;

/** Note checks share a fixed summary, a scrollable list and per-row actions. */
export abstract class CheckReportModal extends Modal {
  protected readonly summaryEl: HTMLParagraphElement;

  constructor(app: App, title: string, featureClass: string) {
    super(app);
    this.setTitle(title);
    this.containerEl.addClass("obsidian-patch-report-container");
    this.modalEl.addClass("obsidian-patch-report", featureClass);
    this.summaryEl = this.contentEl.createEl("p", { attr: { role: "status" } });
  }

  protected addList(label: string): HTMLUListElement {
    return this.contentEl.createEl("ul", { cls: "obsidian-patch-report-list", attr: { "aria-label": label } });
  }

  protected addRow(list: HTMLUListElement, jumpLabel: string, jump: () => void) {
    const row = list.createEl("li", { cls: "obsidian-patch-report-item" });
    const heading = row.createDiv({ cls: "obsidian-patch-report-row" });
    const label = heading.createSpan();
    const actions = heading.createDiv({ cls: "obsidian-patch-report-actions" });
    actions.createEl("button", { text: "Jump", attr: { "aria-label": jumpLabel } }).addEventListener("click", jump);
    return { row, label, actions };
  }

  protected addDetails(actions: HTMLElement, details: HTMLElement, label: string, buttonText = "Details"): void {
    details.id = `obsidian-patch-report-details-${++nextDetailsId}`;
    details.hidden = true;
    const button = actions.createEl("button", { text: buttonText, attr: {
      "aria-label": label, "aria-controls": details.id, "aria-expanded": "false",
    } });
    button.addEventListener("click", () => {
      details.hidden = !details.hidden;
      button.setAttribute("aria-expanded", String(!details.hidden));
    });
  }
}
