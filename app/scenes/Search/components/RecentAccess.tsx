import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import { s } from "@shared/styles";
import { errToString } from "@shared/utils/error";
import type Document from "~/models/Document";
import ArrowKeyNavigation from "~/components/ArrowKeyNavigation";
import ButtonLink from "~/components/ButtonLink";
import DocumentListItem from "~/components/DocumentListItem";
import { ConditionalFade } from "~/components/Fade";
import useStores from "~/hooks/useStores";

type Props = {
  /** Callback when the Escape key is pressed while navigating the list */
  onEscape?: (ev: React.KeyboardEvent<HTMLDivElement>) => void;
};

/**
 * Lists the current user's most recently accessed documents on the empty
 * search page.
 */
function RecentAccess({ onEscape }: Props) {
  const { documents } = useStores();
  const { t } = useTranslation();
  const [items, setItems] = React.useState<Document[]>([]);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isClearing, setIsClearing] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    void documents.fetchRecentAccess({ limit: 15 }).then((results) => {
      if (cancelled) {
        return;
      }

      setItems(results);
      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [documents]);

  const handleClear = React.useCallback(async () => {
    setIsClearing(true);

    try {
      await documents.clearRecentAccess();
      setItems([]);
    } catch (error) {
      toast.error(errToString(error));
    } finally {
      setIsClearing(false);
    }
  }, [documents]);

  const content = items.length ? (
    <>
      <Header>
        <Heading>{t("Recent access")}</Heading>
        <ClearButton type="button" disabled={isClearing} onClick={handleClear}>
          {t("Clear all")}
        </ClearButton>
      </Header>
      <StyledArrowKeyNavigation
        onEscape={onEscape}
        aria-label={t("Recent access")}
        items={items}
      >
        {() =>
          items.map((document) => (
            <DocumentListItem
              key={document.id}
              document={document}
              showCollection
            />
          ))
        }
      </StyledArrowKeyNavigation>
    </>
  ) : null;

  return <ConditionalFade animate={!isLoaded}>{content}</ConditionalFade>;
}

const Heading = styled.h2`
  font-weight: 500;
  font-size: 14px;
  line-height: 1.5;
  color: ${s("textSecondary")};
  margin: 12px 0 0;
`;

const Header = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
`;

const ClearButton = styled(ButtonLink)`
  color: ${s("textTertiary")};
  font-size: 13px;

  &:hover:not(:disabled) {
    color: ${s("text")};
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

const StyledArrowKeyNavigation = styled(ArrowKeyNavigation)`
  padding: 0;
  margin-top: 8px;
`;

export default observer(RecentAccess);
