import { getIcon, getIconIds, normalizePath, Notice, type Menu, type Plugin, type TAbstractFile } from "obsidian";
import {
  convertIconize,
  iconizeName,
  parseIconId,
  parseIconSettings,
  renameIconPaths,
  svgUrl,
  type IconId,
  type IconizeImport,
  type IconSettings,
} from "./icons/config";
import { IconPicker, IconSearch, type IconChoice, type IconCatalog } from "./icons/picker";
import { loadSimpleIcons, readSimpleIconPack, writeSimpleIconPack, type SimpleIconSet } from "./icons/simple-icons";
import { watchExplorerIcons, type ExplorerIcons, type IconAppearance } from "./icons/explorer";
import { iconColorCss } from "./icons/color";

export { parseIconSettings, type IconSettings } from "./icons/config";

export type SimpleIconsStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; version: string }
  | { status: "error"; message: string };

export interface PatchIconsController {
  setEnabled(enabled: boolean): Promise<void>;
  chooseCalloutIcon(select: (choice: IconChoice) => void): void;
  saveUsedIcons(choice?: IconChoice): Promise<void>;
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
 * Static CSS draws image masks on explorer rows. Each view watches only its
 * own rows so lazy folders, rebuilt explorers and popouts receive the icons.
 */
export function registerIcons(
  plugin: Plugin,
  initial: IconSettings,
  save: (settings: IconSettings) => Promise<void>,
  calloutIcons: () => string[] = () => [],
): PatchIconsController {
  const { app } = plugin;
  let settings = parseIconSettings(initial);
  let catalog: Promise<SimpleIconSet | undefined> | undefined;
  let installing: Promise<SimpleIconsStatus> | undefined;
  let status: SimpleIconsStatus = { status: "idle" };
  let active = true;
  let iconImages = new Map<string, IconAppearance>();
  const explorers = new Map<HTMLElement, { document: Document; icons: ExplorerIcons }>();

  const svgFor = (id: IconId): string | undefined => {
    const icon = parseIconId(id);
    return icon?.source === "lucide" ? getIcon(LUCIDE_PREFIX + icon.name)?.outerHTML : settings.svgs[id];
  };

  const render = (): void => {
    const icons = settings.enabled
      ? Object.entries(settings.paths).flatMap(([path, id]) => {
        const svg = svgFor(id);
        return svg === undefined ? [] : [[path, { image: svgUrl(svg), color: iconColorCss(settings.colors[path], settings.brandColors[id]) }] as const];
      })
      : [];
    iconImages = new Map(icons);
    for (const explorer of explorers.values()) explorer.icons.update(iconImages);
  };

  const syncExplorers = (): void => {
    if (!active) return;
    const current = new Set(app.workspace.getLeavesOfType("file-explorer").map(leaf => leaf.view.containerEl));
    for (const [root, explorer] of explorers) {
      if (!current.has(root) || root.ownerDocument !== explorer.document) {
        explorer.icons.dispose();
        explorers.delete(root);
      }
    }
    for (const root of current) {
      if (!explorers.has(root)) explorers.set(root, { document: root.ownerDocument, icons: watchExplorerIcons(root, iconImages) });
    }
  };

  const update = async (next: IconSettings): Promise<void> => {
    if (!active) return;
    const previous = settings;
    settings = next;
    render();
    try { await save(next); }
    catch (error) {
      if (settings === next) { settings = previous; render(); }
      throw error;
    }
  };

  const usedIds = (paths: Record<string, IconId>): Set<IconId> => new Set([...Object.values(paths), ...calloutIcons()]);

  /** Only assigned brand graphics also travel with the vault settings. */
  const usedSvgs = (paths: Record<string, IconId>, set?: SimpleIconSet, chosen?: IconChoice): Record<IconId, string> => {
    const svgs: Record<IconId, string> = {};
    for (const id of usedIds(paths)) {
      const icon = parseIconId(id);
      if (icon?.source !== "simple-icons") continue;
      const svg = set?.svg(icon.name) ?? (chosen?.id === id ? chosen.svg() : undefined) ?? settings.svgs[id];
      if (svg !== undefined) svgs[id] = svg;
    }
    return svgs;
  };

  const lacksSvgs = (): boolean => [...usedIds(settings.paths)]
    .some((id) => parseIconId(id)?.source === "simple-icons" && settings.svgs[id] === undefined);

  const usedBrandColors = (paths: Record<string, IconId>, set?: SimpleIconSet): Record<IconId, string> => {
    const colors: Record<IconId, string> = {};
    for (const id of usedIds(paths)) {
      const icon = parseIconId(id);
      if (icon?.source !== "simple-icons") continue;
      const color = set?.color(icon.name) ?? settings.brandColors[id];
      if (color) colors[id] = color;
    }
    return colors;
  };

  const packPath = (id: string): string => normalizePath(`${plugin.manifest.dir ?? app.vault.configDir + "/plugins/" + plugin.manifest.id}/simple-icons-${id}.json.gz`);
  const installedSet = (): Promise<SimpleIconSet | undefined> => {
    const pack = settings.installedPack;
    if (!pack) return Promise.resolve(undefined);
    if (!catalog) {
      const read = readSimpleIconPack(app.vault.adapter, packPath(pack.id));
      catalog = read;
      void read.catch(() => { if (catalog === read) catalog = undefined; });
    }
    return catalog;
  };

  const refreshUsed = async (): Promise<void> => {
    const set = await installedSet();
    if (!set || !active) return;
    const svgs = usedSvgs(settings.paths, set);
    const brandColors = usedBrandColors(settings.paths, set);
    if (!sameEntries(svgs, settings.svgs) || !sameEntries(brandColors, settings.brandColors)) await update({ ...settings, svgs, brandColors });
  };

  const install = async (): Promise<SimpleIconsStatus> => {
    status = { status: "loading" };
    const id = crypto.randomUUID();
    const path = packPath(id);
    try {
      const set = await loadSimpleIcons(settings.cachedLatest);
      if (!active) return status;
      if (!set.names.length) throw new Error("The downloaded catalog contains no icons");
      await writeSimpleIconPack(app.vault.adapter, path, set);
      if (!active) { await app.vault.adapter.remove(path); return status; }
      const previous = settings.installedPack;
      await update({ ...settings, installedPack: { id, version: set.version }, cachedLatest: set.packageVersion,
        svgs: usedSvgs(settings.paths, set), brandColors: usedBrandColors(settings.paths, set) });
      catalog = Promise.resolve(set);
      status = { status: "ready", version: set.version };
      if (previous) await app.vault.adapter.remove(packPath(previous.id)).catch(() => undefined);
    } catch (error) {
      status = { status: "error", message: describeError(error) };
      await app.vault.adapter.remove(path).catch(() => undefined);
    }
    return status;
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

  const choices = (): IconCatalog => {
    const recent = [...usedIds(settings.paths)].flatMap((id): IconChoice[] => {
      const icon = parseIconId(id);
      if (icon === undefined) return [];
      return icon.source === "lucide"
        ? [lucideChoice(icon.name)]
        : [{ id, source: icon.source, name: icon.name, brandColor: settings.brandColors[id], svg: () => settings.svgs[id] }];
    });
    return { lucide: lucideNames().map(lucideChoice), recent,
      installed: installing ? installing.then(installedSet) : installedSet() };
  };

  const choose = (paths: string[]): void => {
    const catalog = choices();
    const ids = new Set(paths.map(path => settings.paths[path]));
    const colors = new Set(paths.map(path => settings.colors[path]));
    new IconPicker(app, catalog, {
      current: ids.size === 1 ? catalog.recent.find(choice => choice.id === settings.paths[paths[0]!]) : undefined,
      color: colors.size === 1 ? settings.colors[paths[0]!] : undefined,
      mixedColors: colors.size > 1,
      count: paths.length,
      allHaveIcons: paths.every(path => settings.paths[path] !== undefined),
      onApply: async (choice, color) => {
        const next = { ...settings.paths }, nextColors = { ...settings.colors };
        for (const path of paths) {
          if (choice) next[path] = choice.id;
          if (color !== undefined) nextColors[path] = color;
          if (nextColors[path] === "brand" && parseIconId(next[path] ?? "")?.source !== "simple-icons") nextColors[path] = "text";
        }
        const brandColors = usedBrandColors(next);
        if (choice?.brandColor) brandColors[choice.id] = choice.brandColor;
        await update({ ...settings, paths: next, colors: nextColors, brandColors, svgs: usedSvgs(next, undefined, choice) });
      },
    }).open();
  };

  const removeIcons = async (paths: string[]): Promise<void> => {
    const next = { ...settings.paths };
    const colors = { ...settings.colors };
    for (const path of paths) { delete next[path]; delete colors[path]; }
    await update({ ...settings, paths: next, colors, brandColors: usedBrandColors(next), svgs: usedSvgs(next) });
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
    if (paths === undefined) return;
    const colors = { ...(renameIconPaths(settings.colors, oldPath, file.path) ?? settings.colors) };
    // An uncolored moved icon must also replace an orphaned destination color.
    for (const path of Object.keys(settings.paths)) {
      if ((path === oldPath || path.startsWith(`${oldPath}/`)) && settings.colors[path] === undefined) {
        delete colors[file.path + path.slice(oldPath.length)];
      }
    }
    void update({ ...settings, paths, colors });
  }));
  plugin.registerEvent(app.workspace.on("layout-change", syncExplorers));
  plugin.registerEvent(app.workspace.on("window-open", syncExplorers));
  plugin.registerEvent(app.workspace.on("window-close", (_win, win) => {
    for (const [root, explorer] of explorers) {
      if (explorer.document !== win.document) continue;
      explorer.icons.dispose();
      explorers.delete(root);
    }
  }));
  plugin.register(() => {
    active = false;
    for (const explorer of explorers.values()) explorer.icons.dispose();
    explorers.clear();
  });
  render();
  syncExplorers();
  // Recover missing assignment snapshots from the installed pack without going online.
  app.workspace.onLayoutReady(() => {
    if (!active) return;
    syncExplorers();
    const reminderKey = "patches-simple-icons-install-tip";
    if (!settings.installedPack && !app.loadLocalStorage(reminderKey)) {
      app.saveLocalStorage(reminderKey, true);
      new Notice("Patches includes Lucide icons. For optional brand logos, choose Settings → Patches → Patch Icons → Simple Icons → Install.", 10000);
    }
    if (lacksSvgs()) void refreshUsed().catch(error => console.warn("Patches: could not read installed Simple Icons", error));
  });

