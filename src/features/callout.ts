import { ViewPlugin, type EditorView } from "@codemirror/view";
import { debounce, editorInfoField, MarkdownView, Notice, setIcon, type App, type Editor, type IconName, type MarkdownPostProcessorContext, type Plugin, type TFile } from "obsidian";
import { CalloutEditor, GitHubReport, type CalloutDraft, type CalloutEditorOptions } from "./callout/editor";
import { CalloutTypeSuggest } from "./callout/type-suggest";
import { editorLines, isActiveCheckNote, readCheckSource, sameCheckText } from "./note-check-source";
import {
  calloutAt, calloutLines, commonIndent, findCallouts, formatCalloutPaste, formatHeader, githubIssues,
  matchCalloutSource, replaceCalloutLines, unwrapToBlockquote, unwrapToText, withMarkers, type Callout, type CalloutHeader,
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

const STALE = "The callout changed while it was being edited. Copy your draft before reopening the editor.";
const NEW_HEADER: CalloutHeader = { type: "NOTE", metadata: "", fold: "", title: "" };
type WriteMode = "header" | "full";
type EditorContext = Pick<CalloutEditorOptions, "sourcePath" | "showGitHub" | "prioritizeGitHub" | "appearances">;

function isGitHubMarked(app: App, file: TFile | null | undefined, githubFolders: string[]): boolean {
  if (!file) return false;
  if (app.metadataCache.getFileCache(file)?.frontmatter?.[GITHUB_PROPERTY] === true) return true;
  return githubFolders.some((folder) => file.path.startsWith(`${folder.replace(/\/+$/, "")}/`));
}

/**
 * Visual property editing, inline type suggestions, smart multi-line paste,
 * conversion, and GitHub compatibility checking for callouts. Every entry
 * point writes back only if the callout's source is still what was opened.
 */
export function registerCallouts(plugin: Plugin, settings: () => CalloutSettings, appearances: () => EditorContext["appearances"]): () => void {
  const { app } = plugin;
  const fileOf = (info: { file?: TFile | null } | null | undefined): TFile | null => info?.file ?? null;
  const prioritize = (file: TFile | null | undefined): boolean => settings().github && isGitHubMarked(app, file, settings().githubFolders);

  const contextFor = (file: TFile | null): EditorContext => ({
    sourcePath: file?.path ?? "", showGitHub: settings().github, prioritizeGitHub: prioritize(file), appearances: appearances(),
  });
  plugin.registerEditorSuggest(new CalloutTypeSuggest(app, appearances, prioritize));

  plugin.registerEvent(app.workspace.on("editor-paste", (evt, editor) => {
    const clipboard = evt.clipboardData;
    if (evt.defaultPrevented || !clipboard || clipboard.files.length || clipboard.types.some(type => type !== "text/plain")) return;
    const plain = clipboard.getData("text/plain");
    if (!plain || !/[\r\n]/.test(plain)) return;
    const text = editor.getValue();
    const from = editor.posToOffset(editor.getCursor("from"));
    const to = editor.posToOffset(editor.getCursor("to"));
    const replacement = formatCalloutPaste(text, from, to, plain);
    if (replacement === undefined) return;
    evt.preventDefault();
    editor.replaceSelection(replacement);
  }));

  plugin.addCommand({
    id: "insert-callout",
    name: "Insert callout",
    icon: "quote",
    editorCallback: (editor, info) => insert(app, editor, contextFor(fileOf(info))),
  });
  const onCallout = (id: string, name: string, run: (editor: Editor, callout: Callout, file: TFile | null) => void): void => {
    plugin.addCommand({
      id,
      name,
      editorCheckCallback: (checking, editor, info) => {
        const callout = calloutAtCursor(editor);
        if (!callout) return false;
        if (!checking) run(editor, callout, fileOf(info));
        return true;
      },
    });
  };
  onCallout("edit-callout", "Edit callout", (editor, callout, file) =>
    editInEditor(app, editor, callout, contextFor(file)));
  onCallout("callout-to-text", "Convert callout to text", (editor, callout) => replaceCallout(editor, callout, unwrapToText(callout)));
  onCallout("callout-to-blockquote", "Convert callout to blockquote", (editor, callout) => replaceCallout(editor, callout, unwrapToBlockquote(callout)));
  plugin.addCommand({
    id: "check-callouts-github",
    name: "Check callouts for GitHub",
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(MarkdownView);
      const context = view ?? app.workspace.activeEditor;
      if (!context?.editor) return false;
      if (!checking) void report(app, context.editor, view ?? undefined);
      return true;
    },
  });

  plugin.registerEvent(app.workspace.on("editor-menu", (menu, editor, info) => {
    const callout = calloutAtCursor(editor);
    if (callout) {
      menu.addItem((item) => item.setTitle("Edit callout").setIcon("square-pen")
        .onClick(() => editInEditor(app, editor, callout, contextFor(fileOf(info)))));
      menu.addItem((item) => item.setTitle("Convert callout to text").setIcon("pilcrow")
        .onClick(() => replaceCallout(editor, callout, unwrapToText(callout))));
      menu.addItem((item) => item.setTitle("Convert callout to blockquote").setIcon("text-quote")
        .onClick(() => replaceCallout(editor, callout, unwrapToBlockquote(callout))));
    } else if (editor.somethingSelected()) {
      menu.addItem((item) => item.setTitle("Wrap in callout").setIcon("quote")
        .onClick(() => insert(app, editor, contextFor(fileOf(info)))));
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
      addButton(button, "Edit callout", "square-pen", () => editWidget(app, view, embed, contextFor));
    };
    view.contentDOM.addEventListener("mouseover", hover);
    return { destroy: () => view.contentDOM.removeEventListener("mouseover", hover) };
  }));

  // Reading View has no editor, so edits go through the vault by line.
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    if (!el.querySelector(":scope > .callout") || !locate(el, ctx)) return;
    el.addClass("obsidian-patch-callout-host");
    const button = el.createEl("button", { cls: "obsidian-patch-callout-edit clickable-icon", attr: { type: "button" } });
    addButton(
      button,
      "Edit callout",
      "square-pen",
      () => {
        const found = locate(el, ctx);
        const file = app.vault.getFileByPath(ctx.sourcePath);
        if (!found || !file) {
          new Notice("Could not locate this callout. Reopen the note and try again.");
          return;
        }
        const { callout, source, lineStart } = found;
        openEditor(
          app,
          callout,
          contextFor(file),
          async (mode, text) => {
            await app.vault.process(file, (data) => {
              const count = mode === "header" ? 1 : 1 + callout.body.length;
              const updated = replaceCalloutLines(data, lineStart, source, count, text);
              if (updated === undefined) throw new Error(STALE);
              return updated;
            });
          },
        );
      },
    );
  });

  return registerGitHubStatus(plugin, settings);
}

