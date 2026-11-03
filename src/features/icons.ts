import { getIcon, getIconIds, normalizePath, Notice, type Menu, type Plugin, type TAbstractFile } from "obsidian";
import {
  convertIconize,
  iconizeName,
  iconRules,
  parseIconId,
  renameIconPaths,
  type IconId,
  type IconizeImport,
  type IconSettings,
} from "./icons/config";
import { IconPicker, type IconChoice } from "./icons/picker";
import { loadSimpleIcons, type SimpleIconSet } from "./icons/simple-icons";

export { parseIconSettings, type IconSettings } from "./icons/config";

export type SimpleIconsStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; version: string }
  | { status: "error"; message: string };

export interface PatchIconsController {
  setEnabled(enabled: boolean): Promise<void>;
  simpleIconsStatus(): SimpleIconsStatus;
  /** Loads the newest Simple Icons and refreshes the icons in use. */
  updateSimpleIcons(): Promise<SimpleIconsStatus>;
  /** The number of file and folder icons in Iconize's settings, if it has any. */
  countIconizeIcons(): Promise<number | undefined>;
  importIconize(): Promise<void>;
  /** Paths with an icon that no longer exist, for example after a rename outside Obsidian. */
  missingPaths(): string[];
  removeIcons(paths: string[]): Promise<void>;
}

const LUCIDE_PREFIX = "lucide-";
const ICONIZE_ID = "obsidian-icon-folder";

/**
 * Icons are drawn by one generated stylesheet keyed on the explorer's
 * data-path attributes, so they survive the explorer re-rendering, collapsed
 * folders and renames without touching its DOM.
 */
