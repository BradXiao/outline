import { MathView } from "@benrbray/prosemirror-math";
import { isNode } from "@shared/utils/browser";
import type { PluginSpec } from "prosemirror-state";
import { NodeSelection, Plugin, PluginKey } from "prosemirror-state";
import type { EditorView, NodeViewConstructor } from "prosemirror-view";

export interface IMathPluginState {
  macros: { [cmd: string]: string };
  activeNodeViews: MathView[];
  prevCursorPos: number;
}

const MATH_PLUGIN_KEY = new PluginKey<IMathPluginState>("prosemirror-math");

/**
 * Focus the nested math editor when a math node is NodeSelected.
 * Follow-up dispatches (e.g. TrailingNode) call selectionToDOM on the outer
 * view and steal focus from the inner editor; without this, the next
 * keystroke replaces the selected math node.
 *
 * @param view The editor view.
 */
function focusSelectedMathEditor(view: EditorView) {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection)) {
    return;
  }
  const name = selection.node.type.name;
  if (name !== "math_block" && name !== "math_inline") {
    return;
  }
  const dom = view.nodeDOM(selection.from);
  if (!(dom instanceof HTMLElement)) {
    return;
  }
  const inner = dom.querySelector(".math-src .ProseMirror");
  if (inner instanceof HTMLElement) {
    inner.focus();
  }
}

export function createMathView(displayMode: boolean): NodeViewConstructor {
  return (node, view, getPos) => {
    if (!isNode) {
      // dynamically load katex styles and fonts
      void import("katex/dist/katex.min.css");
    }

    const pluginState = MATH_PLUGIN_KEY.getState(view.state);
    if (!pluginState) {
      throw new Error("no math plugin!");
    }
    const nodeViews = pluginState.activeNodeViews;

    // set up NodeView
    const nodeView = new MathView(
      node,
      view,
      getPos as () => number,
      {
        katexOptions: {
          displayMode,
          output: "html",
          macros: pluginState.macros,
        },
      },
      MATH_PLUGIN_KEY,
      () => {
        nodeViews.splice(nodeViews.indexOf(nodeView));
      }
    );

    nodeViews.push(nodeView);
    return nodeView;
  };
}

const mathPluginSpec: PluginSpec<IMathPluginState> = {
  key: MATH_PLUGIN_KEY,
  state: {
    init() {
      return {
        macros: {},
        activeNodeViews: [],
        prevCursorPos: 0,
      };
    },
    apply(tr, value, oldState) {
      return {
        activeNodeViews: value.activeNodeViews,
        macros: value.macros,
        prevCursorPos: oldState.selection.from,
      };
    },
  },
  view: () => ({
    update: (view) => {
      const { selection } = view.state;
      if (
        !(selection instanceof NodeSelection) ||
        (selection.node.type.name !== "math_block" &&
          selection.node.type.name !== "math_inline")
      ) {
        return;
      }
      // Defer until after sibling plugin view updates (TrailingNode) finish.
      requestAnimationFrame(() => focusSelectedMathEditor(view));
    },
  }),
  props: {
    nodeViews: {
      math_inline: createMathView(false),
      math_block: createMathView(true),
    },
    handleDOMEvents: {
      focus: (view) => {
        focusSelectedMathEditor(view);
        return false;
      },
    },
  },
};

export default new Plugin(mathPluginSpec);
