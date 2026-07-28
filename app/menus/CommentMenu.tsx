import copy from "copy-to-clipboard";
import { observer } from "mobx-react";
import { CopyIcon, EditIcon } from "outline-icons";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type Comment from "~/models/Comment";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";
import { OverflowMenuButton } from "~/components/Menu/OverflowMenuButton";
import { useDocumentContext } from "~/components/DocumentContext";
import {
  deleteCommentFactory,
  resolveCommentFactory,
  unresolveCommentFactory,
  viewCommentReactionsFactory,
} from "~/actions/definitions/comments";
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { commentPath, urlify } from "~/utils/routeHelpers";
import { ActionSeparator, createAction } from "~/actions";
import { ActiveDocumentSection } from "~/actions/sections";
import { useMenuAction } from "~/hooks/useMenuAction";

type Props = {
  /** The comment to associate with the menu */
  comment: Comment;
  /** CSS class name */
  className?: string;
  /** Callback when the "Edit" is selected in the menu */
  onEdit: () => void;
  /** Callback when the comment has been deleted */
  onDelete: () => void;
  /** Callback when the comment has been updated */
  onUpdate: (attrs: { resolved: boolean }) => void;
};

function CommentMenu({
  comment,
  onEdit,
  onDelete,
  onUpdate,
  className,
}: Props) {
  const { editor } = useDocumentContext();
  const { documents } = useStores();
  const { t } = useTranslation();
  const can = usePolicy(comment);
  const document = documents.get(comment.documentId);

  const handleCopyLink = useCallback(() => {
    if (document) {
      copy(urlify(commentPath(document, comment)));
      toast.message(t("Link copied"));
    }
  }, [t, document, comment]);

  const handleReplaceSuggestions = useCallback(() => {
    if (!comment.suggestions) {
      return false;
    }

    return (
      editor?.replaceCommentAnchorWithText(comment.id, comment.suggestions) ??
      false
    );
  }, [comment.id, comment.suggestions, editor]);

  const actions = useMemo(
    () => [
      createAction({
        name: `${t("Edit")}…`,
        icon: <EditIcon />,
        section: ActiveDocumentSection,
        visible: can.update && !comment.isResolved,
        perform: onEdit,
      }),
      resolveCommentFactory({
        comment,
        onResolve: () => onUpdate({ resolved: true }),
        onReplaceSuggestions: handleReplaceSuggestions,
      }),
      unresolveCommentFactory({
        comment,
        onUnresolve: () => onUpdate({ resolved: false }),
      }),
      viewCommentReactionsFactory({
        comment,
      }),
      createAction({
        name: t("Copy link"),
        icon: <CopyIcon />,
        section: ActiveDocumentSection,
        perform: handleCopyLink,
      }),
      ActionSeparator,
      deleteCommentFactory({ comment, onDelete }),
    ],
    [
      t,
      comment,
      can.update,
      onEdit,
      onUpdate,
      onDelete,
      handleCopyLink,
      handleReplaceSuggestions,
    ]
  );

  const rootAction = useMenuAction(actions);

  return (
    <DropdownMenu
      action={rootAction}
      align="end"
      ariaLabel={t("Comment options")}
      modal={false}
    >
      <OverflowMenuButton className={className} />
    </DropdownMenu>
  );
}

export default observer(CommentMenu);
