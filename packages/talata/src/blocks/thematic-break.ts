import type { ThematicBreak } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { isSpaceOrTab } from '../core/chars';
import type { Line } from '../core/line';
import { point } from '../core/source';

function neverContinue(): boolean {
  return false;
}

class OpenThematicBreak implements OpenBlock {
  name = 'thematicBreak';
  isContainer = false;
  acceptsLazy = false;
  node: ThematicBreak;

  constructor(node: ThematicBreak) {
    this.node = node;
  }

  continue: () => boolean = neverContinue;

  close(): ThematicBreak {
    return this.node;
  }
}

const thematicBreak: BlockRule = {
  name: 'thematicBreak',
  priority: 600,
  canInterruptParagraph: true,
  triggers: '*-_',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const start = line.nonBlank;
    const end = line.end;
    const marker = text.charCodeAt(start);
    let count = 0;
    for (let i = start; i < end; i++) {
      const code = text.charCodeAt(i);
      if (code === marker) {
        count++;
      } else if (!isSpaceOrTab(code)) {
        return undefined;
      }
    }
    if (count < 3) {
      return undefined;
    }
    line.start = end;
    return new OpenThematicBreak({
      type: 'thematicBreak',
      position: { start: point(state.source, start), end: point(state.source, end) },
    });
  },
};

export default thematicBreak;
