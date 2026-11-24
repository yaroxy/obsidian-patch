import { isolateHistory } from "@codemirror/commands";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import {
  editorInfoField, editorLivePreviewField, finishRenderMath, loadMathJax, MarkdownView, Notice, renderMath, setIcon,
  type Editor, type EditorPosition, type MarkdownPostProcessorContext, type Plugin,
} from "obsidian";
import { editorLines, sameCheckText } from "./note-check-source";
import { TableEditor } from "./table/editor";
import { replaceSavedTable, tableReplacement } from "./table/markdown";
import { createTable, draftTableElement, parseTable, tableRanges, TableSizeError, type Table } from "./table/model";
import { INLINE_MATH, openHtmlToMarkdownConversion, registerTableConversion } from "./table/conversion";
import { auditHtmlTable } from "./table/to-markdown";

const STALE = "The table changed while it was being edited. Open the editor again.";
const REVERSE_EVENT = "obsidian-patch.convert-html-tables";
const WIDGET_MATH = `.cm-html-embed > table ${INLINE_MATH}`;

/**
 * Visual editing for HTML tables in notes. Every entry point opens the same
 * editor and writes back only if the table's source is still what was opened.
 */
export function registerTables(plugin: Plugin): void {
  const { app } = plugin;
  registerTableConversion(plugin);

  plugin.addCommand({
    id: "insert-html-table",
    name: "Insert HTML table",
    editorCallback: (editor) => {
      const from = editor.getCursor("from");
      const to = editor.getCursor("to");
      new TableEditor(app, { tables: [createTable(3, 3)], title: "Insert HTML table",
        save: ([html]) => insertBlock(editor, from, to, html!) }).open();
    },
  });

  plugin.addCommand({
    id: "edit-html-table",
    name: "Edit HTML table",
    editorCheckCallback: (checking, editor, info) => {
      const text = editor.getValue();
      const offset = editor.posToOffset(editor.getCursor());
      const range = tableRanges(text).find(({ from, to }) => from <= offset && offset <= to);
      if (!range) return false;
      if (!checking) {
        const source = text.slice(range.from, range.to);
        const file = info?.file;
        const path = file?.path ?? "";
        edit(
          plugin,
          source,
          (html) => {
            const from = editor.offsetToPos(range.from);
            const to = editor.offsetToPos(range.to);
            if (info?.file !== file || editor.getRange(from, to) !== source) throw new Error(STALE);
            editor.replaceRange(html, from, to);
          },
          {
            sourcePath: path,
            noteText: text,
            onConvert: (markdown) => {
              if (info?.file !== file || (file?.path ?? "") !== path || editor.getValue() !== text) {
                new Notice(STALE);
                return false;
              }
              const from = editor.offsetToPos(range.from);
              const to = editor.offsetToPos(range.to);
              editor.transaction({ changes: [{ from, to, text: tableReplacement(text, range, markdown) }] }, REVERSE_EVENT);
              return true;
            },
          },
        );
      }
      return true;
    },
  });

  // Reading View has no editor, so edits go through the vault by line and
  // HTML-to-Markdown conversion switches to edit mode for a single undoable transaction.
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    if (!el.querySelector(":scope > table") || !locate(el, ctx)) return;
    el.addClass("obsidian-patch-table-host");
    addButton(el.createEl("button", { cls: "obsidian-patch-table-edit clickable-icon", attr: { type: "button" } }), () => {
      const found = locate(el, ctx);
      const path = ctx.sourcePath;
      const file = app.vault.getFileByPath(path);
      if (!found || !file) {
        new Notice(STALE);
        return;
      }
      edit(
        plugin,
        found.source,
        async (html) => {
          await app.vault.process(file, (data) => {
            const updated = replaceSavedTable(data, found, html);
            if (updated === undefined) throw new Error(STALE);
            return updated;
          });
        },
        {
          sourcePath: path,
          noteText: found.noteText,
          onConvert: async (markdown) => {
            let diskText: string;
            try { diskText = await app.vault.read(file); }
            catch { new Notice("Could not read the note to convert this table."); return false; }
            if (app.vault.getFileByPath(path) !== file || !sameCheckText(diskText, found.noteText)) {
              new Notice(STALE);
              return false;
            }
            const view = app.workspace.getLeavesOfType("markdown")
              .map((leaf) => leaf.view)
              .find((candidate): candidate is MarkdownView => candidate instanceof MarkdownView && candidate.containerEl.contains(el) && candidate.file === file);
            if (!view) {
              new Notice("Open the source note in a Markdown tab and convert the table there.");
              return false;
            }
            if (view.getMode() === "preview") {
              if (!sameCheckText(view.data, diskText)) {
                if (!sameCheckText(view.editor.getValue(), diskText)) { new Notice(STALE); return false; }
                view.data = diskText;
              }
              const state = view.leaf.getViewState();
              await view.leaf.setViewState({ ...state, state: { ...state.state, mode: "source" } });
            }
            const editor = view.editor;
            if (view.leaf.view !== view || view.getMode() !== "source" || view.file !== file || app.vault.getFileByPath(path) !== file || !sameCheckText(editor.getValue(), diskText)) {
              new Notice(STALE);
              return false;
            }
            const currentText = editor.getValue();
            const sectionStart = editor.posToOffset({ line: found.lineStart, ch: 0 });
            const absFrom = sectionStart + found.from;
            const absTo = sectionStart + found.to;
            if (currentText.slice(absFrom, absTo) !== found.source) {
              new Notice(STALE);
              return false;
            }
            const fromPos = editor.offsetToPos(absFrom);
            const toPos = editor.offsetToPos(absTo);
            const replacement = tableReplacement(currentText, { from: absFrom, to: absTo }, markdown);
            app.workspace.setActiveLeaf(view.leaf, { focus: true });
            editor.transaction({ changes: [{ from: fromPos, to: toPos, text: replacement }] }, REVERSE_EVENT);
            editor.setCursor(fromPos);
            editor.focus();
            return true;
          },
        },
      );
    });
  });

  plugin.registerEditorExtension(ViewPlugin.define((view) => {
    // Live Preview widgets bypass the Reading View math postprocessor.
    const renderedMath = new WeakMap<HTMLElement, string>();
    let destroyed = false;
    const typeset = async (): Promise<void> => {
      if (destroyed || !view.state.field(editorLivePreviewField, false)) return;
      const formulas = view.contentDOM.querySelectorAll<HTMLElement>(`${WIDGET_MATH}:not(.is-loaded)`);
      if (!formulas.length) return;
      await loadMathJax();
      if (destroyed) return;
      let changed = false;
      for (const el of formulas) {
        if (!view.contentDOM.contains(el) || el.childElementCount || el.classList.contains("is-loaded")) continue;
        const tex = el.textContent;
        try {
          el.replaceChildren(renderMath(tex, false));
          el.addClass("is-loaded");
          renderedMath.set(el, tex);
          changed = true;
        } catch { /* Keep the TeX visible if MathJax cannot render it. */ }
      }
      if (changed) {
        await finishRenderMath();
        if (!destroyed) view.requestMeasure();
      }
    };
    const updateMath = (): void => { void typeset().catch(() => { /* MathJax unavailable. */ }); };

    // CodeMirror ignores widget events. Add the button on first hover.
    const hover = (evt: MouseEvent): void => {
      const embed = (evt.target as Element | null)?.closest?.<HTMLElement>(".cm-html-embed");
      const actions = embed?.querySelector<HTMLElement>(":scope > .embed-actions");
      if (!embed || !actions || !embed.querySelector(":scope > table") || actions.querySelector(".obsidian-patch-table-edit")) return;
      const button = actions.createDiv({ cls: "embed-action obsidian-patch-table-edit" });
      actions.prepend(button);
      addButton(button, () => editWidget(plugin, view, embed));
    };
    view.contentDOM.addEventListener("mouseover", hover);
    queueMicrotask(updateMath);
    return {
      docViewUpdate: updateMath,
      destroy: () => {
        destroyed = true;
        view.contentDOM.removeEventListener("mouseover", hover);
        for (const el of view.contentDOM.querySelectorAll<HTMLElement>(WIDGET_MATH)) {
          const tex = renderedMath.get(el);
          if (tex === undefined) continue;
          el.setText(tex);
          el.removeClass("is-loaded");
        }
      },
    };
  }));
}

