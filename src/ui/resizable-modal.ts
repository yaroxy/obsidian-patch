import { Platform, setTooltip, type Modal } from "obsidian";

interface Size {
  width: number;
  height: number;
}

const MIN: Size = { width: 420, height: 300 };
/** Space kept between a resized modal and the window's edges, as in the CSS cap. */
const MARGIN = 16;

function parseSize(value: unknown): Size | null {
  if (typeof value !== "object" || value === null) return null;
  const { width, height } = value as Record<string, unknown>;
  return typeof width === "number" && typeof height === "number" && Number.isFinite(width) && Number.isFinite(height)
    ? { width, height } : null;
}

/**
 * Lets the user resize a modal by a grip in its bottom-right corner. Obsidian
 * centers modals, so the size changes by twice the pointer's travel, which
 * keeps the grip under the pointer. The size is remembered per vault under
 * `key`, and a double-click on the grip restores the default size.
 *
 * The CSS for `.obsidian-patch-resizable` pins the header and the buttons, so
 * the modal's own layout decides which part takes the room.
 */
export function makeResizable(modal: Modal, key: string): void {
  if (Platform.isMobile) return;
  const { app, modalEl } = modal;
  modalEl.addClass("obsidian-patch-resizable");
  const grip = modalEl.createDiv({ cls: "obsidian-patch-resize-grip" });
  setTooltip(grip, "Drag to resize. Double-click to restore the default size.");

  const apply = (size: Size | null): void => {
    modalEl.toggleClass("is-resized", size !== null);
    if (!size) {
      modalEl.style.removeProperty("width");
      modalEl.style.removeProperty("height");
      return;
    }
    const win = modalEl.win;
    modalEl.style.width = `${Math.round(Math.min(Math.max(size.width, MIN.width), win.innerWidth - 2 * MARGIN))}px`;
    modalEl.style.height = `${Math.round(Math.min(Math.max(size.height, MIN.height), win.innerHeight - 2 * MARGIN))}px`;
  };
  apply(parseSize(app.loadLocalStorage(key)));

  grip.addEventListener("pointerdown", (evt) => {
    if (evt.button !== 0) return;
    // Also keeps the press from starting a text selection.
    evt.preventDefault();
    // Captured, the drag keeps the grip's cursor and its events even off the grip.
    try {
      grip.setPointerCapture(evt.pointerId);
    } catch {
      // The pointer is already gone.
    }
    const start = { x: evt.clientX, y: evt.clientY, width: modalEl.offsetWidth, height: modalEl.offsetHeight };
    const move = (e: PointerEvent): void => {
      apply({ width: start.width + 2 * (e.clientX - start.x), height: start.height + 2 * (e.clientY - start.y) });
    };
    const end = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", end);
      grip.removeEventListener("pointercancel", end);
      grip.removeEventListener("lostpointercapture", end);
      if (modalEl.hasClass("is-resized")) app.saveLocalStorage(key, { width: modalEl.offsetWidth, height: modalEl.offsetHeight });
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
    grip.addEventListener("lostpointercapture", end);
  });
  grip.addEventListener("dblclick", () => {
    apply(null);
    app.saveLocalStorage(key, null);
  });
}
