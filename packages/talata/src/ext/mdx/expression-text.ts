import type { PhrasingContent } from 'mdast';
import type { InlineRule, InlineState } from '../../core/inline';
import { pushNode } from '../../inline/text';
import { scanInline } from './inline';
import { TEXT_EXPRESSION, expressionNode } from './scanner';

function parseExpressionText(state: InlineState): boolean {
  const item = scanInline(state, TEXT_EXPRESSION);
  if (item?.kind !== 'expression') {
    return false;
  }
  const node = expressionNode('mdxTextExpression', state.source, item);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- not in @types/mdast
  pushNode(state, node as unknown as PhrasingContent);
  return true;
}

/** An expression in text: `a {b} c`. Braces are counted. */
const expressionText: InlineRule = {
  name: 'mdxExpressionText',
  priority: 100,
  triggers: '{',
  parse: parseExpressionText,
};

export default expressionText;
