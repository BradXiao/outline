import { parseSearchQuery } from "./utils";

describe("parseSearchQuery", () => {
  it("preserves trailing whitespace in the input value", () => {
    expect(parseSearchQuery("search ")).toEqual({
      input: "search ",
      query: "search",
    });
  });

  it("does not search for whitespace-only input", () => {
    expect(parseSearchQuery("  ")).toEqual({
      input: "  ",
      query: undefined,
    });
  });
});
