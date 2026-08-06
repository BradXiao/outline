import copy from "copy-to-clipboard";
import { HEADING_LINK_CLIPBOARD_FORMAT } from "../lib/clipboard";
import { EditorStyleHelper } from "../styles/EditorStyleHelper";
import Heading from "./Heading";

vi.mock("copy-to-clipboard", () => ({
  default: vi.fn(),
}));

describe("Heading", () => {
  it("copies a heading link as a plain URL", () => {
    if (typeof document === "undefined") {
      return;
    }

    window.history.replaceState(
      {},
      "",
      "/doc/our-editor-qMLBJTiEfI/edit#existing-heading"
    );

    const container = document.createElement("div");
    container.innerHTML = `
      <a class="${EditorStyleHelper.headingPositionAnchor}" id="h-markdown-3"></a>
      <h2 class="heading-content">
        Markdown
        <button type="button" class="heading-anchor">#</button>
      </h2>
    `;

    const button = container.querySelector("button");
    if (!button) {
      throw new Error("Expected heading copy button");
    }

    const heading = new Heading();
    Object.defineProperty(heading, "editor", {
      value: { props: { onNotice: vi.fn() } },
    });
    button.addEventListener("click", heading.handleCopyLink);
    button.click();

    const url = "http://localhost/doc/our-editor-qMLBJTiEfI#h-markdown-3";
    expect(copy).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ format: "text/plain" })
    );

    const options = vi.mocked(copy).mock.lastCall?.[1];
    const setData = vi.fn();
    options?.onCopy?.({ setData });

    expect(setData).toHaveBeenCalledWith(
      HEADING_LINK_CLIPBOARD_FORMAT,
      "Markdown"
    );
  });
});
