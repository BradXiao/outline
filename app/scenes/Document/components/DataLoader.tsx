import { observer } from "mobx-react";
import * as React from "react";
import type { RouteComponentProps, StaticContext } from "react-router";
import { useHistory, useLocation } from "react-router";
import { toError } from "@shared/utils/error";
import { ProsemirrorDataHelper } from "@shared/utils/ProsemirrorDataHelper";
import { RevisionHelper } from "@shared/utils/RevisionHelper";
import type Document from "~/models/Document";
import type Revision from "~/models/Revision";
import Error402 from "~/scenes/Errors/Error402";
import Error403 from "~/scenes/Errors/Error403";
import Error404 from "~/scenes/Errors/Error404";
import ErrorOffline from "~/scenes/Errors/ErrorOffline";
import ErrorUnknown from "~/scenes/Errors/ErrorUnknown";
import { useDocumentContext } from "~/components/DocumentContext";
import { useSplitView } from "~/components/SplitView/context";
import useCurrentTeam from "~/hooks/useCurrentTeam";
import useCurrentUser from "~/hooks/useCurrentUser";
import usePolicy from "~/hooks/usePolicy";
import useQuery from "~/hooks/useQuery";
import useStores from "~/hooks/useStores";
import type { Properties } from "~/types";
import Logger from "~/utils/Logger";
import {
  AuthorizationError,
  NotFoundError,
  OfflineError,
  PaymentRequiredError,
} from "~/utils/errors";
import { patchLocation } from "~/utils/history";
import {
  matchDocumentEdit,
  settingsPath,
  updateDocumentPath,
} from "~/utils/routeHelpers";
import useDocumentSidebar from "../hooks/useDocumentSidebar";
import Loading from "./Loading";
import MarkAsViewed from "./MarkAsViewed";

type Params = {
  /** The document urlId + slugified title  */
  documentSlug: string;
  /** A specific revision id to load. */
  revisionId?: string;
};

type LocationState = {
  /** The document title, if preloaded */
  title?: string;
  restore?: boolean;
  revisionId?: string;
};

type Children = (options: {
  document: Document;
  revision: Revision | undefined;
  abilities: Record<string, boolean>;
  readOnly: boolean;
  onCreateLink: (
    params: Properties<Document>,
    nested?: boolean
  ) => Promise<string>;
}) => React.ReactNode;

type Props = RouteComponentProps<Params, StaticContext, LocationState> & {
  children: Children;
};

