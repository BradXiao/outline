/**
 * Add support for additional syntax that users paste even though it isn't
 * supported by the markdown parser directly by massaging the text content.
 *
 * @param text The incoming pasted plain text
 */
export default function normalizePastedMarkdown(text: string): string {
  // Avoid `\s?` here — it can consume newlines before a checkbox on the next line.
  const CHECKBOX_REGEX = /^(?: ?)(\[(X|\s|_|-)\]\s(.*)?)/gim;

  // find checkboxes not contained in a list and wrap them in list items
  while (text.match(CHECKBOX_REGEX)) {
    text = text.replace(CHECKBOX_REGEX, (match) => `- ${match.trim()}`);
  }

  // Each tab becomes four spaces.
  text = text.replace(/\t/g, "    ");

  // Leading 4+ spaces would become indented code blocks (or be stripped). Convert
  // them to NBSP so indentation stays visible as spaces, except for nested list
  // items which need real spaces to parse correctly.
  text = text.replace(/^( {4,})(?![-*+] |\d+\. )/gm, (spaces) =>
    "\u00A0".repeat(spaces.length)
  );

  // Each line ending becomes a paragraph break. Blank lines are encoded as a
  // lone backslash paragraph so the breaks rule restores empty paragraphs
  // instead of collapsing multiple newlines. Consecutive blockquote lines are
  // joined so they stay in a single quote block.
  if (text.includes("\n") || text.includes("\r")) {
    text = joinNormalizedLines(
      text.replace(/\r\n?/g, "\n").split("\n")
    );
  }

  return text;
}

/**
 * Check whether a line is a markdown blockquote line.
 *
 * @param line A single line of pasted plain text.
 * @return True if the line starts a blockquote.
 */
function isBlockquoteLine(line: string): boolean {
  return /^ {0,3}>/.test(line);
}

/**
 * Join normalized lines into markdown that preserves Enter semantics while
 * keeping consecutive blockquote lines in one quote block.
 *
 * @param lines Lines of pasted plain text after checkbox/tab normalization.
 * @return The joined markdown string.
 */
function joinNormalizedLines(lines: string[]): string {
  if (lines.length === 0) {
    return "";
  }

  const normalized = lines.map((line) => (line === "" ? "\\" : line));
  let result = normalized[0];

  for (let index = 1; index < normalized.length; index++) {
    const previous = normalized[index - 1];
    const current = normalized[index];

    if (
      previous !== "\\" &&
      current !== "\\" &&
      isBlockquoteLine(previous) &&
      isBlockquoteLine(current)
    ) {
      // Keep consecutive quote lines in one blockquote with separate paragraphs.
      result += "\n>\n" + current;
    } else {
      result += "\n\n" + current;
    }
  }

  return result;
}
