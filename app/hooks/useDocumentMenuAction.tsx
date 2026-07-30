import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ExportIcon,
  ImportIcon,
  LightningIcon,
  MoreIcon,
  SearchIcon,
} from "outline-icons";
import {
  ActionSeparator,
  createAction,
  createActionWithChildren,
  createRootMenuAction,
} from "~/actions";
import {
  restoreDocument,
  unsubscribeDocument,
  subscribeDocument,
  restoreDocumentToCollection,
  starDocument,
  unstarDocument,
  editDocument,
  shareDocument,
  createNewDocument,
  createNewDocumentInAlphabeticalCollection,
  importDocument,
  importDirectory,
  createTemplateFromDocument,
  duplicateDocument,
  publishDocument,
  unpublishDocument,
  archiveDocument,
  moveDocument,
  applyTemplateActionFactory,
  pinDocument,
  openDocumentComments,
  openDocumentHistory,
  openDocumentInsights,
  openDocumentInNewWindow,
  openDocumentInDesktop,
  openDocumentInSplit,
  downloadDocument,
  copyDocument,
  presentDocument,
  printDocument,
  searchInDocument,
  deleteDocument,
  leaveDocument,
  permanentlyDeleteDocument,
} from "~/actions/definitions/documents";
import { renameActionFactory } from "~/actions/definitions/common";
import { ActiveDocumentSection } from "~/actions/sections";
import useMobile from "./useMobile";
import type Template from "~/models/Template";
import { useTemplateMenuActions } from "./useTemplateMenuActions";

type Props = {
  /** Document ID for which the actions are generated */
  documentId: string;
  /** Invoked when the "Find and replace" menu item is clicked */
  onFindAndReplace?: () => void;
  /** Invoked when the "Rename" menu item is clicked */
  onRename?: () => void;
  /** Callback when a template is selected to apply its content to the document */
  onSelectTemplate?: (template: Template) => void;
};

export function useDocumentMenuAction({
  documentId,
  onFindAndReplace,
  onRename,
  onSelectTemplate,
}: Props) {
  const { t } = useTranslation();
  const isMobile = useMobile();

  const templateMenuActions = useTemplateMenuActions({
    documentId,
    onSelectTemplate,
  });

  return useCallback(
    () =>
      createRootMenuAction([
        restoreDocument,
        restoreDocumentToCollection,
        starDocument,
        unstarDocument,
        subscribeDocument,
        unsubscribeDocument,
        createAction({
          name: `${t("Find and replace")}…`,
          section: ActiveDocumentSection,
          icon: <SearchIcon />,
          visible: !!onFindAndReplace && isMobile,
          perform: () => onFindAndReplace?.(),
        }),
        ActionSeparator,
        editDocument,
        createActionWithChildren({
          name: t("Actions"),
          section: ActiveDocumentSection,
          icon: <LightningIcon />,
          children: [
            renameActionFactory({
              section: ActiveDocumentSection,
              modelId: documentId,
              onRename,
            }),
            shareDocument,
            duplicateDocument,
            moveDocument,
          ],
        }),
        pinDocument,
        createNewDocument,
        createNewDocumentInAlphabeticalCollection,
        ActionSeparator,
        publishDocument,
        openDocumentComments,
        openDocumentHistory,
        createActionWithChildren({
          name: t("Export"),
          section: ActiveDocumentSection,
          icon: <ExportIcon />,
          children: [downloadDocument, copyDocument, printDocument],
        }),
        ActionSeparator,
        createActionWithChildren({
          name: t("Others"),
          section: ActiveDocumentSection,
          icon: <MoreIcon />,
          children: [
            createTemplateFromDocument,
            unpublishDocument,
            openDocumentInsights,
            archiveDocument,
            applyTemplateActionFactory({ actions: templateMenuActions }),
            createActionWithChildren({
              name: t("Import"),
              section: ActiveDocumentSection,
              icon: <ImportIcon />,
              children: [importDocument, importDirectory],
            }),
            searchInDocument,
            openDocumentInNewWindow,
            openDocumentInSplit,
            openDocumentInDesktop,
            presentDocument,
          ],
        }),
        ActionSeparator,
        deleteDocument,
        permanentlyDeleteDocument,
        leaveDocument,
      ]),
    [t, isMobile, templateMenuActions, documentId, onFindAndReplace, onRename]
  );
}
