import { capitalize } from "es-toolkit/compat";
import { observer } from "mobx-react";
import { useCallback, useMemo, useEffect, useState } from "react";
import { emojiMartToGemoji, snakeCase } from "@shared/editor/lib/emoji";
import { search as emojiSearch } from "@shared/utils/emoji";
import EmojiMenuItem from "./EmojiMenuItem";
import type { Props as SuggestionsMenuProps } from "./SuggestionsMenu";
import SuggestionsMenu from "./SuggestionsMenu";
import useStores from "~/hooks/useStores";
import { determineIconType } from "@shared/utils/icon";
import { IconType } from "@shared/types";
import { allEmojiFrequencies } from "~/utils/emoji";

type Emoji = {
  name: string;
  title: string;
  emoji: string;
  description: string;
  attrs: { "data-name": string };
};

type Props = Omit<
  SuggestionsMenuProps<Emoji>,
  "renderMenuItem" | "items" | "embeds"
>;

const EmojiMenu = (props: Props) => {
  const { emojis } = useStores();
  const { search = "" } = props;
  const [recentEmoji, setRecentEmoji] = useState(
    () => allEmojiFrequencies.recent
  );
  const [frequentEmojis, setFrequentEmojis] = useState(
    () => allEmojiFrequencies.frequent
  );

  useEffect(() => {
    if (!props.isActive) {
      return;
    }

    if (search) {
      void emojis.fetchPage({ query: search });
      return;
    }

    void emojis.fetchPage();
  }, [emojis, props.isActive, search]);

  useEffect(() => {
    if (!props.isActive) {
      return;
    }

    const recent = allEmojiFrequencies.recent;
    const frequent = allEmojiFrequencies.frequent;
    setRecentEmoji(recent);
    setFrequentEmojis(frequent);

    const customEmojiIds = new Set(
      [recent, ...frequent].filter(
        (value): value is string =>
          !!value && determineIconType(value) === IconType.Custom
      )
    );
    void Promise.all(
      Array.from(customEmojiIds).map((id) =>
        emojis.fetch(id).catch(() => undefined)
      )
    );
  }, [emojis, props.isActive]);

  const items = useMemo(
    () =>
      emojiSearch({
        customEmojis: emojis.orderedData,
        query: search,
        recentEmoji,
        frequentEmojis,
      })
        .map((item) => {
          // We snake_case the shortcode for backwards compatability with gemoji to
          // avoid multiple formats being written into documents.
          const id = emojiMartToGemoji[item.id] || item.id;
          const type = determineIconType(id);
          const value = type === IconType.Custom ? id : snakeCase(id);
          const emoji = item.value;

          return {
            name: "emoji",
            title: emoji,
            description:
              type === IconType.Custom
                ? item.name
                : capitalize(item.name.toLowerCase()),
            emoji,
            attrs: { "data-name": value },
          };
        })
        .slice(0, 15),
    [search, emojis.orderedData, frequentEmojis, recentEmoji]
  );

  const handleSelect = useCallback(
    (item: Emoji) => allEmojiFrequencies.track(item.emoji),
    []
  );

  const renderMenuItem = useCallback(
    (item, _index, options) => (
      <EmojiMenuItem {...options} title={item.description} emoji={item.emoji} />
    ),
    []
  );

  return (
    <SuggestionsMenu
      {...props}
      filterable={false}
      renderMenuItem={renderMenuItem}
      items={items}
      onSelect={handleSelect}
    />
  );
};

export default observer(EmojiMenu);
