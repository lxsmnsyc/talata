import type {
  Image,
  ImageReference,
  Link,
  LinkReference,
  PhrasingContent,
  ReferenceType,
  Text,
} from 'mdast';
import type { InlineRule, InlineState } from '../core/inline';
import { nodeIndex, resolveSpan } from '../core/inline';
import { point, skipLineEnding } from '../core/source';
import { normalizeIdentifier } from '../core/state';
import { decodeString } from './decode';
import {
  END,
  LINE_ENDING,
  linePrefix,
  nextLine,
  peek,
  rangeIndex,
  rangeText,
  skipWhitespace,
} from './lines';
import type { Cursor } from './lines';
import { mergeText, pushNode } from './text';

// Links and images: `[` and `![` push a bracket delimiter; `]` closes the
// nearest one as an inline link (`(url "title")`), a full reference
// (`[label]`), a collapsed reference (`[]`) or a shortcut reference, the way
// micromark's label end construct does.

const SPACE = 32;
const TAB = 9;
const EXCLAMATION = 33;
const QUOTE = 34;
const APOSTROPHE = 39;
const LEFT_PAREN = 40;
const RIGHT_PAREN = 41;
const LESS_THAN = 60;
const GREATER_THAN = 62;
const LEFT_BRACKET = 91;
const BACKSLASH = 92;
const RIGHT_BRACKET = 93;

// Destination balance limit and label size limit, as in micromark.
const MAX_BALANCE = 32;
const MAX_LABEL = 999;

const NONE = 0;
const RESOURCE = 1;
const FULL = 2;
const COLLAPSED = 3;
const SHORTCUT = 4;

// Reused per call; link parsing does not nest.
const cursor: Cursor = { range: 0, pos: 0 };
let url = '';
let title: string | null = null;

function openBracket(state: InlineState, start: number, end: number, marker: number): boolean {
  const node: Text = {
    type: 'text',
    value: state.source.text.slice(start, end),
    position: { start: point(state.source, start), end: point(state.source, end) },
  };
  pushNode(state, node);
  state.delimiters.push({
    marker,
    node,
    start,
    end,
    canOpen: false,
    canClose: false,
    active: true,
  });
  state.pos = end;
  return true;
}

function isControl(code: number): boolean {
  return code < 32 || code === 127;
}

/** Destination after `(` and optional whitespace; sets `url`. */
function parseDestination(state: InlineState): boolean {
  const text = state.source.text;
  const end = state.ranges[cursor.range + 1];
  const start = cursor.pos;
  let pos = start;
  if (text.charCodeAt(pos) === LESS_THAN) {
    pos++;
    for (;;) {
      if (pos >= end) {
        return false;
      }
      const code = text.charCodeAt(pos);
      if (code === GREATER_THAN) {
        break;
      }
      if (code === LESS_THAN) {
        return false;
      }
      if (code === BACKSLASH && pos + 1 < end) {
        const next = text.charCodeAt(pos + 1);
        pos += next === LESS_THAN || next === GREATER_THAN || next === BACKSLASH ? 2 : 1;
      } else {
        pos++;
      }
    }
    url = decodeString(text.slice(start + 1, pos));
    cursor.pos = pos + 1;
    return true;
  }
  let balance = 0;
  for (;;) {
    if (pos >= end) {
      // A line ending or the end of the leaf.
      if (balance > 0) {
        return false;
      }
      break;
    }
    const code = text.charCodeAt(pos);
    if (balance === 0 && (code === RIGHT_PAREN || code === SPACE || code === TAB)) {
      break;
    }
    if (code === LEFT_PAREN) {
      if (balance >= MAX_BALANCE) {
        return false;
      }
      balance++;
      pos++;
      continue;
    }
    if (code === RIGHT_PAREN) {
      balance--;
      pos++;
      continue;
    }
    if (code === SPACE || isControl(code)) {
      return false;
    }
    if (code === BACKSLASH && pos + 1 < end) {
      const next = text.charCodeAt(pos + 1);
      pos += next === LEFT_PAREN || next === RIGHT_PAREN || next === BACKSLASH ? 2 : 1;
    } else {
      pos++;
    }
  }
  url = decodeString(text.slice(start, pos));
  cursor.pos = pos;
  return true;
}

