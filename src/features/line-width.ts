import { MarkdownView, setTooltip, type Plugin } from "obsidian";
import {
  DEFAULT_LINE_WIDTH,
  LINE_WIDTH_PROPERTY,
  LINE_WIDTH_STEP,
  MAX_LINE_WIDTH,
  MIN_LINE_WIDTH,
  parseLineWidthProperty,
  type LineWidthProperty,
  type LineWidthSettings,
} from "./line-width/config";

export {
  DEFAULT_LINE_WIDTH,
  LINE_WIDTH_PROPERTY,
  LINE_WIDTH_STEP,
  MAX_LINE_WIDTH,
  MIN_LINE_WIDTH,
  parseLineWidthSettings,
  type LineWidthSettings,
} from "./line-width/config";

/** The custom property Obsidian sizes readable Markdown views with. */
const WIDTH_PROPERTY = "--file-line-width";

/**
 * Sets the width on each Markdown view rather than on the body, so a note's
 * patch-line-width property only resizes its own pane, and views in popout
 * windows need no separate document handling.
 */
export function registerLineWidth(
  plugin: Plugin,
  initial: LineWidthSettings,
  save: (settings: LineWidthSettings) => Promise<void>,
): (settings: LineWidthSettings) => void {
  const { workspace, metadataCache } = plugin.app;
  let settings = initial;
  /** The status bar slider's value while it is dragged and not yet saved. */
  let dragWidth: number | undefined;
  let styled = new Set<HTMLElement>();

  const item = plugin.addStatusBarItem();
  item.addClass("obsidian-patch-line-width");
  const slider = item.createEl("input", {
    cls: "obsidian-patch-line-width-slider",
    type: "range",
    attr: { min: MIN_LINE_WIDTH, max: MAX_LINE_WIDTH, step: LINE_WIDTH_STEP, "aria-label": "Line width" },
  });
  const label = item.createSpan({ cls: "obsidian-patch-line-width-value" });

  const noteWidth = (view: MarkdownView): LineWidthProperty =>
    parseLineWidthProperty(view.file ? metadataCache.getFileCache(view.file)?.frontmatter : undefined);

  const updateStatusBar = (): void => {
    item.toggle(settings.enabled && settings.statusBar);
    const view = workspace.getActiveViewOfType(MarkdownView);
    const property: LineWidthProperty = view ? noteWidth(view) : { status: "none" };
    if (dragWidth === undefined) slider.value = String(settings.width);
    slider.disabled = property.status === "ready";
    label.setText(`${property.status === "ready" ? property.width : dragWidth ?? settings.width} px`);
    label.toggleClass("is-note-width", property.status === "ready");
    label.toggleClass("is-invalid", property.status === "invalid");
    setTooltip(label, property.status === "ready"
      ? `Set by this note's ${LINE_WIDTH_PROPERTY} property`
      : property.status === "invalid"
        ? `${LINE_WIDTH_PROPERTY} is ignored: use a whole number of pixels from ${MIN_LINE_WIDTH} to ${MAX_LINE_WIDTH}`
        : `Click to reset to ${DEFAULT_LINE_WIDTH} px`);
  };

  const apply = (): void => {
    const current = new Set<HTMLElement>();
    if (settings.enabled) {
      for (const leaf of workspace.getLeavesOfType("markdown")) {
        // Deferred tabs are not MarkdownViews yet and are styled once they load.
        if (!(leaf.view instanceof MarkdownView)) continue;
        const property = noteWidth(leaf.view);
        const value = `${property.status === "ready" ? property.width : dragWidth ?? settings.width}px`;
        const el = leaf.view.contentEl;
        if (el.style.getPropertyValue(WIDTH_PROPERTY) !== value) el.style.setProperty(WIDTH_PROPERTY, value);
        current.add(el);
      }
    }
    for (const el of styled) {
      if (!current.has(el)) el.style.removeProperty(WIDTH_PROPERTY);
    }
    styled = current;
    updateStatusBar();
  };

  slider.addEventListener("input", () => {
    dragWidth = slider.valueAsNumber;
    apply();
  });
  // Saved once on release rather than on every step of the drag.
  slider.addEventListener("change", () => void save({ ...settings, width: slider.valueAsNumber }));
  label.addEventListener("click", () => {
    if (!slider.disabled) void save({ ...settings, width: DEFAULT_LINE_WIDTH });
  });

  plugin.registerEvent(workspace.on("layout-change", apply));
  plugin.registerEvent(workspace.on("active-leaf-change", apply));
  plugin.registerEvent(workspace.on("file-open", apply));
  plugin.registerEvent(metadataCache.on("changed", apply));
  plugin.register(() => {
    for (const el of styled) el.style.removeProperty(WIDTH_PROPERTY);
  });
  updateStatusBar();
  workspace.onLayoutReady(apply);

  return (next) => {
    settings = next;
    dragWidth = undefined;
    apply();
  };
}
