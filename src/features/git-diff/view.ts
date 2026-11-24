import { FileSystemAdapter, ItemView, MarkdownView, Platform, TFile, Notice, type Command, type WorkspaceLeaf, type Plugin, type ViewStateResult } from "obsidian";
import type { StructuredPatchHunk } from "diff";
import { isGitWorkTree, readNoteHead, type NoteHead } from "./head";
import { hunkLines, noteChanges } from "./model";
import { registerGitGutter } from "./gutter";

const VIEW = "obsidian-patch-git-diff";

export async function registerNoteDiff(plugin: Plugin): Promise<void> {
  const { workspace, vault } = plugin.app;
  if (!Platform.isDesktopApp || !(vault.adapter instanceof FileSystemAdapter)) return;
  const adapter = vault.adapter;
  const root = adapter.getFullPath("");
  let mounted: ReturnType<typeof mountNoteDiff> | undefined;
  let unloaded = false;
  let pending: Promise<void> | undefined;
  const check = (): Promise<void> => {
    pending ??= isGitWorkTree(root).then(available => {
      if (unloaded) return;
      if (available && !mounted) mounted = mountNoteDiff(plugin, adapter);
      mounted?.(available);
    }).finally(() => { pending = undefined; });
    return pending;
  };
  const windows = new Set<Window>();
  const onFocus = (): void => { void check(); };
  const watchWindow = (win: Window): void => {
    if (windows.has(win)) return;
    windows.add(win);
    win.addEventListener("focus", onFocus);
  };
  const unwatchWindow = (win: Window): void => {
    win.removeEventListener("focus", onFocus);
    windows.delete(win);
  };
  watchWindow(workspace.containerEl.win);
  workspace.iterateAllLeaves(leaf => watchWindow(leaf.view.containerEl.win));
  plugin.registerEvent(workspace.on("window-open", (_container, win) => watchWindow(win)));
  plugin.registerEvent(workspace.on("window-close", (_container, win) => unwatchWindow(win)));
  plugin.register(() => { for (const win of windows) unwatchWindow(win); });
  plugin.register(() => { unloaded = true; });
  await check();
  workspace.onLayoutReady(() => {
    if (!unloaded && !mounted) workspace.detachLeavesOfType(VIEW);
  });
}

