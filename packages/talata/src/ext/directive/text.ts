/* oxlint-disable typescript/no-unsafe-type-assertion -- reads the block parser's own fields and builds mdast nodes that @types/mdast lacks */
import type { PhrasingContent } from 'mdast';
import type { InlineRule, InlineState } from '../../core/inline';
import { point } from '../../core/source';
import { pushNode } from '../../inline/text';
import { deferLabel } from './fixes';
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
function labelRanges(
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

/**
 * Queues the label's inline content to be parsed after the leaf. The inline
 * rules (links, emphasis, strikethrough) keep module state for the leaf being
 * parsed, and a parse inside it would lose that state.
 */
function parseLabel(
  state: InlineState,
  ranges: number[],
  node: { children: PhrasingContent[] },
): void {
  if (ranges.length === 2 && ranges[0] === ranges[1]) {
    return;
  }
  deferLabel(state, node, ranges, state.indents);
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
  const name = text.slice(start + 1, nameEnd);
  let range = state.range;
  let pos = nameEnd;
  if (pos < lineEnd && text.charCodeAt(pos) === COLON) {
    return false;
  }
  const children: PhrasingContent[] = [];
  const node = { type: 'textDirective', name, attributes: {} as Attributes, children };
  if (pos < lineEnd && text.charCodeAt(pos) === LEFT_BRACKET) {
    const label = scanLabel(state, ranges, range, pos, state);
    if (label !== undefined) {
      parseLabel(state, labelRanges(state, range, pos, label.range, label.pos), node);
      range = label.range;
      pos = label.pos + 1;
    }
  }
  if (pos < ranges[range + 1] && text.charCodeAt(pos) === LEFT_BRACE) {
    const read = readAttributes(state, ranges, range, pos, state);
    if (read !== undefined) {
      node.attributes = read.attributes;
      range = read.found.range;
      pos = read.found.pos;
    }
  }
  (node as unknown as { position: unknown }).position = {
    start: point(state.source, start),
    end: point(state.source, pos),
  };
  pushNode(state, node as unknown as PhrasingContent);
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
