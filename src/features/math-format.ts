import { Notice, type Editor, type EditorChange, type Plugin } from "obsidian";
import { DEFAULT_MATH_FORMAT, findMathBlocks, formatMathBlock, type MathBlock, type MathFormatOptions } from "./math-format/model";

export type MathFormatSettings = MathFormatOptions;

export const MATH_INDENTS = [2, 4];

export function parseMathFormatSettings(data: unknown): MathFormatSettings {
  const record: Record<string, unknown> = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  return {
    indent: typeof record.indent === "number" && MATH_INDENTS.includes(record.indent) ? record.indent : DEFAULT_MATH_FORMAT.indent,
    alignAmpersands: typeof record.alignAmpersands === "boolean" ? record.alignAmpersands : DEFAULT_MATH_FORMAT.alignAmpersands,
    alignRowEnds: typeof record.alignRowEnds === "boolean" ? record.alignRowEnds : DEFAULT_MATH_FORMAT.alignRowEnds,
  };
}

const LEFT_ALONE = "a blank line, unbalanced braces or environments, or a stray $";

/** Commands and an editor menu item that format the display math of the open note. */
export function registerMathFormat(plugin: Plugin, settings: () => MathFormatSettings): void {
  plugin.addCommand({
    id: "format-math-block",
    name: "Format math block",
    icon: "sigma",
    editorCheckCallback: (checking, editor) => {
      const block = blockAtCursor(editor);
      if (!block) return false;
      if (!checking) format(editor, [block], settings(), true);
      return true;
    },
  });

  plugin.addCommand({
    id: "format-math-blocks",
    name: "Format all math blocks in note",
    icon: "sigma",
    editorCallback: (editor) => format(editor, findMathBlocks(editor.getValue()), settings(), false),
  });

  plugin.registerEvent(plugin.app.workspace.on("editor-menu", (menu, editor) => {
    const block = blockAtCursor(editor);
    if (!block) return;
    menu.addItem((item) => item.setTitle("Format math block").setIcon("sigma")
      .onClick(() => format(editor, [block], settings(), true)));
  }));
}

function blockAtCursor(editor: Editor): MathBlock | undefined {
  const offset = editor.posToOffset(editor.getCursor());
  return findMathBlocks(editor.getValue()).find(({ from, to }) => from <= offset && offset <= to);
}

/** Replaces the blocks in one undoable step and keeps the cursor on its line. */
function format(editor: Editor, blocks: MathBlock[], options: MathFormatOptions, single: boolean): void {
  const text = editor.getValue();
  const cursor = editor.getCursor();
  const offset = editor.posToOffset(cursor);
  const changes: EditorChange[] = [];
  let skipped = 0;
  let shift = 0;
  let restore: { first: number; last: number } | undefined;
  for (const { from, to } of blocks) {
    const source = text.slice(from, to);
    const result = formatMathBlock(source, options);
    if (result.status === "skipped") skipped++;
    if (result.status !== "changed") continue;
    const start = editor.offsetToPos(from);
    const added = result.text.split("\n").length - source.split("\n").length;
    if (from <= offset && offset <= to) {
      restore = { first: start.line + shift, last: start.line + shift + result.text.split("\n").length - 1 };
    } else if (to < offset) {
      shift += added;
    }
    changes.push({ from: start, to: editor.offsetToPos(to), text: result.text });
  }

  if (changes.length > 0) {
    editor.transaction({ changes });
    if (restore) {
      const line = Math.min(Math.max(cursor.line + shift, restore.first), restore.last);
      editor.setCursor({ line, ch: Math.min(cursor.ch, editor.getLine(line).length) });
    }
  }

  if (single) {
    if (skipped > 0) new Notice(`This math block was left as it is: it has ${LEFT_ALONE}.`);
    else if (changes.length === 0) new Notice("This math block is already formatted.");
    return;
  }
  const done = changes.length > 0 ? `Formatted ${changes.length} math ${changes.length === 1 ? "block" : "blocks"}.`
    : blocks.length > skipped ? "Math blocks are already formatted." : blocks.length === 0 ? "This note has no math blocks." : "";
  const left = skipped > 0 ? `${skipped} left as ${skipped === 1 ? "it is" : "they are"}: ${LEFT_ALONE}.` : "";
  new Notice([done, left].filter(Boolean).join(" "));
}