/** Title starting at the cursor on `"`, `'` or `(`; sets `title`. */
function parseTitle(state: InlineState): boolean {
  const text = state.source.text;
  const ranges = state.ranges;
  const marker = text.charCodeAt(cursor.pos);
  const close = marker === LEFT_PAREN ? RIGHT_PAREN : marker;
  let value = '';
  let from = cursor.pos + 1;
  let pos = from;
  for (;;) {
    const end = ranges[cursor.range + 1];
    while (pos < end) {
      const code = text.charCodeAt(pos);
      if (code === close) {
        title = decodeString(value + text.slice(from, pos));
        cursor.pos = pos + 1;
        return true;
      }
      if (code === BACKSLASH && pos + 1 < end) {
        const next = text.charCodeAt(pos + 1);
        pos += next === close || next === BACKSLASH ? 2 : 1;
      } else {
        pos++;
      }
    }
    if (cursor.range + 2 >= ranges.length) {
      return false;
    }
    // Whitespace at the start of the next line is dropped.
    value += text.slice(from, end) + text.slice(end, skipLineEnding(text, end));
    nextLine(state, cursor);
    from = cursor.pos;
    pos = from;
  }
}

/** Resource starting at the cursor on `(`; sets `url` and `title`. */
function parseResource(state: InlineState): boolean {
  cursor.pos++;
  skipWhitespace(state, cursor);
  url = '';
  title = null;
  let code = peek(state, cursor);
  if (code !== RIGHT_PAREN) {
    if (code < 0 || code === SPACE || isControl(code) || !parseDestination(state)) {
      return false;
    }
    code = peek(state, cursor);
    if (code === SPACE || code === TAB || code === LINE_ENDING) {
      skipWhitespace(state, cursor);
      code = peek(state, cursor);
      if (code === QUOTE || code === APOSTROPHE || code === LEFT_PAREN) {
        if (!parseTitle(state)) {
          return false;
        }
        skipWhitespace(state, cursor);
        code = peek(state, cursor);
      }
    }
  }
  if (code !== RIGHT_PAREN) {
    return false;
  }
  cursor.pos++;
  return true;
}

/** Reference label starting at the cursor on `[`; the cursor ends after `]`. */
function parseLabel(state: InlineState): boolean {
  const text = state.source.text;
  let size = 0;
  let seen = false;
  cursor.pos++;
  for (;;) {
    const code = peek(state, cursor);
    if (code === END || code === LEFT_BRACKET) {
      return false;
    }
    if (code === LINE_ENDING) {
      nextLine(state, cursor);
      size += linePrefix(state, cursor.range, 0).length;
      if (size > MAX_LABEL) {
        return false;
      }
      continue;
    }
    if (code === RIGHT_BRACKET) {
      if (!seen) {
        return false;
      }
      cursor.pos++;
      return true;
    }
    if (++size > MAX_LABEL) {
      return false;
    }
    if (code !== SPACE && code !== TAB) {
      seen = true;
    }
    cursor.pos++;
    if (code === BACKSLASH && cursor.pos < state.ranges[cursor.range + 1]) {
      const next = text.charCodeAt(cursor.pos);
      if (next === LEFT_BRACKET || next === BACKSLASH || next === RIGHT_BRACKET) {
        cursor.pos++;
        if (++size > MAX_LABEL) {
          return false;
        }
      }
    }
  }
}

/** Plain text of nodes, as mdast-util-to-string gives an image's `alt`. */
function toString(nodes: PhrasingContent[]): string {
  let result = '';
  for (const node of nodes) {
    if ('value' in node) {
      result += node.value;
    } else if ('alt' in node) {
      result += node.alt ?? '';
    } else if ('children' in node) {
      result += toString(node.children);
    }
  }
  return result;
}

