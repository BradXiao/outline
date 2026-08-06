import type { Node as ProsemirrorNode } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import {
  createEditorState,
  doc,
  extensionManager,
  p,
  schema,
} from "@shared/test/editor";
import StepList from "./StepList";
import StepListItem from "./StepListItem";

const { step_list, step_list_item, step_list_subtitle } = schema.nodes;

const serializer = extensionManager.serializer();
const parser = extensionManager.parser({
  schema,
  plugins: extensionManager.rulePlugins,
});

function step(text = "") {
  return step_list_item.create(null, [p(text)]);
}

function posInsideFirst(
  node: ProsemirrorNode,
  predicate: (child: ProsemirrorNode) => boolean
) {
  let found: number | undefined;

  node.descendants((child, pos) => {
    if (found === undefined && predicate(child)) {
      found = pos + 1;
      return false;
    }

    return found === undefined;
  });

  if (found === undefined) {
    throw new Error("Matching node not found");
  }

  return found;
}

function applyCommand(
  state: ReturnType<typeof createEditorState>,
  command: ReturnType<StepList["commands"]>["step_list"] | Command
) {
  let result = state;
  const handled = command(state, (tr) => {
    result = state.apply(tr);
  });

  return { handled, result };
}

describe("StepList", () => {
  it("does not add a trailing paragraph when inserted at the end of the document", () => {
    const command = new StepList()
      .commands({
        type: step_list,
        schema,
      })
      .step_list();
    let state = createEditorState(doc([p("Before")]));
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, state.doc.content.size)
      )
    );

    const { handled, result } = applyCommand(state, command);

    expect(handled).toBe(true);
    expect(result.doc.childCount).toBe(2);
    expect(result.doc.lastChild?.type.name).toBe("step_list");
    expect(result.selection.$from.parent.type.name).toBe("paragraph");
    expect(result.selection.$from.parentOffset).toBe(0);
    expect(result.selection.$from.node(-1).type.name).toBe("step_list_item");
  });
});

