import { ViewPlugin, type EditorView } from "@codemirror/view";
import { editorLivePreviewField, finishRenderMath, loadMathJax, Notice, renderMath, setIcon, type App, type Editor, type EditorPosition, type MarkdownPostProcessorContext, type Plugin } from "obsidian";
import { TableEditor } from "./table/editor";
import { createTable, parseTable, tableRanges } from "./table/model";
import { INLINE_MATH, registerTableConversion } from "./table/conversion";

const STALE = "The table changed while it was being edited. Open the editor again.";
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
    editorCheckCallback: (checking, editor) => {
      const text = editor.getValue();
      const offset = editor.posToOffset(editor.getCursor());
      const range = tableRanges(text).find(({ from, to }) => from <= offset && offset <= to);
      if (!range) return false;
      if (!checking) {
        const source = text.slice(range.from, range.to);
        edit(app, source, (html) => {
          const from = editor.offsetToPos(range.from);
          const to = editor.offsetToPos(range.to);
          if (editor.getRange(from, to) !== source) new Notice(STALE);
          else editor.replaceRange(html, from, to);
        });
      }
      return true;
    },
  });

  // Reading View has no editor, so the change goes through the vault by line.
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    if (!el.querySelector(":scope > table") || !locate(el, ctx)) return;
    el.addClass("obsidian-patch-table-host");
    addButton(el.createEl("button", { cls: "obsidian-patch-table-edit clickable-icon", attr: { type: "button" } }), () => {
      const found = locate(el, ctx);
      const file = app.vault.getFileByPath(ctx.sourcePath);
      if (!found || !file) {
        new Notice(STALE);
        return;
      }
      edit(app, found.source, (html) => {
        app.vault.process(file, (data) => {
          const lines = data.split("\n");
          if (lines.slice(found.lineStart, found.lineEnd + 1).join("\n") !== found.section) throw new Error(STALE);
          const section = found.section.slice(0, found.from) + html + found.section.slice(found.to);
          return [...lines.slice(0, found.lineStart), section, ...lines.slice(found.lineEnd + 1)].join("\n");
        }).catch((error: unknown) => new Notice(error instanceof Error ? error.message : String(error)));
      });
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
      addButton(button, () => editWidget(app, view, embed));
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

function edit(app: App, source: string, write: (html: string) => void): void {
  const table = parseTable(source);
  if (table) new TableEditor(app, { tables: [table], title: "Edit HTML table", editing: true, save: ([html]) => write(html!) }).open();
}

function editWidget(app: App, view: EditorView, embed: HTMLElement): void {
  const line = view.state.doc.lineAt(view.posAtDOM(embed));
  const text = view.state.doc.toString();
  const range = tableRanges(text).find(({ from, to }) => to > line.from && from <= line.to);
  if (!range) return;
  const source = text.slice(range.from, range.to);
  edit(app, source, (html) => {
    if (view.state.sliceDoc(range.from, range.to) !== source) new Notice(STALE);
    else view.dispatch({ changes: { from: range.from, to: range.to, insert: html } });
  });
}

function locate(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
  const info = ctx.getSectionInfo(el);
  if (!info) return undefined;
  const section = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1).join("\n");
  const range = tableRanges(section)[0];
  return range && { ...range, lineStart: info.lineStart, lineEnd: info.lineEnd, section, source: section.slice(range.from, range.to) };
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
