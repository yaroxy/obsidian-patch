import { Menu, Modal, Scope, sanitizeHTMLToDom, setIcon, type App, type IconName } from "obsidian";
import { makeResizable } from "../../ui/resizable-modal";
import { insertPlainText } from "./text-input";
import {
  CAPTION_STYLE, deleteColumns, deleteRows, expand, headRows, inside, insertColumn, insertRow, layout, merge,
  setAlign, setCaption, setHeader, split, toHtml, type Align, type Attrs, type Cell, type Layout, type Rect, type Table,
} from "./model";

interface Action {
  name: string;
  icon: IconName;
  run(table: Table, rect: Rect): Table;
  /** False when the action would do nothing for the selection. */
  allowed?(rect: Rect, layout: Layout): boolean;
}

interface TableEditorOptions {
  tables: Table[];
  title: string;
  /** An untouched existing HTML table need not be written back. */
  editing?: boolean;
  converting?: boolean;
  /** Returning false leaves the drafts open, for example after a stale-source check. */
  save(html: string[]): boolean | void;
}

const cellsIn = (rect: Rect, { placed }: Layout) => placed.filter((at) => inside(at, rect));

const ROW_ACTIONS: Action[] = [
  { name: "Insert row above", icon: "between-horizontal-start", run: (table, rect) => insertRow(table, rect.top) },
  { name: "Insert row below", icon: "between-horizontal-end", run: (table, rect) => insertRow(table, rect.bottom + 1) },
  {
    name: "Delete row", icon: "trash-2", run: (table, rect) => deleteRows(table, rect.top, rect.bottom),
    allowed: (rect, grid) => rect.bottom - rect.top + 1 < grid.height,
  },
];

const COLUMN_ACTIONS: Action[] = [
  { name: "Insert column left", icon: "between-vertical-start", run: (table, rect) => insertColumn(table, rect.left) },
  { name: "Insert column right", icon: "between-vertical-end", run: (table, rect) => insertColumn(table, rect.right + 1) },
  {
    name: "Delete column", icon: "trash-2", run: (table, rect) => deleteColumns(table, rect.left, rect.right),
    allowed: (rect, grid) => rect.right - rect.left + 1 < grid.width,
  },
];

const CELL_ACTIONS: Action[] = [
  { name: "Merge cells", icon: "table-cells-merge", run: merge, allowed: (rect, grid) => cellsIn(rect, grid).length > 1 },
  {
    name: "Split cell", icon: "table-cells-split", run: split,
    allowed: (rect, grid) => cellsIn(rect, grid).some(({ cell }) => cell.rowspan > 1 || cell.colspan > 1),
  },
  {
    name: "Toggle header cell", icon: "heading",
    run: (table, rect) => setHeader(table, rect, !cellsIn(rect, layout(table.rows)).every(({ cell }) => cell.header)),
  },
];

const ALIGN_ACTIONS: Action[] = (["left", "center", "right"] as Align[]).map((align) => ({
  name: `Align ${align}`, icon: `align-${align}`, run: (table: Table, rect: Rect) => setAlign(table, rect, align),
}));

/** Attributes that change how the editor looks; the note keeps all of them. */
const SHOWN = new Set(["align", "style", "lang", "dir", "title"]);

/**
 * Edits a table in place on the page, like a document editor: cells are
 * typed into directly, and a selection dragged across cells is what the row,
 * column, merge and alignment actions apply to.
 */
export class TableEditor extends Modal {
  private readonly drafts: { table: Table; undo: Table[]; redo: Table[] }[];
  private current = 0;
  private grid!: Layout;
  private readonly unchanged?: string[];
  private get table(): Table { return this.drafts[this.current]!.table; }
  private set table(value: Table) { this.drafts[this.current]!.table = value; }
  private get undoStack(): Table[] { return this.drafts[this.current]!.undo; }
  private get redoStack(): Table[] { return this.drafts[this.current]!.redo; }
  private readonly cells = new Map<HTMLElement, { cell: Cell; row: number; col: number }>();
  private readonly buttons = new Map<Action | "undo" | "redo", HTMLButtonElement>();
  private readonly host: HTMLElement;
  private anchor = { row: 0, col: 0 };
  private head = { row: 0, col: 0 };
  private dragging = false;
  /** The cell or caption whose typing belongs to the current undo step. */
  private typing?: Cell | "caption";

