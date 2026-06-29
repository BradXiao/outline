import type Token from "markdown-it/lib/token.mjs";
import type {
  NodeSpec,
  Node as ProsemirrorNode,
  NodeType,
} from "prosemirror-model";
import {
  splitListItem,
  sinkListItem,
  liftListItem,
} from "prosemirror-schema-list";
import { Plugin } from "prosemirror-state";
import { toggleCheckboxItems } from "../commands/toggleCheckboxItems";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import checkboxRule from "../rules/checkboxes";
import { CheckboxItemView } from "./CheckboxItemView";
import Node from "./Node";

export default class CheckboxItem extends Node {
  get name() {
    return "checkbox_item";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        checked: {
          default: false,
        },
        inProgress: {
          default: false,
        },
      },
      content: "block+",
      defining: true,
      draggable: true,
      parseDOM: [
        {
          tag: `li[data-type="${this.name}"]`,
          getAttrs: (dom: HTMLLIElement) => ({
            checked: dom.className.includes("checked"),
            inProgress: dom.className.includes("in-progress"),
          }),
        },
      ],
      // Rendering and interaction are handled by CheckboxItemView; this spec is
      // only used for serialization (e.g. clipboard, HTML export).
      toDOM: (node: ProsemirrorNode) => {
        const classNames: string[] = [];
        if (node.attrs.checked) {
          classNames.push("checked");
        } else if (node.attrs.inProgress) {
          classNames.push("in-progress");
        }
        const ariaChecked = node.attrs.checked
          ? "true"
          : node.attrs.inProgress
            ? "mixed"
            : "false";

        return [
          "li",
          {
            "data-type": this.name,
            class: classNames.length > 0 ? classNames.join(" ") : undefined,
          },
          [
            "span",
            { contentEditable: "false" },
            [
              "span",
              {
                class: "checkbox",
                role: "checkbox",
                "aria-checked": ariaChecked,
              },
            ],
          ],
          ["div", 0],
        ];
      },
    };
  }

  get rulePlugins() {
    return [checkboxRule];
  }

  get plugins() {
    return [
      new Plugin({
        props: {
          nodeViews: {
            [this.name]: (node, view, getPos) =>
              new CheckboxItemView(node, view, getPos),
          },
        },
      }),
    ];
  }

  commands({ type }: { type: NodeType }) {
    return {
      indentCheckboxList: () => sinkListItem(type),
      outdentCheckboxList: () => liftListItem(type),
    };
  }

  keys({ type }: { type: NodeType }) {
    return {
      Enter: splitListItem(type, {
        checked: false,
        inProgress: false,
      }),
      Tab: sinkListItem(type),
      "Mod-Enter": toggleCheckboxItems(type),
      "Shift-Tab": liftListItem(type),
      "Mod-]": sinkListItem(type),
      "Mod-[": liftListItem(type),
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    state.append(node.attrs.checked ? "[x] " : node.attrs.inProgress ? "[-] " : "[ ] ");
    if (state.inTable) {
      node.forEach((block, _, i) => {
        if (i > 0) {
          state.append(" ");
        }
        state.renderInline(block);
      });
      return;
    }
    state.renderContent(node);
  }

  parseMarkdown() {
    return {
      block: "checkbox_item",
      getAttrs: (tok: Token) => ({
        checked: tok.attrGet("checked") ? true : undefined,
        inProgress: tok.attrGet("inProgress") ? true : undefined,
      }),
    };
  }
}
