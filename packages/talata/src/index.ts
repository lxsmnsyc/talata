import type { Root } from 'mdast';
import { blockRules, paragraphPrefixRules } from './blocks';
import parse from './core/parse';
import { createRegistry } from './core/registry';
import type { Registry, RuleSet } from './core/registry';
import { transforms } from './core/transform';
import { inlineRules } from './inline';

export interface Options {
  /** Parse GitHub Flavored Markdown: tables, strikethrough, autolinks, task lists and footnotes. */
  gfm?: boolean;
}

const ruleSet: RuleSet = { blockRules, paragraphPrefixRules, inlineRules, transforms };
let commonmarkRules: Registry | undefined;
let gfmRules: Registry | undefined;

/**
 * Parses Markdown into an mdast tree.
 * The tree, including positions, matches what `mdast-util-from-markdown`
 * produces for the same input and options.
 */
export function fromMarkdown(value: string, options: Options = {}): Root {
  if (options.gfm === true) {
    gfmRules ??= createRegistry(ruleSet, { gfm: true });
    return parse(value, { gfm: true }, gfmRules);
  }
  commonmarkRules ??= createRegistry(ruleSet, { gfm: false });
  return parse(value, { gfm: false }, commonmarkRules);
}
