import { decodeURIComponentSafe } from "~/utils/urls";

interface ParsedSearchQuery {
  input: string;
  query: string | undefined;
}

/**
 * Parses a search query while preserving the exact value shown in the input.
 *
 * @param value the encoded query value from the route.
 * @returns the input value and normalized query used for searching.
 */
export function parseSearchQuery(value: string): ParsedSearchQuery {
  const input = decodeURIComponentSafe(value);
  const normalizedQuery = input.trim();

  return {
    input,
    query: normalizedQuery || undefined,
  };
}
