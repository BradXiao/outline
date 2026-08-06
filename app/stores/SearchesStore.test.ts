import stores from "~/stores";

describe("SearchesStore#addRecent", () => {
  beforeEach(() => {
    stores.searches.clear();
  });

  it("adds an app search to the recent searches", () => {
    const search = stores.searches.addRecent("new search");

    expect(search.source).toBe("app");
    expect(stores.searches.recent).toContain(search);
  });
});