describe("StepListItem", () => {
  it("replaces a single empty step list with a paragraph on Enter", () => {
    const command = new StepListItem().keys({
      type: step_list_item,
      schema,
    }).Enter;
    let state = createEditorState(doc([step_list.create(null, [step()])]));
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) =>
              child.type.name === "paragraph" && child.content.size === 0
          )
        )
      )
    );

    const { handled, result } = applyCommand(state, command);

    expect(handled).toBe(true);
    expect(result.doc.childCount).toBe(1);
    expect(result.doc.firstChild?.type.name).toBe("paragraph");
    expect(result.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("closes the step list when Enter is pressed on the last empty step", () => {
    const command = new StepListItem().keys({
      type: step_list_item,
      schema,
    }).Enter;
    let state = createEditorState(
      doc([step_list.create(null, [step("First"), step()])])
    );
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) =>
              child.type.name === "paragraph" && child.content.size === 0
          )
        )
      )
    );

    const { handled, result } = applyCommand(state, command);

    expect(handled).toBe(true);
    expect(result.doc.childCount).toBe(2);
    expect(result.doc.firstChild?.type.name).toBe("step_list");
    expect(result.doc.firstChild?.childCount).toBe(1);
    expect(result.doc.lastChild?.type.name).toBe("paragraph");
    expect(result.selection.$from.parent.type.name).toBe("paragraph");
    expect(result.selection.$from.parentOffset).toBe(0);
  });

  it("does not jump to the next step from nested or non-empty content", () => {
    const command = new StepListItem().keys({
      type: step_list_item,
      schema,
    }).Enter;
    const nestedList = schema.nodes.bullet_list.create(null, [
      schema.nodes.list_item.create(null, [p()]),
    ]);
    const item = step_list_item.create(null, [
      p("First"),
      nestedList,
      schema.nodes.code_block.create(null, schema.text("code")),
    ]);
    const document = doc([step_list.create(null, [item])]);

    let state = createEditorState(document);
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) =>
              child.type.name === "paragraph" && child.content.size === 0
          )
        )
      )
    );

    let result = applyCommand(state, command);

    expect(result.handled).toBe(false);
    expect(result.result.doc.eq(document)).toBe(true);

    state = createEditorState(document);
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) => child.type.name === "code_block"
          )
        )
      )
    );

    result = applyCommand(state, command);

    expect(result.handled).toBe(false);
    expect(result.result.doc.eq(document)).toBe(true);

    state = createEditorState(document);
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) =>
              child.type.name === "paragraph" && child.textContent === "First"
          )
        )
      )
    );

    result = applyCommand(state, command);

    expect(result.handled).toBe(false);
    expect(result.result.doc.eq(document)).toBe(true);
  });

  it("lets code blocks handle Shift+Enter inside step content", () => {
    const command = new StepListItem().keys({
      type: step_list_item,
      schema,
    })["Shift-Enter"];
    const item = step_list_item.create(null, [
      p("First"),
      schema.nodes.code_block.create(null, schema.text("code")),
    ]);
    const document = doc([step_list.create(null, [item])]);

    let state = createEditorState(document);
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) => child.type.name === "code_block"
          )
        )
      )
    );

    const { handled, result } = applyCommand(state, command);

    expect(handled).toBe(false);
    expect(result.doc.eq(document)).toBe(true);
  });

  it("jumps to the next step from an empty direct paragraph", () => {
    const command = new StepListItem().keys({
      type: step_list_item,
      schema,
    }).Enter;
    let state = createEditorState(
      doc([
        step_list.create(null, [
          step_list_item.create(null, [p("First"), p()]),
        ]),
      ])
    );
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) =>
              child.type.name === "paragraph" && child.content.size === 0
          )
        )
      )
    );

    const { handled, result } = applyCommand(state, command);

    expect(handled).toBe(true);
    expect(result.doc.firstChild?.childCount).toBe(2);
    expect(result.doc.firstChild?.child(0).childCount).toBe(1);
    expect(result.doc.firstChild?.child(0).textContent).toBe("First");
    expect(result.doc.firstChild?.child(1).childCount).toBe(1);
    expect(result.selection.$from.parent.type.name).toBe("paragraph");
    expect(result.selection.$from.parentOffset).toBe(0);
    expect(result.selection.$from.node(-1).type.name).toBe("step_list_item");
  });

  it("generates a next step on Mod-Enter from a non-empty step title", () => {
    const command = new StepListItem().keys({
      type: step_list_item,
      schema,
    })["Mod-Enter"];
    let state = createEditorState(doc([step_list.create(null, [step("First")])]));
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) =>
              child.type.name === "paragraph" && child.textContent === "First"
          ) + "First".length
        )
      )
    );

    const { handled, result } = applyCommand(state, command);

    expect(handled).toBe(true);
    expect(result.doc.firstChild?.childCount).toBe(2);
    expect(result.doc.firstChild?.child(0).textContent).toBe("First");
    expect(result.doc.firstChild?.child(1).childCount).toBe(1);
    expect(result.doc.firstChild?.child(1).firstChild?.content.size).toBe(0);
    expect(result.selection.$from.parent.type.name).toBe("paragraph");
    expect(result.selection.$from.parentOffset).toBe(0);
    expect(result.selection.$from.node(-1).type.name).toBe("step_list_item");
  });

  it("inserts a step above a blank step title on Mod-Enter, since a blank title is also the line's beginning", () => {
    const command = new StepListItem().keys({
      type: step_list_item,
      schema,
    })["Mod-Enter"];
    let state = createEditorState(doc([step_list.create(null, [step()])]));
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) =>
              child.type.name === "paragraph" && child.content.size === 0
          )
        )
      )
    );

    const { handled, result } = applyCommand(state, command);

    expect(handled).toBe(true);
    expect(result.doc.firstChild?.childCount).toBe(2);
    expect(result.doc.firstChild?.child(1).childCount).toBe(1);
    expect(result.selection.$from.parentOffset).toBe(0);
    expect(result.selection.$from.node(-1).type.name).toBe("step_list_item");
  });

  it("inserts a step above on Mod-Enter at the beginning of a step title", () => {
    const command = new StepListItem().keys({
      type: step_list_item,
      schema,
    })["Mod-Enter"];
    let state = createEditorState(
      doc([step_list.create(null, [step("First"), step("Second")])])
    );
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) =>
              child.type.name === "paragraph" &&
              child.textContent === "Second"
          )
        )
      )
    );

    const { handled, result } = applyCommand(state, command);

    expect(handled).toBe(true);
    expect(result.doc.firstChild?.childCount).toBe(3);
    expect(result.doc.firstChild?.child(0).textContent).toBe("First");
    expect(result.doc.firstChild?.child(1).childCount).toBe(1);
    expect(result.doc.firstChild?.child(1).firstChild?.content.size).toBe(0);
    expect(result.doc.firstChild?.child(2).textContent).toBe("Second");
    expect(result.selection.$from.parent.textContent).toBe("Second");
    expect(result.selection.$from.parentOffset).toBe(0);
    expect(result.selection.$from.node(-1).type.name).toBe("step_list_item");
  });

  it("generates a next step on Mod-Enter from within step content", () => {
    const command = new StepListItem().keys({
      type: step_list_item,
      schema,
    })["Mod-Enter"];
    let state = createEditorState(
      doc([
        step_list.create(null, [
          step_list_item.create(null, [p("First"), p("Content")]),
        ]),
      ])
    );
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          posInsideFirst(
            state.doc,
            (child) =>
              child.type.name === "paragraph" &&
              child.textContent === "Content"
          )
        )
      )
    );

    const { handled, result } = applyCommand(state, command);

    expect(handled).toBe(true);
    expect(result.doc.firstChild?.childCount).toBe(2);
    expect(result.doc.firstChild?.child(0).childCount).toBe(2);
    expect(result.doc.firstChild?.child(1).childCount).toBe(1);
    expect(result.selection.$from.node(-1).type.name).toBe("step_list_item");
  });
});

