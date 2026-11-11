import { ViewPlugin, type EditorView } from "@codemirror/view";
import { debounce, editorInfoField, MarkdownView, Notice, setIcon, type App, type Editor, type MarkdownPostProcessorContext, type Plugin, type TFile } from "obsidian";
import { CalloutEditor, GitHubReport, type CalloutDraft } from "./callout/editor";
import {
  calloutAt, calloutLines, commonIndent, findCallouts, formatHeader, githubIssues, unwrapToBlockquote, unwrapToText, withMarkers,
  type Callout, type CalloutHeader,
} from "./callout/model";

export interface CalloutSettings {
  /** Show in the editor how GitHub renders the callout. */
  github: boolean;
  /** Folders whose notes get a GitHub count in the status bar, besides notes with `github: true`. */
  githubFolders: string[];
}

export const GITHUB_PROPERTY = "github";

export function parseCalloutSettings(data: unknown): CalloutSettings {
  const record: Record<string, unknown> = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  return {
    github: typeof record.github === "boolean" ? record.github : true,
    githubFolders: Array.isArray(record.githubFolders)
      ? record.githubFolders.filter((folder): folder is string => typeof folder === "string" && folder.trim() !== "")
      : [],
  };
}

const STALE = "The callout changed while it was being edited. Open the editor again.";
const NEW_HEADER: CalloutHeader = { type: "note", metadata: "", fold: "", title: "" };

/**
 * Visual editing for callouts: insert or wrap, edit, convert back to text or
 * a blockquote, and check them against GitHub's alert rules. Every entry point
 * writes back only if the callout's source is still what was opened.
 */
export function registerCallouts(plugin: Plugin, settings: () => CalloutSettings): void {
  const { app } = plugin;
  const pathOf = (info: { file?: TFile | null } | null | undefined): string => info?.file?.path ?? "";

  plugin.addCommand({
    id: "insert-callout",
    name: "Insert callout",
    icon: "quote",
    editorCallback: (editor, info) => insert(app, editor, pathOf(info), settings().github),
  });
  const onCallout = (id: string, name: string, run: (editor: Editor, callout: Callout, path: string) => void): void => {
    plugin.addCommand({
      id,
      name,
      editorCheckCallback: (checking, editor, info) => {
        const callout = calloutAtCursor(editor);
        if (!callout) return false;
        if (!checking) run(editor, callout, pathOf(info));
        return true;
      },
    });
  };
  onCallout("edit-callout", "Edit callout", (editor, callout, path) => editInEditor(app, editor, callout, path, settings().github));
  onCallout("callout-to-text", "Convert callout to text", (editor, callout) => replaceCallout(editor, callout, unwrapToText(callout)));
  onCallout("callout-to-blockquote", "Convert callout to blockquote", (editor, callout) => replaceCallout(editor, callout, unwrapToBlockquote(callout)));
  plugin.addCommand({
    id: "check-callouts-github",
    name: "Check callouts for GitHub",
    editorCallback: (editor) => report(app, editor),
  });

  plugin.registerEvent(app.workspace.on("editor-menu", (menu, editor, info) => {
    const callout = calloutAtCursor(editor);
    if (callout) {
      menu.addItem((item) => item.setTitle("Edit callout").setIcon("square-pen")
        .onClick(() => editInEditor(app, editor, callout, pathOf(info), settings().github)));
      menu.addItem((item) => item.setTitle("Convert callout to text").setIcon("pilcrow")
        .onClick(() => replaceCallout(editor, callout, unwrapToText(callout))));
      menu.addItem((item) => item.setTitle("Convert callout to blockquote").setIcon("text-quote")
        .onClick(() => replaceCallout(editor, callout, unwrapToBlockquote(callout))));
    } else if (editor.somethingSelected()) {
      menu.addItem((item) => item.setTitle("Wrap in callout").setIcon("quote")
        .onClick(() => insert(app, editor, pathOf(info), settings().github)));
    }
  }));

  // Live Preview draws a callout as a widget whose events CodeMirror ignores, so
  // a plain listener adds the button to the widget's own actions on first hover.
  plugin.registerEditorExtension(ViewPlugin.define((view) => {
    const hover = (evt: MouseEvent): void => {
      const embed = (evt.target as Element | null)?.closest?.<HTMLElement>(".cm-callout");
      const actions = embed?.querySelector<HTMLElement>(":scope > .embed-actions");
      if (!embed || !actions || actions.querySelector(".obsidian-patch-callout-edit")) return;
      const button = actions.createDiv({ cls: "embed-action obsidian-patch-callout-edit" });
      actions.prepend(button);
      addButton(button, () => editWidget(app, view, embed, settings().github));
    };
    view.contentDOM.addEventListener("mouseover", hover);
    return { destroy: () => view.contentDOM.removeEventListener("mouseover", hover) };
  }));

  // Reading View has no editor, so the change goes through the vault by line.
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    if (!el.querySelector(":scope > .callout") || !locate(el, ctx)) return;
    el.addClass("obsidian-patch-callout-host");
    addButton(el.createEl("button", { cls: "obsidian-patch-callout-edit clickable-icon", attr: { type: "button" } }), () => {
      const found = locate(el, ctx);
      const file = app.vault.getFileByPath(ctx.sourcePath);
      if (!found || !file) {
        new Notice(STALE);
        return;
      }
      const { callout, section, lineStart, lineEnd } = found;
      const source = section.slice(callout.from, callout.to);
      openEditor(app, callout, ctx.sourcePath, settings().github, (text) => {
        app.vault.process(file, (data) => {
          const lines = data.split("\n");
          if (lines.slice(lineStart, lineEnd + 1).join("\n") !== section) throw new Error(STALE);
          const next = section.slice(0, callout.from) + text(source) + section.slice(callout.to);
          return [...lines.slice(0, lineStart), next, ...lines.slice(lineEnd + 1)].join("\n");
        }).catch((error: unknown) => new Notice(error instanceof Error ? error.message : String(error)));
      });
    });
  });

  registerGitHubStatus(plugin, settings);
}

