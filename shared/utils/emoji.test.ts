import { getEmojiId, search } from "./emoji";

describe("search", () => {
  it("finds a custom emoji when the query omits a character", () => {
    const results = search({
      query: "oulin",
      customEmojis: [{ id: "custom-outline", name: "outline" }],
    });

    expect(results.find((emoji) => emoji.id === "custom-outline")?.name).toBe(
      "outline"
    );
  });

  it("ranks a close prefix match ahead of mid-word matches", () => {
    const results = search({
      query: "oulin",
      customEmojis: [
        { id: "custom-bowling", name: "bowling" },
        { id: "custom-online", name: "online" },
        { id: "custom-outline", name: "outline" },
      ],
    });
    const customResults = results.filter((emoji) =>
      emoji.id.startsWith("custom-")
    );

    expect(customResults[0]?.name).toBe("outline");
  });

  it("ranks exact and prefix matches ahead of fuzzy matches", () => {
    const results = search({
      query: "party",
      customEmojis: [
        { id: "custom-fuzzy", name: "office_party" },
        { id: "custom-prefix", name: "party_parrot" },
        { id: "custom-exact", name: "party" },
      ],
    });
    const customResults = results.filter((emoji) =>
      emoji.id.startsWith("custom-")
    );

    expect(customResults.map((emoji) => emoji.name)).toEqual([
      "party",
      "party_parrot",
      "office_party",
    ]);
  });

  it("ranks an exact built-in shortcode first", () => {
    expect(search({ query: "tada" })[0]?.id).toBe("tada");
  });

  it("matches spelling mistakes", () => {
    const results = search({
      query: "celbration",
      customEmojis: [{ id: "custom-celebration", name: "celebration" }],
    });

    expect(results.some((emoji) => emoji.id === "custom-celebration")).toBe(
      true
    );
  });

  it("ranks the most recently used emoji first by default", () => {
    const results = search({
      query: "",
      recentEmoji: "custom-recent",
      frequentEmojis: ["custom-frequent", "custom-recent"],
      customEmojis: [
        {
          id: "custom-frequent",
          name: "frequent",
          createdAt: "2026-08-06T00:00:00.000Z",
        },
        {
          id: "custom-recent",
          name: "recent",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });

    expect(results.slice(0, 2).map((emoji) => emoji.id)).toEqual([
      "custom-recent",
      "custom-frequent",
    ]);
  });

  it("ranks frequently used emoji by total usage order by default", () => {
    const results = search({
      query: "",
      frequentEmojis: ["custom-most-used", "custom-less-used"],
      customEmojis: [
        { id: "custom-less-used", name: "less_used" },
        { id: "custom-most-used", name: "most_used" },
      ],
    });

    expect(results.slice(0, 2).map((emoji) => emoji.id)).toEqual([
      "custom-most-used",
      "custom-less-used",
    ]);
  });

  it("ranks unused custom emoji by most recent upload by default", () => {
    const results = search({
      query: "",
      customEmojis: [
        {
          id: "custom-older",
          name: "older",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "custom-newer",
          name: "newer",
          createdAt: "2026-08-06T00:00:00.000Z",
        },
      ],
    });

    expect(results.slice(0, 2).map((emoji) => emoji.id)).toEqual([
      "custom-newer",
      "custom-older",
    ]);
  });
});

describe("getEmojiId", () => {
  it("returns the built-in id for a native emoji", () => {
    expect(getEmojiId("😀")).toBe("grinning");
  });
});
