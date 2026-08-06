import { beforeEach, describe, expect, it, vi } from "vitest";
import stores from "~/stores";
import { client } from "~/utils/ApiClient";

describe("DocumentsStore#fetchRecentAccess", () => {
  beforeEach(() => {
    stores.documents.clear();
    vi.mocked(client.post).mockReset();
  });

  it("requests documents.viewed sorted by last access time and preserves order", async () => {
    vi.mocked(client.post).mockResolvedValueOnce({
      data: [
        {
          id: "doc-recent",
          title: "Recent",
          url: "/doc/recent",
          createdAt: "2024-01-02T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          lastViewedAt: "2024-01-03T00:00:00.000Z",
        },
        {
          id: "doc-older",
          title: "Older",
          url: "/doc/older",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
          lastViewedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      policies: [],
    });

    const results = await stores.documents.fetchRecentAccess();

    expect(client.post).toHaveBeenCalledWith("/documents.viewed", {
      sort: "updatedAt",
      direction: "DESC",
      limit: 15,
    });
    expect(results.map((document) => document.id)).toEqual([
      "doc-recent",
      "doc-older",
    ]);
    expect(results[0]).toBe(stores.documents.get("doc-recent"));
  });

  it("returns an empty list when the user has no views", async () => {
    vi.mocked(client.post).mockResolvedValueOnce({
      data: [],
      policies: [],
    });

    const results = await stores.documents.fetchRecentAccess();

    expect(results).toEqual([]);
  });

  it("clears recent access from the server and cached documents", async () => {
    const recentlyViewed = stores.documents.add({
      id: "doc-recent",
      title: "Recent",
      url: "/doc/recent",
      createdAt: "2024-01-02T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
      lastViewedAt: "2024-01-03T00:00:00.000Z",
    });
    const notViewed = stores.documents.add({
      id: "doc-not-viewed",
      title: "Not viewed",
      url: "/doc/not-viewed",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    vi.mocked(client.post).mockResolvedValueOnce({ success: true });

    await stores.documents.clearRecentAccess();

    expect(client.post).toHaveBeenCalledWith("/views.deleteAll");
    expect(recentlyViewed.lastViewedAt).toBeUndefined();
    expect(stores.documents.recentlyViewed).toEqual([]);
    expect(stores.documents.get(notViewed.id)).toBe(notViewed);
  });
});
