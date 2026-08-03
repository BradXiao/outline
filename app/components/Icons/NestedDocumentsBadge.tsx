import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";

type Props = {
  /** Whether the document has nested child documents. */
  hasChildren?: boolean;
  /** Whether nested children are currently expanded. */
  expanded?: boolean;
  /** Called when the disclosure triangle is clicked. */
  onToggle?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** The document icon to render. */
  children: React.ReactNode;
};

/**
 * Wraps a document icon with an optional disclosure triangle in the left gutter.
 * The caret is absolutely positioned so it does not shift icon alignment.
 * Points right when collapsed and down when expanded.
 *
 * @param props - component props.
 * @returns the icon with an optional nested-documents disclosure control.
 */
export function NestedDocumentsIcon({
  hasChildren,
  expanded = false,
  onToggle,
  children,
}: Props) {
  const { t } = useTranslation();

  return (
    <Wrapper>
      {hasChildren ? (
        <Toggle
          type="button"
          aria-label={expanded ? t("Collapse") : t("Expand")}
          aria-expanded={expanded}
          onClick={onToggle}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <Caret $expanded={expanded} viewBox="0 0 10 10" aria-hidden>
            <path d="M2 3.25 L5 6.75 L8 3.25" />
          </Caret>
        </Toggle>
      ) : null}
      {children}
    </Wrapper>
  );
}

const Wrapper = styled.span`
  position: relative;
  display: flex;
  flex-shrink: 0;
`;

const Toggle = styled.button`
  appearance: none;
  position: absolute;
  inset-inline-start: -15px;
  top: 27%;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: ${s("textSecondary")};
  cursor: var(--pointer);
  transform: translateY(-50%);

  &:hover {
    color: ${s("text")};
    background: ${s("sidebarControlHoverBackground")};
  }
`;

/**
 * Chevron caret — points down when expanded, right when collapsed.
 * Sits in the gutter so document icons stay vertically aligned.
 */
const Caret = styled.svg<{ $expanded: boolean }>`
  display: block;
  width: 12px;
  height: 12px;
  opacity: 0.75;
  transform: rotate(${(props) => (props.$expanded ? "0deg" : "-90deg")});
  transition:
    transform 100ms ease,
    opacity 100ms ease;

  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  [dir="rtl"] & {
    transform: rotate(${(props) => (props.$expanded ? "0deg" : "90deg")});
  }

  ${Toggle}:hover & {
    opacity: 1;
  }
`;
