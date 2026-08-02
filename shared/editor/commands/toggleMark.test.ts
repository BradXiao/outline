import { TextSelection } from "prosemirror-state";
import { createEditorState, doc, p, schema } from "@shared/test/editor";
import { toggleMark } from "./toggleMark";

const highlightType = schema.marks.highlight;

describe("toggleMark", () => {
  it("updates mark attributes without changing the selection", () => {
    const testDoc = doc([p("hello world")]);
    const from = 1;
    const to = 6;

    let state = createEditorState(testDoc);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(testDoc, from, to))
    );

    toggleMark(highlightType)(state, (tr) => {
      state = state.apply(tr);
    });

    expect(state.selection.from).toBe(from);
    expect(state.selection.to).toBe(to);

    toggleMark(highlightType, { color: "#FED46A" })(state, (tr) => {
      state = state.apply(tr);
    });

    expect(state.selection.from).toBe(from);
    expect(state.selection.to).toBe(to);
    expect(state.doc.rangeHasMark(from, to, highlightType)).toBe(true);

    const highlight = state.doc
      .resolve(from + 1)
      .marks()
      .find((mark) => mark.type === highlightType);
    expect(highlight?.attrs.color).toBe("#FED46A");
  });
});
