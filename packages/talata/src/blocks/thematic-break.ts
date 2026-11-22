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

/** Whether `text` from `start` to `end` is 3 or more of its first character, with spaces and tabs between. */
export function isThematicBreak(text: string, start: number, end: number): boolean {
  const marker = text.charCodeAt(start);
  let count = 0;
  for (let i = start; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code === marker) {
      count++;
    } else if (!isSpaceOrTab(code)) {
      return false;
    }
  }
  return count >= 3;
}

const thematicBreak: BlockRule = {
  name: 'thematicBreak',
  priority: 600,
  canInterruptParagraph: true,
  triggers: '*-_',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= line.indentLimit) {
      return undefined;
    }
    const start = line.nonBlank;
    const end = line.end;
    if (!isThematicBreak(line.text, start, end)) {
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