describe("StepList markdown", () => {
  it("serializes steps with 'Step N. ' markers and no subtitle", () => {
    const document = doc([
      step_list.create(null, [step("First step"), step("Second step")]),
    ]);

    const output = serializer.serialize(document);

    expect(output.trim()).toBe("Step 1. First step\n\nStep 2. Second step");
  });

  it("serializes a subtitle with a '>> ' prefix on the following line", () => {
    const item = step_list_item.create(null, [
      p("First step"),
      step_list_subtitle.create(null, schema.text("Do this carefully")),
    ]);
    const document = doc([step_list.create(null, [item])]);

    const output = serializer.serialize(document);

    expect(output.trim()).toBe("Step 1. First step\n>> Do this carefully");
  });

  it("parses 'Step N. ' markdown into a step_list", () => {
    const markdown = "Step 1. First step\n\nStep 2. Second step";

    const ast = parser.parse(markdown);
    const json = ast?.toJSON();
    const stepListNode = json?.content?.find(
      (node: { type: string }) => node.type === "step_list"
    );

    expect(stepListNode).toBeDefined();
    expect(stepListNode.content).toHaveLength(2);
    expect(stepListNode.content[0].type).toBe("step_list_item");
    expect(stepListNode.content[0].content[0].content[0].text).toBe(
      "First step"
    );
    expect(stepListNode.content[1].content[0].content[0].text).toBe(
      "Second step"
    );
  });

  it("parses a '>> ' line as a step_list_subtitle", () => {
    const markdown = "Step 1. First step\n>> Do this carefully";

    const ast = parser.parse(markdown);
    const json = ast?.toJSON();
    const stepListNode = json?.content?.find(
      (node: { type: string }) => node.type === "step_list"
    );

    const item = stepListNode.content[0];
    expect(item.content).toHaveLength(2);
    expect(item.content[1].type).toBe("step_list_subtitle");
    expect(item.content[1].content[0].text).toBe("Do this carefully");
  });

  it("round-trips a step list with a subtitle through parse and serialize", () => {
    const markdown = "Step 1. First step\n>> Do this carefully";

    const ast = parser.parse(markdown);
    const output = serializer.serialize(ast);

    expect(output.trim()).toBe(markdown);
  });

  it("does not parse a plain numbered list as a step list", () => {
    const markdown = "1. First item\n2. Second item";

    const ast = parser.parse(markdown);
    const json = ast?.toJSON();
    const stepListNode = json?.content?.find(
      (node: { type: string }) => node.type === "step_list"
    );

    expect(stepListNode).toBeUndefined();
  });

  it("folds a description paragraph after the subtitle into the same step, keeping a single list", () => {
    const markdown = [
      "Step 1. asd",
      ">> this is subtitle",
      "",
      "This is content.",
      "",
      "Step 2. sadf",
      "",
      "Step 3. werwer",
      "",
      "Step 4. AAAAAA",
    ].join("\n");

    const ast = parser.parse(markdown);
    const json = ast?.toJSON();
    const stepListNodes = json?.content?.filter(
      (node: { type: string }) => node.type === "step_list"
    );

    // All four steps should live in a single list, not be split apart by
    // the description paragraph.
    expect(stepListNodes).toHaveLength(1);
    const stepListNode = stepListNodes[0];
    expect(stepListNode.content).toHaveLength(4);

    const firstItem = stepListNode.content[0];
    expect(firstItem.content).toHaveLength(3);
    expect(firstItem.content[0].content[0].text).toBe("asd");
    expect(firstItem.content[1].type).toBe("step_list_subtitle");
    expect(firstItem.content[1].content[0].text).toBe("this is subtitle");
    expect(firstItem.content[2].type).toBe("paragraph");
    expect(firstItem.content[2].content[0].text).toBe("This is content.");

    expect(stepListNode.content[1].content[0].content[0].text).toBe("sadf");
    expect(stepListNode.content[2].content[0].content[0].text).toBe("werwer");
    expect(stepListNode.content[3].content[0].content[0].text).toBe("AAAAAA");
  });

  it("round-trips a step with a description paragraph through parse and serialize", () => {
    const markdown = [
      "Step 1. asd",
      ">> this is subtitle",
      "",
      "This is content.",
      "",
      "Step 2. sadf",
    ].join("\n");

    const ast = parser.parse(markdown);
    const output = serializer.serialize(ast);

    expect(output.trim()).toBe(markdown);
  });
});
