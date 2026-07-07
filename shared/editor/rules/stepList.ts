import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";

const STEP_LINE = /^Step\s+\d+\.\s+(.*)$/i;
const SUBTITLE_LINE = /^>>\s*(.*)$/;

function getLine(state: StateBlock, line: number): string {
  const pos = state.bMarks[line] + state.tShift[line];
  const max = state.eMarks[line];
  return state.src.slice(pos, max);
}

function pushParagraph(state: StateBlock, from: number, to: number): void {
  const lines: string[] = [];
  for (let i = from; i < to; i++) {
    lines.push(getLine(state, i));
  }

  state.push("paragraph_open", "p", 1);
  const inline = state.push("inline", "", 0);
  inline.content = lines.join("\n").trim();
  inline.map = [from, to];
  inline.children = [];
  state.push("paragraph_close", "p", -1);
}

/**
 * Consume any additional body content belonging to the step that started at
 * the current position (e.g. a description paragraph after the title and
 * subtitle), so it doesn't spill out of the step_list_item.
 *
 * Stops, without consuming, at whichever comes first: the next "Step N."
 * line (list continues), a blank line with no following step (list ends),
 * or the end of the block range.
 */
function consumeBody(state: StateBlock, startLine: number, endLine: number) {
  let line = startLine;

  for (;;) {
    if (line >= endLine) {
      return line;
    }

    if (state.isEmpty(line)) {
      const next = line + 1;
      if (next >= endLine || state.isEmpty(next)) {
        return line;
      }
      if (STEP_LINE.test(getLine(state, next))) {
        return next;
      }
      line = next;
      continue;
    }

    if (STEP_LINE.test(getLine(state, line))) {
      return line;
    }

    const paraStart = line;
    while (
      line < endLine &&
      !state.isEmpty(line) &&
      !STEP_LINE.test(getLine(state, line))
    ) {
      line += 1;
    }

    pushParagraph(state, paraStart, line);
  }
}

function stepList(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  // Not a candidate if indented as a code block.
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }

  const firstMatch = STEP_LINE.exec(getLine(state, startLine));
  if (!firstMatch) {
    return false;
  }

  if (silent) {
    return true;
  }

  const listToken = state.push("step_list_open", "ol", 1);
  const listMap: [number, number] = [startLine, startLine];
  listToken.map = listMap;

  let line = startLine;

  while (line < endLine) {
    const match = STEP_LINE.exec(getLine(state, line));
    if (!match) {
      break;
    }

    const itemOpen = state.push("step_list_item_open", "li", 1);
    itemOpen.map = [line, line + 1];

    state.push("paragraph_open", "p", 1);
    const titleInline = state.push("inline", "", 0);
    titleInline.content = match[1].trim();
    titleInline.map = [line, line + 1];
    titleInline.children = [];
    state.push("paragraph_close", "p", -1);
    line += 1;

    if (line < endLine) {
      const subtitleMatch = SUBTITLE_LINE.exec(getLine(state, line));
      if (subtitleMatch) {
        state.push("step_list_subtitle_open", "p", 1);
        const subtitleInline = state.push("inline", "", 0);
        subtitleInline.content = subtitleMatch[1].trim();
        subtitleInline.map = [line, line + 1];
        subtitleInline.children = [];
        state.push("step_list_subtitle_close", "p", -1);
        line += 1;
      }
    }

    // Fold any further description paragraphs into this step, instead of
    // letting them spill out of the list as top-level content.
    line = consumeBody(state, line, endLine);

    itemOpen.map[1] = line;
    state.push("step_list_item_close", "li", -1);
  }

  listMap[1] = line;
  state.push("step_list_close", "ol", -1);
  state.line = line;

  return true;
}

/**
 * Markdown-it plugin to parse Outline's step list syntax:
 *
 *   Step 1. Title
 *   >> Optional subtitle
 *
 *   Step 2. Title
 *
 * into `step_list_open/close`, `step_list_item_open/close`, and
 * `step_list_subtitle_open/close` tokens, reusing standard paragraph tokens
 * for each step's title.
 */
export default function stepListRule(md: MarkdownIt): void {
  md.block.ruler.before("paragraph", "step_list", stepList, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
}