function DataLoader({ match, children }: Props) {
  const { ui, views, shares, comments, documents, revisions } = useStores();
  const team = useCurrentTeam();
  const user = useCurrentUser();
  // Use the nearest router history so canonical-url sync and redirects stay
  // inside the current split view pane instead of rewriting the browser URL.
  const history = useHistory();
  const { setDocument } = useDocumentContext();
  const [error, setError] = React.useState<Error | null>(null);
  const { revisionId, documentSlug } = match.params;

  // Allows loading by /doc/slug-<urlId> or /doc/<id>
  const document = documents.get(match.params.documentSlug);

  if (document) {
    setDocument(document);
  }

  const revision = revisionId
    ? revisions.get(
        revisionId === "latest"
          ? RevisionHelper.latestId(document?.id)
          : revisionId
      )
    : undefined;

  const isEditRoute =
    match.path === matchDocumentEdit || match.path.startsWith(settingsPath());
  const isEditing = isEditRoute || !user?.separateEditMode;
  const { isFocused: isPaneFocused, pane } = useSplitView();
  const can = usePolicy(document);
  const location = useLocation<LocationState>();
  const query = useQuery();
  const missingPolicy = !can || Object.keys(can).length === 0;

  useDocumentSidebar();

  React.useEffect(() => {
    async function fetchDocument() {
      try {
        await documents.fetch(documentSlug, {
          force: missingPolicy,
        });
      } catch (err) {
        setError(toError(err));
      }
    }
    void fetchDocument();
  }, [ui, documents, missingPolicy, documentSlug]);

  const fetchRevisionById = React.useCallback(
    async (id: string, onError: (err: Error) => void) => {
      try {
        if (id === "latest") {
          if (document?.id) {
            await revisions.fetchLatest(document.id);
          }
        } else {
          await revisions.fetch(id);
        }
      } catch (err) {
        onError(err as Error);
      }
    },
    [revisions, document?.id]
  );

  React.useEffect(() => {
    if (revisionId) {
      void fetchRevisionById(revisionId, setError);
    }
  }, [fetchRevisionById, revisionId]);

  const compareTo = query.get("compareTo");

  React.useEffect(() => {
    if (compareTo) {
      void fetchRevisionById(compareTo, (err) =>
        Logger.error("Failed to fetch compareTo revision", err)
      );
    }
  }, [fetchRevisionById, compareTo]);

  React.useEffect(() => {
    async function fetchViews() {
      if (document?.id && !document?.isDeleted && !revisionId) {
        try {
          await views.fetchPage({
            documentId: document.id,
          });
        } catch (err) {
          Logger.error("Failed to fetch views", toError(err));
        }
      }
    }
    void fetchViews();
  }, [document?.id, document?.isDeleted, revisionId, views]);

  const onCreateLink = React.useCallback(
    async (params: Properties<Document>, nested?: boolean) => {
      if (!document) {
        throw new Error("Document not loaded yet");
      }

      const newDocument = await documents.create(
        {
          collectionId: nested ? undefined : document.collectionId,
          parentDocumentId: nested ? document.id : document.parentDocumentId,
          data: ProsemirrorDataHelper.getEmpty(),
          ...params,
        },
        {
          publish: document.isDraft ? undefined : true,
        }
      );

      return newDocument.url;
    },
    [document, documents]
  );

  // Sets the current document as active in the sidebar. In a split view only
  // the focused pane's document is active, updated as focus moves between the
  // panes.
  React.useEffect(() => {
    if (document && isPaneFocused) {
      ui.setActiveDocument(document);
    }
  }, [ui, document, isPaneFocused]);

  React.useEffect(() => {
    let isCanceled = false;

    async function fetchComments() {
      const fetchedComments = await comments.fetchAll({
        documentId: document?.id,
        limit: 100,
        direction: "ASC",
      });

      const hasUnresolvedThreads = fetchedComments.some(
        (comment) => !comment.parentCommentId && !comment.isResolved
      );

      if (!isCanceled && hasUnresolvedThreads) {
        ui.setRightSidebar("comments", pane);
      }
    }

    if (document) {
      // If we're attempting to update an archived, deleted, or otherwise
      // uneditable document then forward to the canonical read url.
      if (!missingPolicy && !can.update && isEditRoute) {
        history.push(document.url);
        return;
      }

      // Prevents unauthorized request to load share information for the document
      // when viewing a public share link
      if (can.read && !document.isDeleted && !revisionId) {
        if (team.commentingEnabled) {
          void fetchComments();
        }

        shares.fetchOne({ documentId: document.id }).catch((err) => {
          if (!(err instanceof NotFoundError)) {
            throw err;
          }
        });
      }
    }

    return () => {
      isCanceled = true;
    };
  }, [
    can.read,
    can.update,
    document,
    isEditRoute,
    comments,
    team,
    shares,
    revisionId,
    missingPolicy,
    pane,
  ]);

  // Auto-enter presentation mode when ?present=true query param is set
  React.useEffect(() => {
    if (document && query.has("present") && !ui.presentationData) {
      ui.setPresentingDocument(document);
    }
  }, [document, query, ui]);

  // Keep the address bar in sync when the document slug changes (e.g. after
  // naming a new doc). Use history.replace in an effect instead of a render-
  // time <Redirect> so the document editor stays mounted — unmounting would
  // re-trigger cursor-restore opacity hiding and multiplayer reconnect.
  const canonicalUrl = document
    ? updateDocumentPath(match.url, document)
    : undefined;
  React.useEffect(() => {
    if (!canonicalUrl || history.location.pathname === canonicalUrl) {
      return;
    }

    history.replace(
      patchLocation(history.location, {
        pathname: canonicalUrl,
      })
    );
  }, [canonicalUrl, history]);

  if (error) {
    return error instanceof OfflineError ? (
      <ErrorOffline />
    ) : error instanceof PaymentRequiredError ? (
      <Error402 />
    ) : error instanceof AuthorizationError ? (
      <Error403 documentId={documentSlug} />
    ) : error instanceof NotFoundError ? (
      <Error404 />
    ) : (
      <ErrorUnknown />
    );
  }

  if (can.read === false) {
    return <Error404 />;
  }

  if (!document || (revisionId && !revision)) {
    return (
      <>
        <Loading location={location} />
      </>
    );
  }

  const canEdit = can.update && !document.isArchived && !revisionId;
  const readOnly = !isEditing || !canEdit;

  return (
    <>
      {!revision && <MarkAsViewed document={document} />}
      <React.Fragment key={canEdit ? "edit" : "read"}>
        {children({
          document,
          revision,
          abilities: can,
          readOnly,
          onCreateLink,
        })}
      </React.Fragment>
    </>
  );
}

export default observer(DataLoader);
