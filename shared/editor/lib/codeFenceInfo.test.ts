import {
  isLineHighlighted,
  parseCodeFenceHighlight,
  parseCodeFenceInfo,
  parseCodeFenceLineNumbering,
  parseCodeFenceParams,
  serializeCodeFenceInfo,
  serializeCodeFenceParams,
  type CodeFenceInfo,
} from "./codeFenceInfo";

describe("parseCodeFenceInfo", () => {
  it("parses a bare language", () => {
    expect(parseCodeFenceInfo("python")).toEqual({
      language: "python",
      title: null,
      hl: null,
      ln: null,
    });
  });

  it("parses an empty info string", () => {
    expect(parseCodeFenceInfo("")).toEqual({
      language: "",
      title: null,
      hl: null,
      ln: null,
    });
  });

  it("defaults a bare word after the language to the title", () => {
    expect(parseCodeFenceInfo("cpp test.py")).toEqual({
      language: "cpp",
      title: "test.py",
      hl: null,
      ln: null,
    });
  });

  it("parses a language with a quoted title", () => {
    expect(parseCodeFenceInfo('python "this is my title.py"')).toEqual({
      language: "python",
      title: "this is my title.py",
      hl: null,
      ln: null,
    });
  });

  it("parses a title containing whitespace via quotes with no language", () => {
    expect(parseCodeFenceInfo('cpp "test_blabla test.py"')).toEqual({
      language: "cpp",
      title: "test_blabla test.py",
      hl: null,
      ln: null,
    });
  });

  it("unescapes quotes and backslashes inside the title", () => {
    expect(parseCodeFenceInfo('python "a \\"quote\\" and \\\\ slash"')).toEqual(
      {
        language: "python",
        title: 'a "quote" and \\ slash',
        hl: null,
        ln: null,
      },
    );
  });

  it("only keeps the first quoted string as the title", () => {
    expect(parseCodeFenceInfo('js "first" "second"')).toEqual({
      language: "js",
      title: "first",
      hl: null,
      ln: null,
    });
  });

  it("parses an explicit title: key", () => {
    expect(parseCodeFenceInfo("cpp title:test.py")).toEqual({
      language: "cpp",
      title: "test.py",
      hl: null,
      ln: null,
    });
  });

  it("parses title:, hl: and ln: together", () => {
    expect(parseCodeFenceInfo("cpp title:test.py hl:2-5,8 ln:5")).toEqual({
      language: "cpp",
      title: "test.py",
      hl: "2-5,8",
      ln: "5",
    });
  });

  it("keeps the ln: range value intact despite the second colon", () => {
    expect(parseCodeFenceInfo("cpp title:test.py ln:5:10")).toEqual({
      language: "cpp",
      title: "test.py",
      hl: null,
      ln: "5:10",
    });
  });

  it("parses a hl: word spec combined with line ranges", () => {
    expect(parseCodeFenceInfo("cpp title:test.py hl:5|test,5-7|test2")).toEqual(
      {
        language: "cpp",
        title: "test.py",
        hl: "5|test,5-7|test2",
        ln: null,
      },
    );
  });

  it("collapses extra whitespace between tokens", () => {
    expect(parseCodeFenceInfo('  python   \t "a title"  ')).toEqual({
      language: "python",
      title: "a title",
      hl: null,
      ln: null,
    });
  });
});

describe("parseCodeFenceParams", () => {
  it("parses a bare title with no language slot", () => {
    expect(parseCodeFenceParams("test.py")).toEqual({
      title: "test.py",
      hl: null,
      ln: null,
    });
  });

  it("parses title/hl/ln together", () => {
    expect(parseCodeFenceParams("test.py hl:2-5,8 ln:5")).toEqual({
      title: "test.py",
      hl: "2-5,8",
      ln: "5",
    });
  });

  it("parses an empty string", () => {
    expect(parseCodeFenceParams("")).toEqual({
      title: null,
      hl: null,
      ln: null,
    });
  });
});

describe("serializeCodeFenceInfo", () => {
  it("serializes language and title", () => {
    expect(
      serializeCodeFenceInfo({
        language: "python",
        title: "aaa.py",
        hl: null,
        ln: null,
      }),
    ).toBe('python "aaa.py"');
  });

  it("omits an empty language and null title", () => {
    expect(
      serializeCodeFenceInfo({ language: "", title: null, hl: null, ln: null }),
    ).toBe("");
  });

  it("escapes quotes and backslashes in the title", () => {
    expect(
      serializeCodeFenceInfo({
        language: "js",
        title: 'a "quote" \\ slash',
        hl: null,
        ln: null,
      }),
    ).toBe('js "a \\"quote\\" \\\\ slash"');
  });

  it("serializes hl and ln", () => {
    expect(
      serializeCodeFenceInfo({
        language: "js",
        title: null,
        hl: "2-5,8",
        ln: "5",
      }),
    ).toBe("js hl:2-5,8 ln:5");
  });
});

