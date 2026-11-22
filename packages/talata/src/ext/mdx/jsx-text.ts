import type { InlineRule, InlineState } from '../../core/inline';
import { pushNode } from '../../inline/text';
import { scanInline } from './inline';
import { TEXT_TAG } from './scanner';
import { recordTextTag, textMarker } from './tags';

function parseJsxText(state: InlineState): boolean {
  const tag = scanInline(state, TEXT_TAG);
  if (tag?.kind !== 'tag') {
    return false;
  }
  recordTextTag(state.source, tag);
  pushNode(state, textMarker(state.source, tag));
  return true;
}

/** A JSX tag in text: `a <b c="d">e</b>`. */
const jsxText: InlineRule = {
  name: 'mdxJsxText',
  priority: 100,
  triggers: '<',
  parse: parseJsxText,
};

export default jsxText;
