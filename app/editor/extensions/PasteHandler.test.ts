import { EditorView } from "prosemirror-view";
import { HEADING_LINK_CLIPBOARD_FORMAT } from "@shared/editor/lib/clipboard";
import { createEditorState, doc, p, schema } from "@shared/test/editor";
import { MentionType } from "@shared/types";
import PasteHandler from "./PasteHandler";

const { fetchDocument } = vi.hoisted(() => ({
  fetchDocument: vi.fn(),
}));

vi.mock("~/stores", () => ({
  default: {
    documents: {
      fetch: fetchDocument,
    },
  },
}));

vi.mock("../components/PasteMenu", () => ({
  PasteMenu: () => null,
}));

describe("PasteHandler", () => {
  it("converts copied heading metadata to a heading mention", async () => {
    window.env.URL = "http://localhost";
    const url = "http://localhost/doc/our-editor-qMLBJTiEfI#h-markdown-3";
    fetchDocument.mockResolvedValue({
      id: "document-id",
      titleWithDefault: "Our editor",
    });

    const pasteHandler = new PasteHandler();
    Object.defineProperty(pasteHandler, "editor", {
      value: { schema },
    });

    const state = createEditorState(doc(p()), pasteHandler.plugins);
    const view = new EditorView(document.createElement("div"), { state });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) => {
          if (type === "text/plain") {
            return url;
          }
          if (type === HEADING_LINK_CLIPBOARD_FORMAT) {
            return "Markdown";
          }
          return "";
        },
      },
    });

    view.dom.dispatchEvent(event);

    await vi.waitFor(() => {
      const mention = view.state.doc.firstChild?.firstChild;
      expect(mention?.type).toBe(schema.nodes.mention);
      expect(mention?.attrs).toMatchObject({
        type: MentionType.Document,
        modelId: "document-id",
        label: "Markdown",
        anchorId: "h-markdown-3",
      });
    });

    view.destroy();
  });
});
