import copy from "copy-to-clipboard";
import { t } from "i18next";
import type Token from "markdown-it/lib/token.mjs";
import { textblockTypeInputRule } from "prosemirror-inputrules";
import type {
  DOMOutputSpec,
  NodeSpec,
  NodeType,
  Schema,
  Node as ProsemirrorNode,
} from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
} from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import type { Primitive } from "utility-types";
import type { UserPreferences } from "../../types";
import { isBrowser, isMac } from "../../utils/browser";
import backspaceToParagraph from "../commands/backspaceToParagraph";
import {
  isSelectionOnFirstCodeLine,
  newlineInCode,
  indentInCode,
  moveToNextNewline,
  moveToPreviousNewline,
  outdentInCode,
  enterInCode,
  splitCodeBlockOnTripleBackticks,
} from "../commands/codeFence";
import { selectAll } from "../commands/selectAll";
import toggleBlockType from "../commands/toggleBlockType";
import { CodeHighlighting } from "../plugins/CodeHighlightingPlugin";
import Mermaid, {
  pluginKey as mermaidPluginKey,
  type MermaidState,
} from "../extensions/Mermaid";
import {
  getLabelForLanguage,
  getCodeLanguageFromElement,
  getRecentlyUsedCodeLanguage,
  normalizeCodeLanguage,
  setRecentlyUsedCodeLanguage,
} from "../lib/code";
import {
  parseCodeFenceInfo,
  parseCodeFenceParams,
  serializeCodeFenceInfo,
  serializeCodeFenceParams,
} from "../lib/codeFenceInfo";
import {
  getCodeLanguageIcon,
  getCodeLanguageIconDataUri,
} from "../lib/codeLanguageIcons";
import { isCode, isMermaid } from "../lib/isCode";
import { isRemoteTransaction } from "../lib/multiplayer";
import { findBlockNodes } from "../queries/findChildren";
import type { MarkdownSerializerState } from "../lib/markdown/serializer";
import { escapeRawTableCell } from "../lib/markdown/tableCell";
import { findNextNewline, findPreviousNewline } from "../queries/findNewlines";
import {
  findParentNode,
  findParentNodeClosestToPos,
} from "../queries/findParentNode";
import { EditorStyleHelper } from "../styles/EditorStyleHelper";
import { getMarkRange } from "../queries/getMarkRange";
import { isInCode } from "../queries/isInCode";
import Node from "./Node";

const DEFAULT_LANGUAGE = "javascript";

/** Fraction of the viewport height above which a code block is collapsible. */
const COLLAPSE_HEIGHT_RATIO = 0.5;

/** Approximate rendered line height of a code block, in pixels. */
const CODE_LINE_HEIGHT = 20;

interface CollapseState {
  /** Positions of code blocks taller than COLLAPSE_HEIGHT_RATIO of the viewport. */
  tallBlocks: Set<number>;
  /** Positions of code blocks currently collapsed by the user or auto-collapse. */
  collapsedBlocks: Set<number>;
  /** Node decorations that add the `collapsed` CSS class. */
  decorations: DecorationSet;
}

/**
 * Find all code block positions whose estimated height exceeds
 * COLLAPSE_HEIGHT_RATIO of the viewport height.
 *
 * @param doc - the document to scan.
 * @returns set of positions of tall code blocks.
 */
function findTallBlocks(doc: ProsemirrorNode): Set<number> {
  const tall = new Set<number>();
  if (!isBrowser) {
    return tall;
  }
  const maxLines =
    (window.innerHeight * COLLAPSE_HEIGHT_RATIO) / CODE_LINE_HEIGHT;
  for (const block of findBlockNodes(doc, true)) {
    if (isCode(block.node)) {
      const lines = (block.node.textContent.match(/\n/g)?.length ?? 0) + 1;
      if (lines > maxLines) {
        tall.add(block.pos);
      }
    }
  }
  return tall;
}

/**
 * Build a CollapseState with node decorations for the collapsed class and
 * widget decorations for toggle buttons on all tall blocks.
 */
