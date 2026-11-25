import { MarkdownView, type App, type Setting } from "obsidian";
import { numberingForSource } from "../features/heading-numbering";
import { isPreset, numberHeadings, PRESETS, type NumberingSettings } from "../features/heading-numbering/model";
import { readCheckSource } from "../features/note-check-source";
import { numberedLineClass } from "../features/heading-numbering/column";

const sample = [
  { line: 0, level: 1, title: "Report" }, { line: 1, level: 2, title: "Methods" },
  { line: 2, level: 4, title: "Materials" }, { line: 3, level: 3, title: "Verification" },
  { line: 4, level: 2, title: "Results" },
];

export function renderNumberingSetting(setting: Setting, app: App, current: () => NumberingSettings,
  save: (settings: NumberingSettings) => Promise<void>): void {
  const preview = setting.descEl.createDiv({ cls: "obsidian-patch-heading-number-preview", attr: { "aria-label": "Numbering preview" } });
  const status = setting.descEl.createDiv({ attr: { role: "status" } });
  let generation = 0;
  async function draw(): Promise<void> {
    const version = ++generation, settings = current();
    const result = numberHeadings(sample, settings, settings.preset);
    preview.empty();
    for (const heading of sample) {
      const item = result.headings.get(heading.line);
      const row = preview.createDiv();
      if (item) {
        row.classList.add(numberedLineClass);
        row.createSpan({ cls: "obsidian-patch-heading-number", text: item.prefix + " " });
      }
      row.append(heading.title);
    }
    const fallback = "Roman numerals above 3999 are displayed as decimal numbers.";
    status.setText(result.romanFallback ? fallback : "");
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!view || !file) return;
    try {
      const text = await readCheckSource(view, file);
      if (version !== generation || view.file !== file) return;
      const index = numberingForSource(text, settings);
      if (index?.conflict) {
        const { heading, actual } = index.conflict;
        status.setText(`Numbering paused in ${file.basename}. Line ${heading.line + 1}, “${heading.title}”, starts with ${actual}. Expected ${heading.prefix}.`);
      } else if (index?.romanFallback) status.setText(fallback);
    } catch { if (version === generation) status.setText("Could not read the current note for the numbering preview."); }
  }
  const change = async (patch: Partial<NumberingSettings>): Promise<void> => {
    await save({ ...current(), ...patch });
    await draw();
  };
  setting.addToggle(toggle => {
    toggle.setTooltip("Number headings by default in this vault").setValue(current().enabled).onChange(enabled => change({ enabled }));
  });
  setting.addDropdown(dropdown => {
    dropdown.selectEl.setAttribute("aria-label", "Heading numbering style");
    dropdown.addOptions(PRESETS).setValue(current().preset).onChange(async value => { if (isPreset(value)) await change({ preset: value }); });
  });
  const advanced = setting.descEl.createEl("details", { cls: "obsidian-patch-heading-number-options" });
  advanced.createEl("summary", { text: "Numbering options" });
  function levelSelect(label: string, key: "startLevel" | "maxDepth", automatic: boolean): void {
    const row = advanced.createEl("label", { text: label });
    const select = row.createEl("select");
    if (automatic) select.createEl("option", { text: "Automatic", value: "0" });
    for (let i = 1; i <= 6; i++) select.createEl("option", { text: automatic ? "H" + i : String(i), value: String(i) });
    select.value = String(current()[key]);
    select.onchange = () => { void change({ [key]: Number(select.value) }); };
  }
  levelSelect("Starting heading level", "startLevel", true);
  levelSelect("Maximum numbering depth", "maxDepth", false);
  const input = advanced.createEl("label", { text: "First number" }).createEl("input", { type: "number" });
  input.min = "1"; input.step = "1"; input.required = true; input.value = String(current().startAt);
  input.onchange = () => {
    if (input.checkValidity() && Number.isSafeInteger(input.valueAsNumber)) void change({ startAt: input.valueAsNumber });
    else input.value = String(current().startAt);
  };
  void draw();
}
