import { getFrontMatterInfo, MarkdownView, Modal, Notice, parseYaml, type App, type Setting, type TFile } from "obsidian";
import { numberingForSource } from "../features/heading-numbering";
import { effectiveNumbering, isPreset, NUMBERING_PROPERTY, noteOptions, numberingProperty, writeNoteOptions, numberHeadings, PRESETS, type NoteOptions, type NumberingSettings } from "../features/heading-numbering/model";
import { readCheckSource } from "../features/note-check-source";
import { numberedLineClass } from "../features/heading-numbering/column";

const sample = [
  { line: 0, level: 1, title: "Report" }, { line: 1, level: 2, title: "Methods" },
  { line: 2, level: 4, title: "Materials" }, { line: 3, level: 3, title: "Verification" },
  { line: 4, level: 2, title: "Results" },
];

type SaveVault = (settings: NumberingSettings) => Promise<void>;
type Target = { file: TFile; view: MarkdownView; options: NoteOptions };
const fields = ["preset", "startLevel", "maxDepth", "startAt"] as const;

class NumberingModal extends Modal {
  constructor(app: App, private current: () => NumberingSettings, private saveVault: SaveVault,
    private refresh: () => Promise<void>, private target?: Target) { super(app); }

  override onOpen(): void {
    const target = this.target, vault = this.current();
    this.modalEl.addClass("obsidian-patch-heading-number-modal");
    this.setTitle(target ? "Heading numbering · This note" : "Heading numbering · Vault defaults");
    this.contentEl.createEl("p", { cls: "obsidian-patch-heading-number-context",
      text: target ? target.file.path : "Used by notes that inherit the vault settings." });
    const form = this.contentEl.createEl("form");
    const grid = form.createDiv({ cls: "obsidian-patch-heading-number-fields" });
    const original: NoteOptions = target ? target.options : { ...vault };
    function field(parent: HTMLElement, title: string): HTMLLabelElement {
      const label = parent.createEl("label");
      label.createSpan({ text: title });
      return label;
    }
    function dropdown(parent: HTMLElement, key: keyof NoteOptions, title: string, choices: Record<string, string>, inherited: string): HTMLSelectElement {
      const select = field(parent, title).createEl("select", { attr: { "aria-label": title } });
      if (target) select.createEl("option", { value: "", text: "Vault default · " + inherited });
      for (const [value, text] of Object.entries(choices)) select.createEl("option", { value, text });
      select.value = String(original[key] ?? "");
      return select;
    }
    const style = dropdown(grid, "preset", "Numbering style", target ? { false: "Off", ...PRESETS } : PRESETS,
      vault.enabled ? PRESETS[vault.preset] : "Off");
    const first = field(grid, "First number").createEl("input", { type: "number", attr: { "aria-label": "First number" } });
    first.min = "1"; first.max = String(Number.MAX_SAFE_INTEGER); first.step = "1"; first.required = !target;
    first.value = String(original.startAt ?? "");
    first.placeholder = "Vault default · " + vault.startAt;
    const advanced = form.createEl("details", { cls: "obsidian-patch-heading-number-reference" });
    advanced.createEl("summary", { text: "Heading level and depth" });
    const advancedGrid = advanced.createDiv({ cls: "obsidian-patch-heading-number-fields" });
    const levels: Record<string, string> = { 0: "Automatic" }, depths: Record<string, string> = {};
    for (let i = 1; i <= 6; i++) { levels[i] = "H" + i; depths[i] = String(i); }
    const level = dropdown(advancedGrid, "startLevel", "Starting heading level", levels, levels[vault.startLevel]!);
    const depth = dropdown(advancedGrid, "maxDepth", "Maximum depth", depths, String(vault.maxDepth));

    let yaml: HTMLElement | undefined;
    if (target) {
      const reference = form.createEl("details", { cls: "obsidian-patch-heading-number-reference" });
      reference.createEl("summary", { text: "Note properties (YAML)" });
      reference.createEl("p", { text: "One text property stores these choices. Choose decimal, zh-report, en-outline or continuous to enable numbering, or false to turn it off." });
      reference.createEl("p", { text: "Optional values: start is a positive whole number, level is 0 (Automatic) or 1–6, and depth is 1–6. Omit any option to inherit it." });
      yaml = reference.createEl("pre").createEl("code");
    }
    const panel = form.createDiv({ cls: "obsidian-patch-heading-number-sample" });
    panel.createDiv({ cls: "obsidian-patch-heading-number-caption", text: "Example" });
    const preview = panel.createDiv({ cls: "obsidian-patch-heading-number-preview" });
    const hint = form.createDiv({ cls: "obsidian-patch-heading-number-hint", attr: { role: "status" } });
    const values = (): NoteOptions => {
      const options: NoteOptions = {};
      if (isPreset(style.value)) options.preset = style.value;
      else if (style.value === "false") options.preset = false;
      if (first.value && first.validity.valid) options.startAt = first.valueAsNumber;
      if (level.value) options.startLevel = Number(level.value);
      if (depth.value) options.maxDepth = Number(depth.value);
      return options;
    };
    const draw = () => {
      const note = values();
      if (yaml) {
        const value = numberingProperty(note);
        yaml.setText(value === undefined ? "# Inheriting vault settings. No note property needed." : NUMBERING_PROPERTY + ": " + value);
      }
      const settings = effectiveNumbering(vault, note);
      const result = numberHeadings(sample, settings, settings.preset);
      preview.empty();
      for (const heading of sample) {
        const item = result.headings.get(heading.line);
        const row = preview.createDiv();
        if (item && (!target || settings.enabled)) {
          row.addClass(numberedLineClass);
          row.createSpan({ cls: "obsidian-patch-heading-number", text: item.prefix + " " });
        }
        row.append(heading.title);
      }
      hint.setText(target && !settings.enabled ? "Numbering is off for this note. Choose a style to enable it."
        : result.romanFallback ? "Roman numerals above 3999 display as decimal numbers." : "");
    };
    form.oninput = draw;
    form.onchange = draw;
    draw();
    const buttons = form.createDiv({ cls: "modal-button-container" });
    buttons.createEl("button", { text: "Cancel", attr: { type: "button" } }).onclick = () => this.close();
    const apply = buttons.createEl("button", { text: "Apply", cls: "mod-cta", attr: { type: "submit" } });
    form.onsubmit = event => {
      event.preventDefault();
      if (!apply.disabled && form.reportValidity()) void commit();
    };
    const commit = async () => {
      apply.disabled = true;
      try {
        const options = values();
        const changed = fields.filter(key => options[key] !== original[key]);
        if (target && changed.length) {
          if (target.view.file === target.file && target.view.getMode() === "source") await target.view.save();
          await this.app.fileManager.processFrontMatter(target.file, (data: Record<string, unknown>) => {
            const latest = noteOptions(data);
            for (const key of changed) {
              if (latest[key] !== original[key] && latest[key] !== options[key]) throw new Error("Note properties changed. Reopen the options to refresh them.");
            }
            const merged = { ...latest, ...Object.fromEntries(changed.map(key => [key, options[key]])) };
            writeNoteOptions(data, merged);
          });
        } else if (!target && changed.length) {
          const resolved = effectiveNumbering(this.current(), options);
          await this.saveVault({ ...resolved, enabled: this.current().enabled });
        }
        await this.refresh();
        this.close();
      } catch (error) {
        hint.setText(error instanceof Error ? error.message : "Could not save numbering options.");
        apply.disabled = false;
      }
    };
  }
}