function buildCollapseState(
  doc: ProsemirrorNode,
  tallBlocks: Set<number>,
  collapsedBlocks: Set<number>,
  expandLabel: string,
  collapseLabel: string
): CollapseState {
  const decorations: Decoration[] = [];
  for (const pos of tallBlocks) {
    const node = doc.nodeAt(pos);
    if (!node || !isCode(node)) {
      continue;
    }

    const isCollapsed = collapsedBlocks.has(pos);

    if (isCollapsed) {
      // The line-number widgets live in the code's text flow, so the collapsed
      // block's `max-height` clip hides the gutter beyond the fold for free —
      // no separate line-number overlay is needed here.
      decorations.push(
        Decoration.node(
          pos,
          pos + node.nodeSize,
          { class: "collapsed" },
          { collapsed: true }
        )
      );
    }

    const label = isCollapsed ? expandLabel : collapseLabel;
    decorations.push(
      Decoration.widget(
        pos + node.nodeSize,
        () => {
          const button = document.createElement("button");
          button.className = EditorStyleHelper.codeBlockToggle;
          button.contentEditable = "false";
          button.type = "button";
          button.textContent = label;
          return button;
        },
        { side: 1, key: `toggle-${pos}-${isCollapsed}` }
      )
    );
  }
  return {
    tallBlocks,
    collapsedBlocks,
    decorations: DecorationSet.create(doc, decorations),
  };
}

/**
 * Options for the CodeFence node.
 */
type CodeFenceOptions = {
  /** Display preferences for the logged in user, if any. */
  userPreferences?: UserPreferences | null;
};

export default class CodeFence extends Node<CodeFenceOptions> {
  /** Plugin key for the collapse state, shared with the command. */
  private static readonly collapseKey = new PluginKey<CollapseState>(
    "collapse-code-block"
  );

  get showLineNumbers(): boolean {
    return this.options.userPreferences?.codeBlockLineNumbers ?? true;
  }

  get name() {
    return "code_fence";
  }

