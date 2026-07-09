import type { Node as ProsemirrorNode } from "prosemirror-model";
import { CellSelection, TableMap } from "prosemirror-tables";
import {
  createEditorState,
  doc,
  p,
  schema,
  table,
  tr,
  td,
} from "@shared/test/editor";
import { ColumnSelection } from "../selection/ColumnSelection";
import { RowSelection } from "../selection/RowSelection";
import Table from "./Table";

type SelectionKind = "table" | "row" | "column" | "partial";
type TableShortcut = "Backspace" | "Delete";

interface TableInfo {
  tableNode: ProsemirrorNode;
  tablePos: number;
}

/**
 * Finds the first table node in the test document.
 *
 * @param state the editor state.
 * @returns table node and its document position.
 * @throws if the table node cannot be found.
 */
function getTableInfo(state: ReturnType<typeof createEditorState>): TableInfo {
  let tableNode: ProsemirrorNode | null = null;
  let tablePos = -1;

  state.doc.descendants((node, pos) => {
    if (node.type === schema.nodes.table) {
      tableNode = node;
      tablePos = pos;
      return false;
    }

    return true;
  });

  if (!tableNode || tablePos === -1) {
    throw new Error("Expected table node in test document");
  }

  return {
    tableNode,
    tablePos,
  };
}

/**
 * Creates an editor state with the requested table selection.
 *
 * @param selectionKind the table selection shape to apply.
 * @returns editor state with the requested selection.
 */
function createState(selectionKind: SelectionKind) {
  const testDoc = doc([
    table([
      tr([td("A1"), td("A2")]),
      tr([td("B1"), td("B2")]),
    ]),
    p("After"),
  ]);
  let state = createEditorState(testDoc);
  const { tableNode, tablePos } = getTableInfo(state);
  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const $topLeft = state.doc.resolve(
    tableStart + map.positionAt(0, 0, tableNode)
  );
  const $topRight = state.doc.resolve(
    tableStart + map.positionAt(0, map.width - 1, tableNode)
  );
  const $bottomLeft = state.doc.resolve(
    tableStart + map.positionAt(map.height - 1, 0, tableNode)
  );
  const $bottomRight = state.doc.resolve(
    tableStart + map.positionAt(map.height - 1, map.width - 1, tableNode)
  );

  const selection =
    selectionKind === "table"
      ? new CellSelection($topLeft, $bottomRight)
      : selectionKind === "row"
        ? RowSelection.rowSelection($topLeft, $topRight)
        : selectionKind === "column"
          ? ColumnSelection.colSelection($topLeft, $bottomLeft)
          : new CellSelection($topLeft);

  state = state.apply(state.tr.setSelection(selection));

  return state;
}

/**
 * Runs a table shortcut against the requested selection state.
 *
 * @param shortcut the key binding name.
 * @param selectionKind the table selection shape to apply.
 * @returns whether the command handled the shortcut and the resulting state.
 */
function runShortcut(shortcut: TableShortcut, selectionKind: SelectionKind) {
  const extension = new Table();
  const command = extension.keys({ type: schema.nodes.table, schema })[shortcut];

  if (!command) {
    throw new Error(`Expected ${shortcut} table shortcut to be defined`);
  }

  let state = createState(selectionKind);
  const handled = command(state, (tr) => {
    state = state.apply(tr);
  });

  return { handled, state };
}

/**
 * Checks whether the document still contains a table node.
 *
 * @param state the editor state.
 * @returns true if a table exists.
 */
function hasTableNode(state: ReturnType<typeof createEditorState>) {
  let hasTable = false;

  state.doc.descendants((node) => {
    if (node.type === schema.nodes.table) {
      hasTable = true;
      return false;
    }

    return true;
  });

  return hasTable;
}

/**
 * Returns the first table node in the state after a shortcut runs.
 *
 * @param state the editor state.
 * @returns the first table node, if present.
 */
function getFirstTableNode(state: ReturnType<typeof createEditorState>) {
  if (!hasTableNode(state)) {
    return undefined;
  }

  return getTableInfo(state).tableNode;
}

describe.each(["Backspace", "Delete"] as const)(
  "%s table shortcut",
  (shortcut) => {
    it("deletes the whole table when the entire table is selected", () => {
      const { handled, state } = runShortcut(shortcut, "table");

      expect(handled).toBe(true);
      expect(hasTableNode(state)).toBe(false);
      expect(state.doc.textContent).toContain("After");
    });

    it("deletes the row when an entire row is selected", () => {
      const { handled, state } = runShortcut(shortcut, "row");
      const resultTable = getFirstTableNode(state);

      expect(handled).toBe(true);
      expect(resultTable).toBeDefined();
      expect(resultTable?.childCount).toBe(1);
      expect(resultTable?.textContent).toContain("B1");
      expect(resultTable?.textContent).not.toContain("A1");
    });

    it("deletes the column when an entire column is selected", () => {
      const { handled, state } = runShortcut(shortcut, "column");
      const resultTable = getFirstTableNode(state);

      expect(handled).toBe(true);
      expect(resultTable).toBeDefined();
      expect(resultTable?.firstChild?.childCount).toBe(1);
      expect(resultTable?.textContent).toContain("A2");
      expect(resultTable?.textContent).not.toContain("A1");
    });

    it("does not delete a row or column for a non-row, non-column cell selection", () => {
      const { handled, state } = runShortcut(shortcut, "partial");
      const resultTable = getFirstTableNode(state);

      expect(handled).toBe(true);
      expect(resultTable).toBeDefined();
      expect(resultTable?.childCount).toBe(2);
      expect(resultTable?.firstChild?.childCount).toBe(2);
    });
  }
);
