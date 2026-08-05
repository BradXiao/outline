import { schema } from "../../test/editor";

describe("Emoji node", () => {
  it("is an inline leaf atom", () => {
    const emoji = schema.nodes.emoji.create({
      "data-name": "thinking_face",
    });

    expect(emoji.isInline).toBe(true);
    expect(emoji.isLeaf).toBe(true);
    expect(emoji.isAtom).toBe(true);
  });

  it("keeps surrounding text outside of the emoji", () => {
    const emoji = schema.nodes.emoji.create({
      "data-name": "thinking_face",
    });
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text("before "),
      emoji,
      schema.text("after"),
    ]);

    expect(paragraph.childCount).toBe(3);
    expect(paragraph.child(2).text).toBe("after");
    expect(paragraph.child(2).marks).toHaveLength(0);
  });
});