export function renderNumberingSetting(setting: Setting, app: App, current: () => NumberingSettings, save: SaveVault): void {
  setting.settingEl.addClass("obsidian-patch-heading-number-setting");
  const status = setting.descEl.createDiv({ attr: { role: "status" } });
  let generation = 0;
  async function refresh(): Promise<void> {
    const version = ++generation, view = app.workspace.getActiveViewOfType(MarkdownView), file = view?.file;
    status.empty();
    if (!view || !file) return;
    try {
      const index = numberingForSource(await readCheckSource(view, file), current());
      if (version !== generation || view.file !== file) return;
      if (index?.conflict) {
        const { heading, actual } = index.conflict;
        status.setText(`Numbering paused in ${file.basename}. Line ${heading.line + 1}, “${heading.title}”, starts with ${actual}. Expected ${heading.prefix}.`);
      } else if (index?.romanFallback) status.setText("Roman numerals above 3999 display as decimal numbers.");
    } catch { if (version === generation) status.setText("Could not read the current note."); }
  }
  setting.addToggle(toggle => toggle.setTooltip("Number headings by default in this vault").setValue(current().enabled)
    .onChange(async enabled => { await save({ ...current(), enabled }); await refresh(); }));
  setting.addButton(button => button.setButtonText("Vault options").onClick(() => new NumberingModal(app, current, save, refresh).open()));
  setting.addButton(button => button.setButtonText("This note…").setDisabled(!app.workspace.getActiveViewOfType(MarkdownView)?.file).onClick(async () => {
    const view = app.workspace.getActiveViewOfType(MarkdownView), file = view?.file;
    if (!view || !file) return;
    try {
      const info = getFrontMatterInfo(await readCheckSource(view, file));
      const options = noteOptions(info.exists ? parseYaml(info.frontmatter) : undefined);
      if (view.file === file) new NumberingModal(app, current, save, refresh, { view, file, options }).open();
    } catch { new Notice("Could not read note properties. Check the YAML at the top of this note."); }
  }));
  void refresh();
}
