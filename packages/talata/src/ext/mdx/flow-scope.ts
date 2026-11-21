import type { BlockRule, BlockState } from '../../core/blocks';
import type { Line } from '../../core/line';
import { noteLazyLine } from './flow';

/**
 * Runs first on every line that is not blank, starts nothing. When the
 * line did not reach an open flow construct, it records where the line
 * starts after the containers that matched: a lazy line error points there.
 */
const mdxFlowScope: BlockRule = {
  name: 'mdxFlowScope',
  priority: 1,
  canInterruptParagraph: true,
  start(state: BlockState, line: Line): undefined {
    noteLazyLine(state, line);
    return undefined;
  },
};

export default mdxFlowScope;
