import type { InlineRule, InlineState } from '../core/inline';
import { parseCharacterReference, reference } from './decode';
import { appendText } from './text';

// Named, decimal and hexadecimal character references (`&amp;`, `&#35;`,
// `&#x22;`). The decoded characters join the surrounding text.

function parseReference(state: InlineState): boolean {
  const start = state.pos;
  const end = parseCharacterReference(state.source.text, start, state.end);
  if (end === -1) {
    return false;
  }
  appendText(state, reference.value, start, end);
  state.pos = end;
  return true;
}

const characterReference: InlineRule = {
  name: 'characterReference',
  priority: 100,
  triggers: '&',
  parse: parseReference,
};

export default characterReference;
