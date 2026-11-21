import type { BlockState } from '../../core/blocks';
import type { Line } from '../../core/line';
import { MdxError } from './error';
import { quietFlowErrors } from './order';
import { MORE, NOK, Scanner } from './scanner';

const SPACE = 32;
const TAB = 9;

const ahead = new Scanner();

/**
 * Whether a construct that continues after its first line ends in text, so
 * the reference keeps the line in the table body it would interrupt. Reads
 * the next lines from the source and drops a `>` for each block quote open
 * around: other prefixes are whitespace, which tags skip. A line less
 * indented than this one, or without the quote markers, may not continue
 * the containers; the scan stops there, and the construct starts.
 */
export default function endsInText(state: BlockState, line: Line, first: Scanner): boolean {
  let quotes = 0;
  let containers = 0;
  for (let i = 1; ; i++) {
    const block = state.getBlock(i);
    if (block === undefined) {
      break;
    }
    if (block.isContainer) {
      containers++;
      if (block.name === 'blockquote') {
        quotes++;
      }
    }
  }
  const source = state.source;
  const text = source.text;
  const starts = source.lineStarts;
  let count = starts.length;
  if (starts[count - 1] === text.length) {
    count--;
  }
  const column = line.visualColumn;
  ahead.copy(first);
  try {
    for (let index = line.index + 1; index < count; index++) {
      const lineStart = starts[index];
      let end = index + 1 < starts.length ? starts[index + 1] - 1 : text.length;
      if (end > lineStart && text.charCodeAt(end) === 10 && text.charCodeAt(end - 1) === 13) {
        end--;
      }
      let pos = lineStart;
      for (let q = 0; q < quotes; q++) {
        while (pos < end && (text.charCodeAt(pos) === SPACE || text.charCodeAt(pos) === TAB)) {
          pos++;
        }
        if (pos >= end || text.charCodeAt(pos) !== 62) {
          return false;
        }
        pos++;
      }
      let visual = 0;
      for (let i = lineStart; i < pos; i++) {
        visual = text.charCodeAt(i) === TAB ? visual + 4 - (visual % 4) : visual + 1;
      }
      while (pos < end && (text.charCodeAt(pos) === SPACE || text.charCodeAt(pos) === TAB)) {
        visual = text.charCodeAt(pos) === TAB ? visual + 4 - (visual % 4) : visual + 1;
        pos++;
      }
      if (pos < end && containers > 0 && visual < column) {
        return false;
      }
      ahead.feed(pos, end, end === text.length, '', pos, false);
      const result = ahead.run();
      if (result !== MORE) {
        if (result === NOK) {
          // The lines it read are rows of the table for the reference: no
          // container starts on them, so errors inside one do not happen.
          quietFlowErrors(source, starts[line.index + 1], end, state.getDepth(state.container));
        }
        return result === NOK;
      }
    }
  } catch (error) {
    if (!(error instanceof MdxError)) {
      throw error;
    }
  }
  return false;
}
