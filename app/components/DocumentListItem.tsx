import {
  useFocusEffect,
  useRovingTabIndex,
} from "@getoutline/react-roving-tabindex";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { mergeRefs } from "react-merge-refs";
import { Link } from "react-router-dom";
import { CheckmarkIcon } from "outline-icons";
import styled, { css, useTheme } from "styled-components";
import breakpoint from "styled-components-breakpoint";
import EventBoundary from "@shared/components/EventBoundary";
import Icon from "@shared/components/Icon";
import { s, hover } from "@shared/styles";
import type Document from "~/models/Document";
import Badge from "~/components/Badge";
import { useModelSelection } from "~/components/ModelSelectionContext";
import DocumentMeta from "~/components/DocumentMeta";
import Flex from "~/components/Flex";
import Highlight from "~/components/Highlight";
import { DocumentPlaceholderIcon } from "~/components/Icons/DocumentPlaceholderIcon";
import { NestedDocumentsIcon } from "~/components/Icons/NestedDocumentsBadge";
import NudeButton from "~/components/NudeButton";
import StarButton, { AnimatedStar } from "~/components/Star";
import Tooltip from "~/components/Tooltip";
import useBoolean from "~/hooks/useBoolean";
import useCurrentUser from "~/hooks/useCurrentUser";
import useMobile from "~/hooks/useMobile";
import usePolicy from "~/hooks/usePolicy";
import { useLocationSidebarContext } from "~/hooks/useLocationSidebarContext";
import DocumentMenu from "~/menus/DocumentMenu";
import { documentPath } from "~/utils/routeHelpers";
import { determineSidebarContext } from "./Sidebar/components/SidebarContext";
import { useDragDocument } from "./Sidebar/hooks/useDragAndDrop";
import { ActionContextProvider } from "~/hooks/useActionContext";
import { useDocumentMenuAction } from "~/hooks/useDocumentMenuAction";
import { ContextMenu } from "./Menu/ContextMenu";
import useStores from "~/hooks/useStores";

type Props = {
  document: Document;
  highlight?: string | undefined;
  context?: string | undefined;
  showParentDocuments?: boolean;
  showCollection?: boolean;
  showPublished?: boolean;
  showDraft?: boolean;
  /** Nesting depth when rendering expanded child rows. */
  depth?: number;
};

const SEARCH_RESULT_REGEX = /<b\b[^>]*>(.*?)<\/b>/gi;

function replaceResultMarks(tag: string) {
  // don't use SEARCH_RESULT_REGEX directly here as it causes an infinite loop
  return tag.replace(new RegExp(SEARCH_RESULT_REGEX.source), "$1");
}

