import type { App, TFile } from "obsidian";

export const DEFAULT_BANNER_WIDTH_PERCENT = 90;

export interface BannerSettings {
  enabled: boolean;
  autoplayVideos: boolean;
  widthPercent: number;
}

export interface BannerConfig {
  linkpath: string;
}

export interface ResolvedBanner extends BannerConfig {
  file: TFile;
  kind: "image" | "video";
}

export type BannerConfigResult =
  | { status: "none" }
  | { status: "error"; message: string }
  | { status: "ready"; config: BannerConfig };

export type BannerState =
  | { status: "none" }
  | { status: "error"; message: string }
  | { status: "ready"; banner: ResolvedBanner };

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "avif", "apng"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov"]);

export function mediaKind(extension: string): "image" | "video" | undefined {
  const ext = extension.toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) ? "image" : VIDEO_EXTENSIONS.has(ext) ? "video" : undefined;
}

export function parseBannerSettings(data: unknown): BannerSettings {
  const value = isRecord(data) ? data : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    autoplayVideos: typeof value.autoplayVideos === "boolean" ? value.autoplayVideos : true,
    widthPercent: typeof value.widthPercent === "number" && Number.isInteger(value.widthPercent) &&
      value.widthPercent >= 10 && value.widthPercent <= 100 ? value.widthPercent : DEFAULT_BANNER_WIDTH_PERCENT,
  };
}

export function parseBannerConfig(frontmatter: unknown): BannerConfigResult {
  if (!isRecord(frontmatter) || frontmatter["patch-banner"] === undefined || frontmatter["patch-banner"] === "") {
    return { status: "none" };
  }
  const value = frontmatter["patch-banner"];
  if (typeof value !== "string") {
    return { status: "error", message: "patch-banner must be a quoted wikilink." };
  }
  const match = /^\[\[([^\[\]#|\r\n]+)\]\]$/.exec(value.trim());
  const linkpath = match?.[1]?.trim();
  if (!linkpath || /^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(linkpath)) {
    return { status: "error", message: "Use a vault wikilink, such as [[assets/banner.png]]." };
  }
  return { status: "ready", config: { linkpath } };
}

export function resolveBanner(app: App, note: TFile, frontmatter: unknown): BannerState {
  const parsed = parseBannerConfig(frontmatter);
  if (parsed.status !== "ready") return parsed;
  const file = app.metadataCache.getFirstLinkpathDest(parsed.config.linkpath, note.path);
  if (!file) return { status: "error", message: `Banner file not found: ${parsed.config.linkpath}` };
  const kind = mediaKind(file.extension);
  if (!kind) return { status: "error", message: `Unsupported banner format: ${file.extension}` };
  return { status: "ready", banner: { ...parsed.config, file, kind } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

