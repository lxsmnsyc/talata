import type { PhrasingContent } from 'mdast';
import type { InlineRule, InlineState } from '../../core/inline';
import { point, skipLineEnding } from '../../core/source';
import { strip } from '../../inline/code-span';
import { createExhausted, getFailedStart, markFailed } from '../../inline/exhausted';
import { linePrefix, prefixSplitColumns, reach, workSteps } from '../../inline/lines';
import { appendText, pushNode } from '../../inline/text';

// Math (text): a run of dollars up to the next run of the same length,
// possibly on a later line. It reads like a code span: line endings stay raw
// in the value and one space or line ending of padding is stripped.

const DOLLAR = 36;

const exhausted = createExhausted();

function parseMathText(state: InlineState, single: boolean): boolean {
  const text = state.source.text;
  const ranges = state.ranges;
  const start = state.pos;
  let pos = start + 1;
  while (pos < state.end && text.charCodeAt(pos) === DOLLAR) {
    pos++;
  }
  const size = pos - start;
  const open = pos;
  if (size < 2 && !single) {
    appendText(state, text.slice(start, open), start, open);
    state.pos = open;
    return true;
  }
  const known = getFailedStart(exhausted, state, size);
  if (known !== undefined && start > known) {
    appendText(state, text.slice(start, open), start, open);
    state.pos = open;
    return true;
  }
  // Find a closing run of the same size.
  let range = state.range;
  let end = state.end;
  let close = -1;
  for (;;) {
    while (pos < end) {
      if (__TALATA_TEST__) {
        workSteps.count++;
      }
      if (text.charCodeAt(pos) !== DOLLAR) {
        pos++;
        continue;
      }
      const run = pos;
      while (pos < end && text.charCodeAt(pos) === DOLLAR) {
        pos++;
      }
      if (pos - run === size) {
        close = run;
        break;
      }
    }
    if (close !== -1 || range + 2 >= ranges.length) {
      break;
    }
    range += 2;
    pos = ranges[range];
    end = ranges[range + 1];
    reach(state, range);
  }
  if (close === -1) {
    // No closer: the whole opening run is text.
    markFailed(exhausted, size, start, known);
    appendText(state, text.slice(start, open), start, open);
    state.pos = open;
    return true;
  }
  let value = '';
  let from = open;
  let virtual = false;
  let virtualEnd = false;
  for (let r = state.range; r < range; r += 2) {
    const lineEnd = ranges[r + 1];
    value += text.slice(from, lineEnd) + text.slice(lineEnd, skipLineEnding(text, lineEnd));
    const prefix = linePrefix(state, r + 2, 0);
    const columns = prefixSplitColumns();
    if (columns > 0) {
      virtual = true;
      virtualEnd = r + 2 === range && ranges[range] === close && prefix.length === columns;
    }
    value += prefix;
    from = ranges[r + 2];
  }
  value += text.slice(from, close);
  const stripped = strip(value, virtual, virtualEnd);
  // `inlineMath` is not in @types/mdast.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const node = {
    type: 'inlineMath',
    value: stripped,
    data: {
      hName: 'code',
      hProperties: { className: ['language-math', 'math-inline'] },
      hChildren: [{ type: 'text', value: stripped }],
    },
    position: { start: point(state.source, start), end: point(state.source, pos) },
  } as unknown as PhrasingContent;
  pushNode(state, node);
  state.range = range;
  state.pos = pos;
  return true;
}

/** The inline rule; `single` is the `singleDollarTextMath` option. */
export default function mathText(single: boolean): InlineRule {
  return {
    name: 'mathText',
    priority: 100,
    triggers: '$',
    parse: (state) => parseMathText(state, single),
  };
}