function calloutAtCursor(editor: Editor): Callout | undefined {
  return calloutAt(findCallouts(editor.getValue()), editor.posToOffset(editor.getCursor()));
}

/**
 * Opens the editor on a callout. Header-only edits replace only the
 * header line so untouched body lines keep their exact bytes and markers.
 */
function openEditor(
  app: App,
  callout: Callout,
  context: EditorContext,
  write: (mode: WriteMode, text: string) => void | Promise<void>,
): void {
  new CalloutEditor(app, {
    title: "Edit callout",
    draft: { header: callout.header, body: callout.body },
    placement: callout,
    ...context,
    save: (draft, changed) => {
      if (changed.body) return write("full", calloutLines(callout.indent, callout.depth, draft.header, draft.body).join("\n"));
      return write("header", withMarkers(formatHeader(draft.header), callout.indent, callout.depth));
    },
    convert: (draft, to) => {
      const edited = { ...callout, header: draft.header, body: draft.body };
      const lines = to === "text" ? unwrapToText(edited) : unwrapToBlockquote(edited);
      return write("full", lines.join("\n"));
    },
  }).open();
}

function editInEditor(app: App, editor: Editor, callout: Callout, context: EditorContext): void {
  const source = editor.getValue().slice(callout.from, callout.to);
  openEditor(app, callout, context, (mode, text) => {
    const current = matchCalloutSource(editor.getValue(), callout.line, source);
    if (!current) throw new Error(STALE);
    const end = mode === "header" ? current.headerTo : current.to;
    editor.replaceRange(text, editor.offsetToPos(current.from), editor.offsetToPos(end));
  });
}

