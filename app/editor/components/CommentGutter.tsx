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
  const headingContent = gutter.closest(".heading-content");
  const lineRect = (headingContent ?? line).getBoundingClientRect();
  const isRTL = getComputedStyle(pm).direction === "rtl";
  const offset = EditorStyleHelper.padding + GUTTER_MARGIN;

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

  if (isRTL) {
    gutter.style.left = "auto";
    gutter.style.right = `${
      document.documentElement.clientWidth - columnRect.left + offset
    }px`;
  } else {
    gutter.style.right = "auto";
    gutter.style.left = `${columnRect.right + offset}px`;
  }

  // Hide when the line has scrolled out of the editor's visible area so the
  // fixed indicator does not float over chrome (header, sidebars).
  const pmRect = pm.getBoundingClientRect();
  const inView = lineRect.bottom > pmRect.top && lineRect.top < pmRect.bottom;
  gutter.style.visibility = inView ? "visible" : "hidden";
}

/**
 * Renders the comment indicators shown in the gutter beside a line that
 * contains one or more unresolved comment marks.
 */
export function CommentGutter({
  commentIds,
  onClickCommentMark,
  onHoverCommentMark,
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const gutter = ref.current;
    if (!gutter) {
      return;
    }

    const updatePosition = () => positionGutter(gutter);
    updatePosition();

    const pm = gutter.closest(".ProseMirror");
    if (!pm) {
      return;
    }

    const observer = new ResizeObserver(updatePosition);
    observer.observe(pm);

    // Capture phase so nested scroll containers (tables, code) are covered.
    window.addEventListener("scroll", updatePosition, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [commentIds]);

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
}

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