function closeBracket(state: InlineState): boolean {
  const delimiters = state.delimiters;
  let open = delimiters.length - 1;
  while (
    open >= 0 &&
    delimiters[open].marker !== LEFT_BRACKET &&
    delimiters[open].marker !== EXCLAMATION
  ) {
    open--;
  }
  if (open < 0) {
    return false;
  }
  const bracket = delimiters[open];
  if (!bracket.active) {
    delimiters.splice(open, 1);
    return false;
  }
  const text = state.source.text;
  const close = state.pos;
  const label = rangeText(state, rangeIndex(state, bracket.end), bracket.end, close);
  const defined = state.definitions.has(normalizeIdentifier(label));
  let reference = label;
  let kind = NONE;
  const next = close + 1 < state.end ? text.charCodeAt(close + 1) : -1;
  cursor.range = state.range;
  cursor.pos = close + 1;
  if (next === LEFT_PAREN) {
    if (parseResource(state)) {
      kind = RESOURCE;
    } else if (defined) {
      kind = SHORTCUT;
      cursor.range = state.range;
      cursor.pos = close + 1;
    }
  } else if (next === LEFT_BRACKET) {
    if (parseLabel(state)) {
      reference = rangeText(state, state.range, close + 2, cursor.pos - 1);
      if (state.definitions.has(normalizeIdentifier(reference))) {
        kind = FULL;
      }
    }
    if (kind === NONE && defined) {
      reference = label;
      cursor.range = state.range;
      cursor.pos = close + 1;
      if (close + 2 < state.end && text.charCodeAt(close + 2) === RIGHT_BRACKET) {
        kind = COLLAPSED;
        cursor.pos = close + 3;
      }
    }
  } else if (defined) {
    kind = SHORTCUT;
  }
  if (kind === NONE) {
    delimiters.splice(open, 1);
    return false;
  }

  // Pair delimiters inside the label only, then move its nodes into the link.
  resolveSpan(state, open + 1);
  const nodes = state.nodes;
  const index = nodeIndex(state, bracket.node);
  const children = nodes.splice(index + 1);
  nodes.length = index;
  delimiters.length = open;
  mergeText(children);
  const image = bracket.marker === EXCLAMATION;
  if (!image) {
    // No links inside links: earlier brackets can no longer form one.
    for (const delimiter of delimiters) {
      if (delimiter.marker === LEFT_BRACKET) {
        delimiter.active = false;
      }
    }
  }
  const position = {
    start: point(state.source, bracket.start),
    end: point(state.source, cursor.pos),
  };
  let node: Link | Image | LinkReference | ImageReference;
  if (kind === RESOURCE) {
    node = image
      ? { type: 'image', title, url, alt: toString(children), position }
      : { type: 'link', title, url, children, position };
  } else {
    let referenceType: ReferenceType = 'shortcut';
    if (kind === FULL) {
      referenceType = 'full';
    } else if (kind === COLLAPSED) {
      referenceType = 'collapsed';
    }
    const identifier = normalizeIdentifier(reference).toLowerCase();
    const decoded = decodeString(reference);
    node = image
      ? {
          type: 'imageReference',
          alt: toString(children),
          label: decoded,
          identifier,
          referenceType,
          position,
        }
      : { type: 'linkReference', children, label: decoded, identifier, referenceType, position };
  }
  pushNode(state, node);
  state.range = cursor.range;
  state.pos = cursor.pos;
  return true;
}

function parseLink(state: InlineState): boolean {
  const text = state.source.text;
  const start = state.pos;
  const code = text.charCodeAt(start);
  if (code === LEFT_BRACKET) {
    return openBracket(state, start, start + 1, LEFT_BRACKET);
  }
  if (code === EXCLAMATION) {
    if (start + 1 < state.end && text.charCodeAt(start + 1) === LEFT_BRACKET) {
      return openBracket(state, start, start + 2, EXCLAMATION);
    }
    return false;
  }
  return closeBracket(state);
}

const link: InlineRule = {
  name: 'link',
  priority: 500,
  triggers: '[]!',
  parse: parseLink,
};

export default link;
