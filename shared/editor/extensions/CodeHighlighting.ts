import { flattenDeep } from "es-toolkit/compat";
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { Decoration, DecorationSet } from "prosemirror-view";
import type refractorType from "refractor/core";
import { getLoaderForLanguage, getRefractorLangForLanguage } from "../lib/code";
import {
  isLineHighlighted,
  parseCodeFenceHighlight,
  parseCodeFenceLineNumbering,
} from "../lib/codeFenceInfo";
import { isRemoteTransaction } from "../lib/multiplayer";
import { findBlockNodes } from "../queries/findChildren";
import { EditorStyleHelper } from "../styles/EditorStyleHelper";

type ParsedNode = {
  text: string;
  classes: string[];
};

/**
 * Build the DOM for a single line-number gutter cell. The number lives in the
 * code's text flow (as a widget decoration) rather than a CSS overlay, so a
 * soft-wrapped line keeps exactly one number and its continuation rows get a
 * blank gutter. The gutter cell paints its own highlight background when its
 * line matches an `hl:` spec, since the code text's highlight span (further
 * along the same line) cannot safely bleed left into the gutter without
 * overlapping this cell.
 *
 * @param lineNumber - the one-based line number to render.
 * @param highlighted - whether the line matches an `hl:` spec.
 * @returns the gutter cell element.
 */
function createLineNumber(lineNumber: number): HTMLElement {
  const span = document.createElement("span");
  span.className = "line-number";
  span.contentEditable = "false";
  span.textContent = String(lineNumber);
  return span;
}

/**
 * Build the DOM for the separator widget marking an `ln:` numbering jump. The
 * raw line that follows is still rendered in full; this only calls out the
 * gap in the displayed numbering.
 *
 * @returns the separator element.
 */
function createLineSeparator(): HTMLElement {
  const span = document.createElement("span");
  span.className = EditorStyleHelper.codeLineSeparator;
  span.contentEditable = "false";
  span.textContent = "⋯";
  return span;
}

/**
 * Build the DOM for a highlighted empty line. An empty line has no text for
 * an inline decoration to attach to, so it needs a standalone element to
 * carry the highlight background across the full row.
 *
 * @returns the highlight element.
 */
function createEmptyLineHighlight(): HTMLElement {
  const span = document.createElement("span");
  span.className = `${EditorStyleHelper.codeLineHighlight} ${EditorStyleHelper.codeLineHighlightEmpty}`;
  return span;
}

const cache: Record<number, { node: Node; decorations: Decoration[] }> = {};
const languagesToImport = new Set<string>();
const languagePromises: Record<
  string,
  Promise<string | undefined> | undefined
> = {};

let refractor: typeof refractorType | undefined;

/** Lazily load refractor core. */
async function getRefractor() {
  refractor ??= (await import("refractor/core")).default;
  return refractor;
}

async function loadLanguage(language: string) {
  const r = await getRefractor();
  if (!language || r.registered(language)) {
    return;
  }

  if (languagePromises[language]) {
    return languagePromises[language];
  }

  const loader = getLoaderForLanguage(language);
  if (!loader) {
    return;
  }

  languagePromises[language] = loader()
    .then((syntax) => {
      r.register(syntax);
      return language;
    })
    .catch((err) => {
      // It will retry loading the language on the next render
      // oxlint-disable-next-line no-console
      console.error(
        `Failed to load language ${language} for code highlighting`,
        err,
      );
      delete languagePromises[language]; // Remove failed promise from cache
      return undefined;
    });

  return languagePromises[language];
}

function getLineHeight(element: HTMLElement): number {
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);

  if (Number.isFinite(lineHeight)) {
    return lineHeight;
  }

  return 20;
}

function clearCodeLineHighlightOverlays(root: HTMLElement) {
  root
    .querySelectorAll(`.`)
    .forEach((element) => element.remove());
}

