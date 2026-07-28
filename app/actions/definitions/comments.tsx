import { DoneIcon, SmileyIcon, TrashIcon } from "outline-icons";
import { toast } from "sonner";
import type Comment from "~/models/Comment";
import CommentDeleteDialog from "~/components/CommentDeleteDialog";
import ViewReactionsDialog from "~/components/Reactions/ViewReactionsDialog";
import { createAction } from "..";
import { ActiveDocumentSection } from "../sections";

export const deleteCommentFactory = ({
  comment,
  onDelete,
}: {
  comment: Comment;
  onDelete: () => void;
}) =>
  createAction({
    name: ({ t }) => `${t("Delete")}…`,
    analyticsName: "Delete comment",
    section: ActiveDocumentSection,
    icon: <TrashIcon />,
    keywords: "trash",
    dangerous: true,
    visible: ({ stores }) => stores.policies.abilities(comment.id).delete,
    perform: ({ t, stores, event }) => {
      event?.preventDefault();
      event?.stopPropagation();

      stores.dialogs.openModal({
        title: t("Delete comment"),
        content: <CommentDeleteDialog comment={comment} onSubmit={onDelete} />,
      });
    },
  });

export const resolveCommentFactory = ({
  comment,
  onResolve,
  onReplaceSuggestions,
}: {
  comment: Comment;
  onResolve: () => void;
  onReplaceSuggestions?: () => boolean;
}) =>
  createAction({
    name: ({ t }) =>
      comment.suggestions
        ? t("Replace with suggestions")
        : t("Mark as resolved"),
    analyticsName: comment.suggestions
      ? "Replace with suggestions"
      : "Resolve thread",
    section: ActiveDocumentSection,
    icon: <DoneIcon outline />,
    visible: ({ stores }) =>
      stores.policies.abilities(comment.id).resolve &&
      stores.policies.abilities(comment.documentId).update,
    perform: async ({ t }) => {
      const replacedInEditor = comment.suggestions
        ? (onReplaceSuggestions?.() ?? false)
        : false;

      await comment.resolve({
        replaceSuggestions: comment.suggestions ? !replacedInEditor : undefined,
      });
      onResolve();
      toast.success(
        comment.suggestions ? t("Suggestions applied") : t("Thread resolved")
      );
    },
  });

export const unresolveCommentFactory = ({
  comment,
  onUnresolve,
}: {
  comment: Comment;
  onUnresolve: () => void;
}) =>
  createAction({
    name: ({ t }) => t("Mark as unresolved"),
    analyticsName: "Unresolve thread",
    section: ActiveDocumentSection,
    icon: <DoneIcon outline />,
    visible: ({ stores }) =>
      stores.policies.abilities(comment.id).unresolve &&
      stores.policies.abilities(comment.documentId).update,
    perform: async () => {
      await comment.unresolve();
      onUnresolve();
    },
  });

export const viewCommentReactionsFactory = ({
  comment,
}: {
  comment: Comment;
}) =>
  createAction({
    name: ({ t }) => `${t("View reactions")}`,
    analyticsName: "View comment reactions",
    section: ActiveDocumentSection,
    icon: <SmileyIcon />,
    visible: ({ stores }) =>
      stores.policies.abilities(comment.id).read &&
      comment.reactions.length > 0,
    perform: ({ t, stores, event }) => {
      event?.preventDefault();
      event?.stopPropagation();

      stores.dialogs.openModal({
        title: t("Reactions"),
        content: <ViewReactionsDialog model={comment} />,
      });
    },
  });
