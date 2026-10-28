import { cachedExtension } from './ext/api';
import type { Extension } from './ext/api';
import mathFlow from './ext/math/flow';
import mathText from './ext/math/text';

/** Same as the `Options` of `micromark-extension-math`. */
export interface Options {
  /** Allow math (text) with a single dollar. Default: true. */
  singleDollarTextMath?: boolean | null | undefined;
}

/**
 * Math in flow (`$$` fences, `math` node) and in text (`$a$`, `inlineMath`
 * node). Matches `micromark-extension-math` with `mdast-util-math`.
 */
export function math(options?: Options | null): Extension {
  const single = options?.singleDollarTextMath !== false;
  return cachedExtension(`math:${single ? 'single' : 'double'}`, () => ({
    name: 'talata:math',
    blockRules: [mathFlow],
    inlineRules: [mathText(single)],
  }));
}
