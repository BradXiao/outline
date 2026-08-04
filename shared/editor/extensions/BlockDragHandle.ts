import type { Slice } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { NodeSelection, Plugin, TextSelection } from "prosemirror-state";
import { dropPoint } from "prosemirror-transform";
import type { EditorView } from "prosemirror-view";
import Extension from "../lib/Extension";
import { findCutAfterHeading } from "../queries/findCutAfterHeading";
import { EditorStyleHelper } from "../styles/EditorStyleHelper";

/**
 * Top-level block types that can be picked up and moved with a gutter handle.
 * Nodes that are already draggable through their own affordance, such as list
 * items and images, are deliberately not included.
 */
const draggableBlocks = new Set([
  "blockquote",
  "code_block",
  "code_fence",
  "container_notice",
  "container_toggle",
  "heading",
  "math_block",
  "table",
]);

/** Width of the handle in px, must match the stylesheet. */
const handleWidth = 18;

/** Height of the handle in px, must match the stylesheet. */
const handleHeight = 24;

/** Gap in px between the handle and the left edge of the block it points at. */
const handleGap = 8;

/** Width in px of the gutter that a heading's copy link and fold buttons use. */
const headingGutterWidth = 26;

/**
 * Width in px of the gutter that a table's row grips and corner grip use. The
 * grips are drawn 18px outside of the table, see the table styles.
 */
const tableGutterWidth = 18 + handleGap / 2;

/**
 * Upper bound in px on the line height used to place the handle, so that it
 * stays near the top of blocks whose first line is unusually tall.
 */
const maxLineHeight = 40;

/**
 * Distance in px from the left edge of a block to the left edge of its handle.
 * Headings and tables already draw their own controls in the gutter, so the
 * handle is placed outside of those rather than on top of them.
 *
 * @param nodeName name of the node type the handle points at.
 * @returns the offset in px.
 */
function getHandleOffset(nodeName: string): number {
  if (nodeName === "heading") {
    return handleWidth + headingGutterWidth;
  }

  if (nodeName === "table") {
    return handleWidth + tableGutterWidth;
  }

  return handleWidth + handleGap;
}

/**
 * Renders a single drag handle in the gutter beside the block currently under
 * the pointer, and drives a native drag of that block when it is used.
 *
 * The handle is deliberately kept outside of the editable DOM and starts the
 * drag itself, rather than marking the nodes `draggable` in the schema. Marking
 * a textblock such as a heading or code block draggable would make Prosemirror
 * set `draggable` on its DOM element whenever it is pressed, which stops the
 * browser from selecting text inside it with the mouse.
 */
class BlockDragHandleView {
  public constructor(view: EditorView) {
    const container = view.dom.parentElement;

    if (!container) {
      return;
    }

    this.view = view;
    this.container = container;

    const handle = view.dom.ownerDocument.createElement("div");
    handle.className = EditorStyleHelper.blockDragHandle;
    handle.contentEditable = "false";
    handle.draggable = true;
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "Drag to move block");
    handle.addEventListener("mousedown", this.handleMouseDown);
    handle.addEventListener("dragstart", this.handleDragStart);
    handle.addEventListener("dragend", this.handleDragEnd);
    container.appendChild(handle);
    this.handle = handle;

    // Tracked on the document rather than the container because the handle is
    // drawn in the gutter, outside of the container, and the pointer has to
    // cross that empty strip to reach it.
    view.dom.ownerDocument.addEventListener("mousemove", this.handleMouseMove);