function mountNoteDiff(plugin: Plugin, adapter: FileSystemAdapter): (available: boolean) => void {
  const { workspace, vault } = plugin.app;
  let available = false;
  const key = "patches-git-markers-disabled";
  let markersEnabled = plugin.app.loadLocalStorage(key) !== true;
  const heads = new Map<string, Promise<NoteHead>>();
  // The gutter and the stacked view can compare the same editor buffer during a single edit.
  const comparisons = new WeakMap<NoteHead, { current: string; hunks: StructuredPatchHunk[] }>();
  const changes = (base: NoteHead, current: string): StructuredPatchHunk[] => {
    const last = comparisons.get(base);
    if (last?.current === current) return last.hunks;
    const hunks = noteChanges(base.text, current);
    comparisons.set(base, { current, hunks });
    return hunks;
  };
  const head = (path: string): Promise<NoteHead> => {
    let pending = heads.get(path);
    if (!pending) {
      pending = readNoteHead(adapter.getFullPath(path));
      heads.set(path, pending);
    }
    return pending;
  };
  const newBaseline = (path: string): void => { heads.delete(path); paint(path); };
  const opening = new Map<string, Promise<WorkspaceLeaf>>();
  const createTab = async (path: string): Promise<WorkspaceLeaf> => {
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW, state: { path } });
    return leaf;
  };
  const open = async (path: string, source?: MarkdownView, hunk?: number): Promise<void> => {
    if (!available) return;
    if (hunk === undefined) newBaseline(path);
    const existing = workspace.getLeavesOfType(VIEW).find(leaf => leaf.getViewState().state?.path === path);
    if (!existing && !opening.has(path)) opening.set(path, createTab(path).finally(() => opening.delete(path)));
    const leaf = existing ?? await opening.get(path);
    if (!leaf || !available) return;
    await workspace.revealLeaf(leaf);
    workspace.setActiveLeaf(leaf, { focus: true });
    if (leaf.view instanceof NoteDiffView) leaf.view.compare(source, hunk);
  };
  const paint = registerGitGutter(plugin, () => available && markersEnabled, head, changes, (editor, path, hunk) => {
    const source = workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
      .find((view): view is MarkdownView => view instanceof MarkdownView && view.contentEl.contains(editor.dom));
    void open(path, source, hunk);
  });
  plugin.registerEvent(workspace.on("active-leaf-change", leaf => {
    const path = leaf?.view instanceof MarkdownView ? leaf.view.file?.path : undefined;
    if (!available || !path) return;
    newBaseline(path);
    for (const candidate of workspace.getLeavesOfType(VIEW)) {
      if (candidate.view instanceof NoteDiffView && candidate.view.getState().path === path) candidate.view.schedule();
    }
  }));
  const releaseClosedNotes = (): void => {
    if (!heads.size) return;
    const openPaths = new Set<string>();
    workspace.iterateAllLeaves(({ view }) => {
      if (view instanceof MarkdownView && view.file) openPaths.add(view.file.path);
      if (view instanceof NoteDiffView) openPaths.add(view.getState().path);
    });
    for (const path of heads.keys()) if (!openPaths.has(path)) heads.delete(path);
  };
  plugin.registerEvent(workspace.on("layout-change", releaseClosedNotes));
  plugin.registerEvent(workspace.on("file-open", releaseClosedNotes));
  plugin.registerEvent(vault.on("rename", (file, oldPath) => {
    for (const path of [...heads.keys()]) {
      if (path === oldPath || path.startsWith(oldPath + "/")) {
        newBaseline(path);
        newBaseline(file.path + path.slice(oldPath.length));
      }
    }
  }));
  plugin.registerView(VIEW, leaf => new NoteDiffView(leaf, head, newBaseline, changes));
  const commands: Command[] = [{
    id: "view-note-git-diff", name: "View Git diff for this note",
    checkCallback(checking) {
      const source = workspace.getActiveViewOfType(MarkdownView);
      if (!source?.file) return false;
      if (!checking) void open(source.file.path, source);
      return true;
    },
  }, {
    id: "toggle-vault-git-markers", name: "Toggle Git change markers for this vault",
    callback() {
      markersEnabled = !markersEnabled;
      plugin.app.saveLocalStorage(key, markersEnabled ? null : true);
      heads.clear();
      paint();
      new Notice(markersEnabled ? "Git change markers enabled for this vault." : "Git change markers disabled for this vault.");
    },
  }];
  return next => {
    if (available !== next) {
      available = next;
      if (available) {
        for (const command of commands) plugin.addCommand({ ...command });
      } else {
        for (const command of commands) plugin.removeCommand(command.id);
        workspace.detachLeavesOfType(VIEW);
      }
    }
    heads.clear();
    paint();
    if (available) {
      for (const { view } of workspace.getLeavesOfType(VIEW)) if (view instanceof NoteDiffView) view.schedule();
    }
  };
}

class NoteDiffView extends ItemView {
  private path = "";
  private source?: MarkdownView;
  constructor(leaf: WorkspaceLeaf, private readonly readHead: (path: string) => Promise<NoteHead>,
    private readonly invalidate: (path: string) => void,
    private readonly changes: (base: NoteHead, current: string) => StructuredPatchHunk[]) { super(leaf); }

  private generation = 0;
  private timer?: number;
  private head?: NoteHead;
  private hunks: StructuredPatchHunk[] = [];
  private index = 0;

  override getViewType(): string { return VIEW; }
  override getDisplayText(): string { return this.path ? "Git diff · " + this.path.split("/").pop() : "Note Git diff"; }
  override getIcon(): string { return "git-compare"; }
  override getState(): { path: string } { return { path: this.path }; }
  override async setState(state: { path?: unknown }, result: ViewStateResult): Promise<void> {
    this.path = typeof state?.path === "string" ? state.path : "";
    this.index = 0;
    await super.setState(state, result);
    await this.refresh();
  }

  compare(source?: MarkdownView, hunk?: number): void {
    this.source = source;
    if (hunk !== undefined) this.index = hunk;
    void this.refresh();
  }

  protected override async onOpen(): Promise<void> {
    this.contentEl.addClass("obsidian-patch-git-diff");
    this.registerEvent(this.app.workspace.on("editor-change", (_editor, info) => {
      if (info.file?.path !== this.path) return;
      if (info instanceof MarkdownView) this.source = info;
      this.schedule();
    }));
    this.registerEvent(this.app.vault.on("modify", file => {
      if (file.path === this.path) this.schedule();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (this.path !== oldPath && !this.path.startsWith(oldPath + "/")) return;
      this.path = file.path + this.path.slice(oldPath.length);
      this.app.workspace.requestSaveLayout();
      this.invalidate(this.path);
      this.schedule();
    }));
    this.registerEvent(this.app.vault.on("delete", file => {
      if (file.path === this.path) this.schedule();
    }));
  }