interface EditReverseContext {
  sourcePath: string;
  noteText: string;
  onConvert(markdown: string): Promise<boolean | void> | boolean | void;
}

function edit(plugin: Plugin, source: string, write: (html: string) => void | Promise<void>, reverse?: EditReverseContext): void {
  let table: Table | undefined;
  try { table = parseTable(source); }
  catch (error) {
    if (!(error instanceof TableSizeError)) throw error;
    new Notice(error.message);
    return;
  }
  if (!table) return;
  const { app } = plugin;
  new TableEditor(app, {
    tables: [table],
    title: "Edit HTML table",
    editing: true,
    save: ([html]) => write(html!),
    convertToMarkdown: reverse
      ? (draft: Table, done: () => void) => {
          const sourceDom = new DOMParser().parseFromString(source, "text/html").querySelector("table");
          const sourceAudit = sourceDom ? auditHtmlTable(sourceDom, reverse.noteText) : undefined;
          const draftDom = draftTableElement(draft);
          if (!draftDom) { new Notice("Could not parse the edited table."); return; }
          openHtmlToMarkdownConversion(
            plugin,
            [{ tableEl: draftDom, extraAudit: sourceAudit }],
            reverse.sourcePath,
            reverse.noteText,
            "Convert HTML to Markdown",
            async ([markdown]) => {
              const ok = await reverse.onConvert(markdown!);
              if (ok === false) return false;
              done();
              return true;
            },
          );
        }
      : undefined,
  }).open();
}

