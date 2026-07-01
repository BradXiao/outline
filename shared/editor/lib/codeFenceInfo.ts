/**
 * Structured representation of a fenced code block's info string (the text that
 * follows the opening ``` of a Markdown code fence).
 */
export interface CodeFenceInfo {
  /** The raw language token, e.g. "python". Empty when none is present. */
  language: string;
  /** A custom title, taken from a bare word/quoted string or a `title:` key. */
  title: string | null;
  /** Raw line-highlight spec from a `hl:` key, e.g. "2-5,8" or "5|test". */
  hl: string | null;
  /** Raw line-numbering spec from a `ln:` key, e.g. "5" or "5:10". */
  ln: string | null;
}

/**
 * A single highlighted-line criterion produced by {@link parseCodeFenceHighlight}.
 */
export interface CodeFenceHighlightSpec {
  /** One-based inclusive start line, or null to match any line. */
  start: number | null;
  /** One-based inclusive end line, or null to match any line. */
  end: number | null;
  /** Restrict the match to lines containing this substring, or null to match unconditionally. */
  text: string | null;
}

/**
 * Custom line-numbering for a code block, produced by {@link parseCodeFenceLineNumbering}.
 */
export interface CodeFenceLineNumbering {
  /** The number displayed for the first line. */
  start: number;
  /**
   * Ranges of displayed line numbers that are skipped over, in the order
   * they occur in the displayed numbering (not the block's raw line order).
   * The displayed number jumps from just before `start` to just after `end`
   * at that point in the block's raw lines. Every raw line is still rendered
   * in full; only the gutter number skips the range.
   */
  jumps: { start: number; end: number }[];
}

/**
 * Split an info string into whitespace-delimited tokens, treating any
 * double-quoted span (with `\"` and `\\` escapes) as part of a single token so
 * that whitespace inside quotes does not split it.
 *
 * @param info - the raw info string.
 * @returns the list of raw tokens, with quotes preserved.
 */
function tokenize(info: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let hasContent = false;

  for (let i = 0; i < info.length; i++) {
    const char = info[i];

    if (inQuote) {
      current += char;
      if (char === "\\" && i + 1 < info.length) {
        // Keep the escaped character verbatim so the closing quote is detected.
        current += info[++i];
      } else if (char === '"') {
        inQuote = false;
      }
      continue;
    }

    if (char === '"') {
      inQuote = true;
      current += char;
      hasContent = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (hasContent) {
        tokens.push(current);
        current = "";
        hasContent = false;
      }
      continue;
    }

    current += char;
    hasContent = true;
  }

  if (hasContent) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Whether a raw token is a fully double-quoted string.
 */
function isQuoted(token: string): boolean {
  return token.length >= 2 && token.startsWith('"') && token.endsWith('"');
}

/**
 * Remove surrounding quotes from a value and unescape `\"` and `\\`.
 */
function unquote(value: string): string {
  if (!isQuoted(value)) {
    return value;
  }
  return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

/**
 * Find the index of the first unquoted `:` or `=` delimiter in a token, or -1
 * when the token has no key/value delimiter.
 */
function findDelimiter(token: string): number {
  let inQuote = false;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (inQuote) {
      if (char === "\\") {
        i++;
      } else if (char === '"') {
        inQuote = false;
      }
      continue;
    }
    if (char === '"') {
      inQuote = true;
      continue;
    }
    if (char === ":" || char === "=") {
      return i;
    }
  }
  return -1;
}

/**
 * Parse a list of raw tokens into title/hl/ln, optionally claiming the first
 * bareword as the language. Shared by {@link parseCodeFenceInfo} (which has a
 * leading language token) and {@link parseCodeFenceParams} (which does not).
 */
function parseTokens(
  tokens: string[],
  { withLanguage }: { withLanguage: boolean },
): CodeFenceInfo {
  let language = "";
  // When there is no language slot to fill, the first bareword is free to
  // become the title instead.
  let languageAssigned = !withLanguage;
  let title: string | null = null;
  let hl: string | null = null;
  let ln: string | null = null;

  for (const token of tokens) {
    const delimiter = findDelimiter(token);
    if (delimiter > 0) {
      const key = token.slice(0, delimiter);
      const value = unquote(token.slice(delimiter + 1));
      if (key === "title" && title === null) {
        title = value;
      } else if (key === "hl" && hl === null) {
        hl = value;
      } else if (key === "ln" && ln === null) {
        ln = value;
      }
      continue;
    }

    if (isQuoted(token)) {
      if (title === null) {
        title = unquote(token);
      }
      continue;
    }

    if (!languageAssigned) {
      language = token;
      languageAssigned = true;
      continue;
    }

    // An unkeyed bareword that isn't the language defaults to the title.
    if (title === null) {
      title = token;
    }
  }

  return { language, title, hl, ln };
}

/**
 * Parse a code fence info string into its structured parts: the language, an
 * optional title (from a bare word, a quoted string, or a `title:` key), and
 * the raw `hl:`/`ln:` specs.
 *
 * @param info - the raw info string following the opening fence.
 * @returns the structured {@link CodeFenceInfo}.
 */
export function parseCodeFenceInfo(info: string): CodeFenceInfo {
  return parseTokens(tokenize(info ?? ""), { withLanguage: true });
}

/**
 * Parse a title-row edit string (no language slot) into title/hl/ln. Used by
 * the editable title input, which only ever edits these three features.
 *
 * @param params - the raw string typed into the title input.
 * @returns the parsed title/hl/ln.
 */
export function parseCodeFenceParams(
  params: string,
): Pick<CodeFenceInfo, "title" | "hl" | "ln"> {
  const { title, hl, ln } = parseTokens(tokenize(params ?? ""), {
    withLanguage: false,
  });
  return { title, hl, ln };
}

/**
 * Whether a param value must be quoted to survive a round-trip through the
 * tokenizer.
 */
function needsQuoting(value: string): boolean {
  return value === "" || /[\s":=]/.test(value);
}

/**
 * Wrap a value in double quotes, escaping `\` and `"`.
 */
function quote(value: string): string {
  return `"${value.replace(/([\\"])/g, "\\$1")}"`;
}

/**
 * Build the title/hl/ln portion shared by {@link serializeCodeFenceInfo} and
 * {@link serializeCodeFenceParams}.
 */
function buildParamParts(
  info: Pick<CodeFenceInfo, "title" | "hl" | "ln">,
  { quoteTitle }: { quoteTitle: boolean },
): string[] {
  const parts: string[] = [];

  if (info.title) {
    parts.push(
      quoteTitle || needsQuoting(info.title) ? quote(info.title) : info.title,
    );
  }

  if (info.hl) {
    parts.push(`hl:${needsQuoting(info.hl) ? quote(info.hl) : info.hl}`);
  }

  if (info.ln) {
    parts.push(`ln:${needsQuoting(info.ln) ? quote(info.ln) : info.ln}`);
  }

  return parts;
}

/**
 * Serialize structured fence info back into an info string. The title is
 * always quoted so it round-trips unambiguously regardless of whether a
 * language is present.
 *
 * @param info - the structured fence info.
 * @returns the info string for the opening fence.
 */
export function serializeCodeFenceInfo(info: CodeFenceInfo): string {
  const parts: string[] = [];

  if (info.language) {
    parts.push(info.language);
  }

  parts.push(...buildParamParts(info, { quoteTitle: true }));

  return parts.join(" ");
}

/**
 * Serialize title/hl/ln into the editable title-row syntax (no language). The
 * title is left bare when it doesn't need quoting, matching how a user would
 * naturally type it.
 *
 * @param info - the title/hl/ln to serialize.
 * @returns the raw string for the title input.
 */
export function serializeCodeFenceParams(
  info: Pick<CodeFenceInfo, "title" | "hl" | "ln">,
): string {
  return buildParamParts(info, { quoteTitle: false }).join(" ");
}

/**
 * Parse a `hl:` spec into a list of highlight criteria. Each comma-separated
 * token is either a line number, a line range (`N-M`), a bare word (matching
 * any line containing it), or a range/number restricted to lines containing a
 * word via `|` (e.g. `5-7|test`).
 *
 * @param hl - the raw `hl:` value, or null when absent.
 * @returns the parsed highlight criteria.
 */
export function parseCodeFenceHighlight(
  hl: string | null,
): CodeFenceHighlightSpec[] {
  if (!hl) {
    return [];
  }

  return hl
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const pipeIndex = token.indexOf("|");
      const rangePart = pipeIndex === -1 ? token : token.slice(0, pipeIndex);
      const textPart = pipeIndex === -1 ? null : token.slice(pipeIndex + 1);

      const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(rangePart);
      if (rangeMatch) {
        const start = Number(rangeMatch[1]);
        const end = rangeMatch[2] ? Number(rangeMatch[2]) : start;
        return { start, end, text: textPart };
      }

      // The range part isn't numeric, so treat the whole token as a word match.
      return { start: null, end: null, text: rangePart || null };
    });
}