export function registerIcons(
  plugin: Plugin,
  initial: IconSettings,
  save: (settings: IconSettings) => Promise<void>,
): PatchIconsController {
  const { app } = plugin;
  let settings = initial;
  let simpleIcons: Promise<SimpleIconSet> | undefined;
  let status: SimpleIconsStatus = { status: "idle" };
  const sheets = new Map<Document, HTMLStyleElement>();

  const svgFor = (id: IconId): string | undefined => {
    const icon = parseIconId(id);
    return icon?.source === "lucide" ? getIcon(LUCIDE_PREFIX + icon.name)?.outerHTML : settings.svgs[id];
  };

  const render = (): void => {
    const icons = settings.enabled
      ? Object.entries(settings.paths).flatMap(([path, id]) => {
        const svg = svgFor(id);
        return svg === undefined ? [] : [[path, svg] as const];
      })
      : [];
    const css = iconRules(icons);
    for (const sheet of sheets.values()) {
      if (sheet.textContent !== css) sheet.textContent = css;
    }
  };

  const addSheet = (doc: Document): void => {
    if (sheets.has(doc)) return;
    const sheet = doc.createElement("style");
    sheet.id = "obsidian-patch-icons";
    doc.head.appendChild(sheet);
    sheets.set(doc, sheet);
    render();
  };

  const update = async (next: IconSettings): Promise<void> => {
    settings = next;
    render();
    await save(next);
  };

  /** The SVG of each Simple Icon in `paths`, from `set` when it is loaded. */
  const usedSvgs = (paths: Record<string, IconId>, set?: SimpleIconSet, chosen?: IconChoice): Record<IconId, string> => {
    const svgs: Record<IconId, string> = {};
    for (const id of new Set(Object.values(paths))) {
      const icon = parseIconId(id);
      if (icon?.source !== "simple-icons") continue;
      const svg = set?.svg(icon.name) ?? (chosen?.id === id ? chosen.svg() : undefined) ?? settings.svgs[id];
      if (svg !== undefined) svgs[id] = svg;
    }
    return svgs;
  };

  const lacksSvgs = (): boolean => Object.values(settings.paths)
    .some((id) => parseIconId(id)?.source === "simple-icons" && settings.svgs[id] === undefined);

  const loadSet = (force = false): Promise<SimpleIconSet> => {
    if (simpleIcons !== undefined && !force) return simpleIcons;
    status = { status: "loading" };
    const loading = loadSimpleIcons(settings.cachedLatest, (cachedLatest) => {
      if (settings.cachedLatest !== cachedLatest) void update({ ...settings, cachedLatest });
    });
    simpleIcons = loading;
    loading.then(
      (set) => {
        status = { status: "ready", version: set.version };
        const svgs = usedSvgs(settings.paths, set);
        if (!sameEntries(svgs, settings.svgs)) void update({ ...settings, svgs });
      },
      (error: unknown) => {
        status = { status: "error", message: describeError(error) };
        console.warn("Obsidian Patch: could not load Simple Icons from jsDelivr", error);
        // A later picker or update retries instead of reusing the failure.
        if (simpleIcons === loading) simpleIcons = undefined;
      },
    );
    return loading;
  };

  const lucideChoice = (name: string): IconChoice => ({
    id: `lucide:${name}`,
    source: "lucide",
    name,
    svg: () => getIcon(LUCIDE_PREFIX + name)?.outerHTML,
  });

  const lucideNames = (): string[] => getIconIds()
    .filter((id) => id.startsWith(LUCIDE_PREFIX))
    .map((id) => id.slice(LUCIDE_PREFIX.length))
    .sort();

  const choose = (paths: string[]): void => {
    const recent = [...new Set(Object.values(settings.paths))].flatMap((id): IconChoice[] => {
      const icon = parseIconId(id);
      if (icon === undefined) return [];
      return icon.source === "lucide"
        ? [lucideChoice(icon.name)]
        : [{ id, source: icon.source, name: icon.name, svg: () => settings.svgs[id] }];
    });
    new IconPicker(app, lucideNames().map(lucideChoice), recent, loadSet(), (choice) => {
      const next = { ...settings.paths };
      for (const path of paths) next[path] = choice.id;
      void update({ ...settings, paths: next, svgs: usedSvgs(next, undefined, choice) });
    }).open();
  };

  const removeIcons = async (paths: string[]): Promise<void> => {
    const next = { ...settings.paths };
    for (const path of paths) delete next[path];
    await update({ ...settings, paths: next, svgs: usedSvgs(next) });
  };

  const addMenuItems = (menu: Menu, files: TAbstractFile[]): void => {
    const paths = files.map((file) => file.path).filter((path) => path !== "/");
    if (!settings.enabled || paths.length === 0) return;
    const plural = paths.length > 1 ? "s" : "";
    menu.addItem((item) => item.setTitle(`Change icon${plural}`).setIcon("image-plus").setSection("action")
      .onClick(() => choose(paths)));
    if (paths.some((path) => settings.paths[path] !== undefined)) {
      menu.addItem((item) => item.setTitle(`Remove icon${plural}`).setIcon("image-minus").setSection("action")
        .onClick(() => void removeIcons(paths)));
    }
  };

  const iconizeDataPath = (): string => normalizePath(`${app.vault.configDir}/plugins/${ICONIZE_ID}/data.json`);

  const readIconize = async (): Promise<unknown> => {
    const path = iconizeDataPath();
    if (!(await app.vault.adapter.exists(path))) return undefined;
    return JSON.parse(await app.vault.adapter.read(path)) as unknown;
  };

  const convertIconizeData = (data: unknown): IconizeImport =>
    convertIconize(data, new Map(lucideNames().map((name) => [iconizeName(name), name])));

  plugin.registerEvent(app.workspace.on("file-menu", (menu, file) => addMenuItems(menu, [file])));
  plugin.registerEvent(app.workspace.on("files-menu", (menu, files) => addMenuItems(menu, files)));
  plugin.registerEvent(app.vault.on("rename", (file, oldPath) => {
    const paths = renameIconPaths(settings.paths, oldPath, file.path);
    if (paths !== undefined) void update({ ...settings, paths });
  }));
  plugin.registerEvent(app.workspace.on("window-open", (_win, win) => addSheet(win.document)));
  plugin.registerEvent(app.workspace.on("window-close", (_win, win) => {
    sheets.get(win.document)?.remove();
    sheets.delete(win.document);
  }));
  plugin.register(() => {
    for (const sheet of sheets.values()) sheet.remove();
    sheets.clear();
  });
  addSheet(document);
  // Icons chosen before an offline import have no SVG yet; fetch them once.
  app.workspace.onLayoutReady(() => {
    if (lacksSvgs()) void loadSet();
  });

  return {
    setEnabled: (enabled) => update({ ...settings, enabled }),
    simpleIconsStatus: () => status,
    async updateSimpleIcons() {
      await loadSet(true).catch(() => undefined);
      return status;
    },
    async countIconizeIcons() {
      const data = await readIconize().catch(() => undefined);
      if (data === undefined) return undefined;
      const { paths, skipped } = convertIconizeData(data);
      return Object.keys(paths).length + skipped.length;
    },
    async importIconize() {
      let data: unknown;
      try {
        data = await readIconize();
      } catch (error) {
        new Notice(`Could not read Iconize's settings: ${describeError(error)}`);
        return;
      }
      const { paths, skipped } = convertIconizeData(data);
      const count = Object.keys(paths).length;
      if (count === 0 && skipped.length === 0) {
        new Notice("Iconize has no file or folder icons in this vault.");
        return;
      }
      const next = { ...settings.paths, ...paths };
      await update({ ...settings, paths: next, svgs: usedSvgs(next) });
      const skippedText = skipped.length === 0 ? "" :
        ` Skipped ${skipped.length}: ${skipped.map(({ path, icon }) => `${icon} (${path})`).join(", ")}.`;
      new Notice(`Imported ${count} icons from Iconize.${skippedText} Disable Iconize so icons are not shown twice.`, 10_000);
      if (lacksSvgs()) {
        loadSet().catch((error: unknown) => new Notice(
          `Simple Icons could not be loaded; their icons appear once they can be: ${describeError(error)}`,
        ));
      }
    },
    missingPaths: () => Object.keys(settings.paths).filter((path) => app.vault.getAbstractFileByPath(path) === null),
    removeIcons,
  };
}

function sameEntries(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