function DocumentListItem(
  props: Props,
  ref: React.RefObject<HTMLAnchorElement>
) {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const theme = useTheme();
  const { userMemberships, groupMemberships, collections, documents } =
    useStores();
  const locationSidebarContext = useLocationSidebarContext();
  const [menuOpen, handleMenuOpen, handleMenuClose] = useBoolean();
  const [expanded, setExpanded] = React.useState(false);
  const isMobile = useMobile();
  const selection = useModelSelection();
  const iconRef = React.useRef<HTMLDivElement>(null);

  let itemRef: React.Ref<HTMLAnchorElement> =
    React.useRef<HTMLAnchorElement>(null);
  if (ref) {
    itemRef = ref;
  }

  const { focused, ...rovingTabIndex } = useRovingTabIndex(itemRef, false);
  useFocusEffect(focused, itemRef);

  const {
    document,
    showParentDocuments,
    showCollection,
    showPublished,
    showDraft = true,
    highlight,
    context,
    depth = 0,
    ...rest
  } = props;
  const queryIsInTitle =
    !!highlight &&
    !!document.title.toLowerCase().includes(highlight.toLowerCase());
  const canStar = !document.isArchived;

  // Match DocumentMeta: resolve the collection from the store. The document
  // relation is often unset in list views even when the collection tree is loaded.
  // Take the max across sources — a collection may exist without its document
  // tree hydrated yet, while child docs are already in the documents store.
  const collection = document.collectionId
    ? collections.get(document.collectionId)
    : undefined;
  const nestedDocumentsCount = Math.max(
    collection?.getChildrenForDocument(document.id).length ?? 0,
    document.children.length,
    document.childDocuments.length
  );
  const hasChildren = nestedDocumentsCount > 0;
  const childNodes =
    collection?.getChildrenForDocument(document.id) ?? document.children;

  const handleToggleChildren = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setExpanded((value) => {
        if (!value) {
          void documents.fetchChildDocuments(document.id);
        }
        return !value;
      });
    },
    [documents, document.id]
  );
  const can = usePolicy(document.id);
  const selectable = !!selection && !!can.update;
  const isSelected = selection?.isSelected(document.id) ?? false;
  const isSelecting =
    selectable && ((selection?.isActive ?? false) || isSelected);

  const inSelectArea = (event: React.MouseEvent) =>
    selectable && !!iconRef.current?.contains(event.target as Node);

  // Handled on the link so preventDefault reliably suppresses navigation.
  const handleLinkClick = (event: React.MouseEvent) => {
    if (selection && inSelectArea(event)) {
      event.preventDefault();
      if (event.shiftKey) {
        selection.selectRange(document.id);
      } else {
        selection.toggle(document.id);
      }
      return;
    }
    rovingTabIndex.onClick?.(event);
  };

  // Suppress the browser's text selection when shift-clicking to select a range.
  const handleLinkMouseDown = (event: React.MouseEvent) => {
    if (event.shiftKey && inSelectArea(event)) {
      event.preventDefault();
    }
  };

  const isShared = !!(
    userMemberships.getByDocumentId(document.id) ||
    groupMemberships.getByDocumentId(document.id)
  );

  const sidebarContext = determineSidebarContext({
    document,
    user,
    currentContext: locationSidebarContext,
  });

  const contextMenuAction = useDocumentMenuAction({ documentId: document.id });

  const [{ isDragging }, draggableRef] = useDragDocument(
    document.asNavigationNode,
    0,
    document,
    false,
    false
  );

  const mergedRef = React.useMemo(
    () =>
      mergeRefs<HTMLAnchorElement>([
        itemRef,
        draggableRef,
      ] as React.Ref<HTMLAnchorElement>[]),
    [itemRef, draggableRef]
  );

  return (
    <ActionContextProvider
      value={{
        activeModels: [
          document,
          ...(!isShared && document.collection ? [document.collection] : []),
        ],
      }}
    >
      <>
        <ContextMenu
          action={contextMenuAction}
          ariaLabel={t("Document options")}
          onOpen={handleMenuOpen}
          onClose={handleMenuClose}
        >
          <DocumentLink
            ref={mergedRef}
            dir={document.dir}
            $isStarred={document.isStarred}
            $isDragging={isDragging}
            $menuOpen={menuOpen}
            $selectable={selectable}
            $depth={depth}
            to={{
              pathname: documentPath(document),
              search: highlight
                ? `?q=${encodeURIComponent(highlight)}`
                : undefined,
              state: {
                title: document.titleWithDefault,
                sidebarContext,
              },
            }}
            {...rest}
            {...rovingTabIndex}
            onClick={handleLinkClick}
            onMouseDown={handleLinkMouseDown}
          >
            <Flex gap={4} auto>
              <NestedDocumentsIcon
                hasChildren={hasChildren}
                expanded={expanded}
                onToggle={handleToggleChildren}
              >
                <IconWrapper ref={iconRef}>
                  {selectable && (
                    <SelectButton
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={t("Select")}
                      $checked={isSelected}
                      $visible={isSelecting}
                      tabIndex={-1}
                    >
                      {isSelected && <CheckmarkIcon size={16} />}
                    </SelectButton>
                  )}
                  <DocumentIconWrapper $dimmed={isSelecting}>
                    {document.icon ? (
                      <Icon
                        value={document.icon}
                        color={document.color ?? undefined}
                        initial={document.initial}
                      />
                    ) : (
                      <DocumentPlaceholderIcon color={theme.textSecondary} />
                    )}
                  </DocumentIconWrapper>
                </IconWrapper>
              </NestedDocumentsIcon>
              <Content>
                <Heading dir={document.dir}>
                  <Title
                    text={document.titleWithDefault}
                    highlight={highlight}
                    dir={document.dir}
                  />
                  {document.isBadgedNew &&
                    document.createdBy?.id !== user.id && (
                      <Badge yellow>{t("New")}</Badge>
                    )}
                  {document.isDraft && showDraft && (
                    <Tooltip
                      content={t("Only visible to you")}
                      placement="top"
                    >
                      <Badge>{t("Draft")}</Badge>
                    </Tooltip>
                  )}
                  {canStar && !isMobile && <StarButton document={document} />}
                </Heading>

                {!queryIsInTitle && (
                  <ResultContext
                    text={context}
                    highlight={highlight ? SEARCH_RESULT_REGEX : undefined}
                    processResult={replaceResultMarks}
                  />
                )}
                <DocumentMeta
                  document={document}
                  showCollection={showCollection}
                  showPublished={showPublished}
                  showParentDocuments={showParentDocuments}
                  showLastViewed
                />
              </Content>
            </Flex>
            <Actions>
              <DocumentMenu
                document={document}
                onOpen={handleMenuOpen}
                onClose={handleMenuClose}
              />
            </Actions>
          </DocumentLink>
        </ContextMenu>
        {expanded &&
          childNodes.map((node) => {
            const childDocument = documents.get(node.id);
            if (!childDocument) {
              return null;
            }

            return (
              <ObservedDocumentListItem
                key={node.id}
                document={childDocument}
                showParentDocuments={showParentDocuments}
                showCollection={showCollection}
                showPublished={showPublished}
                showDraft={showDraft}
                depth={depth + 1}
              />
            );
          })}
      </>
    </ActionContextProvider>
  );
}

