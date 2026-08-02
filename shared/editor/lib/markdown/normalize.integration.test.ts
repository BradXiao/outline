import normalizePastedMarkdown from "./normalize";
import { extensionManager, schema } from "../../../test/editor";

const parser = extensionManager.parser({
  schema,
  plugins: extensionManager.rulePlugins,
});

/**
 * Summarize top-level blocks produced by the paste markdown parser.
 *
 * @param markdown Markdown string to parse.
 * @return Block type/text pairs for assertions.
 */
function blockSummary(markdown: string) {
  const doc = parser.parse(markdown);
  return doc?.content.content.map((node) => ({
    type: node.type.name,
    text: node.textContent,
    empty: node.type.name === "paragraph" && node.textContent === "",
  }));
}

describe("normalizePastedMarkdown parser integration", () => {
  it("maps apple\\nbanana to two paragraphs", () => {
    const normalized = normalizePastedMarkdown("apple\nbanana");
    expect(blockSummary(normalized)).toEqual([
      { type: "paragraph", text: "apple", empty: false },
      { type: "paragraph", text: "banana", empty: false },
    ]);
  });

  it("maps apple\\n\\nbanana to an empty paragraph between", () => {
    const normalized = normalizePastedMarkdown("apple\n\nbanana");
    expect(blockSummary(normalized)).toEqual([
      { type: "paragraph", text: "apple", empty: false },
      { type: "paragraph", text: "", empty: true },
      { type: "paragraph", text: "banana", empty: false },
    ]);
  });

  it("keeps tab indentation without creating a code block", () => {
    const normalized = normalizePastedMarkdown("\tindented");
    expect(blockSummary(normalized)).toEqual([
      {
        type: "paragraph",
        text: "\u00A0\u00A0\u00A0\u00A0indented",
        empty: false,
      },
    ]);
  });

  it("preserves nested list structure from notepad", () => {
    const normalized = normalizePastedMarkdown(
      "- jaioserj\n    - wejroiewr\n\nwerwer"
    );
    const blocks = blockSummary(normalized);
    expect(blocks?.[0]?.type).toBe("bullet_list");
    expect(blocks?.[0]?.text).toContain("jaioserj");
    expect(blocks?.[0]?.text).toContain("wejroiewr");
    expect(blocks?.slice(1)).toEqual([
      { type: "paragraph", text: "", empty: true },
      { type: "paragraph", text: "werwer", empty: false },
    ]);
  });

  it("keeps consecutive quote lines in one blockquote", () => {
    const normalized = normalizePastedMarkdown("> asdijioqw\n> ajiowe");
    const doc = parser.parse(normalized);
    const quote = doc?.content.firstChild;

    expect(doc?.content.childCount).toBe(1);
    expect(quote?.type.name).toBe("blockquote");
    expect(quote?.content.childCount).toBe(2);
    expect(quote?.content.child(0).textContent).toBe("asdijioqw");
    expect(quote?.content.child(1).textContent).toBe("ajiowe");
  });

  it("splits quote blocks when a blank line is between them", () => {
    const normalized = normalizePastedMarkdown("> asdijioqw\n\n> ajiowe");
    expect(blockSummary(normalized)).toEqual([
      { type: "blockquote", text: "asdijioqw", empty: false },
      { type: "paragraph", text: "", empty: true },
      { type: "blockquote", text: "ajiowe", empty: false },
    ]);
  });
});
