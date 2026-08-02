import markdownit, {
  type Options as MarkdownItOptions,
  type PluginSimple,
} from "markdown-it";
import type { Schema } from "prosemirror-model";

type Options = {
  /** Markdown-it options. */
  rules?: MarkdownItOptions;
  /** Markdown-it plugins. */
  plugins?: PluginSimple[];
  /** The schema for associated editor. */
  schema?: Schema;
  /**
   * Disable indented (4-space) code blocks while keeping fenced code blocks.
   * Used for paste so clipboard indentation is not treated as code.
   */
  disableIndentedCode?: boolean;
};

export default function makeRules({
  rules = {},
  plugins = [],
  schema,
  disableIndentedCode = false,
}: Options) {
  const markdownIt = markdownit("default", {
    breaks: false,
    html: false,
    linkify: false,
    ...rules,
  });

  // Disable default markdown-it rules that are not supported by the schema.
  if (!schema?.nodes.ordered_list || !schema?.nodes.bullet_list) {
    markdownIt.disable("list");
  }
  if (!schema?.nodes.blockquote) {
    markdownIt.disable("blockquote");
  }
  if (!schema?.nodes.hr) {
    markdownIt.disable("hr");
  }
  if (!schema?.nodes.heading) {
    // "heading" is ATX (# Title), "lheading" is setext (Title\n=====).
    markdownIt.disable(["heading", "lheading"]);
  }
  if (!schema?.nodes.table) {
    markdownIt.disable("table");
  }
  if (!schema?.nodes.code_block) {
    // "code" is indented code blocks, "fence" is ``` delimited blocks.
    markdownIt.disable(["code", "fence"]);
  } else if (disableIndentedCode) {
    markdownIt.disable("code");
  }

  plugins.forEach((plugin) => markdownIt.use(plugin));
  return markdownIt;
}
