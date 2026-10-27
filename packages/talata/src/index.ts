import type { Root } from 'mdast';

export interface Options {
  /** Parse GitHub Flavored Markdown: tables, strikethrough, autolinks, task lists and footnotes. */
  gfm?: boolean;
}

/**
 * Parses Markdown into an mdast tree.
 * The tree, including positions, matches what `mdast-util-from-markdown`
 * produces for the same input and options.
 */
export function fromMarkdown(_value: string, _options: Options = {}): Root {
  throw new Error('talata: fromMarkdown is not implemented yet');
}