function calloutAtCursor(editor: Editor): Callout | undefined {
  return calloutAt(findCallouts(editor.getValue()), editor.posToOffset(editor.getCursor()));
}

/**
 * Opens the editor on a callout. `write` receives a function from the callout's
 * old source to its new one: only the header line changes when the content
 * did not, so untouched content keeps its exact markers. A conversion from
 * the editor applies to the callout as edited there.
 */
function openEditor(app: App, callout: Callout, sourcePath: string, github: boolean, write: (text: (source: string) => string) => void): void {
  new CalloutEditor(app, {
    title: "Edit callout",
    draft: { header: callout.header, body: callout.body },
    placement: callout,
    sourcePath,
    showGitHub: github,
    save: (draft, changed) => {
      write((source) => (changed.body
        ? calloutLines(callout.indent, callout.depth, draft.header, draft.body).join("\n")
        : withMarkers(formatHeader(draft.header), callout.indent, callout.depth) + source.slice((source.split("\n")[0] ?? "").length)));
    },
    convert: (draft, to) => {
      const edited = { ...callout, header: draft.header, body: draft.body };
      const lines = to === "text" ? unwrapToText(edited) : unwrapToBlockquote(edited);
      write(() => lines.join("\n"));
    },
  }).open();
}

function editInEditor(app: App, editor: Editor, callout: Callout, sourcePath: string, github: boolean): void {
  const source = editor.getValue().slice(callout.from, callout.to);
  openEditor(app, callout, sourcePath, github, (text) => {
    const from = editor.offsetToPos(callout.from);
    const to = editor.offsetToPos(callout.to);
    if (editor.getRange(from, to) !== source) new Notice(STALE);
    else editor.replaceRange(text(source), from, to);
  });
}

function editWidget(app: App, view: EditorView, embed: HTMLElement, github: boolean): void {
  const line = view.state.doc.lineAt(view.posAtDOM(embed));
  const callout = findCallouts(view.state.doc.toString()).find(({ from, depth }) => from === line.from && depth === 1);
  if (!callout) return;
  const source = view.state.sliceDoc(callout.from, callout.to);
  openEditor(app, callout, view.state.field(editorInfoField, false)?.file?.path ?? "", github, (text) => {
    if (view.state.sliceDoc(callout.from, callout.to) !== source) new Notice(STALE);
    else view.dispatch({ changes: { from: callout.from, to: callout.to, insert: text(source) } });
  });
}

function locate(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
  const info = ctx.getSectionInfo(el);
  if (!info) return undefined;
  const section = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1).join("\n");
  const callout = findCallouts(section).find(({ from, depth }) => from === 0 && depth === 1);
  return callout && { callout, section, lineStart: info.lineStart, lineEnd: info.lineEnd };
}

function addButton(button: HTMLElement, open: () => void): void {
  button.setAttribute("aria-label", "Edit callout");
  setIcon(button, "square-pen");
  // In Live Preview, a press would otherwise move the cursor into the callout's source.
  button.addEventListener("mousedown", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  });
  button.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    open();
  });
}

function replaceCallout(editor: Editor, callout: Callout, lines: string[]): void {
  editor.replaceRange(lines.join("\n"), editor.offsetToPos(callout.from), editor.offsetToPos(callout.to));
}

