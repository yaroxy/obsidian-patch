import { FuzzySuggestModal, Notice, type App, type TFile } from "obsidian";
import { mediaKind } from "./config";
import { type BannerActions } from "./media";

export function bannerActions(app: App, note: TFile): BannerActions {
  return {
    select: () => new BannerPicker(app, note).open(),
    remove: () => writeProperties(app, note, (frontmatter) => {
      delete frontmatter["patch-banner"];
    }),
  };
}

class BannerPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly note: TFile) {
    super(app);
    this.setPlaceholder("Choose a banner image or video from this vault…");
  }

  override getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file) => mediaKind(file.extension) !== undefined);
  }

  override getItemText(file: TFile): string { return file.path; }

  override onChooseItem(file: TFile): void {
    writeProperties(this.app, this.note, (frontmatter) => {
      frontmatter["patch-banner"] = `[[${file.path}]]`;
    });
  }
}

function writeProperties(
  app: App,
  note: TFile,
  change: (frontmatter: Record<string, unknown>) => void,
): void {
  void app.fileManager.processFrontMatter(note, change).catch((error: unknown) => {
    new Notice(`Could not update banner: ${error instanceof Error ? error.message : String(error)}`);
  });
}
