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
});

describe("getEmojiId", () => {
  it("returns the built-in id for a native emoji", () => {
    expect(getEmojiId("😀")).toBe("grinning");
  });
});
