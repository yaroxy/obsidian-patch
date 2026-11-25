import { MarkdownRenderChild, Notice, type Plugin } from "obsidian";
import { MermaidIconPack } from "./mermaid-icon-packs";
import { sanitizeMermaidSvg } from "./mermaid-dom";
import {
  loadMermaidRuntime,
  type Mermaid,
  type MermaidRuntime,
  type MermaidVersionChoice,
} from "./mermaid-runtime";
import { registerMermaidCheck } from "./mermaid-check";
import { DIAGRAM_LANGUAGE } from "./mermaid-check/model";

/**
 * Obsidian's own Mermaid renderer reads its font from this property, which
 * defaults to the note's text font, so diagrams match the rest of the note.
 */
const FONT_PROPERTY = "--font-mermaid";

export type MermaidSecurityLevel = "strict" | "loose";

export interface PatchMermaidOptions {
  securityLevel: MermaidSecurityLevel;
  version: MermaidVersionChoice;
  /** The version that `latest` resolved to the last time it was looked up. */
  cachedLatest: string | undefined;
  onLatestResolved: (version: string) => void;
}

export interface PatchMermaidController {
  iconPacks: readonly MermaidIconPack[];
  installIconPack(pack: MermaidIconPack): Promise<void>;
  setSecurityLevel(securityLevel: MermaidSecurityLevel): void;
  setVersion(version: MermaidVersionChoice): Promise<MermaidRuntime>;
  /** The runtime in use, or the one being loaded. */
  runtime(): Promise<MermaidRuntime>;
}

interface Diagram {
  container: HTMLElement;
  source: string;
  /** Increments per render, so a slow render cannot replace a newer one. */
  generation: number;
}

/** The parts of Obsidian's appearance that a rendered diagram depends on. */
interface Appearance {
  dark: boolean;
  font: string;
}

export function registerPatchMermaid(
  plugin: Plugin,
  options: PatchMermaidOptions,
): PatchMermaidController {
  const diagrams = new Set<Diagram>();
  const iconPacks = __MERMAID_ICON_PACKS__.map(source => new MermaidIconPack(source, plugin.app.vault.adapter,
    plugin.manifest.dir ?? `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`));
  const notified = new Set<string>();
  let disposed = false;
  plugin.register(() => { disposed = true; diagrams.clear(); });
  let renderSequence = 0;
  let securityLevel = options.securityLevel;
  let appearance = readAppearance();
  let cachedLatest = options.cachedLatest;

  const load = (version: MermaidVersionChoice): Promise<MermaidRuntime> =>
    loadMermaidRuntime(version, cachedLatest, (resolved) => {
      cachedLatest = resolved;
      options.onLatestResolved(resolved);
    }).then((runtime) => {
      runtime.mermaid.registerIconPacks(iconPacks.map(pack => ({
        name: pack.source.name,
        loader: async () => {
          try { return await pack.load(); }
          catch (error) {
            if (!disposed && !notified.has(pack.source.name)) {
              notified.add(pack.source.name);
              new Notice(`To display ${pack.source.label} icons, install or repair the pack in Settings → Patches → Patch Mermaid.`);
            }
            throw error;
          }
        },
      })));
      configureMermaid(runtime.mermaid, securityLevel, appearance);
      return runtime;
    });

  let runtime = load(options.version);
  registerMermaidCheck(plugin, () => runtime);

  const render = async (diagram: Diagram): Promise<void> => {
    const generation = ++diagram.generation;
    const { mermaid } = await runtime;
    renderSequence += 1;
    const renderId = `obsidian-patch-mermaid-${Date.now()}-${renderSequence}`;

    // Without a container Mermaid measures in a temporary element under body,
    // so a re-render keeps the previous diagram on screen until it is replaced.
    try {
      const { svg, bindFunctions } = await mermaid.render(renderId, diagram.source);
      if (generation !== diagram.generation) {
        return;
      }
      diagram.container.classList.remove("obsidian-patch-mermaid--error");
      diagram.container.replaceChildren(sanitizeMermaidSvg(svg, diagram.container.ownerDocument));
      bindFunctions?.(diagram.container);
    } catch (error) {
      if (generation === diagram.generation) {
        renderError(diagram.container, error);
      }
    }
  };

  /**
   * Text is measured with the font and theme of the moment, so a change to
   * either needs a fresh layout rather than a restyle of the existing SVG.
   */
  const rerenderAll = (): void => {
    for (const diagram of diagrams) {
      if (diagram.container.isConnected) {
        void render(diagram);
      } else {
        diagrams.delete(diagram);
      }
    }
  };

  const reconfigure = async (): Promise<void> => {
    const { mermaid } = await runtime;
    configureMermaid(mermaid, securityLevel, appearance);
    rerenderAll();
  };

  plugin.registerMarkdownCodeBlockProcessor(
    DIAGRAM_LANGUAGE,
    async (source, element, context) => {
      const container = element.createDiv({ cls: "obsidian-patch-mermaid" });
      const diagram: Diagram = { container, source, generation: 0 };

      diagrams.add(diagram);
      const child = new MarkdownRenderChild(container);
      child.register(() => diagrams.delete(diagram));
      context.addChild(child);

      await render(diagram);
    },
  );

  plugin.registerEvent(
    plugin.app.workspace.on("css-change", () => {
      const next = readAppearance();
      if (next.dark === appearance.dark && next.font === appearance.font) {
        return;
      }

      appearance = next;
      void reconfigure();
    }),
  );

  return {
    iconPacks,
    async installIconPack(pack) {
      const icons = await pack.install();
      const { mermaid } = await runtime;
      if (disposed) return;
      mermaid.registerIconPacks([{ name: pack.source.name, icons }]);
      notified.delete(pack.source.name);
      rerenderAll();
    },
    setSecurityLevel(nextSecurityLevel) {
      securityLevel = nextSecurityLevel;
      void reconfigure();
    },
    async setVersion(version) {
      runtime = load(version);
      const loaded = await runtime;
      rerenderAll();
      return loaded;
    },
    runtime: () => runtime,
  };
}

function configureMermaid(
  mermaid: Mermaid,
  securityLevel: MermaidSecurityLevel,
  appearance: Appearance,
): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel,
    suppressErrorRendering: true,
    theme: appearance.dark ? "dark" : "default",
    themeVariables: {
      fontFamily: `var(${FONT_PROPERTY})`,
      // treeView-beta hard-codes black labels and lines instead of reading the
      // Mermaid theme, so it takes Obsidian's text colors directly.
      treeView: {
        labelColor: "var(--text-normal)",
        lineColor: "var(--text-muted)",
      },
    },
  });
}

function readAppearance(): Appearance {
  return {
    dark: document.body.classList.contains("theme-dark"),
    font: getComputedStyle(document.body).getPropertyValue(FONT_PROPERTY).trim(),
  };
}

function renderError(container: HTMLElement, error: unknown): void {
  container.replaceChildren();
  container.classList.add("obsidian-patch-mermaid--error");

  container.createEl("strong", { text: "Mermaid rendering failed" });
  container.createEl("pre", { text: error instanceof Error ? error.message : String(error) });
}
