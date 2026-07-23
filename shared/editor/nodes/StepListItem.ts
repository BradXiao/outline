import type { ParseSpec } from "prosemirror-markdown";
import type {
  Node as ProsemirrorNode,
  NodeSpec,
  NodeType,
  Schema,
} from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { Plugin, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import { findParentNodeClosestToPos } from "../queries/findParentNode";
import Node from "./Node";

const createStepListItem = (schema: Schema, type: NodeType) => {
  const { paragraph } = schema.nodes;

  return paragraph ? type.create({}, [paragraph.create()]) : type.create();
};

const getStepItem = (state: EditorState, type: NodeType) =>
  findParentNodeClosestToPos(
    state.selection.$from,
    (node) => node.type === type
  );

const getStepList = (state: EditorState, type: NodeType) =>
  findParentNodeClosestToPos(
    state.selection.$from,
    (node) => node.type === type
  );

const isInEmptyStepParagraph = (state: EditorState, stepDepth: number) => {
  const { paragraph } = state.schema.nodes;

  return (
    !!paragraph &&
    state.selection.$from.parent.type === paragraph &&
    state.selection.$from.parent.content.size === 0 &&
    state.selection.$from.depth === stepDepth + 1
  );
};

const closeStepList =
  (type: NodeType, schema: Schema): Command =>
  (state, dispatch) => {
    if (!state.selection.empty) {
      return false;
    }

    const step = getStepItem(state, type);
    const { paragraph, step_list } = schema.nodes;

    if (!step || !paragraph || !step_list) {
      return false;
    }

    const title = step.node.firstChild;
    const isInTitle =
      state.selection.$from.parent.type === paragraph &&
      state.selection.$from.depth === step.depth + 1 &&
      state.selection.$from.before(step.depth + 1) === step.start;
    const isEmptyTitle =
      isInTitle &&
      step.node.childCount === 1 &&
      title?.type === paragraph &&
      title.content.size === 0;

    if (!isEmptyTitle) {
      return false;
    }

    const list = getStepList(state, step_list);
    if (!list) {
      return false;
    }

    const stepIndex = state.selection.$from.index(list.depth);

    if (list.node.childCount === 1) {
      let tr = state.tr.replaceWith(
        list.pos,
        list.pos + list.node.nodeSize,
        paragraph.create()
      );
      tr = tr
        .setSelection(TextSelection.create(tr.doc, list.pos + 1))
        .scrollIntoView();

      dispatch?.(tr);
      return true;
    }

    if (stepIndex !== list.node.childCount - 1) {
      return false;
    }

    const listEnd = list.pos + list.node.nodeSize;
    let tr = state.tr.delete(step.pos, step.pos + step.node.nodeSize);
    const insertPos = tr.mapping.map(listEnd, -1);
    tr = tr.insert(insertPos, paragraph.create());

    dispatch?.(
      tr
        .setSelection(TextSelection.create(tr.doc, insertPos + 1))
        .scrollIntoView()
    );
    return true;
  };

const insertNextStep =
  (type: NodeType, schema: Schema): Command =>
  (state, dispatch) => {
    if (!state.selection.empty) {
      return false;
    }

    const step = getStepItem(state, type);
    if (!step) {
      return false;
    }
    if (!isInEmptyStepParagraph(state, step.depth)) {
      return false;
    }

    const paragraphDepth = state.selection.$from.depth;
    const paragraphStart = state.selection.$from.before(paragraphDepth);
    const paragraphEnd = state.selection.$from.after(paragraphDepth);
    const stepEnd = step.pos + step.node.nodeSize;
    let tr = state.tr.delete(paragraphStart, paragraphEnd);
    const insertPos = tr.mapping.map(stepEnd, -1);
    tr = tr.insert(insertPos, createStepListItem(schema, type));

    dispatch?.(
      tr
        .setSelection(TextSelection.create(tr.doc, insertPos + 2))
        .scrollIntoView()
    );
    return true;
  };

const insertSubtitle = (
  state: EditorState,
  dispatch: EditorView["dispatch"] | undefined,
  type: NodeType,
  schema: Schema
) => {
  if (!state.selection.empty) {
    return false;
  }

  const step = getStepItem(state, type);
  if (!step) {
    return false;
  }

  const { paragraph, step_list_subtitle } = schema.nodes;
  const isInTitle =
    !!paragraph &&
    state.selection.$from.parent.type === paragraph &&
    state.selection.$from.depth === step.depth + 1 &&
    state.selection.$from.before(step.depth + 1) === step.start;
  const hasSubtitle =
    !!step_list_subtitle &&
    step.node.childCount > 1 &&
    step.node.child(1).type === step_list_subtitle;

  if (
    !isInTitle ||
    !step.node.firstChild ||
    !step_list_subtitle ||
    hasSubtitle
  ) {
    return false;
  }

  const insertPos = step.start + step.node.firstChild.nodeSize;
  const tr = state.tr.insert(insertPos, step_list_subtitle.create());

  dispatch?.(
    tr
      .setSelection(TextSelection.create(tr.doc, insertPos + 1))
      .scrollIntoView()
  );
  return true;
};

const splitWithinStep =
  (type: NodeType, schema: Schema): Command =>
  (state, dispatch) => {
    if (insertSubtitle(state, dispatch, type, schema)) {
      return true;
    }

    if (!state.selection.empty) {
      return false;
    }

    dispatch?.(state.tr.split(state.selection.to).scrollIntoView());
    return true;
  };

const handleEnter =
  (type: NodeType, schema: Schema): Command =>
  (state, dispatch) => {
    if (closeStepList(type, schema)(state, dispatch)) {
      return true;
    }

    return insertNextStep(type, schema)(state, dispatch);
  };

export default class StepListItem extends Node {
  get name() {
    return "step_list_item";
  }

  get schema(): NodeSpec {
    return {
      group: "block",
      content: "paragraph step_list_subtitle? block*",
      defining: true,
      draggable: true,
      parseDOM: [
        {
          tag: "li.step-list-item",
          preserveWhitespace: "full",
          contentElement: (dom: Element) =>
            (dom as HTMLElement).querySelector(".step-list-body") || dom,
        },
      ],
      toDOM: () => [
        "li",
        { class: "step-list-item" },
        ["div", { class: "step-list-marker", "aria-hidden": "true" }],
        ["div", { class: "step-list-body" }, 0],
      ],
    };
  }

  get plugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            const type = view.state.schema.nodes[this.name];
            if (!type) {
              return false;
            }

            const step = getStepItem(view.state, type);
            if (!step) {
              return false;
            }

            if (event.key === "Enter" && !event.shiftKey) {
              const handled = handleEnter(type, view.state.schema)(
                view.state,
                view.dispatch
              );

              if (handled) {
                event.preventDefault();
              }

              return handled;
            }

            if (event.key === "Enter" && event.shiftKey) {
              const handled = splitWithinStep(type, view.state.schema)(
                view.state,
                view.dispatch
              );

              if (handled) {
                event.preventDefault();
              }

              return handled;
            }

            return false;
          },
        },
      }),
    ];
  }

  keys({
    type,
    schema,
  }: {
    type: NodeType;
    schema: Schema;
  }): Record<string, Command> {
    return {
      Enter: handleEnter(type, schema),
      "Shift-Enter": splitWithinStep(type, schema),
    };
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    let index = 0;

    // Title paragraph, rendered on the same line as the "Step N." marker.
    state.render(node.child(index), node, index);
    index += 1;

    // Optional subtitle, prefixed with ">> " on the following line.
    const next = index < node.childCount ? node.child(index) : null;
    if (next?.type.name === "step_list_subtitle") {
      state.flushClose(1);
      state.render(next, node, index);
      index += 1;
    }

    for (; index < node.childCount; index++) {
      state.render(node.child(index), node, index);
    }
  }

  parseMarkdown(): ParseSpec | void {
    return { block: "step_list_item" };
  }
}
