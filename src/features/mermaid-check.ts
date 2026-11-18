import { getFrontMatterInfo, MarkdownView, Notice, type Plugin, type TFile } from "obsidian";
import { CheckReportModal } from "../ui/check-report";
import { diagramBlocks, DIAGRAM_LANGUAGE, errorLocation, type DiagramBlock, type DiagramLocation } from "./mermaid-check/model";
import type { MermaidRuntime } from "./mermaid-runtime";
import { editorLines, isActiveCheckNote, readCheckSource, sameCheckText } from "./note-check-source";

const COMMAND = "Check diagrams in this note";
const STALE = "The note changed. Run the diagram check again for current line numbers.";

export function registerMermaidCheck(plugin: Plugin, runtime: () => Promise<MermaidRuntime>): void {
  let report: DiagramReport | undefined;
  plugin.register(() => report?.close());
  plugin.addCommand({
    id: "check-diagrams-in-note",
    name: COMMAND,
    checkCallback(checking) {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view?.file) return false;
      if (!checking) {
        report?.close();
        const next = new DiagramReport(view, view.file, runtime);
        next.setCloseCallback(() => { if (report === next) report = undefined; });
        report = next;
        next.open();
      }
      return true;
    },
  });
}

class DiagramReport extends CheckReportModal {
  private closed = false;

  constructor(private readonly view: MarkdownView, private readonly file: TFile, private readonly runtime: () => Promise<MermaidRuntime>) {
    super(view.app, COMMAND, "obsidian-patch-mermaid-report");
  }

  private async current(text: string): Promise<boolean> {
    if (!isActiveCheckNote(this.view, this.file)) return false;
    const source = await readCheckSource(this.view, this.file);
    return isActiveCheckNote(this.view, this.file) && sameCheckText(source, text);
  }

  override async onOpen(): Promise<void> {
    const status = this.summaryEl;
    try {
      const text = await readCheckSource(this.view, this.file);
      if (this.closed) return;
      const markdown = editorLines(text);
      const start = getFrontMatterInfo(markdown).contentStart;
      const firstLine = markdown.slice(0, start).split("\n").length - 1;
      const blocks = diagramBlocks(markdown.slice(start), firstLine);
      if (!blocks.length) {
        status.setText(await this.current(text) ? `No ${DIAGRAM_LANGUAGE} blocks in ${this.file.name}.` : STALE);
        return;
      }
      status.setText(`Checking ${this.file.name}…`);
      const { mermaid, version } = await this.runtime();
      const errors: { number: number; block: DiagramBlock; message: string }[] = [];
      for (const [index, block] of blocks.entries()) {
        if (this.closed) return;
        try {
          await mermaid.parse(block.source);
        } catch (error) {
          errors.push({ number: index + 1, block, message: error instanceof Error ? error.message : String(error) });
        }
      }
      if (this.closed) return;
      if (!await this.current(text)) { status.setText(STALE); return; }
      status.setText(`${this.file.name} · Mermaid ${version} · Checked ${blocks.length} ${blocks.length === 1 ? "diagram" : "diagrams"}. ${errors.length ? `${errors.length} failed to parse.` : "No syntax errors."}`);
      if (!errors.length) return;
      const list = this.addList("Diagram errors");
      for (const { number, block, message } of errors) {
        const position = errorLocation(block, message);
        const line = `Note line ${position.line + 1}${position.line === block.line ? " (opening fence)" : ""}`;
        const { row, label, actions } = this.addRow(list, `Jump to note line ${position.line + 1} for diagram ${number}`,
          () => { void this.goTo(text, block, position); });
        label.createEl("strong", { text: `Diagram ${number}` });
        label.appendText(` · ${line} · Syntax error`);
        this.addDetails(actions, row.createEl("pre", { text: message }), `Details for diagram ${number}`);
      }
    } catch (error) {
      if (!this.closed) status.setText(`Could not check diagrams: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  override onClose(): void { this.closed = true; }

  private async goTo(text: string, block: DiagramBlock, position: DiagramLocation): Promise<void> {
    try {
      const current = await this.current(text);
      if (this.closed) return;
      this.shouldRestoreSelection = false;
      this.close();
      if (!current) { new Notice(STALE); return; }
      if (this.view.getMode() === "preview") {
        // Obsidian gives view.data to the editor when switching modes. After an
        // undo this buffer can lag both the saved file and the existing editor.
        if (!sameCheckText(this.view.data, text)) {
          if (!sameCheckText(this.view.editor.getValue(), text)) { new Notice(STALE); return; }
          this.view.data = text;
        }
        const state = this.view.leaf.getViewState();
        await this.view.leaf.setViewState({ ...state, state: { ...state.state, mode: "source" } });
      }
      const editor = this.view.editor;
      if (!isActiveCheckNote(this.view, this.file) || !sameCheckText(editor.getValue(), text)) { new Notice(STALE); return; }
      const lineText = editor.getLine(position.line);
      const codeLine = block.source.split("\n")[position.line - block.line - 1];
      const ch = position.column !== undefined && codeLine !== undefined && lineText.endsWith(codeLine)
        ? lineText.length - codeLine.length + position.column : 0;
      const cursor = { line: position.line, ch };
      editor.setCursor(cursor);
      editor.scrollIntoView({ from: cursor, to: cursor }, true);
      editor.focus();
    } catch (error) {
      new Notice(`Could not open the source line: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