  get schema(): NodeSpec {
    return {
      attrs: {
        language: {
          default: DEFAULT_LANGUAGE,
          validate: "string",
        },
        title: {
          default: null,
          validate: "string|null",
        },
        hl: {
          default: null,
          validate: "string|null",
        },
        ln: {
          default: null,
          validate: "string|null",
        },
        wrap: {
          default: false,
          validate: "boolean",
        },
        lineNumbers: {
          // Defaults to the logged in user's display preference so blocks
          // without an explicit choice follow the global setting. Toggling the
          // menu button writes an explicit boolean that overrides it.
          default: this.showLineNumbers,
          validate: "boolean",
        },
      },
      content: "text*",
      marks: "comment",
      group: "block",
      code: true,
      defining: true,
      draggable: false,
      parseDOM: [
        {
          tag: `.${EditorStyleHelper.codeBlock}`,
          priority: 60,
          preserveWhitespace: "full",
          contentElement: (node: HTMLElement) =>
            node.querySelector("code") || node,
          getAttrs: (dom: HTMLDivElement) => ({
            language: getCodeLanguageFromElement(dom) ?? "none",
            title: dom.dataset.title ?? null,
            hl: dom.dataset.hl ?? null,
            ln: dom.dataset.ln ?? null,
            wrap: dom.classList.contains("with-line-wrap"),
            lineNumbers: dom.classList.contains("with-line-numbers"),
          }),
        },
        {
          tag: "code",
          priority: 60,
          preserveWhitespace: "full",
          getAttrs: (dom) => {
            // Only parse code blocks that contain newlines for code fences,
            // otherwise the code mark rule will be applied.
            if (!dom.textContent?.includes("\n")) {
              return false;
            }
            return { language: getCodeLanguageFromElement(dom) ?? "none" };
          },
        },
      ],
      toDOM: (node) => {
        const classes = [
          EditorStyleHelper.codeBlock,
          node.attrs.wrap ? "with-line-wrap" : "",
          node.attrs.lineNumbers ? "with-line-numbers" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const language: string = node.attrs.language ?? "none";

        // A static title row is rendered inside the block so it survives static
        // HTML/PDF export, where plugin decorations (and therefore the live
        // editor's interactive title widget) are not rendered. It is hidden in
        // the live editor via CSS, where the widget takes over. Mermaid blocks
        // render a diagram instead of a title, so they are skipped.
        const titleRow: DOMOutputSpec | null = isMermaid(node)
          ? null
          : [
              "div",
              {
                class: `${EditorStyleHelper.codeBlockTitle} ${EditorStyleHelper.codeBlockTitleStatic}`,
                contentEditable: "false",
              },
              [
                "img",
                {
                  class: EditorStyleHelper.codeBlockTitleIcon,
                  src: getCodeLanguageIconDataUri(language),
                  alt: "",
                  "aria-hidden": "true",
                },
              ],
              [
                "span",
                { class: EditorStyleHelper.codeBlockTitleInput },
                node.attrs.title || getLabelForLanguage(language),
              ],
            ];

        return [
          "div",
          {
            class: classes,
            "data-language": node.attrs.language,
            ...(node.attrs.title ? { "data-title": node.attrs.title } : {}),
            ...(node.attrs.hl ? { "data-hl": node.attrs.hl } : {}),
            ...(node.attrs.ln ? { "data-ln": node.attrs.ln } : {}),
          },
          ...(titleRow ? [titleRow] : []),
          ["pre", ["code", { spellCheck: "false" }, 0]],
        ];
      },
    };
  }

  commands({ type, schema }: { type: NodeType; schema: Schema }) {
    return {
      code_block: (attrs: Record<string, Primitive>) => {
        if (attrs?.language) {
          setRecentlyUsedCodeLanguage(attrs.language as string);
        }
        return toggleBlockType(type, schema.nodes.paragraph, {
          language: getRecentlyUsedCodeLanguage() ?? DEFAULT_LANGUAGE,
          ...attrs,
        });
      },
      expandCodeBlockAt:
        (pos: number): Command =>
        (state, dispatch) => {
          const $pos = state.doc.resolve(pos);
          const codeBlock = findParentNodeClosestToPos($pos, isCode);
          if (!codeBlock) {
            return false;
          }

          const collapseState = CodeFence.collapseKey.getState(state);
          if (!collapseState?.collapsedBlocks.has(codeBlock.pos)) {
            return false;
          }

          if (dispatch) {
            dispatch(
              state.tr
                .setMeta(CodeFence.collapseKey, { expand: codeBlock.pos })
                .setMeta("addToHistory", false)
            );
          }
          return true;
        },
      toggleCodeBlockCollapse: (): Command => (state, dispatch) => {
        const codeBlock = findParentNode(isCode)(state.selection);
        if (!codeBlock) {
          return false;
        }

        if (dispatch) {
          dispatch(
            state.tr
              .setMeta(CodeFence.collapseKey, {
                toggle: codeBlock.pos,
              })
              .setMeta("addToHistory", false)
          );
        }
        return true;
      },
      toggleCodeBlockWrap: (): Command => (state, dispatch) => {
        const codeBlock = findParentNode(isCode)(state.selection);
        if (!codeBlock) {
          return false;
        }

        if (dispatch) {
          dispatch(
            state.tr.setNodeMarkup(codeBlock.pos, undefined, {
              ...codeBlock.node.attrs,
              wrap: !codeBlock.node.attrs.wrap,
            })
          );
        }
        return true;
      },
      toggleCodeBlockLineNumbers: (): Command => (state, dispatch) => {
        const codeBlock = findParentNode(isCode)(state.selection);
        if (!codeBlock) {
          return false;
        }

        if (dispatch) {
          dispatch(
            state.tr
              .setNodeMarkup(codeBlock.pos, undefined, {
                ...codeBlock.node.attrs,
                lineNumbers: !codeBlock.node.attrs.lineNumbers,
              })
              // The selection may sit in the title input rather than inside the
              // block, so force the highlighting plugin to rebuild the gutter
              // decorations for the new attribute value.
              .setMeta("codeHighlighting", { refresh: true })
          );
        }
        return true;
      },
      edit_mermaid: (): Command => (state, dispatch) => {
        const codeBlock =
          state.selection instanceof NodeSelection &&
          isCode(state.selection.node)
            ? { pos: state.selection.from, node: state.selection.node }
            : findParentNode(isCode)(state.selection);
        if (!codeBlock || !isMermaid(codeBlock.node)) {
          return false;
        }

        const mermaidState = mermaidPluginKey.getState(state) as MermaidState;
        const decorations = mermaidState?.decorationSet.find(
          codeBlock.pos,
          codeBlock.pos + codeBlock.node.nodeSize
        );
        const nodeDecoration = decorations?.find(
          (d) => d.spec.diagramId && d.from === codeBlock.pos
        );
        const diagramId = nodeDecoration?.spec.diagramId;

        if (dispatch && diagramId) {
          dispatch(
            state.tr
              .setMeta(mermaidPluginKey, {
                editingId:
                  mermaidState?.editingId === diagramId ? undefined : diagramId,
              })
              .setSelection(TextSelection.create(state.doc, codeBlock.pos + 1))
              .scrollIntoView()
          );
        }
        return true;
      },
      copyToClipboard: (): Command => (state, dispatch) => {
        const codeBlock = findParentNode(isCode)(state.selection);

        if (codeBlock) {
          copy(codeBlock.node.textContent);
          this.editor.props.onNotice?.(t("Copied to clipboard"));
          return true;
        }

        const { doc, tr } = state;
        const range =
          getMarkRange(
            doc.resolve(state.selection.from),
            this.editor.schema.marks.code_inline
          ) ||
          getMarkRange(
            doc.resolve(state.selection.to),
            this.editor.schema.marks.code_inline
          );

        if (range) {
          const $end = doc.resolve(range.to);
          tr.setSelection(new TextSelection($end, $end));
          dispatch?.(tr);

          copy(tr.doc.textBetween(state.selection.from, state.selection.to));
          this.editor.props.onNotice?.(t("Copied to clipboard"));
          return true;
        }

        return false;
      },
    };
  }

  get allowInReadOnly() {
    return true;
  }

  keys({ type, schema }: { type: NodeType; schema: Schema }) {
    const output: Record<string, Command> = {
      // Both shortcuts work, but Shift-Ctrl-c matches the one in the menu
      "Shift-Ctrl-c": toggleBlockType(type, schema.nodes.paragraph),
      "Shift-Ctrl-\\": toggleBlockType(type, schema.nodes.paragraph),
      "Shift-Tab": outdentInCode,
      Tab: indentInCode,
      Enter: enterInCode,
      Backspace: backspaceToParagraph(type),
      "Shift-Enter": newlineInCode,
      "Mod-a": selectAll(type),
      "Mod-]": indentInCode,
      "Mod-[": outdentInCode,
    };

    if (isMac) {
      return {
        ...output,
        "Ctrl-a": moveToPreviousNewline,
        "Ctrl-e": moveToNextNewline,
      };
    }

    return output;
  }

  /** Plugins for collapsible code block behavior. */
  private collapsePlugins(): Plugin[] {
    const collapseKey = CodeFence.collapseKey;
    const build = (
      doc: ProsemirrorNode,
      tall: Set<number>,
      collapsed: Set<number>
    ) => buildCollapseState(doc, tall, collapsed, t("Expand"), t("Collapse"));

    return [
      // Main collapse plugin: manages state and decorations
      new Plugin<CollapseState>({
        key: collapseKey,
        state: {
          init: (_config, state) => {
            const tallBlocks = findTallBlocks(state.doc);
            return build(state.doc, tallBlocks, new Set(tallBlocks));
          },
          apply: (tr, prev, _oldState, newState) => {
            const meta = tr.getMeta(collapseKey);

            // Toggle collapsed state
            if (meta?.toggle !== undefined) {
              const next = new Set(prev.collapsedBlocks);
              if (next.has(meta.toggle)) {
                next.delete(meta.toggle);
              } else {
                next.add(meta.toggle);
              }
              return build(newState.doc, prev.tallBlocks, next);
            }

            // Expand a specific block (auto-expand on focus)
            if (meta?.expand !== undefined) {
              if (prev.collapsedBlocks.has(meta.expand)) {
                const next = new Set(prev.collapsedBlocks);
                next.delete(meta.expand);
                return build(newState.doc, prev.tallBlocks, next);
              }
              return prev;
            }

            // Recompute tall blocks on doc changes. Newly tall blocks are only
            // auto-collapsed when content arrives via load/remote sync — never
            // while the user is typing, which would collapse the block under
            // the cursor.
            if (tr.docChanged) {
              const tallBlocks = findTallBlocks(newState.doc);
              const collapsedBlocks = new Set<number>();
              const isRemote = isRemoteTransaction(tr);

              const inverse = tr.mapping.invert();
              for (const pos of tallBlocks) {
                const oldPos = inverse.map(pos);
                if (isRemote && !prev.tallBlocks.has(oldPos)) {
                  // Newly tall blocks start collapsed on load
                  collapsedBlocks.add(pos);
                } else if (prev.collapsedBlocks.has(oldPos)) {
                  // Preserve previous collapsed state
                  collapsedBlocks.add(pos);
                }
              }

              return build(newState.doc, tallBlocks, collapsedBlocks);
            }

            return prev;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
      // Click handler for toggle button + auto-expand on focus
      new Plugin({
        key: new PluginKey("collapse-toggle"),
        appendTransaction: (transactions, oldState, newState) => {
          const hasCollapseMeta = transactions.some((tr) =>
            tr.getMeta(collapseKey)
          );
          const hasSelectionSet = transactions.some((tr) => tr.selectionSet);
          if (hasCollapseMeta || !hasSelectionSet) {
            return null;
          }

          const codeBlock = findParentNode(isCode)(newState.selection);
          const collapseState = collapseKey.getState(newState);
          if (
            !codeBlock ||
            !collapseState?.collapsedBlocks.has(codeBlock.pos)
          ) {
            return null;
          }

          // Only auto-expand when the selection moved INTO the block. If the
          // selection was already inside this block (e.g. after the user just
          // clicked Collapse while the cursor was inside), don't re-expand.
          const oldCodeBlock = findParentNode(isCode)(oldState.selection);
          if (oldCodeBlock?.pos === codeBlock.pos) {
            return null;
          }

          return newState.tr
            .setMeta(collapseKey, { expand: codeBlock.pos })
            .setMeta("addToHistory", false);
        },
        props: {
          handleDOMEvents: {
            mousedown: (view: EditorView, event: MouseEvent) => {
              const target = event.target as HTMLElement;
              const button = target.closest(
                `.${EditorStyleHelper.codeBlockToggle}`
              );
              if (!button) {
                return false;
              }

              const codeBlockEl =
                button.previousElementSibling?.classList.contains(
                  EditorStyleHelper.codeBlock
                )
                  ? button.previousElementSibling
                  : null;
              if (!codeBlockEl) {
                return false;
              }

              const codeEl = codeBlockEl.querySelector("code");
              if (!codeEl) {
                return false;
              }

              const pos = view.posAtDOM(codeEl, 0);
              const $pos = view.state.doc.resolve(pos);
              const parent = findParentNodeClosestToPos($pos, isCode);
              if (!parent) {
                return false;
              }

              const collapseState = collapseKey.getState(view.state);
              const isCollapsing = !collapseState?.collapsedBlocks.has(
                parent.pos
              );

              view.dispatch(
                view.state.tr
                  .setMeta(collapseKey, { toggle: parent.pos })
                  .setMeta("addToHistory", false)
              );

              if (isCollapsing) {
                codeBlockEl.scrollIntoView({ block: "nearest" });
              }

              event.preventDefault();
              event.stopPropagation();
              return true;
            },
          },
        },
      }),
    ];
  }

  /**
   * Build widget decorations rendering a title row above every (non-mermaid)
   * code block. The row shows the language icon plus an editable title that
   * defaults to the language label.
   */
  private buildTitleDecorations(doc: ProsemirrorNode): DecorationSet {
    const decorations: Decoration[] = [];

    for (const block of findBlockNodes(doc, true)) {
      const node = block.node;
      if (node.type.name !== this.name || isMermaid(node)) {
        continue;
      }

      const language: string = node.attrs.language ?? "none";
      const title: string | null = node.attrs.title ?? null;

      decorations.push(
        Decoration.widget(
          block.pos,
          (view: EditorView, getPos: () => number | undefined) =>
            this.createTitleRow(view, getPos, node),
          {
            // Render after any widget the previous block places at this same
            // boundary position. When two code blocks are adjacent, the prior
            // block's collapse toggle lives at `blockEnd === this block's pos`
            // with `side: 1`; a smaller side would order this title before that
            // toggle, leaving the toggle wedged between the title and the code
            // block. That breaks the `.code-block-title + .code-block` margin
            // collapse and the toggle's own sibling-based click/hover logic.
            side: 2,
            // Keyed by position + icon/label inputs so it is reused across
            // highlight/line-number rebuilds (the input is never rebuilt while
            // focused, since editing the title dispatches no transaction). The
            // position keeps keys unique between otherwise-identical blocks.
            key: `code-title-${block.pos}-${language}-${title ?? ""}`,
          }
        )
      );
    }

    return DecorationSet.create(doc, decorations);
  }

  /** Focus the editable title input for the code block at the given position. */
  private focusTitleInput(view: EditorView, pos: number): boolean {
    const codeBlock = view.nodeDOM(pos);
    if (!(codeBlock instanceof HTMLElement)) {
      return false;
    }

    const titleRow = codeBlock.previousElementSibling;
    if (
      !(titleRow instanceof HTMLElement) ||
      !titleRow.classList.contains(EditorStyleHelper.codeBlockTitle)
    ) {
      return false;
    }

    const input = titleRow.querySelector<HTMLInputElement>(
      `.${EditorStyleHelper.codeBlockTitleInput}`
    );
    if (!input || input.readOnly) {
      return false;
    }

    input.focus();
    const caret = input.value.length;
    input.setSelectionRange(caret, caret);
    return true;
  }

  /** Plugin that renders the title row widget above each code block. */
  private codeTitlePlugin(): Plugin {
    return new Plugin<DecorationSet>({
      key: new PluginKey("code-block-title"),
      state: {
        init: (_config, state) => this.buildTitleDecorations(state.doc),
        apply: (tr, pluginState) =>
          tr.docChanged ? this.buildTitleDecorations(tr.doc) : pluginState,
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    });
  }

  /** Create the DOM for a single code block title row. */
  private createTitleRow(
    view: EditorView,
    getPos: () => number | undefined,
    node: ProsemirrorNode
  ): HTMLElement {
    const language: string = node.attrs.language ?? "none";

    const dom = document.createElement("div");
    dom.className = EditorStyleHelper.codeBlockTitle;
    dom.contentEditable = "false";

    const icon = document.createElement("span");
    icon.className = EditorStyleHelper.codeBlockTitleIcon;
    icon.innerHTML = getCodeLanguageIcon(language);

    const input = document.createElement("input");
    input.className = EditorStyleHelper.codeBlockTitleInput;
    input.type = "text";
    input.spellcheck = false;
    input.value = node.attrs.title ?? "";
    input.placeholder = getLabelForLanguage(language);

    if (!view.editable) {
      input.readOnly = true;
      input.tabIndex = -1;
    }

    // The raw title/hl/ln syntax the input held when it was last focused, used
    // to restore an in-progress edit on Escape.
    let editingSnapshot = "";

    // Parse the input's raw syntax and commit title/hl/ln, then collapse the
    // display back to just the title (the input only shows the full syntax
    // while focused).
    const commit = () => {
      const pos = getPos();
      if (pos === undefined) {
        return;
      }
      const codeNode = view.state.doc.nodeAt(pos);
      if (!codeNode || !isCode(codeNode)) {
        return;
      }
      const parsed = parseCodeFenceParams(input.value.trim());
      const changed =
        (codeNode.attrs.title ?? null) !== parsed.title ||
        (codeNode.attrs.hl ?? null) !== parsed.hl ||
        (codeNode.attrs.ln ?? null) !== parsed.ln;

      if (changed) {
        view.dispatch(
          view.state.tr
            .setNodeMarkup(pos, undefined, {
              ...codeNode.attrs,
              title: parsed.title,
              hl: parsed.hl,
              ln: parsed.ln,
            })
            // Force the highlighting plugin to rebuild line-number and
            // highlight decorations. The selection is not inside the block
            // (focus is in the title input), so without this the gutter and
            // highlights would be dropped on the change.
            .setMeta("codeHighlighting", { refresh: true })
        );
      }

      input.value = parsed.title ?? "";
    };

    // When the title input gains focus, swap its display from the title-only
    // text to the full editable syntax (title:/hl:/ln:), and move the editor
    // selection into the code block. The block toolbar's visibility is
    // derived from the selection sitting inside a code node, so without this
    // it would never appear when the user clicks the title of a block their
    // caret was not already in. The editor itself does not take DOM focus (it
    // stays in the input), so ProseMirror does not pull the caret out of the
    // input, and the toolbar's click-outside handler ignores clicks while an
    // INPUT is focused.
    const handleFocus = () => {
      const pos = getPos();
      if (pos === undefined) {
        return;
      }
      const codeNode = view.state.doc.nodeAt(pos);
      if (!codeNode || !isCode(codeNode)) {
        return;
      }

      editingSnapshot = serializeCodeFenceParams({
        title: codeNode.attrs.title ?? null,
        hl: codeNode.attrs.hl ?? null,
        ln: codeNode.attrs.ln ?? null,
      });
      input.value = editingSnapshot;

      const inside = pos + 1;
      const { selection } = view.state;
      if (selection.from >= inside && selection.to <= pos + codeNode.nodeSize) {
        return;
      }
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, inside))
      );
    };
    if (view.editable) {
      input.addEventListener("focus", handleFocus);
    }

    // Keep keystrokes from reaching the ProseMirror keymap while editing.
    const stop = (event: Event) => event.stopPropagation();
    for (const type of ["keypress", "keyup", "input", "beforeinput", "paste"]) {
      input.addEventListener(type, stop);
    }
    // Allow the input to receive focus/caret without ProseMirror handling it.
    input.addEventListener("mousedown", stop);

    input.addEventListener("keydown", (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        input.value = editingSnapshot;
        input.blur();
      } else if (event.key === "ArrowDown") {
        const pos = getPos();
        if (pos === undefined) {
          return;
        }

        event.preventDefault();
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.create(view.state.doc, pos + 1))
            .scrollIntoView()
        );
        view.focus();
      } else if (event.key === "ArrowUp") {
        const pos = getPos();
        if (pos === undefined) {
          return;
        }

        const selection = Selection.findFrom(view.state.doc.resolve(pos), -1);
        if (!selection) {
          return;
        }

        event.preventDefault();
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
        view.focus();
      }
    });

    input.addEventListener("blur", commit);

    dom.appendChild(icon);
    dom.appendChild(input);
    return dom;
  }

