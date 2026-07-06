import type { NodeSpec, NodeType } from "prosemirror-model";
import backspaceToParagraph from "../commands/backspaceToParagraph";
import { selectAll } from "../commands/selectAll";
import CodeFence from "./CodeFence";

export default class CodeBlock extends CodeFence {
  get name() {
    return "code_block";
  }

  get schema(): NodeSpec {
    const schema = super.schema;
    return {
      ...schema,
      parseDOM: schema.parseDOM?.map((rule) => ({
        ...rule,
        priority: 40,
      })),
    };
  }

  get markdownToken() {
    return "code_block";
  }

  /**
   * The triple-backtick input rule is fenced-code syntax and must always
   * produce a `code_fence` (the full-featured block with a title row), never a
   * `code_block`. Because `code_block` is registered ahead of `code_fence`, its
   * inherited input rule would otherwise win and create a title-less block.
   *
   * @returns an empty list of input rules.
   */
  inputRules() {
    return [];
  }

  keys({ type }: { type: NodeType }) {
    return {
      Backspace: backspaceToParagraph(type),
      "Mod-a": selectAll(type),
    };
  }
}
