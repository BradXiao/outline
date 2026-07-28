import { t } from "i18next";
import { observer } from "mobx-react";
import { CommentIcon } from "outline-icons";
import * as React from "react";
import styled from "styled-components";
import { s } from "@shared/styles";
import { EditorStyleHelper } from "@shared/editor/styles/EditorStyleHelper";
import stores from "~/stores";

type IconProps = {
  /** The id of the comment thread this indicator represents. */
  commentId: string;
  /** Callback invoked when the indicator is clicked, opening the thread. */
  onClick?: (commentId: string) => void;
  /** Callback invoked when the indicator is hovered or unhovered. */
  onHover?: (commentId: string, hovered: boolean) => void;
};

const CommentGutterIcon = observer(function CommentGutterIcon({
  commentId,
  onClick,
  onHover,
}: IconProps) {
  const count = stores.comments.inThread(commentId).length;
  const setHovered = (hovered: boolean) => onHover?.(commentId, hovered);

  return (
    <Icon
      type="button"
      aria-label={t("View comment thread")}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(commentId);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <CommentIcon size={18} />
      {count > 0 && <span>{count}</span>}
    </Icon>
  );
});

type Props = {
  /** The ids of the comment threads present on this line. */
  commentIds: string[];
  /** Callback invoked when an indicator is clicked, opening the thread. */
  onClickCommentMark?: (commentId: string) => void;
  /** Callback invoked when an indicator is hovered, highlighting the mark. */
  onHoverCommentMark?: (commentId: string, hovered: boolean) => void;
};

const GUTTER_MARGIN = 8;

/**
 * Find the top-level editor child that owns this gutter, so horizontal
 * alignment uses the content column rather than a nested cell/code/quote box.
 *
 * @param from - An element inside the editor (typically the gutter itself).
 * @param pm - The ProseMirror root element.
 * @returns the top-level block under `.ProseMirror`.
 */
function findContentColumn(from: HTMLElement, pm: HTMLElement): HTMLElement {
  let node: HTMLElement | null = from;
  let topLevel = from;

  while (node && node !== pm) {
    if (node.parentElement === pm) {
      topLevel = node;
      break;
    }
    node = node.parentElement;
  }

  return topLevel;
}

/**
 * Find the editor grid column that wraps the document.
 *
 * @param pm - The ProseMirror root element.
 * @returns the grid item wrapping the editor, or the ProseMirror root.
 */
function findEditorColumn(pm: HTMLElement): HTMLElement {
  let node: HTMLElement | null = pm.parentElement;

  while (node) {
    const parent = node.parentElement;
    if (parent && getComputedStyle(parent).display === "grid") {
      return node;
    }
    node = parent;
  }

  return pm;
}

/**
 * Find the inline-end edge of a sibling grid column (e.g. Contents/TOC) that
 * sits beside the editor, if any.
 *
 * @param editorColumn - The editor's grid item.
 * @param isRTL - Whether the document is right-to-left.
 * @returns the viewport coordinate of that column's inner edge, or null.
 */
function findAdjacentColumnEdge(
  editorColumn: HTMLElement,
  isRTL: boolean
): number | null {
  const parent = editorColumn.parentElement;
  if (!parent || getComputedStyle(parent).display !== "grid") {
    return null;
  }

  const editorRect = editorColumn.getBoundingClientRect();

  for (const child of Array.from(parent.children)) {
    if (!(child instanceof HTMLElement) || child === editorColumn) {
      continue;
    }

    const rect = child.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      continue;
    }

    if (!isRTL && rect.left >= editorRect.right - 2) {
      return rect.left;
    }
    if (isRTL && rect.right <= editorRect.left + 2) {
      return rect.right;
    }
  }

  return null;
}

/**
 * Position the gutter in the document margin beside the content column.
 * Uses `position: fixed` so nested `position`/`overflow` on tables, code
 * blocks, and quotes cannot trap or clip the indicator.
 *
 * @param gutter - The gutter element to position.
 */
