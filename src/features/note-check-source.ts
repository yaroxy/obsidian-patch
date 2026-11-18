import { MarkdownView, type TFile } from "obsidian";

/** Reading view may retain an older hidden editor. Keep the disk text intact for mode switches. */
export function readCheckSource(view: MarkdownView, file: TFile): string | Promise<string> {
  return view.getMode() === "preview" ? view.app.vault.read(file) : view.editor.getValue();
}

export function isActiveCheckNote(view: MarkdownView, file: TFile): boolean {
  return view.file === file && view.app.workspace.getActiveViewOfType(MarkdownView) === view;
}

/** CodeMirror represents line breaks as LF even when the saved file uses CRLF. */
export function editorLines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function sameCheckText(first: string, second: string): boolean {
  return first === second || editorLines(first) === editorLines(second);
}
