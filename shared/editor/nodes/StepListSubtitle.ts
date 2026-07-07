import type { ParseSpec } from "prosemirror-markdown";
import type { Node as ProsemirrorNode, NodeSpec } from "prosemirror-model";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import Node from "./Node";

export default class StepListSubtitle extends Node {
  get name() {
    return "step_list_subtitle";
  }

  get schema(): NodeSpec {
    return {
      group: "block",
      content: "inline*",
      defining: true,
      parseDOM: [
        {
          tag: "p.step-list-subtitle",
          preserveWhitespace: "full",
        },
      ],
      toDOM: () => ["p", { class: "step-list-subtitle" }, 0],
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.write(">> ");
    state.renderInline(node);
    state.closeBlock(node);
  }

  parseMarkdown(): ParseSpec | void {
    return { block: "step_list_subtitle" };
  }
}
