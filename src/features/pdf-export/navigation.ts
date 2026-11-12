import { resolveSubpath, stripHeading, type App, type TFile } from "obsidian";
import { headingLink, headingSlugs } from "./model";

/** Called only on the native export DOM, after Obsidian removes internal hrefs. */
export function addPdfHeadingLinks(root: HTMLElement, app: App, file: TFile): void {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache?.headings?.length) return;
  const headings = [...root.querySelectorAll<HTMLElement>("h1[data-heading],h2[data-heading],h3[data-heading],h4[data-heading],h5[data-heading],h6[data-heading]")]
    .filter(h => !h.closest(".markdown-embed,.internal-embed"));
  const byOffset = new Map<number, HTMLElement>();
  let cursor = 0;
  for (const entry of cache.headings) {
    const index = headings.findIndex((h, i) => i >= cursor && h.tagName === `H${entry.level}`
      && stripHeading(h.getAttribute("data-heading") ?? "") === stripHeading(entry.heading));
    if (index >= 0) { byOffset.set(entry.position.start.offset, headings[index]!); cursor = index + 1; }
  }
  const idCounts = new Map<string, number>();
  for (const el of root.querySelectorAll<HTMLElement>("[id]")) idCounts.set(el.id, (idCounts.get(el.id) ?? 0) + 1);
  const ids = new Set(idCounts.keys());
  let next = 0;
  for (const heading of headings) {
    if (heading.id && idCounts.get(heading.id) === 1) continue;
    let id: string;
    do { id = `obsidian-patch-pdf-heading-${next++}`; } while (ids.has(id));
    heading.id = id;
    ids.add(id);
  }
  const slugs = headingSlugs(headings.map(h => h.textContent ?? ""));
  const bySlug = new Map(slugs.map((slug, i) => [slug, headings[i]!]));
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a.internal-link[data-href]")) {
    if (anchor.closest(".markdown-embed,.internal-embed")) continue;
    const target = headingLink(anchor.getAttribute("data-href") ?? "");
    if (!target || (target.path && app.metadataCache.getFirstLinkpathDest(target.path, file.path)?.path !== file.path)) continue;
    const resolved = resolveSubpath(cache, target.subpath);
    const heading = resolved?.type === "heading"
      ? byOffset.get(resolved.current.position.start.offset)
      : resolved ? undefined : bySlug.get(target.subpath.slice(1));
    if (heading) anchor.setAttribute("href", `#${encodeURIComponent(heading.id)}`);
  }
}