  constructor(app: App, private readonly options: TableEditorOptions) {
    super(app);
    if (!options.tables.length) throw new Error("The table editor needs at least one table.");
    this.drafts = options.tables.map(table => ({ table, undo: [], redo: [] }));
    if (options.editing) this.unchanged = options.tables.map(toHtml);
    this.setTitle(options.title);
    this.modalEl.addClass("obsidian-patch-table-modal");
    if (options.converting) this.contentEl.createEl("p", { cls: "setting-item-description", text:
      "Review and edit the tables below. Your note changes only when you confirm; one undo restores the whole conversion." });
    if (this.drafts.length > 1) this.navigation();
    this.toolbar(this.contentEl.createDiv({ cls: "obsidian-patch-table-toolbar" }));
    this.host = this.contentEl.createDiv({ cls: "obsidian-patch-table-grid markdown-rendered" });
    // Outside the content, so the buttons stay in view while the table scrolls.
    const footer = this.modalEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const label = options.converting ? this.drafts.length > 1 ? `Convert all ${this.drafts.length} tables` : "Convert to HTML" : "Save";
    footer.createEl("button", { text: label, cls: "mod-cta" }).addEventListener("click", () => this.commit());
    makeResizable(this, "obsidian-patch-table-editor-size");
    this.listen();

    // A child scope sees keys before the modal's own: Escape first leaves the
    // cell being typed in, as in a spreadsheet, instead of discarding the edits.
    this.scope = new Scope(this.scope);
    this.scope.register([], "Escape", (evt) => {
      if (evt.isComposing) return; // Let the IME cancel its candidates.
      const active = this.host.doc.activeElement;
      if (active?.instanceOf(HTMLElement) && this.host.contains(active)) active.blur();
      else this.close();
      return false;
    });
    this.scope.register(["Mod"], "Enter", () => { this.commit(); return false; });
    this.scope.register(["Mod"], "z", () => { this.step(this.undoStack, this.redoStack); return false; });
    this.scope.register(["Mod", "Shift"], "z", () => { this.step(this.redoStack, this.undoStack); return false; });
  }

  override onOpen(): void {
    // The modal belongs to the window it opened in, which may be a pop-out.
    this.host.doc.addEventListener("mouseup", this.endDrag);
    this.render();
  }

  /** A new table starts in its first cell; Modal focuses its first control after onOpen. */
  override open(): void {
    super.open();
    if (this.unchanged === undefined && !this.options.converting) this.focus(this.cells.keys().next().value);
  }

  override onClose(): void {
    this.host.doc.removeEventListener("mouseup", this.endDrag);
  }

  private commit(): void {
    const html = this.drafts.map(draft => toHtml(draft.table));
    if (html.some((value, i) => value !== this.unchanged?.[i]) && this.options.save(html) === false) return;
    this.close();
  }

  private navigation(): void {
    const bar = this.contentEl.createDiv({ cls: "obsidian-patch-table-navigation" });
    const previous = bar.createEl("button", { text: "Previous table" });
    const position = bar.createSpan({ attr: { "aria-live": "polite" } });
    const next = bar.createEl("button", { text: "Next table" });
    const update = (): void => {
      position.setText(`Table ${this.current + 1} of ${this.drafts.length}`);
      previous.disabled = this.current === 0;
      next.disabled = this.current === this.drafts.length - 1;
    };
    const move = (step: number): void => {
      this.endDrag();
      this.current += step;
      this.anchor = this.head = { row: 0, col: 0 };
      this.render();
      this.host.scrollTop = this.host.scrollLeft = 0;
      update();
    };
    previous.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    update();
  }

  private toolbar(bar: HTMLElement): void {
    const menuButton = (label: string, actions: Action[]): void => {
      const button = bar.createEl("button", { text: label, cls: "obsidian-patch-table-menu-button" });
      setIcon(button.createSpan(), "chevron-down");
      button.addEventListener("click", () => {
        const { left, bottom } = button.getBoundingClientRect();
        this.menu([actions]).showAtPosition({ x: left, y: bottom }, button.ownerDocument);
      });
    };
    const iconButton = (key: Action | "undo" | "redo", name: string, icon: IconName, run: () => void): void => {
      const button = bar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": name } });
      setIcon(button, icon);
      button.addEventListener("click", run);
      this.buttons.set(key, button);
    };
    const separator = (): void => { bar.createDiv({ cls: "obsidian-patch-table-separator" }); };
    menuButton("Row", ROW_ACTIONS);
    menuButton("Column", COLUMN_ACTIONS);
    separator();
    for (const action of [...CELL_ACTIONS, ...ALIGN_ACTIONS]) {
      if (action === ALIGN_ACTIONS[0]) separator();
      iconButton(action, action.name, action.icon, () => this.apply(action));
    }
    separator();
    iconButton("undo", "Undo", "undo-2", () => this.step(this.undoStack, this.redoStack));
    iconButton("redo", "Redo", "redo-2", () => this.step(this.redoStack, this.undoStack));
  }

