import type { PhrasingContent, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import type { Line } from '../../core/line';
import { point } from '../../core/source';
import { queueLabel } from './labels';
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
    const start = line.nonBlank;
    if (line.text.charCodeAt(start + 1) !== COLON) {
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
      children: [] as PhrasingContent[],
      position: { start: point(state.source, start), end: point(state.source, line.end) },
    };
    if (head.labelEnd > head.labelStart) {
      queueLabel(state, node, head.labelStart, head.labelEnd);
    }
    line.start = line.end;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return new OpenLeafDirective(node as unknown as RootContent);
  },
};

export default leafDirective;