function editWidget(plugin: Plugin, view: EditorView, embed: HTMLElement): void {
  const line = view.state.doc.lineAt(view.posAtDOM(embed));
  const text = view.state.doc.toString();
  const range = tableRanges(text).find(({ from, to }) => to > line.from && from <= line.to);
  if (!range) return;
  const source = text.slice(range.from, range.to);
  const file = view.state.field(editorInfoField, false)?.file;
  const path = file?.path ?? "";
  edit(
    plugin,
    source,
    (html) => {
      if (!view.dom.isConnected || view.state.field(editorInfoField, false)?.file !== file || view.state.sliceDoc(range.from, range.to) !== source) throw new Error(STALE);
      view.dispatch({ changes: { from: range.from, to: range.to, insert: html } });
    },
    {
      sourcePath: path,
      noteText: text,
      onConvert: (markdown) => {
        if (!view.dom.isConnected || view.state.field(editorInfoField, false)?.file !== file || (file?.path ?? "") !== path || view.state.doc.toString() !== text) {
          new Notice(STALE);
          return false;
        }
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: tableReplacement(text, range, markdown) },
          annotations: isolateHistory.of("full"),
        });
        return true;
      },
    },
  );
}

function locate(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
  const info = ctx.getSectionInfo(el);
  if (!info) return undefined;
  const section = editorLines(info.text).split("\n").slice(info.lineStart, info.lineEnd + 1).join("\n");
  const range = tableRanges(section)[0];
  return range && { ...range, noteText: info.text, lineStart: info.lineStart, section, source: section.slice(range.from, range.to) };
}

function addButton(button: HTMLElement, open: () => void): void {
  button.setAttribute("aria-label", "Edit table");
  setIcon(button, "square-pen");
  // In Live Preview, a press would otherwise move the cursor into the table's source.
  button.addEventListener("mousedown", (evt) => { evt.preventDefault(); evt.stopPropagation(); });
  button.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    open();
  });
}

/** An HTML block runs until a blank line, so the table gets one on each side. */
function insertBlock(editor: Editor, from: EditorPosition, to: EditorPosition, html: string): void {
  const last = editor.lastLine();
  const before = editor.getRange({ line: 0, ch: 0 }, from);
  const after = editor.getRange(to, { line: last, ch: editor.getLine(last).length });
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after.startsWith("\n\n") ? "" : after === "" || after.startsWith("\n") ? "\n" : "\n\n";
  editor.replaceRange(lead + html + trail, from, to);
}
