import { InputRule } from "prosemirror-inputrules";
import type { ParseSpec } from "prosemirror-markdown";
import type {
  Node as ProsemirrorNode,
  NodeType,
  NodeSpec,
  Schema,
} from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import stepListRule from "../rules/stepList";
import Node from "./Node";

const STEP_LIST_TRIGGER = /(?:^|\n)step\s+1\.\s$/i;

const createStepListItem = (schema: Schema) => {
  const { paragraph, step_list_item } = schema.nodes;

  if (!step_list_item) {
    return null;
  }

  return paragraph
    ? step_list_item.create({}, [paragraph.create()])
    : step_list_item.create();
};

const insertStepList = (type: NodeType, schema: Schema): Command => {
  return (state, dispatch) => {
    const step = createStepListItem(schema);

    if (!step) {
      return false;
    }

    const insertPos = state.selection.from;
    const tr = state.tr.replaceSelectionWith(type.create({}, [step]));

    dispatch?.(
      tr
        .setSelection(TextSelection.create(tr.doc, insertPos + 3))
        .scrollIntoView()
    );
    return true;
  };
};

export default class StepList extends Node {
  get name() {
    return "step_list";
  }

  get rulePlugins() {
    return [stepListRule];
  }

  get schema(): NodeSpec {
    return {
      group: "block",
      content: "step_list_item+",
      defining: true,
      parseDOM: [
        {
          tag: "ol.step-list",
          preserveWhitespace: "full",
        },
      ],
      toDOM: () => ["ol", { class: "step-list" }, 0],
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      step_list: () => insertStepList(type, schema),
    };
  }

  inputRules({ type, schema }: { type: NodeType; schema: Schema }) {
    return [
      new InputRule(STEP_LIST_TRIGGER, (state, match, start, end) => {
        if (!match) {
          return null;
        }

        const step = createStepListItem(schema);
        if (!step) {
          return null;
        }

        const typed = match[0];
        const trimmed = typed.trimStart();
        const deleteStart = start + (typed.length - trimmed.length);
        const tr = state.tr
          .delete(deleteStart, end)
          .replaceSelectionWith(type.create({}, [step]));

        return tr
          .setSelection(TextSelection.create(tr.doc, deleteStart + 3))
          .scrollIntoView();
      }),
    ];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    node.forEach((step, _offset, index) => {
      state.wrapBlock("", `Step ${index + 1}. `, node, () =>
        state.render(step, node, index)
      );
    });
  }

  parseMarkdown(): ParseSpec | void {
    return { block: "step_list" };
  }
}
