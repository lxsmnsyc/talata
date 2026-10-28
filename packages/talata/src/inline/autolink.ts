import type { InlineRule, InlineState } from '../core/inline';
import { point } from '../core/source';
import { isAsciiAlpha, isAsciiAlphanumeric } from './classify';
import { pushNode } from './text';

// Autolinks: `<scheme:anything>` and `<user@host>`, on one line, as
// micromark's autolink construct reads them.

const PLUS = 43;
const DASH = 45;
const DOT = 46;
const COLON = 58;
const LESS_THAN = 60;
const GREATER_THAN = 62;
const AT = 64;

function isSchemeCharacter(code: number): boolean {
  return code === PLUS || code === DASH || code === DOT || isAsciiAlphanumeric(code);
}

/** micromark's `asciiAtext`: `#` to `'`, `*`, `+`, `-` to `9`, `=`, `?`, `A` to `Z`, `^` to `~`. */
function isAtext(code: number): boolean {
  return (
    (code >= 35 && code <= 39) ||
    code === 42 ||
    code === 43 ||
    (code >= 45 && code <= 57) ||
    code === 61 ||
    code === 63 ||
    (code >= 65 && code <= 90) ||
    (code >= 94 && code <= 126)
  );
}

/** Offset of the `>` ending a URL autolink whose scheme starts at `pos`, or -1. */
function matchUrl(text: string, pos: number, end: number): number {
  if (pos >= end || !isAsciiAlpha(text.charCodeAt(pos))) {
    return -1;
  }
  let index = pos + 1;
  while (index < end && index - pos < 32 && isSchemeCharacter(text.charCodeAt(index))) {
    index++;
  }
  if (index - pos < 2 || index >= end || text.charCodeAt(index) !== COLON) {
    return -1;
  }
  for (index++; index < end; index++) {
    const code = text.charCodeAt(index);
    if (code === GREATER_THAN) {
      return index;
    }
    if (code === 32 || code === LESS_THAN || code < 32 || code === 127) {
      return -1;
    }
  }
  return -1;
}

/** Offset of the `>` ending an email autolink that starts at `pos`, or -1. */
function matchEmail(text: string, pos: number, end: number): number {
  let index = pos;
  while (index < end && isAtext(text.charCodeAt(index))) {
    index++;
  }
  if (index === pos || index >= end || text.charCodeAt(index) !== AT) {
    return -1;
  }
  index++;
  // Labels of letters, digits and inner dashes, up to 63 characters each.
  for (;;) {
    if (index >= end || !isAsciiAlphanumeric(text.charCodeAt(index))) {
      return -1;
    }
    let size = 0;
    for (;;) {
      if (index >= end) {
        return -1;
      }
      const code = text.charCodeAt(index);
      if (code === DOT || code === GREATER_THAN) {
        if (text.charCodeAt(index - 1) === DASH) {
          return -1;
        }
        break;
      }
      if ((code !== DASH && !isAsciiAlphanumeric(code)) || size++ >= 63) {
        return -1;
      }
      index++;
    }
    if (text.charCodeAt(index) === GREATER_THAN) {
      return index;
    }
    index++;
  }
}

function parseAutolink(state: InlineState): boolean {
  const text = state.source.text;
  const start = state.pos;
  let close = matchUrl(text, start + 1, state.end);
  let email = false;
  if (close === -1) {
    close = matchEmail(text, start + 1, state.end);
    if (close === -1) {
      return false;
    }
    email = true;
  }
  const value = text.slice(start + 1, close);
  const source = state.source;
  pushNode(state, {
    type: 'link',
    title: null,
    url: email ? 'mailto:' + value : value,
    children: [
      {
        type: 'text',
        value,
        position: { start: point(source, start + 1), end: point(source, close) },
      },
    ],
    position: { start: point(source, start), end: point(source, close + 1) },
  });
  state.pos = close + 1;
  return true;
}

const autolink: InlineRule = {
  name: 'autolink',
  priority: 100,
  triggers: '<',
  parse: parseAutolink,
};

export default autolink;
