import type { Root } from 'mdast';
import type { Processor } from 'unified';
import { fromMarkdown } from './index';
import type { Options } from './index';

export type { Options };

/**
 * Unified plugin that sets the parser to talata, in place of `remark-parse`
 * (and `remark-gfm` when `gfm` is set). The `extensions` option takes talata
 * extensions; micromark and mdast extensions do not apply to it.
 */
export function talata(this: Processor, options: Options = {}): void {
  this.parser = (document: unknown): Root => fromMarkdown(String(document), options);
}

export default talata;
