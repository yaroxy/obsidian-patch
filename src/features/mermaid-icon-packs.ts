import type { AsyncIconLoader } from "mermaid";
import { normalizePath, type DataAdapter } from "obsidian";
import { downloadIconData } from "./icons/download";

type IconPack = Awaited<ReturnType<AsyncIconLoader["loader"]>>;
type PackSource = (typeof __MERMAID_ICON_PACKS__)[number];

export class MermaidIconPack {
  private readonly path: string;
  private loading?: Promise<IconPack>;
  private installing?: Promise<IconPack>;

  constructor(readonly source: PackSource, private readonly adapter: DataAdapter, directory: string) {
    this.path = normalizePath(`${directory}/mermaid-${source.name}-${source.version}.json.gz`);
  }

  exists(): Promise<boolean> {
    return this.adapter.exists(this.path);
  }

  /** A missing cache never initiates a download while rendering a note. */
  load(): Promise<IconPack> {
    if (this.installing) return this.installing;
    this.loading ??= this.readCache().finally(() => { this.loading = undefined; });
    return this.loading;
  }

  install(): Promise<IconPack> {
    this.installing ??= this.installOrRepair().finally(() => { this.installing = undefined; });
    return this.installing;
  }

  private async readCache(): Promise<IconPack> {
    const bytes = await this.adapter.readBinary(this.path);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return this.verified(await new Response(stream).arrayBuffer());
  }

  private async verified(bytes: ArrayBuffer): Promise<IconPack> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    if (hex !== this.source.sha256) throw new Error(`Unexpected data for ${this.source.label} ${this.source.version}.`);
    // The hash identifies the exact icons.json from the locked Iconify package.
    return JSON.parse(new TextDecoder().decode(bytes)) as IconPack;
  }

  private async installOrRepair(): Promise<IconPack> {
    if (await this.exists()) {
      try { return await this.readCache(); } catch { /* Replace a damaged download. */ }
    }
    const { name, version } = this.source;
    const url = `https://cdn.jsdelivr.net/npm/@iconify-json/${name}@${version}/icons.json`;
    const bytes = (await downloadIconData(url)).arrayBuffer;
    const pack = await this.verified(bytes);
    const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    const pending = `${this.path}.${crypto.randomUUID()}.tmp`;
    try {
      await this.adapter.writeBinary(pending, await new Response(compressed).arrayBuffer());
      if (await this.exists()) {
        // Another instance may have finished while this one was downloading.
        try { return await this.readCache(); } catch { await this.adapter.remove(this.path); }
      }
      await this.adapter.rename(pending, this.path);
      return pack;
    } catch (error) {
      // A second window or device can finish installing the same pack first.
      try { return await this.readCache(); } catch { throw error; }
    } finally {
      if (await this.adapter.exists(pending)) await this.adapter.remove(pending);
    }
  }
}
