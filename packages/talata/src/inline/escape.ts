import type { InlineRule, InlineState } from '../core/inline';
import { point } from '../core/source';
import { isAsciiPunctuation } from './classify';
import { appendText, pushNode } from './text';

// Backslash escapes (`\*` is a literal `*`) and backslash hard breaks (a
// backslash at the end of a line that is not the last).

function parseEscape(state: InlineState): boolean {
  const text = state.source.text;
  const start = state.pos;
  const next = start + 1;
  if (next < state.end) {
    if (!isAsciiPunctuation(text.charCodeAt(next))) {
      return false;
    }
    appendText(state, text.charAt(next), start, next + 1);
    state.pos = next + 1;
    return true;
  }
  if (state.range + 2 >= state.ranges.length) {
    return false;
  }
  // The text parser extends the break over the line ending.
  pushNode(state, {
    type: 'break',
    position: { start: point(state.source, start), end: point(state.source, next) },
  });
  state.pos = next;
  return true;
}

const escape: InlineRule = {
  name: 'escape',
  priority: 100,
  triggers: '\\',
  parse: parseEscape,
};

export default escape;
