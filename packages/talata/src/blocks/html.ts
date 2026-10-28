import type { Html } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { DASH, isSpaceOrTab } from '../core/chars';
import type { Line } from '../core/line';
import { point, skipLineEnding } from '../core/source';
import { isEmptyLastLine, lineContent } from './code-indented';

const EXCLAMATION = 33;
const DOUBLE_QUOTE = 34;
const APOSTROPHE = 39;
const SLASH = 47;
const COLON = 58;
const LESS_THAN = 60;
const EQUALS = 61;
const GREATER_THAN = 62;
const QUESTION = 63;
const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;
const UNDERSCORE = 95;
const BACKTICK = 96;
const DOT = 46;

// The seven kinds of HTML blocks, numbered as in the CommonMark spec.
const RAW = 1;
const COMMENT = 2;
const INSTRUCTION = 3;
const DECLARATION = 4;
const CDATA = 5;
const BASIC = 6;
const COMPLETE = 7;

// End scan states, after micromark's html-flow.
const SCAN = 0;
const AFTER_DASH = 1;
const BEFORE_CLOSE = 2;
const AFTER_BRACKET = 3;

const rawNames = new Set(['pre', 'script', 'style', 'textarea']);

const blockNames = new Set([
  'address',
  'article',
  'aside',
  'base',
  'basefont',
  'blockquote',
  'body',
  'caption',
  'center',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'iframe',
  'legend',
  'li',
  'link',
  'main',
  'menu',
  'menuitem',
  'nav',
  'noframes',
  'ol',
  'optgroup',
  'option',
  'p',
  'param',
  'search',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'title',
  'tr',
  'track',
  'ul',
]);

function isAsciiAlpha(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAsciiAlphanumeric(code: number): boolean {
  return isAsciiAlpha(code) || (code >= 48 && code <= 57);
}

/**
 * Whether `[from, end)` holds the end of a raw block: `</pre>`, `</script>`,
 * `</style>` or `</textarea>`, any of them, in any case.
 */
function hasRawEnd(text: string, from: number, end: number): boolean {
  let i = from;
  while (i < end) {
    if (text.charCodeAt(i) !== LESS_THAN || text.charCodeAt(i + 1) !== SLASH || i + 1 >= end) {
      i++;
      continue;
    }
    const nameStart = i + 2;
    let j = nameStart;
    while (j < end && j - nameStart < 8 && isAsciiAlpha(text.charCodeAt(j))) {
      j++;
    }
    if (
      j < end &&
      text.charCodeAt(j) === GREATER_THAN &&
      rawNames.has(text.slice(nameStart, j).toLowerCase())
    ) {
      return true;
    }
    i = j > nameStart ? j : nameStart;
  }
  return false;
}

/**
 * Whether `[from, end)` holds the end of a comment (`-->`), instruction
 * (`?>`), declaration (`>`) or CDATA (`]]>`) block. `state` is the scan state
 * at `from`. This follows micromark's states, so `]]]>` does not end CDATA.
 */
function hasEnd(text: string, from: number, end: number, kind: number, state: number): boolean {
  let scan = state;
  for (let i = from; i < end; i++) {
    const code = text.charCodeAt(i);
    if (scan === BEFORE_CLOSE) {
      if (code === GREATER_THAN) {
        return true;
      }
      if (code === DASH && kind === COMMENT) {
        continue;
      }
      scan = SCAN;
    } else if (scan === AFTER_DASH) {
      if (code === DASH) {
        scan = BEFORE_CLOSE;
        continue;
      }
      scan = SCAN;
    } else if (scan === AFTER_BRACKET) {
      if (code === RIGHT_BRACKET) {
        scan = BEFORE_CLOSE;
        continue;
      }
      scan = SCAN;
    }
    if (kind === COMMENT && code === DASH) {
      scan = AFTER_DASH;
    } else if (kind === DECLARATION && code === GREATER_THAN) {
      return true;
    } else if (kind === INSTRUCTION && code === QUESTION) {
      scan = BEFORE_CLOSE;
    } else if (kind === CDATA && code === RIGHT_BRACKET) {
      scan = AFTER_BRACKET;
    }
  }
  return false;
}

function skipSpaces(text: string, from: number, end: number): number {
  let i = from;
  while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
    i++;
  }
  return i;
}

