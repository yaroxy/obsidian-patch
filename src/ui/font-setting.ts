import { AbstractInputSuggest, type App, type Setting } from "obsidian";
import { cssFontFamily } from "../features/appearance";

type FontWindow = Window & { queryLocalFonts?: () => Promise<{ family: string }[]> };

class InstalledFontSuggest extends AbstractInputSuggest<string> {
  private families?: Promise<string[] | undefined>;

  constructor(app: App, private readonly input: HTMLInputElement, private readonly commit: () => void) {
    super(app, input);
  }

  list(): Promise<string[] | undefined> {
    const win = this.input.ownerDocument.defaultView as FontWindow;
    this.families ??= win.queryLocalFonts?.().then(faces => [...new Set(faces.map(face => face.family))].sort((a, b) => a.localeCompare(b)))
      .catch(() => undefined);
    return this.families ?? Promise.resolve(undefined);
  }

  protected override async getSuggestions(query: string): Promise<string[]> {
    const names = await this.list();
    const needle = query.trim().toLowerCase();
    return (names ?? []).filter(name => name.toLowerCase().includes(needle)).slice(0, this.limit || 100);
  }

  override renderSuggestion(name: string, el: HTMLElement): void { el.setText(name); }
  override selectSuggestion(name: string): void {
    this.input.value = name;
    this.commit();
    this.close();
  }
}

/** Enumerate local fonts only while using the field. Manual family names also work on mobile. */
export function renderFontSetting(setting: Setting, app: App, value: string, save: (font: string) => Promise<void>, sample: string): void {
  const preview = setting.descEl.createDiv({ cls: "obsidian-patch-font-preview", text: sample });
  const message = setting.descEl.createDiv({ cls: "obsidian-patch-setting-status", attr: { "aria-live": "polite" } });
  setting.addText(text => {
    text.setPlaceholder("e.g. JetBrains Mono").setValue(value);
    const input = text.inputEl;
    const paint = (): void => {
      preview.style.fontFamily = input.value.trim() ? cssFontFamily(input.value.trim()) : "";
      message.empty();
    };
    const check = async (): Promise<void> => {
      const font = input.value.trim();
      const names = await suggest.list();
      if (input.value.trim() !== font || !input.isConnected) return;
      if (font && names?.length && !names.some(name => name.toLowerCase() === font.toLowerCase())) {
        message.setText("This family was not found on this device. Check its installed name.");
      } else if (!names?.length) {
        message.setText("The device font list is unavailable. You can enter an installed family name.");
      }
    };
    let committed = value;
    const commit = async (): Promise<void> => {
      paint();
      const font = input.value.trim();
      if (font !== committed) {
        const previous = committed;
        committed = font;
        try { await save(font); }
        catch {
          if (committed === font) {
            committed = previous;
            message.setText("Could not save this font. Choose it again to retry.");
          }
          return;
        }
      }
      void check();
    };
    const suggest = new InstalledFontSuggest(app, input, () => { void commit(); });
    input.addEventListener("input", paint);
    input.addEventListener("focus", () => { void check(); });
    input.addEventListener("blur", () => { void commit(); });
    // The suggest popover handles Enter on a highlighted family before the input receives it.
    input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing && !event.defaultPrevented) input.blur(); });
    paint();
  });
}
