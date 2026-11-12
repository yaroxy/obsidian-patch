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
    console.warn("Obsidian Patch: the native PDF export hook is unavailable.");
    return;
  }
  let disposed = false;
  const prepared = new WeakSet<Modal>();
  const prepare = (modal: PdfModal): void => {
    if (prepared.has(modal)) return;
    prepared.add(modal);
    const print = modal.print;
    const desktop = modal.printToPdfDesktop;
    modal.print = async function (...args) {
      const root = await print.apply(this, args);
      if (!disposed && settings().headingLinks) addPdfHeadingLinks(root, plugin.app, this.file);
      return root;
    };
    modal.printToPdfDesktop = function (options) {
      if (disposed || !settings().outline) return desktop.call(this, options);
      return desktop.call(this, { ...options, generateDocumentOutline: true, generateTaggedPDF: true });
    };
  };
  function enhanced(this: ExportView): void {
    if (disposed || (!settings().outline && !settings().headingLinks)) return original!.call(this);
    const file = this.file;
    const open = Modal.prototype.open;
    // The native constructor opens synchronously. Restore the shared method before returning.
    Modal.prototype.open = function () {
      const modal = this as Partial<PdfModal>;
      if (modal.file === file && typeof modal.print === "function" && typeof modal.printToPdfDesktop === "function") prepare(this as PdfModal);
      return open.call(this);
    };
    try { original!.call(this); } finally { Modal.prototype.open = open; }
  }
  prototype.printToPdf = enhanced;
  plugin.register(() => {
    disposed = true;
    if (prototype.printToPdf === enhanced) prototype.printToPdf = original;
  });
}
