import type { PhrasingContent } from 'mdast';
import type { InlineRule, InlineState } from '../../core/inline';
import { point } from '../../core/source';
import { pushNode } from '../../inline/text';
import { parseLabel } from './labels';
import { inLabel } from './scopes';
import { COLON, LEFT_BRACE, LEFT_BRACKET, readAttributes, readName, scanLabel } from './syntax';
import type { Attributes } from './syntax';

const BACKSLASH = 92;

/** True when the `:` before `pos` was made by a backslash escape (`\:`). */
function isEscapedColon(text: string, pos: number, rangeStart: number): boolean {
  let i = pos - 2;
  while (i >= rangeStart && text.charCodeAt(i) === BACKSLASH) {
    i--;
  }
  return (pos - 2 - i) % 2 === 1;
}

/**
 * The ranges of the label content: from just after the `[` in range `from`
 * to the `]` at `close` in range `to`.
 */
function getLabelRanges(
  state: InlineState,
  from: number,
  open: number,
  to: number,
  close: number,
): number[] {
  const ranges = state.ranges;
  if (from === to) {
    return [open + 1, close];
  }
  const result = [open + 1, ranges[from + 1]];
  for (let r = from + 2; r < to; r += 2) {
    result.push(ranges[r], ranges[r + 1]);
  }
  result.push(ranges[to], close);
  return result;
}

function parseDirective(state: InlineState): boolean {
  const text = state.source.text;
  const ranges = state.ranges;
  const start = state.pos;
  const lineEnd = state.end;
  // `::a` and `a::b` are not directives: a colon right before is text, unless it was escaped.
  if (
    start > ranges[state.range] &&
    text.charCodeAt(start - 1) === COLON &&
    !isEscapedColon(text, start, ranges[state.range])
  ) {
    return false;
  }
  const nameEnd = readName(text, start + 1, lineEnd);
  if (nameEnd === -1) {
    return false;
  }
  let range = state.range;
  let pos = nameEnd;
  if (pos < lineEnd && text.charCodeAt(pos) === COLON) {
    return false;
  }
  let children: PhrasingContent[] = [];
  let attributes: Attributes = {};
  // The label: inline content, parsed in place.
  if (pos < lineEnd && text.charCodeAt(pos) === LEFT_BRACKET) {
    const label = scanLabel(state, ranges, range, pos, state);
    if (label !== undefined) {
      const inner = getLabelRanges(state, range, pos, label.range, label.pos);
      if (inner.length > 2 || inner[0] !== inner[1]) {
        const indents = state.indents;
        children = inLabel(state.source, () => parseLabel(state, inner, indents));
      }
      range = label.range;
      pos = label.pos + 1;
    }
  }
  if (pos < ranges[range + 1] && text.charCodeAt(pos) === LEFT_BRACE) {
    const read = readAttributes(state, ranges, range, pos, state);
    if (read !== undefined) {
      attributes = read.attributes;
      range = read.found.range;
      pos = read.found.pos;
    }
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const node = {
    type: 'textDirective',
    name: text.slice(start + 1, nameEnd),
    attributes,
    children,
    position: { start: point(state.source, start), end: point(state.source, pos) },
  } as unknown as PhrasingContent;
  pushNode(state, node);
  state.range = range;
  state.pos = pos;
  return true;
}

/** `:name[label]{attributes}` in text. */
const textDirective: InlineRule = {
  name: 'directiveText',
  priority: 80,
  triggers: ':',
  parse: parseDirective,
};

export default textDirective;
