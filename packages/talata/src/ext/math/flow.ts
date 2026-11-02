import type { RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import { isSpaceOrTab } from '../../core/chars';
import type { Line } from '../../core/line';
import { point, skipLineEnding } from '../../core/source';
import { isEmptyLastLine, lineContent } from '../../blocks/code-indented';
import { matchedOnlyAtEnd } from '../../blocks/blockquote';
import { isClosingFence, trimLineEndings } from '../../blocks/code-fenced';
import decodeString from '../../blocks/decode';

const DOLLAR = 36;

class OpenMathFlow implements OpenBlock {
  name = 'mathFlow';
  isContainer = false;
  acceptsLazy = false;
  size: number;
  /** Columns of indentation before the opening fence; removed from content lines. */
  indent: number;
  start: number;
  end: number;
  meta: string | null;
  /**
   * Content as the reference buffers it: every line ending after the opening
   * fence, and content lines without their prefixes.
   */
  raw = '';
  /** The current line is the closing fence. */
  closing = false;
  closed = false;

  constructor(size: number, indent: number, start: number, end: number, meta: string | null) {
    this.size = size;
    this.indent = indent;
    this.start = start;
    this.end = end;
    this.meta = meta;
  }

  continue(state: BlockState, line: Line): boolean {
    if (this.closed || (isEmptyLastLine(line) && matchedOnlyAtEnd(state, line))) {
      return false;
    }
    this.closing = isClosingFence(line, DOLLAR, this.size);
    return true;
  }

  addLine(state: BlockState, line: Line): void {
    const text = state.source.text;
    const next = skipLineEnding(text, this.end);
    const eol = text.slice(this.end, next);
    if (isEmptyLastLine(line)) {
      // micromark ends the block after the line ending, with no content line.
      this.end = next;
      this.raw += eol;
      return;
    }
    this.end = line.end;
    if (this.closing) {
      this.closed = true;
      this.raw += eol;
      line.start = line.end;
      return;
    }
    this.raw += eol + lineContent(line, this.indent);
  }

  close(state: BlockState): RootContent {
    let end = this.end;
    let raw = this.raw;
    if (!this.closed && state.closeKeepsLineEnding) {
      end = skipLineEnding(state.source.text, end);
      raw += state.source.text.slice(this.end, end);
    }
    const value = trimLineEndings(raw);
    // `math` is not in @types/mdast.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return {
      type: 'math',
      meta: this.meta,
      value,
      data: {
        hName: 'pre',
        hChildren: [
          {
            type: 'element',
            tagName: 'code',
            properties: { className: ['language-math', 'math-display'] },
            children: [{ type: 'text', value }],
          },
        ],
      },
      position: { start: point(state.source, this.start), end: point(state.source, end) },
    } as unknown as RootContent;
  }
}

const mathFlow: BlockRule = {
  name: 'mathFlow',
  priority: 350,
  canInterruptParagraph: true,
  triggers: '$',
  start(_state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const start = line.nonBlank;
    const end = line.end;
    let i = start;
    while (i < end && text.charCodeAt(i) === DOLLAR) {
      i++;
    }
    const size = i - start;
    if (size < 2) {
      return undefined;
    }
    while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
      i++;
    }
    // The meta runs to the end of the line and may not hold a dollar.
    const metaStart = i;
    for (; i < end; i++) {
      if (text.charCodeAt(i) === DOLLAR) {
        return undefined;
      }
    }
    const meta = metaStart < end ? decodeString(text.slice(metaStart, end)) : null;
    const indent = line.indent;
    line.start = end;
    return new OpenMathFlow(size, indent, start, end, meta);
  },
};

export default mathFlow;
