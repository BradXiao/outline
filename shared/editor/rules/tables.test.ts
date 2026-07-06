import { DOMParser as ProsemirrorDOMParser } from "prosemirror-model";
import { extensionManager, schema } from "../../test/editor";

const serializer = extensionManager.serializer();
const parser = extensionManager.parser({
  schema,
  plugins: extensionManager.rulePlugins,
});

const domParser = ProsemirrorDOMParser.fromSchema(schema);

/**
 * Wraps a block node in a single-cell table so cell serialization/parsing can
 * be exercised in isolation.
 */
function tableWith(cell: Record<string, unknown>) {
  return schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tr",
            content: [
              {
                type: "th",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Header" }],
                  },
                ],
              },
            ],
          },
          {
            type: "tr",
            content: [{ type: "td", content: [cell] }],
          },
        ],
      },
    ],
  });
}

it("round-trips a notice inside a table cell", () => {
  const doc = tableWith({
    type: "container_notice",
    attrs: { style: "warning" },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "First | line" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Second line" }],
      },
    ],
  });

  const markdown = serializer.serialize(doc, { commonMark: true });
  expect(parser.parse(markdown)!.toJSON()).toEqual(doc.toJSON());
});

it("round-trips a code fence inside a table cell", () => {
  const doc = tableWith({
    type: "code_fence",
    attrs: { language: "javascript", wrap: false },
    content: [{ type: "text", text: "a | b\nc \\ d" }],
  });

  const markdown = serializer.serialize(doc, { commonMark: true });
  expect(parser.parse(markdown)!.toJSON()).toEqual(doc.toJSON());
});

it("parses pasted code HTML as a code fence", () => {
  if (typeof document === "undefined") {
    return;
  }

  const element = document.createElement("div");
  element.innerHTML = `<pre><code class="language-js">const hello = &quot;world&quot;;\n</code></pre>`;

  const doc = domParser.parse(element);
  const codeBlock = doc.content.firstChild;

  expect(codeBlock?.type.name).toBe("code_fence");
  expect(codeBlock?.attrs.language).toBe("javascript");
  expect(codeBlock?.textContent).toBe(`const hello = "world";\n`);
});

it("round-trips a toggle block inside a table cell", () => {
  const doc = tableWith({
    type: "container_toggle",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Toggle | heading" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hidden body" }],
      },
    ],
  });

  const markdown = serializer.serialize(doc, { commonMark: true });
  expect(parser.parse(markdown)!.toJSON()).toEqual(doc.toJSON());
});

it("round-trips a math block inside a table cell", () => {
  const doc = tableWith({
    type: "math_block",
    content: [{ type: "text", text: "a | b\n\\frac{1}{2}" }],
  });

  const markdown = serializer.serialize(doc, { commonMark: true });
  expect(parser.parse(markdown)!.toJSON()).toEqual(doc.toJSON());
});

it("keeps a multi-line paragraph cell as hard breaks, not a fenced block", () => {
  const doc = tableWith({
    type: "paragraph",
    content: [
      { type: "text", text: "Line one" },
      { type: "br" },
      { type: "text", text: "Line two" },
    ],
  });

  const markdown = serializer.serialize(doc, { commonMark: true });
  expect(parser.parse(markdown)!.toJSON()).toEqual(doc.toJSON());
});