  private menu(groups: Action[][]): Menu {
    const menu = new Menu();
    const rect = this.selected();
    groups.forEach((actions, index) => {
      if (index > 0) menu.addSeparator();
      for (const action of actions) {
        menu.addItem((item) => item.setTitle(action.name).setIcon(action.icon)
          .setDisabled(action.allowed?.(rect, this.grid) === false)
          .onClick(() => this.apply(action)));
      }
    });
    return menu;
  }

  private apply(action: Action): void {
    const rect = this.selected();
    if (action.allowed?.(rect, this.grid) === false) return;
    const next = action.run(this.table, rect);
    if (next === this.table) return;
    this.remember();
    this.table = next;
    this.anchor = this.head = { row: rect.top, col: rect.left };
    this.render();
  }

  private remember(): void {
    this.undoStack.push(structuredClone(this.table));
    this.redoStack.length = 0;
  }

  private step(from: Table[], to: Table[]): void {
    const table = from.pop();
    if (!table) return;
    to.push(this.table);
    this.table = table;
    this.render();
  }

  private render(): void {
    this.grid = layout(this.table.rows);
    this.cells.clear();
    this.typing = undefined;
    this.host.empty();
    const table = this.host.createEl("table");
    show(table, this.table.attrs);
    const caption = table.createEl("caption", { attr: { contenteditable: "true", "data-placeholder": "Caption" } });
    show(caption, this.table.caption?.attrs ?? [["style", CAPTION_STYLE]]);
    caption.append(sanitizeHTMLToDom(this.table.caption?.html ?? ""));
    const head = headRows(this.table.rows);
    const placed = new Map(this.grid.placed.map((at) => [at.cell, at]));
    let group: HTMLElement | undefined;
    this.table.rows.forEach((row, index) => {
      if (!group || index === head) group = table.createEl(index < head ? "thead" : "tbody");
      const tr = group.createEl("tr");
      for (const cell of row) {
        const el = tr.createEl(cell.header ? "th" : "td", { attr: { contenteditable: "true" } });
        if (cell.rowspan > 1) el.rowSpan = cell.rowspan;
        if (cell.colspan > 1) el.colSpan = cell.colspan;
        show(el, cell.attrs);
        el.append(sanitizeHTMLToDom(cell.html));
        this.cells.set(el, placed.get(cell)!);
      }
    });
    this.highlight();
  }

  /** Named apart from Modal's own `selection`, which holds the editor selection to restore. */
  private selected(): Rect {
    const clamp = ({ row, col }: { row: number; col: number }) => ({
      row: Math.min(row, this.grid.height - 1), col: Math.min(col, this.grid.width - 1),
    });
    const [a, b] = [clamp(this.anchor), clamp(this.head)];
    return expand(this.grid.grid, {
      top: Math.min(a.row, b.row), left: Math.min(a.col, b.col),
      bottom: Math.max(a.row, b.row), right: Math.max(a.col, b.col),
    });
  }

  private highlight(): void {
    const rect = this.selected();
    const several = cellsIn(rect, this.grid).length > 1;
    for (const [el, at] of this.cells) el.toggleClass("is-selected", several && inside(at, rect));
    for (const [key, button] of this.buttons) {
      button.disabled = key === "undo" ? this.undoStack.length === 0
        : key === "redo" ? this.redoStack.length === 0
          : key.allowed?.(rect, this.grid) === false;
    }
  }

  private at(target: EventTarget | null): { row: number; col: number } | undefined {
    const el = (target as Element | null)?.closest?.("td, th");
    const at = el ? this.cells.get(el as HTMLElement) : undefined;
    return at && { row: at.row, col: at.col };
  }

  private focus(el: HTMLElement | undefined): void {
    if (!el) return;
    el.focus();
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    el.ownerDocument.getSelection()?.removeAllRanges();
    el.ownerDocument.getSelection()?.addRange(range);
    const at = this.cells.get(el);
    if (at) this.anchor = this.head = { row: at.row, col: at.col };
    this.highlight();
  }