// States of the complete tag scan, after micromark's html-flow.
const NAME_BEFORE = 0;
const NAME = 1;
const NAME_AFTER = 2;
const VALUE_BEFORE = 3;
const QUOTED = 4;
const QUOTED_AFTER = 5;
const UNQUOTED = 6;
const TAG_END = 7;

function isAttributeNameStart(code: number): boolean {
  return code === COLON || code === UNDERSCORE || isAsciiAlpha(code);
}

function isAttributeName(code: number): boolean {
  return code === DASH || code === DOT || isAttributeNameStart(code) || (code >= 48 && code <= 57);
}

/** Whether `[from, end)` finishes a complete opening tag after its name, then has only whitespace. */
function isCompleteOpenTag(text: string, from: number, end: number): boolean {
  let state = NAME_BEFORE;
  let quote = 0;
  let i = from;
  for (;;) {
    // -1 stands for the end of the line.
    const code = i < end ? text.charCodeAt(i) : -1;
    if (state === NAME_BEFORE) {
      if (code === SLASH) {
        state = TAG_END;
        i++;
      } else if (isAttributeNameStart(code)) {
        state = NAME;
        i++;
      } else if (isSpaceOrTab(code)) {
        i++;
      } else {
        state = TAG_END;
      }
    } else if (state === NAME) {
      if (isAttributeName(code)) {
        i++;
      } else {
        state = NAME_AFTER;
      }
    } else if (state === NAME_AFTER) {
      if (code === EQUALS) {
        state = VALUE_BEFORE;
        i++;
      } else if (isSpaceOrTab(code)) {
        i++;
      } else {
        state = NAME_BEFORE;
      }
    } else if (state === VALUE_BEFORE) {
      if (
        code === -1 ||
        code === LESS_THAN ||
        code === EQUALS ||
        code === GREATER_THAN ||
        code === BACKTICK
      ) {
        return false;
      }
      if (code === DOUBLE_QUOTE || code === APOSTROPHE) {
        quote = code;
        state = QUOTED;
        i++;
      } else if (isSpaceOrTab(code)) {
        i++;
      } else {
        state = UNQUOTED;
      }
    } else if (state === QUOTED) {
      if (code === -1) {
        return false;
      }
      if (code === quote) {
        state = QUOTED_AFTER;
      }
      i++;
    } else if (state === QUOTED_AFTER) {
      if (code !== SLASH && code !== GREATER_THAN && !isSpaceOrTab(code)) {
        return false;
      }
      state = NAME_BEFORE;
    } else if (state === UNQUOTED) {
      if (
        code === -1 ||
        code === DOUBLE_QUOTE ||
        code === APOSTROPHE ||
        code === SLASH ||
        code === LESS_THAN ||
        code === EQUALS ||
        code === GREATER_THAN ||
        code === BACKTICK ||
        isSpaceOrTab(code)
      ) {
        state = NAME_AFTER;
      } else {
        i++;
      }
    } else {
      return code === GREATER_THAN && skipSpaces(text, i + 1, end) === end;
    }
  }
}

class OpenHtml implements OpenBlock {
  name = 'html';
  isContainer = false;
  acceptsLazy = false;
  kind: number;
  start: number;
  end: number;
  value: string;
  closed: boolean;

  constructor(kind: number, start: number, end: number, value: string, closed: boolean) {
    this.kind = kind;
    this.start = start;
    this.end = end;
    this.value = value;
    this.closed = closed;
  }

  continue(_state: BlockState, line: Line): boolean {
    if (this.closed) {
      return false;
    }
    return this.kind < BASIC || !line.blank;
  }

