export interface PdfExportSettings {
  outline: boolean;
  headingLinks: boolean;
}

export function parsePdfExportSettings(value: unknown): PdfExportSettings {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    outline: typeof data.outline === "boolean" ? data.outline : true,
    headingLinks: typeof data.headingLinks === "boolean" ? data.headingLinks : true,
  };
}

/** Decode each side separately so an escaped # in a heading isn't a new separator. */
export function headingLink(link: string): { path: string; subpath: string } | undefined {
  const hash = link.indexOf("#");
  if (hash < 0) return;
  const decode = (value: string): string => { try { return decodeURIComponent(value); } catch { return value; } };
  const path = decode(link.slice(0, hash));
  const fragment = decode(link.slice(hash + 1));
  if (!fragment || fragment.startsWith("^") || /^[a-z][a-z\d+.-]*:/i.test(path)) return;
  return { path, subpath: `#${fragment}` };
}

/** Common Markdown TOC fragments; native Obsidian heading resolution takes precedence. */
export function headingSlugs(texts: string[]): string[] {
  const used = new Set<string>();
  return texts.map(text => {
    const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s/g, "-");
    let slug = base, suffix = 0;
    while (used.has(slug)) slug = `${base}-${++suffix}`;
    used.add(slug);
    return slug;
  });
}
