import {
  parseCodeFenceInfo,
  serializeCodeFenceInfo,
  type CodeFenceInfo,
} from "./codeFenceInfo";

describe("parseCodeFenceInfo", () => {
  it("parses a bare language", () => {
    expect(parseCodeFenceInfo("python")).toEqual({
      language: "python",
      title: null,
      params: {},
    });
  });

  it("parses an empty info string", () => {
    expect(parseCodeFenceInfo("")).toEqual({
      language: "",
      title: null,
      params: {},
    });
  });

  it("parses a language with a quoted title", () => {
    expect(parseCodeFenceInfo('python "this is my title.py"')).toEqual({
      language: "python",
      title: "this is my title.py",
      params: {},
    });
  });

  it("parses a leading title with no language", () => {
    expect(parseCodeFenceInfo('"only a title"')).toEqual({
      language: "",
      title: "only a title",
      params: {},
    });
  });

  it("unescapes quotes and backslashes inside the title", () => {
    expect(parseCodeFenceInfo('python "a \\"quote\\" and \\\\ slash"')).toEqual({
      language: "python",
      title: 'a "quote" and \\ slash',
      params: {},
    });
  });

  it("only keeps the first quoted string as the title", () => {
    expect(parseCodeFenceInfo('js "first" "second"')).toEqual({
      language: "js",
      title: "first",
      params: {},
    });
  });

  it("parses key:value and key=value params", () => {
    expect(parseCodeFenceInfo("js fold:true theme=dark")).toEqual({
      language: "js",
      title: null,
      params: { fold: "true", theme: "dark" },
    });
  });

  it("parses quoted param values containing whitespace", () => {
    expect(parseCodeFenceInfo('js title="my file.py"')).toEqual({
      language: "js",
      title: null,
      params: { title: "my file.py" },
    });
  });

  it("parses bare flags as boolean true", () => {
    expect(parseCodeFenceInfo("js fold")).toEqual({
      language: "js",
      title: null,
      params: { fold: true },
    });
  });

  it("collapses extra whitespace between tokens", () => {
    expect(parseCodeFenceInfo("  python   \t \"a title\"  ")).toEqual({
      language: "python",
      title: "a title",
      params: {},
    });
  });
});

describe("serializeCodeFenceInfo", () => {
  it("serializes language and title", () => {
    expect(
      serializeCodeFenceInfo({
        language: "python",
        title: "aaa.py",
        params: {},
      })
    ).toBe('python "aaa.py"');
  });

  it("omits an empty language and null title", () => {
    expect(
      serializeCodeFenceInfo({ language: "", title: null, params: {} })
    ).toBe("");
  });

  it("escapes quotes and backslashes in the title", () => {
    expect(
      serializeCodeFenceInfo({
        language: "js",
        title: 'a "quote" \\ slash',
        params: {},
      })
    ).toBe('js "a \\"quote\\" \\\\ slash"');
  });

  it("serializes params, quoting values that need it", () => {
    expect(
      serializeCodeFenceInfo({
        language: "js",
        title: null,
        params: { theme: "dark", file: "my file.py", fold: true },
      })
    ).toBe('js theme:dark file:"my file.py" fold');
  });

  it("omits false flags", () => {
    expect(
      serializeCodeFenceInfo({
        language: "js",
        title: null,
        params: { fold: false },
      })
    ).toBe("js");
  });
});

describe("round-trips", () => {
  const cases: CodeFenceInfo[] = [
    { language: "python", title: null, params: {} },
    { language: "python", title: "this is my title.py", params: {} },
    { language: "js", title: 'a "quote" and \\ slash', params: {} },
    { language: "js", title: null, params: { theme: "dark", fold: true } },
    { language: "js", title: "x.py", params: { file: "my file.py" } },
  ];

  it.each(cases)("parse(serialize(x)) === x", (info) => {
    expect(parseCodeFenceInfo(serializeCodeFenceInfo(info))).toEqual(info);
  });
});