  addLine(state: BlockState, line: Line): void {
    const text = state.source.text;
    const eol = text.slice(this.end, skipLineEnding(text, this.end));
    if (isEmptyLastLine(line)) {
      // micromark ends the block after the line ending, with no content line.
      this.value += eol;
      this.end += eol.length;
      this.closed = true;
      return;
    }
    const from = line.start;
    this.end = line.end;
    this.value += eol + lineContent(line, 0);
    if (this.kind === RAW) {
      this.closed = hasRawEnd(text, from, line.end);
    } else if (this.kind < BASIC) {
      this.closed = hasEnd(text, from, line.end, this.kind, SCAN);
    }
  }

  close(state: BlockState): Html {
    let end = this.end;
    let value = this.value;
    if (this.kind < BASIC && !this.closed && state.closeKeepsLineEnding) {
      const text = state.source.text;
      end = skipLineEnding(text, end);
      value += text.slice(this.end, end);
    }
    return {
      type: 'html',
      value,
      position: { start: point(state.source, this.start), end: point(state.source, end) },
    };
  }
}

/** The kind of HTML block that starts at `<` at `open`, or 0. Sets `scanFrom` for kinds 1 to 5. */
function startKind(state: BlockState, text: string, open: number, end: number): number {
  let i = open + 1;
  const code = text.charCodeAt(i);
  if (i >= end) {
    return 0;
  }
  if (code === EXCLAMATION) {
    i++;
    const next = text.charCodeAt(i);
    if (i < end && next === DASH) {
      return text.charCodeAt(i + 1) === DASH && i + 1 < end ? COMMENT : 0;
    }
    if (i < end && next === LEFT_BRACKET) {
      return text.startsWith('CDATA[', i + 1) && i + 7 <= end ? CDATA : 0;
    }
    return i < end && isAsciiAlpha(next) ? DECLARATION : 0;
  }
  if (code === QUESTION) {
    return INSTRUCTION;
  }
  const closing = code === SLASH;
  if (closing) {
    i++;
  }
  const nameStart = i;
  if (i >= end || !isAsciiAlpha(text.charCodeAt(i))) {
    return 0;
  }
  while (i < end && (text.charCodeAt(i) === DASH || isAsciiAlphanumeric(text.charCodeAt(i)))) {
    i++;
  }
  const after = text.charCodeAt(i);
  const slash = i < end && after === SLASH;
  if (i < end && !slash && after !== GREATER_THAN && !isSpaceOrTab(after)) {
    return 0;
  }
  const name = text.slice(nameStart, i).toLowerCase();
  if (!slash && !closing && rawNames.has(name)) {
    return RAW;
  }
  if (blockNames.has(name)) {
    return !slash || (i + 1 < end && text.charCodeAt(i + 1) === GREATER_THAN) ? BASIC : 0;
  }
  // Kind 7 cannot interrupt a paragraph, except a lazy one.
  if (state.paragraph !== undefined && !state.lazy) {
    return 0;
  }
  if (closing) {
    i = skipSpaces(text, i, end);
    return i < end && text.charCodeAt(i) === GREATER_THAN && skipSpaces(text, i + 1, end) === end
      ? COMPLETE
      : 0;
  }
  return isCompleteOpenTag(text, i, end) ? COMPLETE : 0;
}

const html: BlockRule = {
  name: 'html',
  priority: 400,
  canInterruptParagraph: true,
  triggers: '<',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const open = line.nonBlank;
    const end = line.end;
    const kind = startKind(state, text, open, end);
    if (kind === 0) {
      return undefined;
    }
    let closed = false;
    if (kind === RAW) {
      closed = hasRawEnd(text, open + 2, end);
    } else if (kind === COMMENT) {
      closed = hasEnd(text, open + 4, end, kind, BEFORE_CLOSE);
    } else if (kind === INSTRUCTION) {
      closed = hasEnd(text, open + 2, end, kind, BEFORE_CLOSE);
    } else if (kind === DECLARATION) {
      closed = hasEnd(text, open + 3, end, kind, BEFORE_CLOSE);
    } else if (kind === CDATA) {
      closed = hasEnd(text, open + 9, end, kind, SCAN);
    }
    // The block starts at the line's indentation, which is part of its value.
    const start = line.start;
    const value = lineContent(line, 0);
    return new OpenHtml(kind, start, end, value, closed);
  },
};

export default html;
