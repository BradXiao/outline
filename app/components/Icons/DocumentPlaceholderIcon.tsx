import { NotepadIcon } from "outline-icons";
import styled from "styled-components";

/**
 * Placeholder icon displayed for documents that have no custom icon set.
 * Rendered at half opacity to indicate it is a default, not a chosen icon.
 */
export const DocumentPlaceholderIcon = styled(NotepadIcon)`
  opacity: 0.2;
`;
