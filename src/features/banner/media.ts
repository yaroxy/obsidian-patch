import type { App } from "obsidian";
import type { BannerSettings, BannerState } from "./config";

export interface BannerActions {
  select(): void;
  remove(): void;
}

/** Media and playback owned by a page cover. */
export class BannerMedia {
  private readonly stage: HTMLElement;
  private readonly message: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly observer: IntersectionObserver;
  private readonly resizeObserver: ResizeObserver;
  private readonly motion: MediaQueryList;
  private media?: HTMLImageElement | HTMLVideoElement;
  private sourceKey = "";
  private state: BannerState = { status: "none" };
  private visible = false;
  private pausedByUser = false;
  private manuallyStarted = false;
  private imageAllowed = false;
  private imageHidden = false;
  private playbackBlocked = false;
  private failed = false;
  private destroyed = false;

  constructor(
    readonly element: HTMLElement,
    private readonly app: App,
    private settings: BannerSettings,
    actions: BannerActions,
    resized: () => void = () => {},
  ) {
    element.classList.add("obsidian-patch-banner");
    this.stage = element.createDiv({ cls: "obsidian-patch-banner-stage" });
    this.message = this.stage.createDiv({ cls: "obsidian-patch-banner-message" });
    const toolbar = element.createDiv({ cls: "obsidian-patch-banner-toolbar" });
    this.button(toolbar, "Change cover", () => actions.select());
    this.button(toolbar, "Remove cover", () => actions.remove());
    this.toggle = this.button(toolbar, "Show media", () => this.toggleMedia());
    const win = element.ownerDocument.defaultView!;
    this.motion = win.matchMedia("(prefers-reduced-motion: reduce)");
    this.observer = new win.IntersectionObserver((entries) => {
      this.visible = entries.some((entry) => entry.isIntersecting);
      this.syncPlayback();
    });
    this.observer.observe(element);
    this.resizeObserver = new win.ResizeObserver(resized);
    this.resizeObserver.observe(element);
    this.motion.addEventListener("change", this.onMotionChange);
    element.ownerDocument.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  update(state: BannerState, settings: BannerSettings): void {
    if (this.destroyed) return;
    this.state = state;
    this.settings = settings;
    this.element.hidden = !settings.enabled || state.status === "none";
    this.element.dataset.status = state.status;
    if (state.status !== "ready" || !settings.enabled) {
      this.releaseMedia();
      this.sourceKey = "";
      this.message.textContent = state.status === "error" ? state.message : "";
      this.message.hidden = false;
      this.toggle.hidden = true;
      return;
    }
    const { banner } = state;
    const key = JSON.stringify([banner.file.path, banner.file.stat.mtime, banner.file.stat.size]);
    if (key !== this.sourceKey) {
      this.releaseMedia();
      this.sourceKey = key;
      this.pausedByUser = false;
      this.manuallyStarted = false;
      this.imageAllowed = false;
      this.imageHidden = false;
      this.playbackBlocked = false;
      this.failed = false;
    }
    this.mountMedia();
    this.syncPlayback();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer.disconnect();
    this.resizeObserver.disconnect();
    this.motion.removeEventListener("change", this.onMotionChange);
    this.element.ownerDocument.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.releaseMedia();
    this.element.remove();
  }

  private readonly onVisibilityChange = (): void => this.syncPlayback();
  private readonly onMotionChange = (): void => {
    this.imageAllowed = false;
    this.manuallyStarted = false;
    this.mountMedia();
    this.syncPlayback();
  };

  private mountMedia(): void {
    if (this.destroyed || this.state.status !== "ready" || !this.settings.enabled) return;
    const { banner } = this.state;
    const mayAnimate = !["jpg", "jpeg", "bmp"].includes(banner.file.extension.toLowerCase());
    if (banner.kind === "image" && (this.imageHidden || (this.motion.matches && mayAnimate && !this.imageAllowed))) {
      this.releaseMedia();
      this.message.textContent = "Media hidden. Choose Show media to display it.";
      this.message.hidden = false;
      this.toggle.hidden = false;
      this.labelToggle("Show media");
      return;
    }
    if (!this.media && !this.failed) {
      const win = this.element.ownerDocument.defaultView!;
      const media = banner.kind === "video"
        ? win.createEl("video", { cls: "obsidian-patch-banner-media" })
        : win.createEl("img", { cls: "obsidian-patch-banner-media" });
      this.media = media;
      this.message.textContent = "Loading banner…";
      this.message.hidden = false;
      const loaded = (): void => {
        if (this.destroyed || this.media !== media) return;
        this.message.hidden = true;
        this.syncPlayback();
      };
      media.addEventListener(banner.kind === "video" ? "loadeddata" : "load", loaded, { once: true });
      media.addEventListener("error", () => {
        if (this.destroyed || this.media !== media) return;
        this.failed = true;
        this.message.textContent = "Media could not be loaded. Choose another banner or retry.";
        this.message.hidden = false;
        this.toggle.hidden = false;
        this.labelToggle("Retry media");
      }, { once: true });
      if (media.tagName === "VIDEO") {
        const video = media as HTMLVideoElement;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.addEventListener("play", () => this.updateToggle());
        video.addEventListener("pause", () => this.updateToggle());
      } else {
        (media as HTMLImageElement).alt = "";
      }
      media.src = this.app.vault.getResourcePath(banner.file);
      this.stage.prepend(media);
    }
    this.updateToggle();
  }

  private toggleMedia(): void {
    if (this.failed) {
      this.failed = false;
      this.releaseMedia();
      this.mountMedia();
    } else if (this.state.status === "ready" && this.state.banner.kind === "image") {
      this.imageHidden = !!this.media;
      this.imageAllowed = true;
      this.mountMedia();
    } else {
      const video = this.video();
      this.pausedByUser = video !== undefined && !video.paused;
      this.manuallyStarted = !this.pausedByUser;
      this.playbackBlocked = false;
    }
    this.syncPlayback();
  }

  private syncPlayback(): void {
    const video = this.video();
    if (!video || this.destroyed) return;
    if (this.shouldPlay()) {
      if (video.paused && !this.playbackBlocked) {
        void video.play().then(() => {
          if (this.media !== video || !this.shouldPlay()) video.pause();
        }).catch(() => {
          if (this.media === video && this.shouldPlay()) this.playbackBlocked = true;
          this.updateToggle();
        });
      }
    } else {
      video.pause();
    }
    this.updateToggle();
  }

  private shouldPlay(): boolean {
    return !this.destroyed && this.settings.enabled && !this.failed && this.visible &&
      !this.element.ownerDocument.hidden && !this.pausedByUser &&
      (this.manuallyStarted || (this.settings.autoplayVideos && !this.motion.matches));
  }

  private updateToggle(): void {
    if (this.failed || !this.media) return;
    this.toggle.hidden = false;
    this.labelToggle(this.video() ? (this.video()!.paused ? "Play video" : "Pause video") : "Hide media");
  }

  private labelToggle(label: string): void {
    this.toggle.textContent = label;
    this.toggle.setAttribute("aria-label", label);
  }

  private video(): HTMLVideoElement | undefined {
    return this.media?.tagName === "VIDEO" ? this.media as HTMLVideoElement : undefined;
  }

  private releaseMedia(): void {
    const media = this.media;
    this.media = undefined;
    if (!media) return;
    if (media.tagName === "VIDEO") (media as HTMLVideoElement).pause();
    media.removeAttribute("src");
    if (media.tagName === "VIDEO") (media as HTMLVideoElement).load();
    media.remove();
  }

  private button(parent: HTMLElement, label: string, callback: () => void): HTMLButtonElement {
    const button = parent.createEl("button", { text: label, attr: { type: "button", "aria-label": label } });
    button.addEventListener("click", (event) => { event.preventDefault(); callback(); });
    return button;
  }
}
