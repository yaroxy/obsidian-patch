/** Wider than Obsidian's own 700px --file-line-width. */
export const DEFAULT_LINE_WIDTH = 900;
export const MIN_LINE_WIDTH = 500;
export const MAX_LINE_WIDTH = 2000;
export const LINE_WIDTH_STEP = 10;
export const LINE_WIDTH_PROPERTY = "patch-line-width";

export interface LineWidthSettings {
  enabled: boolean;
  /** Width in pixels for notes without a patch-line-width property. */
  width: number;
  statusBar: boolean;
}

export type LineWidthProperty =
  | { status: "none" }
  | { status: "invalid" }
  | { status: "ready"; width: number };

export function parseLineWidthSettings(data: unknown): LineWidthSettings {
  const value = isRecord(data) ? data : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    width: isLineWidth(value.width) ? value.width : DEFAULT_LINE_WIDTH,
    statusBar: typeof value.statusBar === "boolean" ? value.statusBar : true,
  };
}

/** Reads a whole number of pixels, written as `900` or `"900px"`. */
export function parseLineWidthProperty(frontmatter: unknown): LineWidthProperty {
  if (!isRecord(frontmatter)) return { status: "none" };
  const value = frontmatter[LINE_WIDTH_PROPERTY];
  if (value === undefined || value === null || value === "") return { status: "none" };
  const match = typeof value === "string" ? /^\s*(\d+)\s*(?:px)?\s*$/i.exec(value) : null;
  const width = typeof value === "number" ? value : match ? Number(match[1]) : NaN;
  return isLineWidth(width) ? { status: "ready", width } : { status: "invalid" };
}

function isLineWidth(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_LINE_WIDTH && value <= MAX_LINE_WIDTH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
