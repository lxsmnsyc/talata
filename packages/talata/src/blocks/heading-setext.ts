import type { Heading } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { isSpaceOrTab } from '../core/chars';
import type { Line } from '../core/line';
import { point } from '../core/source';

const EQUALS = 61; // =

function neverContinue(): boolean {
  return false;
}

class OpenSetextHeading implements OpenBlock {
  name = 'heading';
  isContainer = false;
  acceptsLazy = false;
  node: Heading;

  constructor(node: Heading) {
    this.node = node;
  }

  continue: () => boolean = neverContinue;

  close(): Heading {
    return this.node;
  }
}

// A `=` or `-` underline turns the open paragraph into a heading. The
// heading starts where the paragraph started, before any definitions that
// prefix rules took from it.
const headingSetext: BlockRule = {
  name: 'headingSetext',
  priority: 500,
  canInterruptParagraph: true,
  triggers: '=-',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (state.paragraph === undefined || state.lazy || line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const end = line.end;
    const marker = text.charCodeAt(line.nonBlank);
    let i = line.nonBlank + 1;
    while (i < end && text.charCodeAt(i) === marker) {
      i++;
    }
    while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
      i++;
    }
    if (i < end) {
      return undefined;
    }
    const paragraph = state.takeParagraph();
    if (paragraph === undefined) {
      return undefined;
    }
    const node: Heading = {
      type: 'heading',
      depth: marker === EQUALS ? 1 : 2,
      children: [],
      position: { start: point(state.source, paragraph.start), end: point(state.source, end) },
    };
    state.inline(node, paragraph.lines);
    line.start = end;
    return new OpenSetextHeading(node);
  },
};

export default headingSetext;
