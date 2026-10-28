import type { ExtensionName } from '../parsers';
import frontmatter from './ext-frontmatter';
import math from './ext-math';
import type { Random } from './random';

/**
 * What the fuzzer needs from one extension. Each extension node owns its
 * `ext-<name>.ts` file and edits nothing else in `test/fuzz/`.
 */
export interface ExtensionFuzz {
  name: ExtensionName;
  /**
   * False until the extension is done. A false extension is left out of the
   * reference and of talata, so documents that hold its syntax parse as
   * plain text on both sides.
   */
  ready: boolean;
  /** mdast node types the reference produces for it. */
  nodeTypes: string[];
  /** Lines to put first in a document (frontmatter). Used with chance 0.3. */
  start?: (random: Random) => string[];
  /** Lines of a block at any depth, inside lists and quotes too. `text` returns one line of inline content. */
  block?: (random: Random, text: () => string) => string[];
  /** A piece of inline content. `text` returns inline content, for a label. */
  inline?: (random: Random, text: () => string) => string;
}

export const fuzzExtensions: ExtensionFuzz[] = [frontmatter, math];

/** Names of the extensions that are ready. */
export function readyExtensions(): ExtensionName[] {
  const names: ExtensionName[] = [];
  for (const extension of fuzzExtensions) {
    if (extension.ready) {
      names.push(extension.name);
    }
  }
  return names;
}
