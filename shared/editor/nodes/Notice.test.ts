import { extensionManager, findNodes, schema } from "../../test/editor";
import { NoticeTypes } from "./Notice";

const serializer = extensionManager.serializer();
const parser = extensionManager.parser({
  schema,
  plugins: extensionManager.rulePlugins,
});

/**
 * Finds the first container_notice node in a document JSON tree.
 *
 * @param doc - the parsed ProseMirror document.
 * @returns the notice node with attrs.
 */
const findNoticeNode = (doc: ReturnType<typeof parser.parse>) => {
  const noticeNode = findNodes(doc?.toJSON(), "container_notice")[0];
  if (!noticeNode?.attrs) {
    throw new Error("Expected notice node with attributes");
  }
  return { ...noticeNode, attrs: noticeNode.attrs };
};

describe("Notice node style round-trip", () => {
  it.each([
    NoticeTypes.Info,
    NoticeTypes.Success,
    NoticeTypes.Warning,
    NoticeTypes.Tip,
    NoticeTypes.Question,
    NoticeTypes.Error,
  ])("preserves %s style through markdown serialize → parse", (style) => {
    const original = `:::${style}\nHello notice\n:::`;
    const doc = parser.parse(original);
    const noticeNode = findNoticeNode(doc);
    expect(noticeNode.attrs.style).toBe(style);

    const markdown = serializer.serialize(doc);
    expect(markdown).toContain(`:::${style}`);

    const roundTripped = parser.parse(markdown);
    expect(findNoticeNode(roundTripped).attrs.style).toBe(style);
  });

  it("parses question and error styles from markdown", () => {
    const question = parser.parse(":::question\nAsk me anything\n:::");
    expect(findNoticeNode(question).attrs.style).toBe(NoticeTypes.Question);

    const error = parser.parse(":::error\nSomething went wrong\n:::");
    expect(findNoticeNode(error).attrs.style).toBe(NoticeTypes.Error);
  });
});
