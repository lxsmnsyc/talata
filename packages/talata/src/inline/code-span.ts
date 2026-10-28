import type { InlineRule, InlineState } from '../core/inline';
import { point, skipLineEnding } from '../core/source';
import { linePrefix } from './lines';
import { appendText, pushNode } from './text';

// Code spans: a run of backticks up to the next run of the same length,
// possibly on a later line. Line endings stay raw in the value, as do the
// spaces micromark keeps at the start of later lines.

const BACKTICK = 96;
const SPACE = 32;
const LF = 10;
const CR = 13;

// Opening sizes with no closer up to the end of the leaf, by size: the
// earliest such start. A later run of that size has no closer either.
// Keyed on the inline state, which is new for every leaf.
let exhaustedState: InlineState | undefined;
let exhausted: (number | undefined)[] = [];

function isPadding(code: number): boolean {
  return code === SPACE || code === LF || code === CR;
}

/** Strips one space or line ending from both ends when both have one and the value is not all padding. */
function strip(value: string): string {
  const length = value.length;
  if (length < 2 || !isPadding(value.charCodeAt(0)) || !isPadding(value.charCodeAt(length - 1))) {
    return value;
  }
  let data = false;
  for (let i = 0; i < length; i++) {
    if (!isPadding(value.charCodeAt(i))) {
      data = true;
      break;
    }
  }
  if (!data) {
    return value;
  }
  const head = value.charCodeAt(0) === CR && value.charCodeAt(1) === LF ? 2 : 1;
  const tail = value.charCodeAt(length - 1) === LF && value.charCodeAt(length - 2) === CR ? 2 : 1;
  return value.slice(head, length - tail);
}

function parseCodeSpan(state: InlineState): boolean {
  const text = state.source.text;
  const ranges = state.ranges;
  const start = state.pos;
  let pos = start + 1;
  while (pos < state.end && text.charCodeAt(pos) === BACKTICK) {
    pos++;
  }
  const size = pos - start;
  const open = pos;
  if (exhaustedState !== state) {
    exhaustedState = state;
    exhausted = [];
  }
  const known = exhausted[size];
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
      if (text.charCodeAt(pos) !== BACKTICK) {
        pos++;
        continue;
      }
      const run = pos;
      while (pos < end && text.charCodeAt(pos) === BACKTICK) {
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
  }
  if (close === -1) {
    // No closer: the whole opening run is text.
    if (known === undefined || start < known) {
      exhausted[size] = start;
    }
    appendText(state, text.slice(start, open), start, open);
    state.pos = open;
    return true;
  }
  let value = '';
  let from = open;
  for (let r = state.range; r < range; r += 2) {
    const lineEnd = ranges[r + 1];
    value += text.slice(from, lineEnd) + text.slice(lineEnd, skipLineEnding(text, lineEnd));
    value += linePrefix(state, r + 2, 0);
    from = ranges[r + 2];
  }
  value += text.slice(from, close);
  pushNode(state, {
    type: 'inlineCode',
    value: strip(value),
    position: { start: point(state.source, start), end: point(state.source, pos) },
  });
  state.range = range;
  state.pos = pos;
  return true;
}

const codeSpan: InlineRule = {
  name: 'codeSpan',
  priority: 100,
  triggers: '`',
  parse: parseCodeSpan,
};

export default codeSpan;
