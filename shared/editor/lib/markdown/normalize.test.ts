import normalizePastedMarkdown from "./normalize";

const NBSP = "\u00A0";
const FOUR_NBSP = NBSP.repeat(4);

describe("normalizePastedMarkdown", () => {
  describe("checkbox normalization", () => {
    it("should wrap standalone checkbox with list item prefix", () => {
      const input = "[x] Task one";
      const expected = "- [x] Task one";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should wrap standalone checkbox with uppercase X", () => {
      const input = "[X] Task two";
      const expected = "- [X] Task two";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should wrap standalone unchecked checkbox", () => {
      const input = "[ ] Task three";
      const expected = "- [ ] Task three";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should wrap standalone checkbox with underscore", () => {
      const input = "[_] Task four";
      const expected = "- [_] Task four";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should wrap standalone checkbox with dash", () => {
      const input = "[-] Task five";
      const expected = "- [-] Task five";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should wrap multiple standalone checkboxes", () => {
      const input = "[x] Task one\n[X] Task two\n[ ] Task three";
      const expected = "- [x] Task one\n\n- [X] Task two\n\n- [ ] Task three";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should wrap checkbox with single leading space", () => {
      const input = " [x] Task with spaces";
      const expected = "- [x] Task with spaces";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should not modify checkboxes already in list items", () => {
      const input = "- [x] Already in list";
      const expected = "- [x] Already in list";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should not match checkbox without space after bracket", () => {
      const input = "[x]";
      const expected = "[x]";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should handle checkbox with space but no description text", () => {
      const input = "[x] ";
      const expected = "- [x]";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should not match checkbox with multiple leading spaces", () => {
      const input = "  [x] Task";
      const expected = "  [x] Task";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should not consume blank lines before a checkbox", () => {
      const input = "[x] Task one\n\n\n[X] Task two";
      const expected = "- [x] Task one\n\n\\\n\n\\\n\n- [X] Task two";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });
  });

  describe("newline normalization", () => {
    it("should convert a single newline to a paragraph break", () => {
      const input = "apple\nbanana";
      const expected = "apple\n\nbanana";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should convert Windows line endings to paragraph breaks", () => {
      const input = "apple\r\nbanana";
      const expected = "apple\n\nbanana";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should preserve a blank line as an empty paragraph marker", () => {
      const input = "apple\n\nbanana";
      const expected = "apple\n\n\\\n\nbanana";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should preserve multiple blank lines as empty paragraph markers", () => {
      const input = "apple\n\n\nbanana";
      const expected = "apple\n\n\\\n\n\\\n\nbanana";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should handle multiple instances of blank lines", () => {
      const input = "Line one\n\n\nLine two\n\n\n\nLine three";
      const expected =
        "Line one\n\n\\\n\n\\\n\nLine two\n\n\\\n\n\\\n\n\\\n\nLine three";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });
  });

  describe("tab normalization", () => {
    it("should convert each leading tab to four visible spaces", () => {
      const input = "\tindented text";
      const expected = `${FOUR_NBSP}indented text`;
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should convert multiple leading tabs to four spaces each", () => {
      const input = "\t\t\tdeep indent";
      const expected = `${FOUR_NBSP.repeat(3)}deep indent`;
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should convert mid-line tabs to regular spaces", () => {
      const input = "column1\tcolumn2";
      const expected = "column1    column2";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should convert leading spaces that would form a code block", () => {
      const input = "    indented text";
      const expected = `${FOUR_NBSP}indented text`;
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should keep spaces that indent nested list items", () => {
      const input = "- parent\n    - child";
      const expected = "- parent\n\n    - child";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should convert tab-indented notepad lines without code blocks", () => {
      const input =
        "web crawler\n\tweeather+good sentences\n\tgoogle text\n\tgoogle image";
      const expected = `web crawler\n\n${FOUR_NBSP}weeather+good sentences\n\n${FOUR_NBSP}google text\n\n${FOUR_NBSP}google image`;
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });
  });

  describe("combined normalization", () => {
    it("should apply checkbox normalization then newline normalization", () => {
      const input = "[x] Task one\n\n\n[X] Task two";
      const expected = "- [x] Task one\n\n\\\n\n\\\n\n- [X] Task two";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should handle mixed content with checkboxes and multiple newlines", () => {
      const input = "Regular text\n\n\n[x] Checkbox task\n\n\nMore text";
      const expected =
        "Regular text\n\n\\\n\n\\\n\n- [x] Checkbox task\n\n\\\n\n\\\n\nMore text";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should handle checkbox after a single newline", () => {
      const input = "Text\n[x] Task";
      const expected = "Text\n\n- [x] Task";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should preserve nested lists while expanding surrounding newlines", () => {
      const input =
        "- jaioserj\n    - wejroiewr\n\nwerwer\n\n我的投票\n刪除";
      const expected =
        "- jaioserj\n\n    - wejroiewr\n\n\\\n\nwerwer\n\n\\\n\n我的投票\n\n刪除";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });
  });

  describe("blockquote normalization", () => {
    it("should keep consecutive quote lines in one blockquote", () => {
      const input = "> asdijioqw\n> ajiowe";
      const expected = "> asdijioqw\n>\n> ajiowe";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should split quote blocks when a blank line is between them", () => {
      const input = "> asdijioqw\n\n> ajiowe";
      const expected = "> asdijioqw\n\n\\\n\n> ajiowe";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });

    it("should keep a run of quote lines together then split after a blank line", () => {
      const input = "> one\n> two\n\n> three";
      const expected = "> one\n>\n> two\n\n\\\n\n> three";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(normalizePastedMarkdown("")).toBe("");
    });

    it("should handle text with no special formatting", () => {
      expect(normalizePastedMarkdown("Just regular text")).toBe(
        "Just regular text"
      );
    });

    it("should handle text with only newlines", () => {
      const input = "\n\n\n";
      const expected = "\\\n\n\\\n\n\\\n\n\\";
      expect(normalizePastedMarkdown(input)).toBe(expected);
    });
  });
});