    // Captured so that the drop is handled before it reaches Prosemirror's own
    // listener on the editable DOM, see `handleDrop`.
    view.dom.ownerDocument.addEventListener("drop", this.handleDrop, true);
  }

  /**
   * Hide the handle when the document changes, as the position it points at is
   * no longer guaranteed to describe the same block. Selection-only updates are
   * ignored, the handle itself changes the selection when it is pressed.
   *
   * @param view the editor view.
   * @param prevState the state before the update.
   */
  public update(view: EditorView, prevState: EditorState) {
    if (!this.dragging && prevState.doc !== view.state.doc) {
      this.hide();
    }
  }

  public destroy() {
    if (!this.handle || !this.container) {
      return;
    }

    this.handle.ownerDocument.removeEventListener(
      "mousemove",
      this.handleMouseMove
    );
    this.handle.ownerDocument.removeEventListener(
      "drop",
      this.handleDrop,
      true
    );
    this.handle.removeEventListener("mousedown", this.handleMouseDown);
    this.handle.removeEventListener("dragstart", this.handleDragStart);
    this.handle.removeEventListener("dragend", this.handleDragEnd);
    this.handle.remove();

    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
    }

    if (this.timeout !== undefined) {
      clearTimeout(this.timeout);
    }
  }

  private view: EditorView | undefined;

  private container: HTMLElement | undefined;

  private handle: HTMLElement | undefined;

  /** Document position of the block the handle currently points at. */
  private pos: number | undefined;

  /** Document position of the block the handle pointed at when it was pressed. */
  private pressedPos: number | undefined;

  /** Whether a drag started from the handle is in progress. */
  private dragging = false;

  /** The document range and content being dragged, while a drag is running. */
  private drag: { from: number; to: number; slice: Slice } | undefined;

  private frame: number | undefined;

  private timeout: ReturnType<typeof setTimeout> | undefined;

  private handleMouseMove = (event: MouseEvent) => {
    if (this.dragging || this.frame !== undefined) {
      return;
    }

    const { clientX, clientY } = event;

    // Pointer moves arrive far more often than frames are painted, and each
    // update reads layout, so coalesce them.
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.refresh(clientX, clientY);
    });
  };

  private handleMouseDown = () => {
    if (this.pos === undefined) {
      return;
    }

    // Remembered separately because the handle can be hidden between the press
    // and the drag starting, for instance by a change from a collaborator, and
    // would otherwise forget which block was picked up.
    //
    // Note that the event is not prevented, doing so would stop the drag from
    // starting. The block is deliberately not selected either: a selection puts
    // the toolbar menu for tables and code blocks on screen, and moves focus
    // into blocks that edit themselves through a nested view, such as math.
    this.pressedPos = this.pos;
  };

  private handleDragStart = (event: DragEvent) => {
    const view = this.view;
    const pos = this.pressedPos;

    if (!view || !event.dataTransfer || pos === undefined) {
      return;
    }

    this.dragging = true;

    const range = this.getRange(view, pos);
    const { dom, text, slice } = view.serializeForClipboard(range.content());

    event.dataTransfer.clearData();
    event.dataTransfer.setData("text/html", dom.innerHTML);
    event.dataTransfer.setData("text/plain", text);
    event.dataTransfer.effectAllowed = "copyMove";

    const nodeDOM = view.nodeDOM(pos);
    if (nodeDOM instanceof HTMLElement) {
      event.dataTransfer.setDragImage(nodeDOM, 0, 0);
    }

    // Recorded so that the drop moves exactly what was picked up, rather than
    // whatever the editor's selection happens to be by the time it lands.
    this.drag = { from: range.from, to: range.to, slice };

    // Prosemirror only listens for dragstart on its own DOM, so the drag has to
    // be handed to it explicitly. This is what draws the drop cursor.
    view.dragging = { slice, move: true };
  };

  private handleDragEnd = () => {
    const view = this.view;

    this.dragging = false;
    this.hide();

    // Cleaned up on a later tick because a browser may send dragend before the
    // drop has been processed, and the drop needs to know what was dragged.
    this.timeout = setTimeout(() => {
      this.timeout = undefined;
      this.drag = undefined;
      this.pressedPos = undefined;

      if (view) {
        view.dragging = null;
      }
    }, 50);
  };

  /**
   * Move the dragged block to the position it was dropped at.
   *
   * Prosemirror can do this itself, but only by removing the current selection,
   * which is not reliably still the block that was picked up: plugins are free
   * to change the selection while the drag runs, and the browser may clear it
   * when the drag begins. Moving the recorded range instead makes the result
   * the same for every block type.
   */
  private handleDrop = (event: DragEvent) => {
    const view = this.view;
    const drag = this.drag;
    const target = event.target;

    if (
      !view ||
      !drag ||
      !view.editable ||
      !(target instanceof globalThis.Node) ||
      !view.dom.contains(target)
    ) {
      return;
    }

    // Prosemirror ignores events that have already been handled, so preventing
    // this one stops it from inserting a second copy of the block from the
    // drag's clipboard data.
    event.preventDefault();

    const found = view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });

    // The recorded range describes the document as it was when the drag began,
    // a collaborator may have shortened it since.
    if (!found || drag.to > view.state.doc.content.size) {
      return;
    }

    const insertPos = dropPoint(view.state.doc, found.pos, drag.slice);

    // A block cannot be dropped inside of itself, and dropping it against its
    // own boundaries would leave the document unchanged.
    if (
      insertPos === null ||
      (insertPos >= drag.from && insertPos <= drag.to)
    ) {
      return;
    }

    const node = drag.slice.content.firstChild;
    const isNode =
      drag.slice.openStart === 0 &&
      drag.slice.openEnd === 0 &&
      drag.slice.content.childCount === 1 &&
      node;

    const tr = view.state.tr.delete(drag.from, drag.to);
    const pos = tr.mapping.map(insertPos);

    if (isNode) {
      tr.replaceRangeWith(pos, pos, node);
    } else {
      tr.replaceRange(pos, pos, drag.slice);
    }

    // The moved block is left unselected, selecting it would open the toolbar
    // menu on top of the block that has only just been put down. Prosemirror
    // maps the selection the editor already had through the move.
    //
    // Focus is taken before dispatching, as Prosemirror does for its own drops,
    // so that a node view which moves focus into itself keeps it.
    view.focus();
    view.dispatch(tr.scrollIntoView());
  };

  /**
   * Point the handle at the top level block under the given viewport
   * coordinates, or hide it when there is no draggable block there.
   */
  private refresh(clientX: number, clientY: number) {
    const view = this.view;
    const container = this.container;
    const handle = this.handle;

    if (!view || !container || !handle || !view.editable) {
      return;
    }

    const containerRect = container.getBoundingClientRect();

    // The area the handle serves is the editor plus the gutter strip it is
    // drawn in, so that the pointer can travel to it without losing the block.
    // Headings sit furthest out, so their offset bounds the strip.
    if (
      clientX < containerRect.left - getHandleOffset("heading") ||
      clientX > containerRect.right ||
      clientY < containerRect.top ||
      clientY > containerRect.bottom
    ) {
      this.hide();
      return;
    }

    const editorRect = view.dom.getBoundingClientRect();

    // Coordinates in the gutter do not resolve to a position, clamp them into
    // the content column so that the block beside the pointer is still found.
    const left = Math.min(
      Math.max(clientX, editorRect.left + 1),
      editorRect.right - 1
    );
    const found = view.posAtCoords({ left, top: clientY });

    if (!found) {
      this.hide();
      return;
    }

    const $pos = view.state.doc.resolve(found.pos);
    const pos = $pos.depth ? $pos.before(1) : found.pos;
    const node = view.state.doc.nodeAt(pos);

    if (
      !node ||
      !draggableBlocks.has(node.type.name) ||
      !NodeSelection.isSelectable(node)
    ) {
      this.hide();
      return;
    }

    if (
      pos === this.pos &&
      handle.classList.contains(EditorStyleHelper.blockDragHandleVisible)
    ) {
      return;
    }

    const nodeDOM = view.nodeDOM(pos);
    if (!(nodeDOM instanceof HTMLElement)) {
      this.hide();
      return;
    }

    const nodeRect = nodeDOM.getBoundingClientRect();

    this.pos = pos;
    handle.style.top = `${
      this.getFirstLineCenter(view, pos, nodeDOM) -
      containerRect.top -
      handleHeight / 2
    }px`;
    handle.style.left = `${
      nodeRect.left - containerRect.left - getHandleOffset(node.type.name)
    }px`;
    handle.classList.add(EditorStyleHelper.blockDragHandleVisible);
  }

  /**
   * Find the vertical center of the first line of content inside a block, in
   * viewport coordinates. The element's own box is not usable for this: a table
   * wrapper starts roughly two lines above the table it draws, and blocks such
   * as notices and code blocks pad their contents by differing amounts.
   *
   * @param view the editor view.
   * @param pos position of the block.
   * @param nodeDOM the block's element.
   * @returns the center of the line in viewport coordinates.
   */
  private getFirstLineCenter(
    view: EditorView,
    pos: number,
    nodeDOM: HTMLElement
  ): number {
    const lineHeight = Math.min(
      parseFloat(getComputedStyle(nodeDOM).lineHeight) || handleHeight,
      maxLineHeight
    );

    try {
      const { top, bottom } = view.coordsAtPos(pos + 1);

      // Prosemirror collapses the result to a zero height line at the top of
      // the first child when the block holds other blocks rather than text, so
      // there is only a line to center within for textblocks.
      return bottom - top > 1 ? (top + bottom) / 2 : top + lineHeight / 2;
    } catch (_err) {
      // coordsAtPos throws for positions that are not currently laid out, for
      // example inside a collapsed heading.
      return nodeDOM.getBoundingClientRect().top + lineHeight / 2;
    }
  }

  /**
   * Get the range covered by a block drag. Dragging a heading includes the
   * section it introduces, through the next heading of the same or higher
   * level. Other block drags cover the single node.
   *
   * The range is expressed as a selection so that its content can be read, it
   * is never applied to the editor.
   *
   * @param view the editor view.
   * @param pos position of the block.
   * @returns the range to drag.
   */
  private getRange(view: EditorView, pos: number) {
    const node = view.state.doc.nodeAt(pos);

    if (node?.type.name === "heading") {
      const $heading = view.state.doc.resolve(pos + 1);
      const end = findCutAfterHeading($heading).pos;

      return TextSelection.create(view.state.doc, pos, end);
    }

    return NodeSelection.create(view.state.doc, pos);
  }

  private hide() {
    this.pos = undefined;
    this.handle?.classList.remove(EditorStyleHelper.blockDragHandleVisible);
  }
}

/**
 * Adds a drag handle to blocks that have no drag affordance of their own, such
 * as headings, code blocks, quotes, notices, toggles, tables and math blocks.
 */
export default class BlockDragHandle extends Extension {
  get name() {
    return "block_drag_handle";
  }

  get plugins(): Plugin[] {
    return [
      new Plugin({
        view: (view) => new BlockDragHandleView(view),
      }),
    ];
  }
}
