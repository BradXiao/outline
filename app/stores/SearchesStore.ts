import { uniqBy } from "es-toolkit/compat";
import { action, computed } from "mobx";
import { v4 as uuidv4 } from "uuid";
import SearchQuery from "~/models/SearchQuery";
import { client } from "~/utils/ApiClient";
import type RootStore from "./RootStore";
import Store, { RPCAction } from "./base/Store";

export default class SearchesStore extends Store<SearchQuery> {
  actions = [RPCAction.List, RPCAction.Delete];

  constructor(rootStore: RootStore) {
    super(rootStore, SearchQuery);
  }

  /**
   * Adds a search performed in the app to the local recent-search list.
   *
   * @param query the normalized search query.
   * @returns the newly added search query.
   */
  addRecent(query: string): SearchQuery {
    return this.add({
      id: uuidv4(),
      query,
      source: "app",
      createdAt: new Date().toISOString(),
    });
  }

  @computed
  get recent(): SearchQuery[] {
    return uniqBy(this.orderedData, "query")
      .filter((search) => search.source === "app")
      .slice(0, 8);
  }

  /**
   * Clears all recent searches made in the app.
   *
   * @returns a promise that resolves when the searches have been cleared.
   */
  @action
  clearRecent = async (): Promise<void> => {
    this.isSaving = true;

    try {
      await client.post("/searches.deleteAll");
      this.removeAll((search) => search.source === "app");
    } finally {
      this.isSaving = false;
    }
  };
}