const IconWrapper = styled.div`
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  width: 24px;
  /* Hug the icon rather than stretching to the height of the item, so that only
  clicks landing on the icon itself begin a selection – the remainder of the
  item navigates. */
  align-self: flex-start;
`;

const DocumentIconWrapper = styled.span<{ $dimmed: boolean }>`
  position: relative;
  display: flex;
  transition: opacity 100ms ease;
  opacity: ${(props) => (props.$dimmed ? 0 : 1)};
`;

const SelectButton = styled(NudeButton)<{
  $checked: boolean;
  $visible: boolean;
}>`
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 2px solid ${s("inputBorder")};
  color: ${(props) => props.theme.accentText};
  opacity: ${(props) => (props.$visible ? 1 : 0)};
  transition:
    opacity 100ms ease,
    background 100ms ease,
    border-color 100ms ease;

  ${(props) =>
    props.$checked &&
    css`
      background: ${props.theme.accent};
      border-color: ${props.theme.accent};
    `}
`;

const Content = styled.div`
  flex-grow: 1;
  flex-shrink: 1;
  min-width: 0;
`;

const Actions = styled(EventBoundary)`
  display: none;
  align-items: center;
  margin: 8px;
  flex-shrink: 0;
  flex-grow: 0;
  color: ${s("textSecondary")};

  ${NudeButton}:${hover},
  ${NudeButton}[aria-expanded= "true"] {
    background: ${s("sidebarControlHoverBackground")};
  }

  ${breakpoint("tablet")`
    display: flex;
  `};
`;

const DocumentLink = styled(Link)<{
  $isStarred?: boolean;
  $isDragging?: boolean;
  $menuOpen?: boolean;
  $selectable?: boolean;
  $depth?: number;
}>`
  display: flex;
  align-items: center;
  margin: 10px -8px;
  padding: 6px 8px;
  /* Leave a gutter for the disclosure caret so icons stay aligned. */
  padding-left: ${(props) => 18 + (props.$depth ?? 0) * 24}px;
  border-radius: 8px;
  max-height: 50vh;
  width: calc(100vw - 8px);
  cursor: var(--pointer);
  transition: opacity 250ms ease;
  opacity: ${(props) => (props.$isDragging ? 0.1 : 1)};

  &:focus-visible {
    outline: none;
  }

  ${breakpoint("tablet")`
    width: auto;
  `};

  ${Actions} {
    opacity: 0;
  }

  ${AnimatedStar} {
    opacity: ${(props) => (props.$isStarred ? "1 !important" : 0)};
  }

  &:${hover},
  &:active,
  &:focus,
  &:focus-within {
    background: ${s("listItemHoverBackground")};

    ${Actions} {
      opacity: 1;
    }

    ${AnimatedStar} {
      opacity: 0.5;

      &:${hover} {
        opacity: 1;
      }
    }
  }

  /* Revealing the checkbox is a hover affordance only – on touch devices the
  equivalent states (active, focus) are triggered by tapping the item to
  navigate, which makes an item appear selected when it is not. There, the
  checkbox appears once a selection is underway. */
  @media (hover: hover) {
    &:hover,
    &:focus,
    &:focus-within {
      ${(props) =>
        props.$selectable &&
        css`
          ${SelectButton} {
            opacity: 1;
          }

          ${DocumentIconWrapper} {
            opacity: 0;
          }
        `}
    }
  }

  ${(props) =>
    props.$menuOpen &&
    css`
      background: ${s("listItemHoverBackground")};

      ${Actions} {
        opacity: 1;
      }

      ${AnimatedStar} {
        opacity: 0.5;
      }
    `}
`;

const Heading = styled.span<{ rtl?: boolean }>`
  display: flex;
  justify-content: ${(props) => (props.rtl ? "flex-end" : "flex-start")};
  align-items: center;
  margin-top: 0;
  margin-bottom: 0.1em;
  white-space: nowrap;
  color: ${s("text")};
  font-family: ${s("fontFamily")};
  font-weight: 500;
  font-size: 18px;
  line-height: 1.2;
  gap: 4px;
`;

const Title = styled(Highlight)`
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ResultContext = styled(Highlight)`
  display: block;
  color: ${s("textSecondary")};
  font-size: 15px;
  margin-top: -0.25em;
  margin-bottom: 0.25em;
  max-height: 90px;
  overflow: hidden;
`;

const ObservedDocumentListItem = observer(React.forwardRef(DocumentListItem));

export default ObservedDocumentListItem;
