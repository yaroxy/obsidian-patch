import { MarkdownView, Modal, Platform, type Component, type Plugin, type TFile } from "obsidian";
import { addPdfHeadingLinks } from "./pdf-export/navigation";
import type { PdfExportSettings } from "./pdf-export/model";

export { parsePdfExportSettings, type PdfExportSettings } from "./pdf-export/model";

interface PdfModal extends Modal {
  file: TFile;
  print(container: HTMLElement, component: Component, includeName: boolean): Promise<HTMLElement>;
  printToPdfDesktop(options: Record<string, unknown>): Promise<void>;
}
type ExportView = MarkdownView & { printToPdf?: () => void };

/** The native export has no public hook. Keep all host-method access in this adapter. */
export function registerPdfExport(plugin: Plugin, settings: () => PdfExportSettings): void {
  if (!Platform.isDesktopApp) return;
  const prototype = MarkdownView.prototype as ExportView;
  const original = prototype.printToPdf;
  if (typeof original !== "function") {
    console.warn("Patches: the native PDF export hook is unavailable.");
    return;
  }
  let disposed = false;
  const prepared = new WeakSet<Modal>();
  const prepare = (modal: PdfModal): void => {
    if (prepared.has(modal)) return;
    prepared.add(modal);
    const print = modal.print.bind(modal);
    const desktop = modal.printToPdfDesktop.bind(modal);
    modal.print = async function (...args) {
      const root = await print(...args);
      if (!disposed && settings().headingLinks) addPdfHeadingLinks(root, plugin.app, modal.file);
      return root;
    };
    modal.printToPdfDesktop = function (options) {
      if (disposed || !settings().outline) return desktop(options);
      return desktop({ ...options, generateDocumentOutline: true, generateTaggedPDF: true });
    };
  };
  function enhanced(this: ExportView): void {
    if (disposed || (!settings().outline && !settings().headingLinks)) return original!.call(this);
    const file = this.file;
    // Restore the complete property descriptor, including the original function
    // identity. Unsupported host shapes keep the native export path.
    const descriptor = Object.getOwnPropertyDescriptor(Modal.prototype, "open");
    const value: unknown = descriptor?.value;
    if (!descriptor || typeof value !== "function" || !descriptor.writable) return original!.call(this);
    const open = value as Modal["open"];
    // The native constructor opens synchronously. Restore the shared method before returning.
    Modal.prototype.open = function () {
      const modal = this as Partial<PdfModal>;
      if (modal.file === file && typeof modal.print === "function" && typeof modal.printToPdfDesktop === "function") prepare(this as PdfModal);
      return open.call(this);
    };
    try { original!.call(this); } finally { Object.defineProperty(Modal.prototype, "open", descriptor); }
  }
  prototype.printToPdf = enhanced;
  plugin.register(() => {
    disposed = true;
    if (prototype.printToPdf === enhanced) prototype.printToPdf = original;
  });
}
