import type { InlineRule, InlineState } from '../../core/inline';
import { enterChunk } from './inline';

/** Runs at each `:`, before a text directive's label is parsed: see `enterChunk`. */
const mdxChunks: InlineRule = {
  name: 'mdxChunks',
  priority: 79,
  triggers: ':',
  parse(state: InlineState): boolean {
    enterChunk(state);
    return false;
  },
};

export default mdxChunks;
