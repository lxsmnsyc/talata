import type { InlineRule, InlineState } from '../../core/inline';
import { reparsed } from './tags';

/**
 * Runs at the `[` that starts an image label parsed again, and makes the
 * label resolve as micromark resolves the inside of a link: strikethrough
 * before emphasis, whichever came first.
 */
const mdxLabel: InlineRule = {
  name: 'mdxLabel',
  priority: 1,
  triggers: '[',
  parse(state: InlineState): boolean {
    if (state.pos === state.ranges[0] && reparsed.has(state.ranges)) {
      state.attentionFirst = false;
    }
    return false;
  },
};

export default mdxLabel;