/**
 * Wraps the selected lines, or inserts a new callout at the cursor. A blank
 * line separates the callout from text around it, which would otherwise join
 * the callout as a lazy continuation or merge with a neighboring quote.
 */
function insert(app: App, editor: Editor, sourcePath: string, github: boolean): void {
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  const selected = editor.somethingSelected();
  const first = from.line;
  const last = selected && to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;
  const original = Array.from({ length: last - first + 1 }, (_, i) => editor.getLine(first + i));
  const blank = !selected && (original[0] ?? "").trim() === "";
  const lines = selected ? original : [];
  const indent = selected ? commonIndent(lines) : /^[ \t]*/.exec(original[0] ?? "")?.[0] ?? "";
  const draft: CalloutDraft = { header: NEW_HEADER, body: lines.map((line) => (line.trim() === "" ? "" : line.slice(indent.length))) };

  const save = (result: CalloutDraft): void => {
    if (Array.from({ length: last - first + 1 }, (_, i) => editor.getLine(first + i)).join("\n") !== original.join("\n")) {
      new Notice(STALE);
      return;
    }
    const block = calloutLines(indent, 1, result.header, result.body);
    // An empty new callout gets a line to type in.
    if (result.body.length === 0) block.push(`${withMarkers("", indent, 1)} `);
    // Replace the selected lines or the blank line at the cursor; otherwise add after the cursor's line.
    const start = selected || blank ? first : first + 1;
    const end = selected || blank ? last : first;
    const before = start > 0 ? editor.getLine(start - 1) : "";
    const after = end + 1 <= editor.lastLine() ? editor.getLine(end + 1) : "";
    const lead = before.trim() !== "" ? [""] : [];
    const trail = after.trim() !== "" ? [""] : [];
    const text = [...lead, ...block, ...trail].join("\n");
    if (selected || blank) editor.replaceRange(text, { line: start, ch: 0 }, { line: end, ch: editor.getLine(end).length });
    else editor.replaceRange(`\n${text}`, { line: first, ch: editor.getLine(first).length });
    const cursor = start + lead.length + block.length - 1;
    editor.setCursor({ line: cursor, ch: editor.getLine(cursor).length });
  };
  new CalloutEditor(app, {
    title: selected ? "Wrap in callout" : "Insert callout",
    draft,
    placement: { indent, depth: 1 },
    sourcePath,
    showGitHub: github,
    save,
  }).open();
}

function report(app: App, editor: Editor): void {
  const callouts = findCallouts(editor.getValue());
  if (callouts.length === 0) {
    new Notice("This note has no callouts.");
    return;
  }
  new GitHubReport(app, callouts.map((callout) => ({ line: callout.line, label: formatHeader(callout.header), issues: githubIssues(callout) })), (line) => {
    editor.setCursor({ line, ch: 0 });
    editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    editor.focus();
  }).open();
}

/** A status bar count of callouts GitHub would show as plain blockquotes, for notes meant for GitHub. */
function registerGitHubStatus(plugin: Plugin, settings: () => CalloutSettings): void {
  const { app } = plugin;
  const status = plugin.addStatusBarItem();
  status.addClass("obsidian-patch-callout-status", "mod-clickable");
  status.hide();
  const marked = (file: TFile): boolean => {
    if (app.metadataCache.getFileCache(file)?.frontmatter?.[GITHUB_PROPERTY] === true) return true;
    return settings().githubFolders.some((folder) => file.path.startsWith(`${folder.replace(/\/+$/, "")}/`));
  };
  const update = debounce(() => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!settings().github || !view || !file || !marked(file)) {
      status.hide();
      return;
    }
    const callouts = findCallouts(view.editor.getValue());
    const failing = callouts.filter((callout) => githubIssues(callout).some(({ level }) => level === "error")).length;
    if (callouts.length === 0) {
      status.hide();
      return;
    }
    status.show();
    status.empty();
    setIcon(status.createSpan({ cls: "obsidian-patch-callout-status-icon" }), failing ? "alert-triangle" : "check-circle-2");
    status.createSpan({ text: failing ? `GitHub: ${failing}/${callouts.length} callouts not alerts` : "GitHub: callouts OK" });
    status.setAttribute("aria-label", failing
      ? `GitHub would show ${failing} of ${callouts.length} callouts as plain blockquotes. Click for details.`
      : "GitHub shows every callout in this note as an alert.");
  }, 300, true);
  status.addEventListener("click", () => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view) report(app, view.editor);
  });
  plugin.registerEvent(app.workspace.on("active-leaf-change", update));
  plugin.registerEvent(app.workspace.on("editor-change", update));
  plugin.registerEvent(app.metadataCache.on("changed", update));
  app.workspace.onLayoutReady(update);
}
