import type { MenuItem } from "@shared/editor/types";
import { isRenderableSuggestion } from "./isRenderableSuggestion";

describe("isRenderableSuggestion", () => {
  it("excludes suggestions without a title", () => {
    const item: MenuItem = {
      name: "mention",
    };

    expect(isRenderableSuggestion(item)).toBe(false);
  });

  it("removes invisible gaps from the keyboard order", () => {
    const items: MenuItem[] = [
      { name: "mention", title: "Document A" },
      { name: "mention" },
      { name: "mention", title: "Document B" },
    ];

    expect(
      items.filter(isRenderableSuggestion).map((item) => item.title)
    ).toEqual(["Document A", "Document B"]);
  });

  it("includes titled suggestions and separators", () => {
    const item: MenuItem = {
      name: "mention",
      title: "Document A",
    };
    const separator: MenuItem = {
      name: "separator",
    };

    expect(isRenderableSuggestion(item)).toBe(true);
    expect(isRenderableSuggestion(separator)).toBe(true);
  });
});
