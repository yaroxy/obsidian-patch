import { Platform, type Plugin } from "obsidian";

interface DesktopWindow {
  getMinimumSize(): [number, number];
  setMinimumSize(width: number, height: number): void;
  getBounds(): { width: number; height: number };
  getContentBounds(): { width: number };
  isMaximized(): boolean;
  isFullScreen(): boolean;
  setSize(width: number, height: number): void;
}

const workspaceClass = "obsidian-patch-line-width-workspace";

/** Only the main desktop workspace has a root split between two sidedocks. */
export function registerWorkspaceWidth(plugin: Plugin, initial: boolean): (enabled: boolean) => void {
  if (!Platform.isDesktopApp) return () => {};
  const { workspace } = plugin.app;
  const el = workspace.containerEl;
  const win = el.win;
  const electron = window.require("electron");
  if (!electron.remote?.getCurrentWindow) return () => {};
  const native: DesktopWindow = electron.remote.getCurrentWindow();

  let enabled = initial;
  let disposed = false;
  let previousMinimum: number | undefined;
  let appliedMinimum: number | undefined;
  let frame = 0;
  const floorClass = "obsidian-patch-line-width-sidebar-floor";
  const clamped = new Set<Element>();

  function update(): void {
    frame = 0;
    if (!enabled || disposed || !el.isConnected || !el.clientWidth) return;
    const root = el.querySelector<HTMLElement>(":scope > .mod-root");
    if (!root) return;
    // CSS flex handles live dragging. Only the space required at the limit matters here.
    let minimum = parseFloat(win.getComputedStyle(root).minWidth);
    if (!Number.isFinite(minimum)) return;
    const layoutStyle = win.getComputedStyle(el);
    const padding = parseFloat(layoutStyle.paddingLeft) + parseFloat(layoutStyle.paddingRight);
    const contentWidth = el.clientWidth - padding;
    const pixels = (value: string) => value.endsWith("%")
      ? parseFloat(value) * contentWidth / 100 : parseFloat(value) || 0;
    let visible = 0;
    // Read the theme's own minimum again in case a theme or media query changed it.
    for (const dock of clamped) dock.classList.remove(floorClass);
    clamped.clear();
    for (const child of Array.from(el.children)) {
      if (child.classList.contains("is-sidedock-collapsed")) continue;
      const css = win.getComputedStyle(child);
      if (css.display === "none" || css.position === "absolute" || css.position === "fixed") continue;
      visible++;
      minimum += pixels(css.marginLeft) + pixels(css.marginRight);
      if (child === root) continue;
      if (child.classList.contains("mod-sidedock")) {
        const themeFloor = pixels(css.minWidth);
        if (themeFloor < 200) clamped.add(child);
        minimum += Math.max(200, themeFloor);
      } else {
        minimum += child.getBoundingClientRect().width;
      }
    }
    for (const dock of clamped) dock.classList.add(floorClass);
    minimum += padding + Math.max(0, visible - 1) * pixels(layoutStyle.columnGap);
    const chrome = Math.max(0, win.innerWidth - el.clientWidth);
    const bounds = native.getBounds();
    const frameWidth = bounds.width - native.getContentBounds().width;
    const [current, height] = native.getMinimumSize();
    if (current !== appliedMinimum) previousMinimum = current;
    const width = Math.max(previousMinimum ?? current, Math.ceil((minimum + chrome) * electron.webFrame.getZoomFactor()) + frameWidth);
    if (current !== width) native.setMinimumSize(width, height);
    appliedMinimum = width;
    if (bounds.width < width && !native.isMaximized() && !native.isFullScreen()) native.setSize(width, bounds.height);
  }

  const schedule = () => {
    if (enabled && !disposed && !frame) frame = win.requestAnimationFrame(update);
  };
  const resize = new ResizeObserver(schedule);
  const layout = new MutationObserver(schedule);
  function configure(next: boolean): void {
    enabled = next;
    el.classList.toggle(workspaceClass, next);
    layout.disconnect();
    resize.disconnect();
    if (next) {
      layout.observe(el, { attributes: true, attributeFilter: ["class"], childList: true });
      resize.observe(el);
      for (const child of el.querySelectorAll(":scope > .workspace-ribbon")) resize.observe(child);
      schedule();
    } else {
      for (const dock of clamped) dock.classList.remove(floorClass);
      clamped.clear();
      win.cancelAnimationFrame(frame);
      frame = 0;
      const [width, height] = native.getMinimumSize();
      if (previousMinimum !== undefined && appliedMinimum === width && width !== previousMinimum) native.setMinimumSize(previousMinimum, height);
      previousMinimum = appliedMinimum = undefined;
    }
  }

  plugin.registerDomEvent(win, "resize", schedule);
  plugin.registerEvent(workspace.on("css-change", schedule));
  plugin.registerEvent(workspace.on("layout-change", schedule));
  workspace.onLayoutReady(() => { if (!disposed) configure(enabled); });
  plugin.register(() => { disposed = true; configure(false); });
  return next => { if (next !== enabled) configure(next); };
}
