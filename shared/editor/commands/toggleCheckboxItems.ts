import type { Node, NodeType } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { findParentNode } from "../queries/findParentNode";

/**
 * A prosemirror command to cycle checkbox items at the current selection through
 * three states: not started → in progress → done → not started.
 * When multiple items are selected, advances them together as a group.
 *
 * @param type The checkbox item node type.
 * @returns A prosemirror command.
 */
export function toggleCheckboxItems(type: NodeType): Command {
  return (state, dispatch) => {
    const { empty, from, to } = state.selection;

    // If selection spans multiple nodes, find all checkbox items in range
    if (!empty) {
      const checkboxes: Array<{ pos: number; node: Node }> = [];

      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type === type) {
          checkboxes.push({ pos, node });
          return false; // Don't descend into checkbox items
        }
        return true;
      });

      if (checkboxes.length === 0) {
        return false;
      }

      // If any are done → uncheck all; if any are in-progress → done all; else → in-progress all
      const anyChecked = checkboxes.some((cb) => cb.node.attrs.checked);
      const anyInProgress = !anyChecked && checkboxes.some((cb) => cb.node.attrs.inProgress);
      const newChecked = anyInProgress;
      const newInProgress = !anyChecked && !anyInProgress;

      if (dispatch) {
        let tr = state.tr;
        // Apply in reverse order to preserve positions
        for (let i = checkboxes.length - 1; i >= 0; i--) {
          const { pos, node } = checkboxes[i];
          tr = tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            checked: newChecked,
            inProgress: newInProgress,
          });
        }
        dispatch(tr);
      }
      return true;
    }

    // Single cursor: toggle the parent checkbox item
    const listItem = findParentNode((node) => node.type === type)(
      state.selection
    );

    if (!listItem) {
      return false;
    }

    const { checked, inProgress } = listItem.node.attrs;
    // Cycle: not started → in progress → done → not started
    const newChecked = !!inProgress && !checked;
    const newInProgress = !checked && !inProgress;

    dispatch?.(
      state.tr.setNodeMarkup(listItem.pos, undefined, {
        checked: newChecked,
        inProgress: newInProgress,
      })
    );
    return true;
  };
}
