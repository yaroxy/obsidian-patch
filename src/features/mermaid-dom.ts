import createDOMPurify, { type DOMPurify } from "dompurify";

const sanitizers = new WeakMap<Document, DOMPurify>();
const svgNamespace = "http://www.w3.org/2000/svg";
const xlinkNamespace = "http://www.w3.org/1999/xlink";
const useTargets = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "g", "symbol", "svg", "text", "tspan"]);

function restrictSvgReferences(fragment: DocumentFragment): void {
  const rejected: Element[] = [];
  for (const use of fragment.querySelectorAll("use")) {
    const references = [use.getAttribute("href"), use.getAttributeNS(xlinkNamespace, "href")].filter(value => value !== null);
    const owner = use.closest("svg");
    const localReference = references.length > 0 && references.every(value => /^#[^\s#]+$/.test(value) && value === references[0]);
    const targets = localReference && owner
      ? [...owner.querySelectorAll("[id]")].filter(element => element.id === references[0]!.slice(1) && element.closest("svg") === owner)
      : [];
    const target = targets.length === 1 ? targets[0] : undefined;
    // Bundled icons reuse static vector shapes. Keep those local references,
    // but not external documents, missing/ambiguous IDs, or recursive use trees.
    if (!target || target.namespaceURI !== svgNamespace || !useTargets.has(target.localName)
      || target.contains(use) || target.querySelector("use,foreignObject,image,style,animate,set,script")) {
      rejected.push(use);
    }
  }
  // Inspect the original sanitized tree before removing anything, so a cycle
  // cannot become apparently safe merely because an earlier reference vanished.
  for (const use of rejected) use.remove();
}

/** Sanitize before insertion while preserving Mermaid's SVG styles and HTML labels. */
export function sanitizeMermaidSvg(svg: string, document: Document): DocumentFragment {
  const ownerWindow = document.defaultView;
  if (!ownerWindow) throw new Error("The diagram window is unavailable");

  let sanitizer = sanitizers.get(document);
  if (!sanitizer) {
    sanitizer = createDOMPurify(ownerWindow);
    if (!sanitizer.isSupported) throw new Error("SVG sanitization is unavailable");
    sanitizers.set(document, sanitizer);
  }

  // Obsidian's sanitizeHTMLToDom removes <style> and <foreignObject>, which
  // Mermaid needs for themes, HTML labels, and treeView icons. DOMPurify keeps
  // SVG styles while filtering scripts, event handlers, and unsafe URLs; adding
  // foreignObject preserves its contents under the same sanitization rules.
  const fragment = sanitizer.sanitize(svg, {
    ADD_TAGS: ["foreignObject", "use"],
    HTML_INTEGRATION_POINTS: { "annotation-xml": true, foreignobject: true },
    // Match Obsidian's support for app deep links. DOMPurify still rejects
    // script protocols and data URLs in link attributes.
    ALLOW_UNKNOWN_PROTOCOLS: true,
    RETURN_DOM_FRAGMENT: true,
  });
  restrictSvgReferences(fragment);
  return document.importNode(fragment, true);
}