/**
 * Whether a given source line matches any of the highlight criteria.
 *
 * @param specs - the parsed highlight criteria.
 * @param lineNumber - the one-based source line number.
 * @param lineText - the line's text content.
 * @returns whether the line should be highlighted.
 */
export function isLineHighlighted(
  specs: CodeFenceHighlightSpec[],
  lineNumber: number,
  lineText: string,
): boolean {
  return specs.some((spec) => {
    const inRange =
      spec.start === null ||
      (lineNumber >= spec.start && lineNumber <= (spec.end ?? spec.start));
    const textMatches = spec.text === null || lineText.includes(spec.text);
    return inRange && textMatches;
  });
}

/**
 * Parse a `ln:` spec into a starting line number and a list of numbering
 * jumps. The value is a comma-separated list: a bare number (`5`) starts
 * numbering at that line, while a range (`5:10` or `5-10`) marks a jump of 5
 * through 9 in the displayed numbering — the displayed number skips ahead by
 * the range's size at that point in the block's raw lines, but every raw
 * line is still shown in full. The hyphen form is accepted alongside the
 * colon so the syntax matches `hl:`'s range dashes. Multiple ranges may be
 * combined, e.g. `2:3,6:7` jumps when the displayed number reaches 2 and
 * again when it reaches 6 — each range's start refers to the displayed
 * numbering produced by the ranges before it, not to a raw line position.
 *
 * @param ln - the raw `ln:` value, or null when absent.
 * @returns the parsed line-numbering options.
 */
export function parseCodeFenceLineNumbering(
  ln: string | null,
): CodeFenceLineNumbering {
  let start = 1;
  const jumps: { start: number; end: number }[] = [];

  if (ln) {
    for (const token of ln
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      const rangeMatch = /^(\d+)[:-](\d+)$/.exec(token);
      if (rangeMatch) {
        const rangeStart = Number(rangeMatch[1]);
        const rangeEnd = Number(rangeMatch[2]);
        if (rangeEnd > rangeStart) {
          jumps.push({ start: rangeStart, end: rangeEnd - 1 });
        }
        continue;
      }

      const singleMatch = /^(\d+)$/.exec(token);
      if (singleMatch) {
        start = Number(singleMatch[1]);
      }
    }
  }

  return { start, jumps };
}
