import { beforeEach, describe, expect, it, vi } from "vitest";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";

describe("SearchesStore#clearRecent", () => {
  beforeEach(() => {
    stores.searches.clear();
    vi.mocked(client.post).mockReset();
  });

  it("adds an app search to the recent searches", () => {
    const search = stores.searches.addRecent("new search");

    expect(search.source).toBe("app");
    expect(stores.searches.recent).toContain(search);
  });

  it("clears app searches from the server and local store", async () => {
    const appSearch = stores.searches.add({
      id: "app-search",
      query: "app query",
      source: "app",
      createdAt: "2024-01-02T00:00:00.000Z",
    });
    const apiSearch = stores.searches.add({
      id: "api-search",
      query: "api query",
      source: "api",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    vi.mocked(client.post).mockResolvedValueOnce({ success: true });

    await stores.searches.clearRecent();

    expect(client.post).toHaveBeenCalledWith("/searches.deleteAll");
    expect(stores.searches.get(appSearch.id)).toBeUndefined();
    expect(stores.searches.get(apiSearch.id)).toBe(apiSearch);
  });
});