describe("serializeCodeFenceParams", () => {
  it("leaves a simple title bare", () => {
    expect(
      serializeCodeFenceParams({ title: "test.py", hl: null, ln: null }),
    ).toBe("test.py");
  });

  it("quotes a title containing whitespace", () => {
    expect(
      serializeCodeFenceParams({ title: "my file.py", hl: null, ln: null }),
    ).toBe('"my file.py"');
  });

  it("serializes title, hl and ln together", () => {
    expect(
      serializeCodeFenceParams({ title: "test.py", hl: "2-5,8", ln: "5" }),
    ).toBe("test.py hl:2-5,8 ln:5");
  });
});

describe("round-trips", () => {
  const cases: CodeFenceInfo[] = [
    { language: "python", title: null, hl: null, ln: null },
    { language: "python", title: "this is my title.py", hl: null, ln: null },
    { language: "js", title: 'a "quote" and \\ slash', hl: null, ln: null },
    { language: "js", title: "x.py", hl: "2-5,8", ln: "5" },
    { language: "cpp", title: "test.py", hl: "5|test,5-7|test2", ln: "5:10" },
  ];

  it.each(cases)("parse(serialize(x)) === x", (info) => {
    expect(parseCodeFenceInfo(serializeCodeFenceInfo(info))).toEqual(info);
  });
});

describe("parseCodeFenceHighlight", () => {
  it("returns an empty list when there is no spec", () => {
    expect(parseCodeFenceHighlight(null)).toEqual([]);
  });

  it("parses a single line number", () => {
    expect(parseCodeFenceHighlight("8")).toEqual([
      { start: 8, end: 8, text: null },
    ]);
  });

  it("parses a range and a single line", () => {
    expect(parseCodeFenceHighlight("2-5,8")).toEqual([
      { start: 2, end: 5, text: null },
      { start: 8, end: 8, text: null },
    ]);
  });

  it("parses a bare word as a text match", () => {
    expect(parseCodeFenceHighlight("test")).toEqual([
      { start: null, end: null, text: "test" },
    ]);
  });

  it("parses a range restricted to lines containing a word", () => {
    expect(parseCodeFenceHighlight("5|test,5-7|test2")).toEqual([
      { start: 5, end: 5, text: "test" },
      { start: 5, end: 7, text: "test2" },
    ]);
  });
});

describe("isLineHighlighted", () => {
  it("matches a line within a highlighted range", () => {
    const specs = parseCodeFenceHighlight("2-5,8");
    expect(isLineHighlighted(specs, 3, "anything")).toBe(true);
    expect(isLineHighlighted(specs, 8, "anything")).toBe(true);
    expect(isLineHighlighted(specs, 6, "anything")).toBe(false);
  });

  it("matches a line containing a word anywhere", () => {
    const specs = parseCodeFenceHighlight("test");
    expect(isLineHighlighted(specs, 1, "this has a test in it")).toBe(true);
    expect(isLineHighlighted(specs, 99, "this has a test in it")).toBe(true);
    expect(isLineHighlighted(specs, 1, "no match here")).toBe(false);
  });

  it("only matches a ranged line when it also contains the word", () => {
    const specs = parseCodeFenceHighlight("5-7|test");
    expect(isLineHighlighted(specs, 6, "has a test")).toBe(true);
    expect(isLineHighlighted(specs, 6, "no match")).toBe(false);
    expect(isLineHighlighted(specs, 10, "has a test")).toBe(false);
  });
});

describe("parseCodeFenceLineNumbering", () => {
  it("defaults to starting at 1 with no jumps", () => {
    expect(parseCodeFenceLineNumbering(null)).toEqual({
      start: 1,
      jumps: [],
    });
  });

  it("parses a custom starting line number", () => {
    expect(parseCodeFenceLineNumbering("5")).toEqual({
      start: 5,
      jumps: [],
    });
  });

  it("parses a jump range, with an inclusive-exclusive end", () => {
    expect(parseCodeFenceLineNumbering("5:10")).toEqual({
      start: 1,
      jumps: [{ start: 5, end: 9 }],
    });
  });

  it("accepts a hyphen in place of the colon, matching hl:'s range syntax", () => {
    expect(parseCodeFenceLineNumbering("5-10")).toEqual({
      start: 1,
      jumps: [{ start: 5, end: 9 }],
    });
  });

  it("parses multiple comma-separated jump ranges", () => {
    expect(parseCodeFenceLineNumbering("2:3,6:7")).toEqual({
      start: 1,
      jumps: [
        { start: 2, end: 2 },
        { start: 6, end: 6 },
      ],
    });
  });

  it("combines a starting line number with jump ranges", () => {
    expect(parseCodeFenceLineNumbering("5,8:10")).toEqual({
      start: 5,
      jumps: [{ start: 8, end: 9 }],
    });
  });

  it("ignores a malformed jump range", () => {
    expect(parseCodeFenceLineNumbering("10:5")).toEqual({
      start: 1,
      jumps: [],
    });
  });
});
