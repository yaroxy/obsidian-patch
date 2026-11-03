import type { EditorView } from "@codemirror/view";

interface ScrollState {
  scrollParent: Element | null;
  getScrollOffset(): number;
}

/**
 * While it re-measures line heights, CodeMirror keeps one line steady and
 * picks that line from the raw scroll offset, as if the text began at the top
 * of its scroller. A cover above the title moves the text down so far that the
 * pick can land past the end of the note, on a line the height map only
 * extrapolates. Once the real line is measured, the correction throws the
 * scroll position back by hundreds of pixels. Measure the offset from the top
 * of the text instead, as CodeMirror already does inside an outer scroller.
 *
 * `viewState.getScrollOffset` is internal to CodeMirror. Without it nothing is
 * changed, and only the jump this works around remains.
 */
export function measureScrollFromText(view: EditorView): () => void {
  const state = (view as unknown as { viewState?: Partial<ScrollState> }).viewState;
  const original = state?.getScrollOffset;
  if (!state || typeof original !== "function") return () => {};
  const own = Object.prototype.hasOwnProperty.call(state, "getScrollOffset");
  const fromText = function (this: ScrollState): number {
    return this.scrollParent === view.scrollDOM
      ? view.scrollDOM.getBoundingClientRect().top - view.contentDOM.getBoundingClientRect().top
      : original.call(this);
  };
  state.getScrollOffset = fromText;
  return () => {
    if (state.getScrollOffset !== fromText) return;
    if (own) state.getScrollOffset = original;
    else delete state.getScrollOffset;
  };
}
