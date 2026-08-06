import type { MenuItem } from "@shared/editor/types";

/**
 * Returns whether a suggestion has enough content to be rendered.
 *
 * @param item suggestion to check.
 * @returns true when the suggestion can be rendered.
 */
export function isRenderableSuggestion(
  item: Pick<MenuItem, "name" | "title">
): boolean {
  return item.name === "separator" || !!item.title;
}