  schedule(): void {
    this.generation++;
    this.contentEl.win.clearTimeout(this.timer);
    this.timer = this.contentEl.win.setTimeout(() => { void this.refresh(); }, 250);
  }

  protected override async onClose(): Promise<void> {
    this.generation++;
    this.contentEl.win.clearTimeout(this.timer);
  }

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    const { vault, workspace } = this.app;
    try {
      const file = vault.getAbstractFileByPath(this.path);
      if (!(file instanceof TFile)) throw new Error("This note is no longer in the vault.");
      if (!(vault.adapter instanceof FileSystemAdapter)) throw new Error("A local desktop vault is required.");
      const matches = (view?: MarkdownView): view is MarkdownView => !!view && view.file === file && view.getMode() === "source" && workspace.getLeavesOfType("markdown").includes(view.leaf);
      const editor = matches(this.source) ? this.source : workspace.getLeavesOfType("markdown")
        .map(leaf => leaf.view).find((view): view is MarkdownView => view instanceof MarkdownView && matches(view));
      const [head, current] = await Promise.all([this.readHead(file.path), editor ? editor.editor.getValue() : vault.read(file)]);
      if (generation !== this.generation) return;
      this.head = head;
      this.hunks = this.changes(head, current);
      this.index = Math.min(this.index, Math.max(0, this.hunks.length - 1));
      this.draw();
    } catch (error) {
      if (generation !== this.generation) return;
      this.head = undefined;
      this.hunks = [];
      this.draw(error instanceof Error ? error.message : String(error));
    }
  }

  private draw(error?: string): void {
    const el = this.contentEl;
    el.empty();
    const bar = el.createDiv({ cls: "obsidian-patch-git-toolbar" });
    bar.createEl("strong", { text: this.path.split("/").pop(), attr: { title: this.path } });
    const refresh = bar.createEl("button", { text: "Refresh", attr: { title: "Read HEAD and the current note again" } });
    refresh.onclick = () => { this.invalidate(this.path); void this.refresh(); };
    if (error) { el.createEl("p", { text: error, attr: { role: "status" } }); return; }
    const baseLabel = this.head?.commit ? "HEAD · " + this.head.commit.slice(0, 8) : "HEAD · no commits yet";
    if (!this.head?.tracked) el.createEl("p", { text: "This path has no version in HEAD. Its current lines are shown as additions." });
    const hunk = this.hunks[this.index];
    if (!hunk) {
      el.createEl("p", { text: this.head?.tracked ? "No changes from " + baseLabel + "." : "The current note is empty." });
      return;
    }
    const controls = bar.createDiv({ cls: "obsidian-patch-git-navigation" });
    controls.createSpan({ text: `Change ${this.index + 1} of ${this.hunks.length}`, attr: { "aria-live": "polite" } });
    for (const [step, name] of [[-1, "Previous"], [1, "Next"]] as const) {
      const button = controls.createEl("button", { text: name });
      button.disabled = !this.hunks[this.index + step];
      button.onclick = () => { this.index += step; this.draw(); };
    }
    for (const side of ["before", "current"] as const) {
      const pane = el.createEl("section", { cls: "obsidian-patch-git-pane" });
      pane.createEl("h3", { text: side === "before" ? baseLabel : "Current note" });
      const lines = pane.createDiv({ cls: "obsidian-patch-git-lines", attr: { tabindex: "0", "aria-label": side === "before" ? "Committed lines" : "Current lines" } });
      const rows = hunkLines(hunk, side);
      if (!rows.length) lines.createDiv({ text: "No lines in this version." });
      const showRows = (start: number): void => {
        const end = Math.min(start + 200, rows.length);
        for (const row of rows.slice(start, end)) {
          const line = lines.createDiv({ cls: "obsidian-patch-git-line" });
          line.dataset.change = row.mark;
          line.createSpan({ cls: "obsidian-patch-git-number", text: row.line?.toString() ?? "" });
          line.createSpan({ text: row.mark === "-" ? "−" : row.mark });
          line.createSpan({ text: row.text });
        }
        if (end < rows.length) {
          const more = lines.createEl("button", { text: `Show next ${Math.min(200, rows.length - end)} lines` });
          more.onclick = () => { more.remove(); showRows(end); };
        }
      };
      showRows(0);
    }
  }
}
