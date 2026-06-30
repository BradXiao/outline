import { flattenDeep } from "es-toolkit/compat";
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type refractorType from "refractor/core";
import { getLoaderForLanguage, getRefractorLangForLanguage } from "../lib/code";
import { isRemoteTransaction } from "../lib/multiplayer";
import { findBlockNodes } from "../queries/findChildren";

type ParsedNode = {
  text: string;
  classes: string[];
};

/**
 * Build the DOM for a single line-number gutter cell. The number lives in the
 * code's text flow (as a widget decoration) rather than a CSS overlay, so a
 * soft-wrapped line keeps exactly one number and its continuation rows get a
 * blank gutter.
 *
 * @param lineNumber - the one-based line number to render.
 * @returns the gutter cell element.
 */
function createLineNumber(lineNumber: number): HTMLElement {
  const span = document.createElement("span");
  span.className = "line-number";
  span.contentEditable = "false";
  span.textContent = String(lineNumber);
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
        err
      );
      delete languagePromises[language]; // Remove failed promise from cache
      return undefined;
    });

  return languagePromises[language];
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
    true
  ).filter((item) => item.node.type.name === name);

  function parseNodes(
    nodes: refractorType.RefractorNode[],
    classNames: string[] = []
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
      })
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
      if (showLineNumbers) {
        const text = block.node.textContent;
        const lineCount = (text.match(/\n/g) || []).length + 1;
        const gutterWidth = String(lineCount).length;

        // Reserve the gutter space and expose its width to the CSS that sizes
        // each number. A single node decoration keeps this cheap.
        lineDecorations.push(
          Decoration.node(
            block.pos,
            block.pos + block.node.nodeSize,
            { style: `--line-number-gutter-width: ${gutterWidth};` },
            { key: `line-gutter-${gutterWidth}` }
          )
        );

        // One widget per logical line, anchored at the line's start position.
        // The first line begins at the content start (block.pos + 1); every
        // subsequent line begins one position after its preceding newline.
        const pushNumber = (pos: number, lineNumber: number) => {
          lineDecorations.push(
            Decoration.widget(pos, () => createLineNumber(lineNumber), {
              side: -1,
              key: `line-number-${lineNumber}-${gutterWidth}`,
            })
          );
        };

        let lineNumber = 1;
        pushNumber(block.pos + 1, lineNumber);
        for (let i = 0; i < text.length; i++) {
          if (text[i] === "\n") {
            lineNumber += 1;
            pushNumber(block.pos + 1 + i + 1, lineNumber);
          }
        }
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
            })
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
              })
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
                  })
                );
              }
            }
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