function editWidget(app: App, view: EditorView, embed: HTMLElement, contextFor: (file: TFile | null) => EditorContext): void {
  const line = view.state.doc.lineAt(view.posAtDOM(embed));
  const callout = findCallouts(view.state.doc.toString()).find(({ from, depth }) => from === line.from && depth === 1);
  if (!callout) return;
  const file = view.state.field(editorInfoField, false)?.file ?? null;
  const source = view.state.sliceDoc(callout.from, callout.to);
  openEditor(app, callout, contextFor(file), (mode, text) => {
    const current = matchCalloutSource(view.state.doc.toString(), callout.line, source);
    if (!current) throw new Error(STALE);
    const to = mode === "header" ? current.headerTo : current.to;
    view.dispatch({ changes: { from: current.from, to, insert: text } });
  });
}

function locate(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
  const info = ctx.getSectionInfo(el);
  if (!info) return undefined;
  const section = editorLines(info.text).split("\n").slice(info.lineStart, info.lineEnd + 1).join("\n");
  const callout = findCallouts(section).find(({ from, depth }) => from === 0 && depth === 1);
  return callout && { callout, source: section.slice(callout.from, callout.to), lineStart: info.lineStart };
}

function addButton(button: HTMLElement, label: string, icon: IconName, open: () => void): void {
  button.setAttribute("aria-label", label);
  setIcon(button, icon);
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
function insert(app: App, editor: Editor, context: EditorContext): void {
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
    if (Array.from({ length: last - first + 1 }, (_, i) => editor.getLine(first + i)).join("\n") !== original.join("\n")) throw new Error(STALE);
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
    editor.focus();
  };
  new CalloutEditor(app, {
    title: selected ? "Wrap in callout" : "Insert callout",
    draft,
    placement: { indent, depth: 1 },
    ...context,
    save,
  }).open();
}

async function report(app: App, editor: Editor, view?: MarkdownView): Promise<void> {
  const file = view?.file;
  const active = () => view && file ? isActiveCheckNote(view, file) : app.workspace.activeEditor?.editor === editor;
  const read = () => view && file ? readCheckSource(view, file) : editor.getValue();
  const readError = () => { new Notice("Could not read the note to check its callouts."); };
  const jump = async (text: string, line: number) => {
    if (!active() || !sameCheckText(text, await read()) || !active()) {
      new Notice("The note changed. Run the callout check again for current line numbers.");
      return;
    }
    if (view?.getMode() === "preview") {
      // Obsidian's line navigation waits for the preview sections to finish rendering.
      view.setEphemeralState({ line, focus: true });
      return;
    }
    editor.setCursor({ line, ch: 0 });
    editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    editor.focus();
  };
  try {
    const text = await read();
    if (!active()) return;
    const callouts = findCallouts(editorLines(text));
    if (!callouts.length) { new Notice("This note has no callouts."); return; }
    const entries = callouts.map((callout) => ({ line: callout.line, label: formatHeader(callout.header), issues: githubIssues(callout) }));
    new GitHubReport(app, entries, (line) => { void jump(text, line).catch(readError); }).open();
  } catch { readError(); }
}

/** A status bar count of callouts GitHub would show as plain blockquotes, for notes meant for GitHub. */
function registerGitHubStatus(plugin: Plugin, settings: () => CalloutSettings): () => void {
  const { app } = plugin;
  const status = plugin.addStatusBarItem();
  status.addClass("obsidian-patch-callout-status", "mod-clickable");
  status.hide();
  let revision = 0;
  const refresh = debounce(async (requested: number) => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!settings().github || !view || !file || !isGitHubMarked(app, file, settings().githubFolders)) {
      status.hide();
      return;
    }
    let text: string;
    try { text = await readCheckSource(view, file); }
    catch { if (requested === revision) status.hide(); return; }
    if (requested !== revision || !isActiveCheckNote(view, file)) return;
    const callouts = findCallouts(editorLines(text));
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
  const update = () => refresh(++revision);
  status.addEventListener("click", () => {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view) void report(app, view.editor, view);
  });
  plugin.registerEvent(app.workspace.on("active-leaf-change", update));
  plugin.registerEvent(app.workspace.on("editor-change", update));
  plugin.registerEvent(app.metadataCache.on("changed", update));
  app.workspace.onLayoutReady(update);
  plugin.register(() => { ++revision; refresh.cancel(); });
  return update;
}
