import Storage from "@shared/utils/Storage";

const storageKey = "documentCursorPositions";

/** Maximum number of document cursor positions to retain locally. */
const maxEntries = 100;

type CursorPosition = {
  /** The ProseMirror document position of the cursor. */
  pos: number;
  /** The cursor offset from the scroll viewport top when recorded. */
  viewportOffset?: number;
  /** Unix timestamp (ms) when recorded, used for least-recently-used eviction. */
  updatedAt: number;
};

type CursorPositions = Record<string, CursorPosition>;

interface SetCursorPositionOptions {
  /** The cursor offset from the scroll viewport top when recorded. */
  viewportOffset?: number;
}

function read(): CursorPositions {
  return Storage.get(storageKey) ?? {};
}

/**
 * Get the last recorded cursor position for a document.
 *
 * @param documentId The document identifier.
 * @returns The last cursor position, or undefined if none has been recorded.
 */
export function getCursorPosition(documentId: string): number | undefined {
  return read()[documentId]?.pos;
}

/**
 * Get the cursor offset from the scroll viewport top for a document.
 *
 * @param documentId The document identifier.
 * @returns The cursor viewport offset, or undefined if none has been recorded.
 */
export function getCursorViewportOffset(
  documentId: string
): number | undefined {
  return read()[documentId]?.viewportOffset;
}

/**
 * Record the last cursor position for a document so that it can be restored the
 * next time the document is opened. The least recently updated entries are
 * evicted once the maximum number of stored positions is exceeded.
 *
 * @param documentId The document identifier.
 * @param pos The ProseMirror document position of the cursor.
 * @param options Additional cursor view metadata.
 */
export function setCursorPosition(
  documentId: string,
  pos: number,
  options?: SetCursorPositionOptions
): void {
  const positions = read();
  positions[documentId] = {
    pos,
    viewportOffset: options?.viewportOffset,
    updatedAt: Date.now(),
  };

  const ids = Object.keys(positions);
  if (ids.length > maxEntries) {
    ids
      .sort((a, b) => positions[a].updatedAt - positions[b].updatedAt)
      .slice(0, ids.length - maxEntries)
      .forEach((id) => delete positions[id]);
  }

  Storage.set(storageKey, positions);
}
