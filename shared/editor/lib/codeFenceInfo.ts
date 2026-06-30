/**
 * Structured representation of a fenced code block's info string (the text that
 * follows the opening ``` of a Markdown code fence).
 */
export interface CodeFenceInfo {
  /** The raw language token, e.g. "python". Empty when none is present. */
  language: string;
  /** A custom title, taken from a bare double-quoted string in the info. */
  title: string | null;
  /** Additional key/value or boolean flags, reserved for future features. */
  params: Record<string, string | boolean>;
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
 * Parse a code fence info string into its structured parts. The first bareword
 * becomes the language; a bare double-quoted string becomes the title; tokens
 * of the form `key:value`, `key=value`, or a lone bareword become params (the
 * extension point for future features).
 *
 * @param info - the raw info string following the opening fence.
 * @returns the structured {@link CodeFenceInfo}.
 */
export function parseCodeFenceInfo(info: string): CodeFenceInfo {
  const tokens = tokenize(info ?? "");
  let language = "";
  let title: string | null = null;
  let languageAssigned = false;
  const params: Record<string, string | boolean> = {};

  for (const token of tokens) {
    const delimiter = findDelimiter(token);
    if (delimiter > 0) {
      const key = token.slice(0, delimiter);
      params[key] = unquote(token.slice(delimiter + 1));
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

    params[token] = true;
  }

  return { language, title, params };
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
 * Serialize structured fence info back into an info string. Inverse of
 * {@link parseCodeFenceInfo}: emits the language first, then the title as a
 * bare quoted string, then params as `key:value` pairs (quoting values that
 * need it) and boolean-true flags as bare words.
 *
 * @param info - the structured fence info.
 * @returns the info string for the opening fence.
 */
export function serializeCodeFenceInfo(info: CodeFenceInfo): string {
  const parts: string[] = [];

  if (info.language) {
    parts.push(info.language);
  }

  if (info.title) {
    parts.push(quote(info.title));
  }

  for (const [key, value] of Object.entries(info.params ?? {})) {
    if (value === false) {
      continue;
    }
    if (value === true) {
      parts.push(key);
      continue;
    }
    parts.push(`${key}:${needsQuoting(value) ? quote(value) : value}`);
  }

  return parts.join(" ");
}