function syncCodeLineHighlightOverlays(view: EditorView, name: string) {
  if (!(view.dom instanceof HTMLElement)) {
    return;
  }

  clearCodeLineHighlightOverlays(view.dom);

  const blocks: { node: Node; pos: number }[] = findBlockNodes(
    view.state.doc,
    true,
  ).filter((item) => item.node.type.name === name);

  blocks.forEach((block) => {
    const highlightSpecs = parseCodeFenceHighlight(block.node.attrs.hl ?? null);

    if (!highlightSpecs.length) {
      return;
    }

    const blockElement = view.nodeDOM(block.pos);
    if (!(blockElement instanceof HTMLElement)) {
      return;
    }

    const pre = blockElement.querySelector("pre");
    if (!(pre instanceof HTMLElement)) {
      return;
    }

    const preStyles = getComputedStyle(pre);
    const preRect = pre.getBoundingClientRect();
    const borderTop = Number.parseFloat(preStyles.borderTopWidth) || 0;
    const lineHeight = getLineHeight(pre);
    const text = block.node.textContent;
    let lineNumber = 1;
    let linePos = block.pos + 1;

    for (let i = 0; i <= text.length; i++) {
      const atNewline = text[i] === "\n";
      if (!atNewline && i < text.length) {
        continue;
      }

      const lineEnd = block.pos + 1 + i;
      const lineText = text.slice(linePos - block.pos - 1, i);
      const highlighted = isLineHighlighted(
        highlightSpecs,
        lineNumber,
        lineText,
      );

      if (highlighted) {
        try {
          const startCoords = view.coordsAtPos(linePos);
          const endCoords = view.coordsAtPos(lineEnd);
          const top = Math.max(
            0,
            startCoords.top - preRect.top + pre.scrollTop - borderTop,
          );
          const height = Math.max(
            lineHeight,
            endCoords.bottom - startCoords.top,
          );
          const highlight = document.createElement("div");

          highlight.className = EditorStyleHelper.codeLineHighlight;
          highlight.contentEditable = "false";
          highlight.style.top = `px`;
          highlight.style.height = `px`;
          pre.insertBefore(highlight, pre.firstChild);
        } catch {
          // The editor view may not have DOM coordinates for a block while it is
          // being mounted or unmounted. It will be measured again on the next
          // view update.
        }
      }

      lineNumber += 1;
      linePos = atNewline ? lineEnd + 1 : lineEnd;
    }
  });
}