  /** Tab moves through the cells; Tab in the last cell adds a row. */
  private move(from: HTMLElement, direction: 1 | -1): void {
    const order = [...this.cells.keys()];
    const index = order.indexOf(from) + direction;
    if (index < order.length) {
      this.focus(order[Math.max(0, index)]);
      return;
    }
    this.anchor = this.head = { row: this.grid.height - 1, col: 0 };
    this.apply(ROW_ACTIONS[1]!);
    this.focus([...this.cells].find(([, at]) => at.row === this.grid.height - 1)?.[0]);
  }

  private readonly endDrag = (): void => {
    this.dragging = false;
    this.host.removeClass("is-selecting");
  };

  private recordInput(el: HTMLElement): void {
    if (el.tagName === "CAPTION") {
      if (this.typing !== "caption") { this.remember(); this.typing = "caption"; }
      this.table = setCaption(this.table, clean(el));
      return;
    }
    const at = this.cells.get(el);
    if (!at) return;
    if (this.typing !== at.cell) { this.remember(); this.typing = at.cell; }
    at.cell.html = clean(el);
    this.highlight();
  }

  private listen(): void {
    const host = this.host;
    host.addEventListener("mousedown", (evt) => {
      const at = this.at(evt.target);
      if (!at || evt.button !== 0) return;
      if (evt.shiftKey) {
        evt.preventDefault();
        this.head = at;
      } else {
        this.anchor = this.head = at;
        this.dragging = true;
      }
      this.highlight();
    });
    host.addEventListener("mouseover", (evt) => {
      const at = this.at(evt.target);
      if (!this.dragging || !at || (at.row === this.head.row && at.col === this.head.col)) return;
      this.head = at;
      // Selecting cells, not text: drop the caret so the drag does not select across cells.
      host.addClass("is-selecting");
      host.ownerDocument.getSelection()?.removeAllRanges();
      (host.ownerDocument.activeElement as HTMLElement | null)?.blur();
      this.highlight();
    });
    host.addEventListener("contextmenu", (evt) => {
      const at = this.at(evt.target);
      if (!at) return;
      evt.preventDefault();
      if (!cellsIn(this.selected(), this.grid).some((cell) => cell.row === at.row && cell.col === at.col)) {
        this.anchor = this.head = at;
        this.highlight();
      }
      this.menu([ROW_ACTIONS, COLUMN_ACTIONS, CELL_ACTIONS, ALIGN_ACTIONS]).showAtMouseEvent(evt);
    });
    host.addEventListener("input", (evt) => {
      this.recordInput(evt.target as HTMLElement);
    });
    host.addEventListener("beforeinput", (evt) => {
      if (evt.inputType !== "historyUndo" && evt.inputType !== "historyRedo") return;
      if (!evt.cancelable) return;
      evt.preventDefault();
      if (evt.inputType === "historyUndo") this.step(this.undoStack, this.redoStack);
      else this.step(this.redoStack, this.undoStack);
    });
    host.addEventListener("keydown", (evt) => {
      if (evt.isComposing || evt.key === "Process") return;
      const el = evt.target as HTMLElement;
      if (evt.key === "Enter" && !evt.metaKey && !evt.ctrlKey) {
        evt.preventDefault();
        if (this.cells.has(el) && insertPlainText(el, "\n")) this.recordInput(el);
      } else if (evt.key === "Tab" && this.cells.has(el)) {
        evt.preventDefault();
        this.move(el, evt.shiftKey ? -1 : 1);
      }
    });
    // Keep cells to text and line breaks rather than whatever markup was copied.
    host.addEventListener("paste", (evt) => {
      evt.preventDefault();
      const el = evt.target as HTMLElement;
      if (!this.cells.has(el) && el.tagName !== "CAPTION") return;
      if (insertPlainText(el, evt.clipboardData?.getData("text/plain") ?? "")) this.recordInput(el);
    });
  }
}

function show(el: HTMLElement, attrs: Attrs): void {
  for (const [name, value] of attrs) if (SHOWN.has(name)) el.setAttribute(name, value);
}

/** The editor's trailing break only holds the caret. */
function clean(el: HTMLElement): string {
  return el.innerHTML.replace(/(?:<br\s*\/?>|\s|&nbsp;)+$/i, "");
}
