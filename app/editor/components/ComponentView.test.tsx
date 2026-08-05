import type { EditorView } from "prosemirror-view";
import type { FunctionComponent } from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import Extension from "@shared/editor/lib/Extension";
import type { ComponentProps } from "@shared/editor/types";
import { p, schema } from "@shared/test/editor";
import ComponentView from "./ComponentView";
import type { NodeViewRenderer } from "./NodeViewRenderer";

describe("ComponentView", () => {
  class TestExtension extends Extension {}

  const createNoticeView = (
    component: FunctionComponent<ComponentProps> = () => null
  ) => {
    const nodeRenderers = new Set<NodeViewRenderer<ComponentProps>>();
    return new ComponentView(component, {
      editor: { nodeRenderers },
      extension: new TestExtension(),
      node: schema.nodes.container_notice.create(null, p("notice")),
      view: { editable: true } as EditorView,
      getPos: () => 0,
      decorations: [],
    });
  };

  it("attaches editable content before the React portal renders", () => {
    const componentView = createNoticeView();

    expect(componentView.contentDOM).not.toBeNull();
    expect(componentView.contentDOM?.parentElement).toBe(componentView.dom);

    componentView.destroy();
  });

  it("moves editable content into the React component after it renders", () => {
    const Content = ({ contentRef }: ComponentProps) => (
      <div data-testid="content" ref={contentRef} />
    );
    const componentView = createNoticeView(Content);
    const root = document.createElement("div");

    act(() => {
      ReactDOM.render(componentView.renderer.content, root);
    });

    expect(componentView.contentDOM?.parentElement).toBe(
      componentView.dom?.querySelector('[data-testid="content"]')
    );

    act(() => {
      ReactDOM.unmountComponentAtNode(root);
    });
    componentView.destroy();
  });
});