function getDecorations({
  doc,
  name,
  lineNumbers,
}: {
  /** The prosemirror document to operate on. */
  doc: Node;
  /** The node name. */
  name: string;
  /** Whether to include decorations representing line numbers */
  lineNumbers?: boolean;
}) {
  const decorations: Decoration[] = [];
  const blocks: { node: Node; pos: number }[] = findBlockNodes(
    doc,
    true,
  ).filter((item) => item.node.type.name === name);

  function parseNodes(
    nodes: refractorType.RefractorNode[],
    classNames: string[] = [],
  ): {
    text: string;
    classes: string[];
  }[] {
    return flattenDeep(
      nodes.map((node) => {
        if (node.type === "element") {
          const classes = [...classNames, ...(node.properties.className || [])];
          return parseNodes(node.children, classes);
        }

        return {
          text: node.value,
          classes: classNames,
        };
      }),
    );
  }

  blocks.forEach((block) => {
    let startPos = block.pos + 1;
    const language = block.node.attrs.language;
    const lang = getRefractorLangForLanguage(language);
    const lineDecorations = [];

    if (!cache[block.pos] || !cache[block.pos].node.eq(block.node)) {
      // Per-block line number preference. Falls back to the editor-wide default
      // for blocks that predate the attribute (loaded without it set).
      const showLineNumbers = block.node.attrs.lineNumbers ?? lineNumbers;
      const text = block.node.textContent;
      const highlightSpecs = parseCodeFenceHighlight(
        block.node.attrs.hl ?? null,
      );
      const numbering = parseCodeFenceLineNumbering(
        block.node.attrs.ln ?? null,
      );
      const lineCount = (text.match(/\n/g) || []).length + 1;

      // ln: jumps only affect the displayed number, so the widest possible
      // number also needs to account for every jump's size.
      const jumps = numbering.jumps;
      const totalJump = jumps.reduce(
        (sum, jump) => sum + (jump.end - jump.start + 1),
        0,
      );
      const gutterWidth = String(
        numbering.start + lineCount - 1 + totalJump,
      ).length;

      // Walk the block's lines once, anchoring line-number widgets, hl:
      // highlight decorations, and the ln: jump separator at each line's
      // start position. The first line begins at the content start
      // (block.pos + 1); every subsequent line begins one position after its
      // preceding newline. Every raw line is always rendered in full — a
      // jump only ever changes which number is displayed next to a line, it
      // never removes any of the block's own text from view.
      let lineNumber = 1;
      let linePos = block.pos + 1;
      let jumpOffset = 0;

      for (let i = 0; i <= text.length; i++) {
        const atNewline = text[i] === "\n";
        if (!atNewline && i < text.length) {
          continue;
        }

        const lineEnd = block.pos + 1 + i;
        const lineText = text.slice(linePos - block.pos - 1, i);

        // Jump ranges are specified in the displayed numbering, not raw line
        // position, so each one must be matched against the number this line
        // would otherwise show — which already accounts for any earlier
        // jump's offset — rather than against its raw line count. Matching
        // against the raw count instead would work for a single jump (where
        // the two coincide) but misfire for a second jump once the first has
        // shifted the display numbers away from the raw count.
        const wouldBeDisplayNumber = numbering.start + lineNumber - 1 + jumpOffset;
        const jump = jumps.find((range) => range.start === wouldBeDisplayNumber);
        if (jump) {
          jumpOffset += jump.end - jump.start + 1;
          lineDecorations.push(
            Decoration.widget(linePos, createLineSeparator, {
              side: -1,
              key: `line-separator-${block.pos}-${jump.start}`,
            }),
          );
        }

        // hl: specs are authored against the displayed numbering (what the
        // user actually sees in the gutter), not the raw line count, so the
        // match must use the same jump-adjusted number as the gutter widget
        // below rather than the raw lineNumber.
        const displayNumber = numbering.start + lineNumber - 1 + jumpOffset;
        const highlighted = isLineHighlighted(
          highlightSpecs,
          displayNumber,
          lineText,
        );

        if (highlighted) {
          if (lineEnd > linePos) {
            lineDecorations.push(
              Decoration.inline(linePos, lineEnd, {
                class: EditorStyleHelper.codeLineHighlight,
              }),
            );
          } else {
            // An empty line has no text for an inline decoration to attach
            // to, so fall back to a standalone element for the background.
            lineDecorations.push(
              Decoration.widget(linePos, createEmptyLineHighlight, {
                side: 0,
                key: `line-highlight-empty-${block.pos}-${lineNumber}`,
              }),
            );
          }
        }

        if (showLineNumbers) {
          lineDecorations.push(
            Decoration.widget(
              linePos,
              () => createLineNumber(displayNumber, highlighted),
              {
                side: -1,
                key: `line-number-${displayNumber}-${gutterWidth}-${highlighted}`,
              },
            ),
          );
        }

        lineNumber += 1;
        linePos = atNewline ? lineEnd + 1 : lineEnd;
      }

      if (showLineNumbers) {
        // Reserve the gutter space and expose its width to the CSS that sizes
        // each number.
        lineDecorations.push(
          Decoration.node(
            block.pos,
            block.pos + block.node.nodeSize,
            { style: `--line-number-gutter-width: ${gutterWidth};` },
            { key: `code-block-style-${gutterWidth}` },
          ),
        );
      }

      cache[block.pos] = {
        node: block.node,
        decorations: lineDecorations,
      };

      if (!lang) {
        // do nothing
      } else if (refractor?.registered(lang)) {
        languagesToImport.delete(language);

        const nodes = refractor!.highlight(block.node.textContent, lang);
        const newDecorations = parseNodes(nodes)
          .map((node: ParsedNode) => {
            const from = startPos;
            const to = from + node.text.length;

            startPos = to;

            return {
              ...node,
              from,
              to,
            };
          })
          .filter((node) => node.classes && node.classes.length)
          .map((node) =>
            Decoration.inline(node.from, node.to, {
              class: node.classes.join(" "),
            }),
          )
          .concat(lineDecorations);


        cache[block.pos] = {
          node: block.node,
          decorations: newDecorations,
        };
      } else {
        languagesToImport.add(language);
      }
    }

    cache[block.pos]?.decorations.forEach((decoration) => {
      decorations.push(decoration);
    });
  });

  Object.keys(cache)
    .filter((pos) => !blocks.find((block) => block.pos === Number(pos)))
    .forEach((pos) => {
      delete cache[Number(pos)];
    });

  return DecorationSet.create(doc, decorations);
}

