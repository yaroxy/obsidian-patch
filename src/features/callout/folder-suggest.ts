import { AbstractInputSuggest, type App } from "obsidian";

const byPath = new Intl.Collator(undefined, { numeric: true });

function folderRange(value: string, caret: number): { from: number; to: number } {
  const from = value.slice(0, caret).lastIndexOf(",") + 1;
  const comma = value.indexOf(",", caret);
  return { from, to: comma < 0 ? value.length : comma };
}

/** Complete only the folder under the caret in the comma-separated setting. */
export class GitHubFolderSuggest extends AbstractInputSuggest<string> {
  private activeStart = -1;

  constructor(app: App, private readonly input: HTMLInputElement) {
    super(app, input);
    // The native suggest refreshes on focus and input. Moving between existing
    // paths also needs a fresh list, without firing a change to the setting.
    input.addEventListener("selectionchange", () => {
      if (input.isActiveElement() && this.range().from !== this.activeStart) {
        input.dispatchEvent(new Event("focus"));
      }
    });
  }

  private range(): { from: number; to: number } {
    return folderRange(this.input.value, this.input.selectionStart ?? this.input.value.length);
  }

  protected override getSuggestions(value: string): string[] {
    const { from, to } = this.range();
    this.activeStart = from;
    const query = value.slice(from, to).trim().toLowerCase();
    const others = new Set((value.slice(0, from) + value.slice(to)).split(",").map(path => path.trim().replace(/\/+$/, "")));
    return this.app.vault.getAllFolders(false)
      .map(folder => folder.path)
      .filter(path => !path.includes(",") && !others.has(path) && path.toLowerCase().includes(query))
      .sort(byPath.compare);
  }

  override renderSuggestion(path: string, el: HTMLElement): void {
    el.setText(path);
  }

  override selectSuggestion(path: string): void {
    const value = this.input.value;
    const { from, to } = this.range();
    const leadingSpace = value.slice(from, to).match(/^\s*/)?.[0] ?? "";
    this.input.setRangeText(leadingSpace + path, from, to, "end");
    this.input.dispatchEvent(new Event("input", { bubbles: true }));
    this.close();
  }
}