function positionGutter(gutter: HTMLElement) {
  const pm = gutter.closest(".ProseMirror");
  if (!(pm instanceof HTMLElement)) {
    return;
  }

  // Portal mount uses display:contents; its parent is the annotated line.
  const line = gutter.parentElement?.parentElement;
  if (!line) {
    return;
  }

  const columnRect = findContentColumn(gutter, pm).getBoundingClientRect();
  const editorColumn = findEditorColumn(pm);
  const headingContent = gutter.closest(".heading-content");
  const lineRect = (headingContent ?? line).getBoundingClientRect();
  const isRTL = getComputedStyle(pm).direction === "rtl";
  const offset = EditorStyleHelper.padding + GUTTER_MARGIN;
  const gutterWidth = gutter.offsetWidth || 40;
  const adjacentEdge = findAdjacentColumnEdge(editorColumn, isRTL);

  // Headings are taller than a text line; center the indicator against the text.
  let top = lineRect.top;
  if (headingContent) {
    top =
      lineRect.top +
      (lineRect.height - gutter.getBoundingClientRect().height) / 2;
  }

  gutter.style.position = "fixed";
  gutter.style.top = `${top}px`;
  gutter.style.insetInlineStart = "auto";
  gutter.style.marginInlineStart = "0";

  // Prefer the natural gutter slot. When Contents (TOC) is open beside the
  // editor, clamp so indicators stay in the margin and do not cover it.
  if (isRTL) {
    let right =
      document.documentElement.clientWidth - columnRect.left + offset;
    if (adjacentEdge !== null) {
      const maxRight =
        document.documentElement.clientWidth - adjacentEdge - gutterWidth - 4;
      right = Math.min(right, Math.max(0, maxRight));
    }
    gutter.style.left = "auto";
    gutter.style.right = `${right}px`;
  } else {
    let left = columnRect.right + offset;
    if (adjacentEdge !== null) {
      left = Math.min(left, adjacentEdge - gutterWidth - 4);
    }
    gutter.style.right = "auto";
    gutter.style.left = `${left}px`;
  }

  // Hide when the line has scrolled out of the editor's visible area so the
  // fixed indicator does not float over chrome (header, sidebars). Also hide
  // when Contents leaves too little room for a gutter beside the content.
  const pmRect = pm.getBoundingClientRect();
  const fits =
    adjacentEdge === null || adjacentEdge - columnRect.right >= gutterWidth;
  const inView = lineRect.bottom > pmRect.top && lineRect.top < pmRect.bottom;
  gutter.style.visibility = inView && fits ? "visible" : "hidden";
}

/**
 * Renders the comment indicators shown in the gutter beside a line that
 * contains one or more unresolved comment marks.
 */
export const CommentGutter = observer(function CommentGutter({
  commentIds,
  onClickCommentMark,
  onHoverCommentMark,
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Right sidebar (comments/history) shifts the editor without always changing
  // its size — reposition as soon as the panel toggles. Width changes during
  // the open animation are picked up via ResizeObserver on [role=main].
  const rightSidebar = stores.ui.rightSidebar;

  React.useLayoutEffect(() => {
    const gutter = ref.current;
    if (!gutter) {
      return;
    }

    const updatePosition = () => positionGutter(gutter);
    updatePosition();

    const pm = gutter.closest(".ProseMirror");
    if (!(pm instanceof HTMLElement)) {
      return;
    }

    const editorColumn = findEditorColumn(pm);
    const grid = editorColumn.parentElement;
    // The layout main column shrinks/grows when the right Aside opens — PM
    // itself often stays the same width and would not notify ResizeObserver.
    const main = pm.closest('[role="main"]');
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(pm);
    if (editorColumn !== pm) {
      resizeObserver.observe(editorColumn);
    }
    if (main instanceof HTMLElement) {
      resizeObserver.observe(main);
    }
    // Watch sibling columns (Contents/TOC) so we reclamp when they appear.
    if (grid) {
      for (const child of Array.from(grid.children)) {
        if (child instanceof HTMLElement) {
          resizeObserver.observe(child);
        }
      }
    }

    const mutationObserver =
      grid &&
      new MutationObserver(() => {
        for (const child of Array.from(grid.children)) {
          if (child instanceof HTMLElement) {
            resizeObserver.observe(child);
          }
        }
        updatePosition();
      });
    mutationObserver?.observe(grid, { childList: true });

    // Capture phase so nested scroll containers (tables, code) are covered.
    window.addEventListener("scroll", updatePosition, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", updatePosition);

    return () => {
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [commentIds, rightSidebar]);

  return (
    <Gutter
      ref={ref}
      className={EditorStyleHelper.commentGutter}
      contentEditable={false}
      suppressContentEditableWarning
    >
      {commentIds.map((commentId) => (
        <CommentGutterIcon
          key={commentId}
          commentId={commentId}
          onClick={onClickCommentMark}
          onHover={onHoverCommentMark}
        />
      ))}
    </Gutter>
  );
});

const Gutter = styled.div`
  /* Fallback before the layout effect pins a fixed position to the content
     column — nested tables/code/quotes otherwise trap or clip this. */
  position: absolute;
  inset-inline-start: calc(100% + ${EditorStyleHelper.padding}px);
  margin-inline-start: ${GUTTER_MARGIN}px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  user-select: none;
  white-space: nowrap;
  z-index: 1;
  visibility: hidden;
`;

const Icon = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin: 0;
  padding: 2px 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: ${s("textTertiary")};
  cursor: var(--pointer);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }

  svg {
    flex-shrink: 0;
    fill: currentColor;
  }
`;