  return {
    setEnabled: (enabled) => update({ ...settings, enabled }),
    chooseCalloutIcon: select => new IconSearch(app, choices(), select).open(),
    saveUsedIcons: async choice => {
      const brandColors = usedBrandColors(settings.paths);
      if (choice?.brandColor) brandColors[choice.id] = choice.brandColor;
      await update({ ...settings, svgs: usedSvgs(settings.paths, undefined, choice), brandColors });
    },
    simpleIconsStatus: () => status.status === "idle" && settings.installedPack ? { status: "ready", version: settings.installedPack.version } : status,
    updateSimpleIcons() {
      installing ??= install().finally(() => { installing = undefined; });
      return installing;
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
      const colors = { ...settings.colors };
      for (const path of Object.keys(paths)) delete colors[path];
      await update({ ...settings, paths: next, colors, brandColors: usedBrandColors(next), svgs: usedSvgs(next) });
      const skippedText = skipped.length === 0 ? "" :
        ` Skipped ${skipped.length}: ${skipped.map(({ path, icon }) => `${icon} (${path})`).join(", ")}.`;
      new Notice(`Imported ${count} icons from Iconize.${skippedText} Disable Iconize so icons are not shown twice.`, 10_000);
      if (lacksSvgs()) {
        if (!settings.installedPack) new Notice("Select Install under Patch Icons → Simple Icons to download the missing brand icons.");
        else await refreshUsed().catch(error => new Notice(`Could not read the installed icons: ${describeError(error)}`));
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
