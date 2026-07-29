import elkLayouts from "@mermaid-js/layout-elk";
import mermaid from "mermaid";
import type { Plugin } from "obsidian";

const CODE_BLOCK_LANGUAGE = "mermaid-latest";

export function registerMermaidLatest(plugin: Plugin): void {
  let renderSequence = 0;

  mermaid.registerLayoutLoaders(elkLayouts);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
  });

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
