import { transparentize } from "polished";
import styled, { css } from "styled-components";
import { s, truncateMultiline } from "@shared/styles";
import Text from "~/components/Text";

/**
 * Shared callout styling for text associated with a comment.
 */
export const commentCalloutStyles = css`
  display: block;
  margin: 0 0 8px;
  padding: 8px 10px;
  border-inline-start: 3px solid;
  border-radius: 2px;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
`;

/**
 * Highlighted text associated with a comment.
 */
export const HighlightedText = styled(Text)`
  ${commentCalloutStyles}

  border-inline-start-color: ${s("commentMarkBackground")};
  background: ${(props) =>
    transparentize(0.88, props.theme.commentedImageOutlineDark)};
  color: ${s("textSecondary")};

  ${truncateMultiline(3)}
`;
