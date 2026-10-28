/* oxlint-disable typescript/no-unsafe-type-assertion -- reads the block parser's own fields and builds mdast nodes that @types/mdast lacks */
import type { RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import type { Line } from '../../core/line';
import { isSpaceOrTab } from '../../core/chars';
import { point } from '../../core/source';
import { labelWithTrailing } from './fixes';
import { COLON, readHead } from './syntax';

function neverContinue(): boolean {
  return false;
}

class OpenLeafDirective implements OpenBlock {
  name = 'leafDirective';
  isContainer = false;
  acceptsLazy = false;
  node: RootContent;

  constructor(node: RootContent) {
    this.node = node;
  }

  continue: () => boolean = neverContinue;

  close(): RootContent {
    return this.node;
  }
}

/** `::name[label]{attributes}` on a line of its own. */
const leafDirective: BlockRule = {
  name: 'directiveLeaf',
  priority: 345,
  canInterruptParagraph: true,
  triggers: ':',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const start = line.nonBlank;
    if (text.charCodeAt(start + 1) !== COLON) {
      return undefined;
    }
    const head = readHead(state, start + 2, line.end);
    if (head === undefined) {
      return undefined;
    }
    const node = {
      type: 'leafDirective',
      name: head.name,
      attributes: head.attributes,
      children: [],
      position: { start: point(state.source, start), end: point(state.source, line.end) },
    };
    if (head.labelEnd > head.labelStart) {
      state.inline(node, [head.labelStart, head.labelEnd]);
      let from = head.labelEnd;
      while (from > head.labelStart && isSpaceOrTab(text.charCodeAt(from - 1))) {
        from--;
      }
      if (from < head.labelEnd) {
        labelWithTrailing(state, node, from, head.labelEnd);
      }
    }
    line.start = line.end;
    return new OpenLeafDirective(node as unknown as RootContent);
  },
};

export default leafDirective;