  get plugins() {
    const createActiveCodeBlockDecoration = (state: EditorState) => {
      const codeBlock = findParentNode(isCode)(state.selection);
      if (!codeBlock) {
        return DecorationSet.empty;
      }

      if (isMermaid(codeBlock.node)) {
        const mermaidState = mermaidPluginKey.getState(state) as MermaidState;
        const decorations = mermaidState?.decorationSet.find(
          codeBlock.pos,
          codeBlock.pos + codeBlock.node.nodeSize
        );
        const nodeDecoration = decorations?.find(
          (d) => d.spec.diagramId && d.from === codeBlock.pos
        );
        const diagramId = nodeDecoration?.spec.diagramId;

        if (!diagramId || mermaidState?.editingId !== diagramId) {
          return DecorationSet.empty;
        }
      }

      const decoration = Decoration.node(
        codeBlock.pos,
        codeBlock.pos + codeBlock.node.nodeSize,
        { class: "code-active" }
      );
      return DecorationSet.create(state.doc, [decoration]);
    };

    return [
      CodeHighlighting({
        name: this.name,
        lineNumbers: this.showLineNumbers,
      }),
      this.name === "code_fence"
        ? Mermaid({
            isDark: this.editor.props.theme.isDark,
            editor: this.editor,
          })
        : undefined,
      new Plugin({
        key: new PluginKey("code-fence-split"),
        props: {
          handleTextInput: (view, _from, _to, text) => {
            if (text === "`") {
              const { state, dispatch } = view;
              return splitCodeBlockOnTripleBackticks(state, dispatch);
            }
            return false;
          },
        },
      }),
      new Plugin({
        key: new PluginKey("code-fence-title-navigation"),
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== "ArrowUp") {
              return false;
            }

            if (!isSelectionOnFirstCodeLine(view.state)) {
              return false;
            }

            const codeBlock = findParentNode(isCode)(view.state.selection);
            if (!codeBlock || !this.focusTitleInput(view, codeBlock.pos)) {
              return false;
            }

            event.preventDefault();
            return true;
          },
        },
      }),
      new Plugin({
        key: new PluginKey("triple-click"),
        props: {
          handleDOMEvents: {
            mousedown(view, event) {
              const { dispatch, state } = view;
              const {
                selection: { $from, $to },
              } = state;
              if (
                $from.sameParent($to) &&
                event.detail === 3 &&
                isInCode(view.state, { onlyBlock: true })
              ) {
                dispatch?.(
                  state.tr
                    .setSelection(
                      TextSelection.create(
                        state.doc,
                        findPreviousNewline($from),
                        findNextNewline($from)
                      )
                    )
                    .scrollIntoView()
                );

                event.preventDefault();
                return true;
              }

              return false;
            },
          },
        },
      }),
      new Plugin({
        key: new PluginKey("code-fence-active"),
        state: {
          init: (_, state) => createActiveCodeBlockDecoration(state),
          apply: (tr, pluginState, oldState, newState) => {
            // Only recompute if selection or document changed
            if (
              !tr.selectionSet &&
              !tr.docChanged &&
              !tr.getMeta(mermaidPluginKey)
            ) {
              return pluginState;
            }

            return createActiveCodeBlockDecoration(newState);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
      // Title row + collapse plugins - only on code_fence (not CodeBlock subclass)
      ...(this.name === "code_fence"
        ? [this.codeTitlePlugin(), ...this.collapsePlugins()]
        : []),
    ].filter(Boolean) as Plugin[];
  }

  inputRules({ type }: { type: NodeType }) {
    return [
      textblockTypeInputRule(/^```([a-z0-9+#-]*) $/i, type, (match) => ({
        language:
          normalizeCodeLanguage(match[1]) ??
          getRecentlyUsedCodeLanguage() ??
          DEFAULT_LANGUAGE,
      })),
    ];
  }

  toMarkdown(state: MarkdownSerializerState, node: ProsemirrorNode) {
    // Fence content bypasses esc(), so when inside a table cell escape it here
    // so it cannot break out of the column.
    const content = state.inTable
      ? escapeRawTableCell(node.textContent)
      : node.textContent;

    const info = serializeCodeFenceInfo({
      language: node.attrs.language || "",
      title: node.attrs.title ?? null,
      hl: node.attrs.hl ?? null,
      ln: node.attrs.ln ?? null,
    });

    state.write("```" + info + "\n");
    state.text(content, false);
    state.ensureNewLine();
    state.write("```");
    state.closeBlock(node);
  }

  get markdownToken() {
    return "fence";
  }

  parseMarkdown() {
    return {
      block: this.name,
      getAttrs: (tok: Token) => {
        // The fence info string is used verbatim by markdown-it, so it can
        // carry a trailing carriage return (CRLF files), surrounding
        // whitespace, a quoted custom title, or trailing parameters. Parse it
        // into structured parts and map language aliases from other platforms
        // (e.g. "js" → "javascript") to an identifier the editor can highlight;
        // unknown languages are kept as-is so they round-trip on export.
        const info = parseCodeFenceInfo(tok.info);
        return {
          language: normalizeCodeLanguage(info.language) ?? info.language,
          title: info.title,
          hl: info.hl,
          ln: info.ln,
        };
      },
      noCloseToken: true,
    };
  }
}
