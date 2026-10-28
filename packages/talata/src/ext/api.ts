import type { BlockRule, ParagraphPrefixRule } from '../core/blocks';
import type { InlineRule } from '../core/inline';
import type { Transform } from '../core/transform';

/**
 * Syntax that is not part of CommonMark or GFM. An extension lives in its own
 * module under `src/ext/`, reaches users through a subpath entry such as
 * `talata/math`, and is passed in `Options.extensions`. It uses the same rule
 * types as the built-in rules (`roadmaps/v2/contracts/extension.md`).
 * Internal in 0.2.
 */
export interface Extension {
  /** `talata:<subpath>`, for example `talata:math`. It shows in the built output, which a test relies on. */
  name: string;
  blockRules?: BlockRule[];
  paragraphPrefixRules?: ParagraphPrefixRule[];
  inlineRules?: InlineRule[];
  transforms?: Transform[];
}

// Lives for the whole process: one entry per distinct option set, which stays small.
const made = new Map<string, Extension>();

/**
 * Returns the extension stored under `key`, creating it on first use. A
 * factory derives `key` from its normalized options, so equal options give
 * the same object and `fromMarkdown` finds its registry in the cache.
 * `key` starts with the factory name: `math:single`, `frontmatter:"yaml"`.
 */
export function cachedExtension(key: string, create: () => Extension): Extension {
  let extension = made.get(key);
  if (extension === undefined) {
    extension = create();
    made.set(key, extension);
  }
  return extension;
}
