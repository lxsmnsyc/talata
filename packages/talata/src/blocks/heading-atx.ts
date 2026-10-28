import type { Heading } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { NUMBER_SIGN, isSpaceOrTab } from '../core/chars';
import type { Line } from '../core/line';
import { point } from '../core/source';

const DEPTHS: Heading['depth'][] = [1, 2, 3, 4, 5, 6];

function neverContinue(): boolean {
  return false;
}

class OpenHeading implements OpenBlock {
  name = 'heading';
  isContainer = false;
  acceptsLazy = false;
  node: Heading;
  contentStart: number;
  contentEnd: number;

  constructor(node: Heading, contentStart: number, contentEnd: number) {
    this.node = node;
    this.contentStart = contentStart;
    this.contentEnd = contentEnd;
  }

  continue: () => boolean = neverContinue;

  close(state: BlockState): Heading {
    if (this.contentStart < this.contentEnd) {
      state.inline(this.node, [this.contentStart, this.contentEnd]);
    }
    return this.node;
  }
}

const headingAtx: BlockRule = {
  name: 'headingAtx',
  priority: 200,
  canInterruptParagraph: true,
  triggers: '#',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const start = line.nonBlank;
    const end = line.end;
    let i = start;
    while (i < end && text.charCodeAt(i) === NUMBER_SIGN) {
      i++;
    }
    const depth = i - start;
    if (depth > 6 || (i < end && !isSpaceOrTab(text.charCodeAt(i)))) {
      return undefined;
    }
    while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
      i++;
    }
    let contentEnd = end;
    while (contentEnd > i && isSpaceOrTab(text.charCodeAt(contentEnd - 1))) {
      contentEnd--;
    }
    // A closing sequence is a run of `#` that is the whole content or follows
    // a space or tab.
    let closing = contentEnd;
    while (closing > i && text.charCodeAt(closing - 1) === NUMBER_SIGN) {
      closing--;
    }
    if (closing === i) {
      contentEnd = i;
    } else if (closing < contentEnd && isSpaceOrTab(text.charCodeAt(closing - 1))) {
      contentEnd = closing;
      while (contentEnd > i && isSpaceOrTab(text.charCodeAt(contentEnd - 1))) {
        contentEnd--;
      }
    }
    const node: Heading = {
      type: 'heading',
      depth: DEPTHS[depth - 1],
      children: [],
      position: { start: point(state.source, start), end: point(state.source, end) },
    };
    line.start = end;
    return new OpenHeading(node, i, contentEnd);
  },
};

export default headingAtx;
