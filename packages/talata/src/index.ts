import type { Root } from 'mdast';
import { blockRules, paragraphPrefixRules } from './blocks';
import parse from './core/parse';
import { createRegistry } from './core/registry';
import type { Registry, RuleSet } from './core/registry';
import { transforms } from './core/transform';
import type { Extension } from './ext/api';
import { inlineRules } from './inline';

export interface Options {
  /** Parse GitHub Flavored Markdown: tables, strikethrough, autolinks, task lists and footnotes. */
  gfm?: boolean;
  /**
   * Extra syntax, such as `frontmatter()` from `talata/frontmatter`. Rules of
   * later extensions run after earlier ones at equal priority.
   */
  extensions?: Extension[];
}

interface Cached {
  gfm: boolean;
  extensions: Extension[];
  registry: Registry;
}

const cache: Cached[] = [];

function sameList(a: Extension[], b: Extension[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** The registry for one mode and list of extensions, built on first use. Holds the last 8 combinations. */
function registryFor(gfm: boolean, extensions: Extension[]): Registry {
  for (const entry of cache) {
    if (entry.gfm === gfm && sameList(entry.extensions, extensions)) {
      return entry.registry;
    }
  }
  const set: RuleSet = {
    blockRules: [...blockRules],
    paragraphPrefixRules: [...paragraphPrefixRules],
    inlineRules: [...inlineRules],
    transforms: [...transforms],
  };
  for (const extension of extensions) {
    set.blockRules.push(...(extension.blockRules ?? []));
    set.paragraphPrefixRules.push(...(extension.paragraphPrefixRules ?? []));
    set.inlineRules.push(...(extension.inlineRules ?? []));
    set.transforms.push(...(extension.transforms ?? []));
  }
  const registry = createRegistry(set, { gfm });
  if (cache.length === 8) {
    cache.shift();
  }
  cache.push({ gfm, extensions: [...extensions], registry });
  return registry;
}

/**
 * Parses Markdown into an mdast tree.
 * The tree, including positions, matches what `mdast-util-from-markdown`
 * produces for the same input and options.
 */
export function fromMarkdown(value: string, options: Options = {}): Root {
  const gfm = options.gfm === true;
  return parse(value, { gfm }, registryFor(gfm, options.extensions ?? []));
}
