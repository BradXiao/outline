import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import Extension from "../lib/Extension";

/** Distance from the edge of the scrollport, in px, at which scrolling starts. */
const EdgeSize = 96;

/** Scroll speed in px per second when the pointer is at, or beyond, the edge. */
const MaxSpeed = 1000;

/** Maximum time in ms to advance in a single frame, guards against long stalls. */
const MaxFrameTime = 100;

/** The region that scrolls when dragging near its top or bottom edge. */
type Scrollport = {
  /** Top of the region in viewport coordinates. */
  top: number;
  /** Bottom of the region in viewport coordinates. */
  bottom: number;
  /** Scrolls the region vertically by the given number of pixels. */
  scrollBy: (top: number) => void;
};

/**
 * Find the region that scrolls the editor, either the nearest scrollable
 * ancestor or the viewport itself.
 *
 * @param view the editor view.
 * @returns the scrollport, or undefined if the view is detached.
 */
function getScrollport(view: EditorView): Scrollport | undefined {
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;

  if (!win) {
    return undefined;
  }

  for (let node = view.dom.parentElement; node; node = node.parentElement) {
    // Neither of these scroll themselves, the viewport scrolls in their place.
    // Note that body reports a scrollable overflow-y because global styles set
    // overflow-x, which would otherwise make it look like a valid scrollport.
    if (node === doc.body || node === doc.documentElement) {
      break;
    }

    const element = node;
    const { overflowY } = win.getComputedStyle(element);

    if (
      (overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay") &&
      element.scrollHeight > element.clientHeight
    ) {
      const rect = element.getBoundingClientRect();

      return {
        top: rect.top,
        bottom: rect.bottom,
        scrollBy: (top: number) => element.scrollBy({ top }),
      };
    }
  }

  return {
    top: 0,
    bottom: win.innerHeight,
    scrollBy: (top: number) => win.scrollBy({ top }),
  };
}

/**
 * Calculate the scroll speed for a pointer position, ramping up linearly as the
 * pointer approaches the edge of the scrollport.
 *
 * @param clientY the pointer position in viewport coordinates.
 * @param scrollport the region being scrolled.
 * @returns the speed in px per second, negative to scroll up, zero to stop.
 */
function getScrollSpeed(clientY: number, scrollport: Scrollport): number {
  const distanceToTop = Math.max(clientY - scrollport.top, 0);
  const distanceToBottom = Math.max(scrollport.bottom - clientY, 0);

  if (distanceToTop < EdgeSize) {
    return -MaxSpeed * ((EdgeSize - distanceToTop) / EdgeSize);
  }

  if (distanceToBottom < EdgeSize) {
    return MaxSpeed * ((EdgeSize - distanceToBottom) / EdgeSize);
  }

  return 0;
}

/**
 * Scrolls the document while dragging a node, such as a list item or image,
 * towards the top or bottom edge of the viewport. Without this a drag cannot
 * reach a drop target that is outside of the current scroll position.
 */
export default class DragAutoScroll extends Extension {
  get name() {
    return "drag_auto_scroll";
  }

  get plugins(): Plugin[] {
    return [
      new Plugin({
        view: (view) => {
          const doc = view.dom.ownerDocument;
          const win = doc.defaultView;

          if (!win) {
            return {};
          }

          let scrollport: Scrollport | undefined;
          let frame: number | undefined;
          let lastFrameTime = 0;
          let clientY = 0;

          const step = (now: number) => {
            frame = win.requestAnimationFrame(step);

            // Advance by elapsed time rather than a fixed amount per frame so
            // that the speed is the same regardless of frame rate, and remains
            // sane if frames are dropped while the browser handles the drag.
            const elapsed = Math.min(now - lastFrameTime, MaxFrameTime);
            lastFrameTime = now;

            if (!scrollport) {
              return;
            }

            const speed = getScrollSpeed(clientY, scrollport);
            if (speed) {
              scrollport.scrollBy((speed * elapsed) / 1000);
            }
          };

          const stop = () => {
            if (frame !== undefined) {
              win.cancelAnimationFrame(frame);
            }
            frame = undefined;
            scrollport = undefined;
          };

          const handleDragStart = (event: DragEvent) => {
            const target = event.target;

            // Only respond to drags that started inside this editor, other
            // editors on the page manage their own scrollport. The container is
            // used rather than the editor itself so that drags started from a
            // handle rendered beside the editable DOM are included.
            const origin = view.dom.parentElement ?? view.dom;

            if (!(target instanceof win.Node) || !origin.contains(target)) {
              return;
            }

            scrollport = getScrollport(view);
            clientY = event.clientY;

            if (frame === undefined) {
              lastFrameTime = win.performance.now();
              frame = win.requestAnimationFrame(step);
            }
          };

          const handleDragOver = (event: DragEvent) => {
            if (frame !== undefined) {
              clientY = event.clientY;
            }
          };

          // Listen on the document as the pointer regularly leaves the editor
          // while dragging, particularly when close to the edge of the window.
          doc.addEventListener("dragstart", handleDragStart);
          doc.addEventListener("dragover", handleDragOver);
          doc.addEventListener("dragend", stop);
          doc.addEventListener("drop", stop);

          return {
            destroy: () => {
              stop();
              doc.removeEventListener("dragstart", handleDragStart);
              doc.removeEventListener("dragover", handleDragOver);
              doc.removeEventListener("dragend", stop);
              doc.removeEventListener("drop", stop);
            },
          };
        },
      }),
    ];
  }
}
