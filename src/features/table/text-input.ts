/** Replace only a selection contained in one editable cell or caption. */
export function insertPlainText(element: HTMLElement, text: string): boolean {
  if (!text) return false;
  const doc = element.ownerDocument;
  const selection = doc.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return false;

  range.deleteContents();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (index > 0) {
      const br = doc.defaultView!.createEl("br");
      range.insertNode(br);
      range.setStartAfter(br);
      range.collapse(true);
    }
    if (lines[index]) {
      const node = doc.createTextNode(lines[index]!);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
    }
  }
  // A final line break needs a second break to make the empty line visible.
  // Keep the caret before that placeholder; clean() omits trailing breaks.
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    const tail = range.cloneRange();
    tail.setEnd(element, element.childNodes.length);
    const remaining = tail.cloneContents();
    if (!remaining.textContent && !remaining.querySelector("br,img,video")) {
      const placeholder = doc.defaultView!.createEl("br");
      range.insertNode(placeholder);
      range.setStartBefore(placeholder);
      range.collapse(true);
    }
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
