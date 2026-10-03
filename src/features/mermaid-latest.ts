import type { AsyncIconLoader } from "mermaid";
import { MarkdownRenderChild, type Plugin } from "obsidian";
import logosIcons from "gzip:@iconify-json/logos/icons.json";
import materialIcons from "gzip:@iconify-json/material-icon-theme/icons.json";
import {
  loadMermaidRuntime,
  type Mermaid,
  type MermaidRuntime,
  type MermaidVersionChoice,
} from "./mermaid-runtime";

const CODE_BLOCK_LANGUAGE = "mermaid-latest";

/**
 * Obsidian's own Mermaid renderer reads its font from this property, which
 * defaults to the note's text font, so diagrams match the rest of the note.
 */
const FONT_PROPERTY = "--font-mermaid";

export type MermaidSecurityLevel = "strict" | "loose";

export interface MermaidLatestOptions {
  securityLevel: MermaidSecurityLevel;
  version: MermaidVersionChoice;
  /** The version that `latest` resolved to the last time it was looked up. */
  cachedLatest: string | undefined;
  onLatestResolved: (version: string) => void;
}

export interface MermaidLatestController {
  setSecurityLevel(securityLevel: MermaidSecurityLevel): void;
  setVersion(version: MermaidVersionChoice): Promise<MermaidRuntime>;
  /** The runtime in use, or the one being loaded. */
  runtime(): Promise<MermaidRuntime>;
}

type IconPack = Awaited<ReturnType<AsyncIconLoader["loader"]>>;

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

export function registerMermaidLatest(
  plugin: Plugin,
  options: MermaidLatestOptions,
): MermaidLatestController {
  const diagrams = new Set<Diagram>();
  let renderSequence = 0;
  let securityLevel = options.securityLevel;
  let appearance = readAppearance();
  let cachedLatest = options.cachedLatest;

  const load = (version: MermaidVersionChoice): Promise<MermaidRuntime> =>
    loadMermaidRuntime(version, cachedLatest, (resolved) => {
      cachedLatest = resolved;
      options.onLatestResolved(resolved);
    }).then((runtime) => {
      registerIconPacks(runtime.mermaid);
      configureMermaid(runtime.mermaid, securityLevel, appearance);
      return runtime;
    });

  let runtime = load(options.version);

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
      diagram.container.innerHTML = svg;
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
    CODE_BLOCK_LANGUAGE,
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

const iconPacks: Record<string, string> = {
  "material-icon-theme": materialIcons,
  logos: logosIcons,
};
const inflatedIconPacks = new Map<string, Promise<IconPack>>();

/** Every Mermaid instance shares one decompressed copy of each icon pack. */
function registerIconPacks(mermaid: Mermaid): void {
  mermaid.registerIconPacks(
    Object.entries(iconPacks).map(([name, data]) => ({
      name,
      loader: () => {
        let pack = inflatedIconPacks.get(name);
        if (pack === undefined) {
          pack = inflateJson<IconPack>(data);
          inflatedIconPacks.set(name, pack);
        }
        return pack;
      },
    })),
  );
}

function readAppearance(): Appearance {
  return {
    dark: document.body.classList.contains("theme-dark"),
    font: getComputedStyle(document.body).getPropertyValue(FONT_PROPERTY).trim(),
  };
}

/** Decodes an icon pack that the build embedded as gzip-compressed base64. */
async function inflateJson<T>(base64: string): Promise<T> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text()) as T;
}

function renderError(container: HTMLElement, error: unknown): void {
  container.replaceChildren();
  container.classList.add("obsidian-patch-mermaid--error");

  const title = document.createElement("strong");
  title.textContent = "Mermaid rendering failed";

  const details = document.createElement("pre");
  details.textContent = error instanceof Error ? error.message : String(error);

  container.append(title, details);
}