export function CodeHighlighting({
  name,
  lineNumbers,
}: {
  /** The node name. */
  name: string;
  /** Whether to include decorations representing line numbers */
  lineNumbers?: boolean;
}) {
  let highlighted = false;

  return new Plugin({
    key: new PluginKey("codeHighlighting"),
    state: {
      init: (_, { doc }) => DecorationSet.create(doc, []),
      apply: (transaction: Transaction, decorationSet, oldState, state) => {
        const nodeName = state.selection.$head.parent.type.name;
        const previousNodeName = oldState.selection.$head.parent.type.name;
        const codeBlockChanged =
          transaction.docChanged && [nodeName, previousNodeName].includes(name);

        // @ts-expect-error accessing private field.
        const isPaste = transaction.meta?.paste;
        const langLoaded = transaction.getMeta("codeHighlighting")?.langLoaded;
        // Set when a code block's attributes change without the selection being
        // inside it (e.g. editing the title from the title row). Without this,
        // mapping the existing decorations through the setNodeMarkup step drops
        // the line-number node decoration and the gutter disappears.
        const refresh = transaction.getMeta("codeHighlighting")?.refresh;

        if (
          !highlighted ||
          codeBlockChanged ||
          isPaste ||
          langLoaded ||
          refresh ||
          isRemoteTransaction(transaction)
        ) {
          // Invalidate cached entries for blocks whose language just loaded
          // so getDecorations rebuilds them with syntax highlighting applied.
          if (Array.isArray(langLoaded)) {
            for (const key of Object.keys(cache)) {
              const pos = Number(key);
              if (langLoaded.includes(cache[pos]?.node.attrs.language)) {
                delete cache[pos];
              }
            }
          }
          highlighted = true;
          return getDecorations({ doc: transaction.doc, name, lineNumbers });
        }

        return decorationSet.map(transaction.mapping, transaction.doc);
      },
    },
    view: (view) => {
      if (!highlighted) {
        void getRefractor().then(() => {
          if (!view.isDestroyed) {
            view.dispatch(
              view.state.tr.setMeta("codeHighlighting", {
                langLoaded: true,
              }),
            );
          }
        });
      }
      return {
        update: () => {
          if (!languagesToImport.size) {
            return;
          }

          void Promise.all([...languagesToImport].map(loadLanguage)).then(
            (results) => {
              const loaded = results.filter((lang): lang is string => !!lang);
              if (loaded.length && !view.isDestroyed) {
                view.dispatch(
                  view.state.tr.setMeta("codeHighlighting", {
                    langLoaded: loaded,
                  }),
                );
              }
            },
          );
        },
      };
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
