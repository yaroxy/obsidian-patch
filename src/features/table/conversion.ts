import { isolateHistory } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { Component, MarkdownRenderer, Notice, type Editor, type MarkdownFileInfo, type Plugin } from "obsidian";
import { TableEditor } from "./editor";
import { selectMarkdownTables, tableReferences, tableReplacement, type MarkdownTable } from "./markdown";
import { createTable, type Table } from "./model";

const EVENT = "obsidian-patch.convert-tables";
const NAME = "Convert Markdown tables to HTML";
const STALE = "The note changed while the preview was open. Cancel and open the conversion again.";

/** Cursor/selection conversion always goes through a draft and one editor transaction. */
export function registerTableConversion(plugin: Plugin): void {
  // Editor.transaction passes its origin as the CM user event. Isolate the
  // conversion from typing immediately before and after it as well as from itself.
  plugin.registerEditorExtension(EditorState.transactionExtender.of(transaction =>
    transaction.isUserEvent(EVENT) ? { annotations: isolateHistory.of("full") } : null));

  const pending = new WeakSet<Editor>();
  const open = async (editor: Editor, info: MarkdownFileInfo): Promise<void> => {
    if (pending.has(editor)) return;
    pending.add(editor);
    try {
      if (editor.listSelections().length !== 1) throw new Error("Use one cursor or one selection to convert tables.");
      const text = editor.getValue();
      const tables = selectMarkdownTables(text, editor.posToOffset(editor.getCursor("from")), editor.posToOffset(editor.getCursor("to")));
      if (!tables.length) throw new Error("Place the cursor in a standalone Markdown table, or select complete tables.");
      const file = info.file, path = file?.path ?? "";
      const current = (): boolean => info.file === file && (file?.path ?? "") === path && editor.getValue() === text;
      const references = tableReferences(text);
      const drafts: Table[] = [];
      // Keep the component alive through rendering, then release all processors.
      const component = new Component();
      component.load();
      try {
        for (let i = 0; i < tables.length; i++) {
          try { drafts.push(await renderTable(plugin, tables[i]!, text, references, path, component)); }
          catch (error) { throw new Error(`Table ${i + 1}: ${message(error)} No tables were converted.`); }
        }
      } finally { component.unload(); }
      if (!current()) throw new Error(STALE);
      new TableEditor(plugin.app, { tables: drafts, title: "Convert Markdown to HTML", converting: true, save: html => {
        if (!current()) { new Notice(STALE); return false; }
        const changes = tables.map((table, i) => ({ from: editor.offsetToPos(table.from), to: editor.offsetToPos(table.to),
          text: tableReplacement(text, table, html[i]!) }));
        editor.transaction({ changes }, EVENT);
        return true;
      } }).open();
    } catch (error) { new Notice(message(error)); }
    finally { pending.delete(editor); }
  };

  plugin.addCommand({ id: "convert-markdown-tables", name: NAME, icon: "table-2",
    editorCallback: (editor, info) => { void open(editor, info); } });
  plugin.registerEvent(plugin.app.workspace.on("editor-menu", (menu, editor, info) => {
    let found = false;
    try { found = selectMarkdownTables(editor.getValue(), editor.posToOffset(editor.getCursor("from")), editor.posToOffset(editor.getCursor("to"))).length > 0; }
    catch { found = true; } // Keep the action discoverable; clicking explains a partial selection.
    if (found) menu.addItem(item => item.setTitle(NAME).setIcon("table-2").onClick(() => { void open(editor, info); }));
  }));
}

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const INLINE = new Set(["A", "ABBR", "B", "BR", "CODE", "DEL", "EM", "I", "KBD", "MARK", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U", "VAR", "WBR"]);

async function renderTable(plugin: Plugin, source: MarkdownTable, text: string, references: string, path: string, component: Component): Promise<Table> {
  const width = source.align.length;
  if (source.rows.some(row => row.length > width)) throw new Error("A row has more cells than the header; fix it before converting.");
  if (/\[\^/.test(source.source)) throw new Error("Footnotes are not supported in HTML conversion yet.");
  const container = createDiv();
  // Include the rest of the contiguous block for validation. A conservative
  // source scan must never convert only part of a row that the native parser
  // still considers part of this table (for example an indented continuation).
  const following = text.slice(source.to).split(/\r?\n[ \t]*\r?\n/, 1)[0] ?? "";
  await MarkdownRenderer.render(plugin.app, source.source + following + "\n\n" + references, container, path, component);
  const rendered = container.querySelector("table");
  if (!rendered || container.querySelectorAll("table").length !== 1 || rendered.rows.length !== source.rows.length
    || Array.from(rendered.rows).some(row => row.cells.length !== width)) {
    throw new Error("This table's structure could not be converted reliably.");
  }
  if (rendered.querySelector(".math, .internal-embed, .footnote-ref") || [...rendered.querySelectorAll("th *, td *")].some(el =>
    !INLINE.has(el.tagName) || [...el.classList].some(cls => !["internal-link", "external-link"].includes(cls)))) {
    throw new Error("Formulas, images, embeds and dynamic content are not supported in HTML conversion yet.");
  }
  const table = createTable(rendered.rows.length, width);
  for (let r = 0; r < table.rows.length; r++) {
    for (let c = 0; c < width; c++) {
      const cell = table.rows[r]![c]!, dom = rendered.rows[r]!.cells[c]!;
      // Drop renderer-only hints, but retain native wiki-link targets and safe inline markup.
      for (const el of dom.querySelectorAll("[data-tooltip-position], [aria-label]")) {
        el.removeAttribute("data-tooltip-position"); el.removeAttribute("aria-label");
      }
      cell.html = dom.innerHTML;
      cell.attrs = cell.attrs.filter(([name]) => name !== "align");
      cell.attrs.unshift(["align", source.align[c]!]);
    }
  }
  return table;
}
