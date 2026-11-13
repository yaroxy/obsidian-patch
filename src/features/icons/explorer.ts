const TITLE_SELECTOR = ".nav-folder-title[data-path], .nav-file-title[data-path]";
const ICON_CLASS = "obsidian-patch-icons-has-icon";
const ICON_PROPERTY = "--obsidian-patch-icon";
const paintedBy = new WeakMap<HTMLElement, Set<HTMLElement>>();

export interface ExplorerIcons {
  update(icons: ReadonlyMap<string, string>): void;
  dispose(): void;
}

/** Applies image masks to rendered explorer rows; no stylesheet or SVG DOM is created. */
export function watchExplorerIcons(root: HTMLElement, initial: ReadonlyMap<string, string>): ExplorerIcons {
  const ownerWindow = root.ownerDocument.defaultView;
  if (!ownerWindow) throw new Error("The file explorer window is unavailable");
  let icons = initial;
  let active = true;
  const painted = new Set<HTMLElement>();

  const clear = (title: HTMLElement): void => {
    // A row can move to another explorer before the old observer receives its
    // removal. Only its latest renderer may clear that row's decoration.
    const owner = paintedBy.get(title);
    if (!owner || owner === painted) {
      title.classList.remove(ICON_CLASS);
      title.style.removeProperty(ICON_PROPERTY);
      paintedBy.delete(title);
    }
    painted.delete(title);
  };

  const updateTitle = (title: HTMLElement): void => {
    const image = root.contains(title) ? icons.get(title.getAttribute("data-path") ?? "") : undefined;
    if (image === undefined) {
      clear(title);
      return;
    }
    if (title.style.getPropertyValue(ICON_PROPERTY) !== image) title.style.setProperty(ICON_PROPERTY, image);
    title.classList.add(ICON_CLASS);
    painted.add(title);
    paintedBy.set(title, painted);
  };

  const scan = (element: Element): void => {
    if (element.matches(TITLE_SELECTOR)) updateTitle(element as HTMLElement);
    for (const title of element.querySelectorAll<HTMLElement>(TITLE_SELECTOR)) updateTitle(title);
  };

  const clearDetached = (): void => {
    for (const title of painted) {
      if (!root.contains(title) || !title.matches(TITLE_SELECTOR)) clear(title);
    }
  };

  // Limit observation to the explorer view. Markdown editing and diagram
  // rendering elsewhere in the window do not trigger icon reconciliation.
  const observer = new ownerWindow.MutationObserver((records) => {
    if (!active) return;
    let removed = false;
    for (const record of records) {
      if (record.type === "attributes") {
        const title = record.target as HTMLElement;
        if (title.matches(TITLE_SELECTOR)) updateTitle(title);
        else if (painted.has(title)) clear(title);
      } else {
        removed ||= record.removedNodes.length > 0;
        for (const added of record.addedNodes) {
          if (added.nodeType === 1) scan(added as Element);
        }
      }
    }
    if (removed) clearDetached();
  });
  // Our class/style writes are deliberately outside the observed attributes.
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-path"] });
  scan(root);

  return {
    update(next) {
      if (!active) return;
      icons = next;
      clearDetached();
      scan(root);
    },
    dispose() {
      active = false;
      observer.disconnect();
      for (const title of painted) clear(title);
    },
  };
}
