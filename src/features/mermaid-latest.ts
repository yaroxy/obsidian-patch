import elkLayouts from "@mermaid-js/layout-elk";
import mermaid from "mermaid";
import type { Plugin } from "obsidian";

const CODE_BLOCK_LANGUAGE = "mermaid-latest";

export type MermaidSecurityLevel = "strict" | "sandbox" | "loose";

export function registerMermaidLatest(
  plugin: Plugin,
  securityLevel: MermaidSecurityLevel,
): (securityLevel: MermaidSecurityLevel) => void {
  let renderSequence = 0;

  mermaid.registerLayoutLoaders(elkLayouts);
  mermaid.registerIconPacks([
    {
      name: "material-icon-theme",
      loader: () =>
        import("@iconify-json/material-icon-theme").then((module) => module.icons),
    },
  ]);
  configureMermaid(securityLevel);

  plugin.registerMarkdownCodeBlockProcessor(
    CODE_BLOCK_LANGUAGE,
    async (source, element) => {
      const container = document.createElement("div");
      container.className = "obsidian-patch-mermaid";
      element.append(container);

      renderSequence += 1;
      const renderId = `obsidian-patch-mermaid-${Date.now()}-${renderSequence}`;

      try {
        const { svg, bindFunctions } = await mermaid.render(renderId, source, container);
        container.innerHTML = svg;
        bindFunctions?.(container);
      } catch (error) {
        renderError(container, error);
      }
    },
  );

  return configureMermaid;
}

function configureMermaid(securityLevel: MermaidSecurityLevel): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel,
    suppressErrorRendering: true,
  });
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
