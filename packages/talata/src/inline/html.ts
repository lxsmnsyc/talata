import type { InlineRule, InlineState } from '../core/inline';
import { point, skipLineEnding } from '../core/source';
import { isAsciiAlpha, isAsciiAlphanumeric } from './classify';
import { END, LINE_ENDING, linePrefix, nextLine, peek, workSteps } from './lines';
import type { Cursor } from './lines';
import { pushNode } from './text';

// Raw HTML: open and closing tags, comments, processing instructions,
// declarations and CDATA sections, following micromark's html text
// construct state by state. They may span lines; after each line ending up
// to 3 columns of the kept line prefix are dropped from the value.

const SPACE = 32;
const TAB = 9;
const EXCLAMATION = 33;
const QUOTE = 34;
const APOSTROPHE = 39;
const DASH = 45;
const DOT = 46;
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

// States.
const OPEN = 0;
const DECLARATION_OPEN = 1;
const COMMENT_OPEN = 2;
const COMMENT = 3;
const COMMENT_CLOSE = 4;
const COMMENT_END = 5;
const CDATA_OPEN = 6;
const CDATA = 7;
const CDATA_CLOSE = 8;
const CDATA_END = 9;
const DECLARATION = 10;
const INSTRUCTION = 11;
const INSTRUCTION_CLOSE = 12;
const TAG_CLOSE_START = 13;
const TAG_CLOSE = 14;
const TAG_CLOSE_BETWEEN = 15;
const TAG_OPEN = 16;
const TAG_OPEN_BETWEEN = 17;
const ATTRIBUTE_NAME = 18;
const ATTRIBUTE_NAME_AFTER = 19;
const ATTRIBUTE_VALUE_BEFORE = 20;
const ATTRIBUTE_VALUE_QUOTED = 21;
const ATTRIBUTE_VALUE_UNQUOTED = 22;
const ATTRIBUTE_VALUE_QUOTED_AFTER = 23;
const END_TAG = 24;

const CDATA_TEXT = 'CDATA[';

const cursor: Cursor = { range: 0, pos: 0 };

// Comments, CDATA, declarations and instructions that reach the end of the
// leaf unclosed: the earliest start per kind. A later one of the same kind
// cannot close either, so it fails at once instead of scanning again.
// Keyed on the inline state, which is new for every leaf.
let exhaustedState: InlineState | undefined;
const exhausted = [-1, -1, -1, -1];

function kindOf(current: number): number {
  if (current === CDATA || current === CDATA_CLOSE || current === CDATA_END) {
    return 1;
  }
  if (current === DECLARATION) {
    return 2;
  }
  if (current === INSTRUCTION || current === INSTRUCTION_CLOSE) {
    return 3;
  }
  return 0;
}

/** Fails a scan that reached the end of the leaf, and remembers it. */
function exhaust(state: InlineState, current: number, start: number): number {
  if (exhaustedState !== state) {
    exhaustedState = state;
    exhausted.fill(-1);
  }
  const kind = kindOf(current);
  if (exhausted[kind] === -1 || start < exhausted[kind]) {
    exhausted[kind] = start;
  }
  return -1;
}

function isExhausted(state: InlineState, current: number, start: number): boolean {
  if (exhaustedState !== state) {
    return false;
  }
  const from = exhausted[kindOf(current)];
  return from !== -1 && start > from;
}

function isSpace(code: number): boolean {
  return code === SPACE || code === TAB;
}

/** Offset after the `>` that ends the construct; the cursor ends there too. -1 on failure. */
function scan(state: InlineState): number {
  const start = cursor.pos;
  let current = OPEN;
  let marker = 0;
  let index = 0;
  cursor.pos++;
  for (;;) {
    workSteps.count++;
    const code = peek(state, cursor);
    if (code === LINE_ENDING) {
      // Only states that allow a line ending reach here with one.
      if (
        current !== COMMENT &&
        current !== CDATA &&
        current !== DECLARATION &&
        current !== INSTRUCTION &&
        current !== TAG_CLOSE_BETWEEN &&
        current !== TAG_OPEN_BETWEEN &&
        current !== ATTRIBUTE_NAME_AFTER &&
        current !== ATTRIBUTE_VALUE_BEFORE &&
        current !== ATTRIBUTE_VALUE_QUOTED
      ) {
        // Other states treat it like any character that does not match.
        if (!lineEndingTransition(current)) {
          return -1;
        }
        current = lineEndingNext(current);
        continue;
      }
      nextLine(state, cursor);
      continue;
    }
    switch (current) {
      case OPEN:
        if (code === EXCLAMATION) {
          current = DECLARATION_OPEN;
        } else if (code === SLASH) {
          current = TAG_CLOSE_START;
        } else if (code === QUESTION) {
          current = INSTRUCTION;
          if (isExhausted(state, current, start)) {
            return -1;
          }
        } else if (isAsciiAlpha(code)) {
          current = TAG_OPEN;
        } else {
          return -1;
        }
        break;
      case DECLARATION_OPEN:
        if (code === DASH) {
          current = COMMENT_OPEN;
        } else if (code === LEFT_BRACKET) {
          current = CDATA_OPEN;
          index = 0;
        } else if (isAsciiAlpha(code)) {
          current = DECLARATION;
          if (isExhausted(state, current, start)) {
            return -1;
          }
        } else {
          return -1;
        }
        break;
      case COMMENT_OPEN:
        if (code !== DASH) {
          return -1;
        }
        current = COMMENT_END;
        if (isExhausted(state, COMMENT, start)) {
          return -1;
        }
        break;
      case COMMENT:
        if (code === END) {
          return exhaust(state, current, start);
        }
        if (code === DASH) {
          current = COMMENT_CLOSE;
        }
        break;
      case COMMENT_CLOSE:
        if (code !== DASH) {
          current = COMMENT;
          continue;
        }
        current = COMMENT_END;
        break;
      case COMMENT_END:
        if (code === GREATER_THAN) {
          return cursor.pos + 1;
        }
        current = code === DASH ? COMMENT_CLOSE : COMMENT;
        continue;
      case CDATA_OPEN:
        if (code !== CDATA_TEXT.charCodeAt(index)) {
          return -1;
        }
        index++;
        if (index === CDATA_TEXT.length) {
          current = CDATA;
          if (isExhausted(state, current, start)) {
            return -1;
          }
        }
        break;
      case CDATA:
        if (code === END) {
          return exhaust(state, current, start);
        }
        if (code === RIGHT_BRACKET) {
          current = CDATA_CLOSE;
        }
        break;
      case CDATA_CLOSE:
        if (code !== RIGHT_BRACKET) {
          current = CDATA;
          continue;
        }
        current = CDATA_END;
        break;
      case CDATA_END:
        if (code === GREATER_THAN) {
          return cursor.pos + 1;
        }
        if (code !== RIGHT_BRACKET) {
          current = CDATA;
          continue;
        }
        break;
      case DECLARATION:
        if (code === END) {
          return exhaust(state, current, start);
        }
        if (code === GREATER_THAN) {
          return cursor.pos + 1;
        }
        break;
      case INSTRUCTION:
        if (code === END) {
          return exhaust(state, current, start);
        }
        if (code === QUESTION) {
          current = INSTRUCTION_CLOSE;
        }
        break;
      case INSTRUCTION_CLOSE:
        if (code === GREATER_THAN) {
          return cursor.pos + 1;
        }
        current = INSTRUCTION;
        continue;
      case TAG_CLOSE_START:
        if (!isAsciiAlpha(code)) {
          return -1;
        }
        current = TAG_CLOSE;
        break;
      case TAG_CLOSE:
        if (code !== DASH && !isAsciiAlphanumeric(code)) {
          current = TAG_CLOSE_BETWEEN;
          continue;
        }
        break;
      case TAG_CLOSE_BETWEEN:
        if (!isSpace(code)) {
          return code === GREATER_THAN ? cursor.pos + 1 : -1;
        }
        break;
      case TAG_OPEN:
        if (code === SLASH || code === GREATER_THAN || isSpace(code)) {
          current = TAG_OPEN_BETWEEN;
          continue;
        }
        if (code !== DASH && !isAsciiAlphanumeric(code)) {
          return -1;
        }
        break;
      case TAG_OPEN_BETWEEN:
        if (code === SLASH) {
          current = END_TAG;
        } else if (code === COLON || code === UNDERSCORE || isAsciiAlpha(code)) {
          current = ATTRIBUTE_NAME;
        } else if (!isSpace(code)) {
          return code === GREATER_THAN ? cursor.pos + 1 : -1;
        }
        break;
      case ATTRIBUTE_NAME:
        if (
          code !== DASH &&
          code !== DOT &&
          code !== COLON &&
          code !== UNDERSCORE &&
          !isAsciiAlphanumeric(code)
        ) {
          current = ATTRIBUTE_NAME_AFTER;
          continue;
        }
        break;
      case ATTRIBUTE_NAME_AFTER:
        if (code === EQUALS) {
          current = ATTRIBUTE_VALUE_BEFORE;
        } else if (!isSpace(code)) {
          current = TAG_OPEN_BETWEEN;
          continue;
        }
        break;
      case ATTRIBUTE_VALUE_BEFORE:
        if (
          code === END ||
          code === LESS_THAN ||
          code === EQUALS ||
          code === GREATER_THAN ||
          code === BACKTICK
        ) {
          return -1;
        }
        if (code === QUOTE || code === APOSTROPHE) {
          marker = code;
          current = ATTRIBUTE_VALUE_QUOTED;
        } else if (!isSpace(code)) {
          current = ATTRIBUTE_VALUE_UNQUOTED;
        }
        break;
      case ATTRIBUTE_VALUE_QUOTED:
        if (code === END) {
          return -1;
        }
        if (code === marker) {
          current = ATTRIBUTE_VALUE_QUOTED_AFTER;
        }
        break;
      case ATTRIBUTE_VALUE_UNQUOTED:
        if (
          code === END ||
          code === QUOTE ||
          code === APOSTROPHE ||
          code === LESS_THAN ||
          code === EQUALS ||
          code === BACKTICK
        ) {
          return -1;
        }
        if (code === SLASH || code === GREATER_THAN || isSpace(code)) {
          current = TAG_OPEN_BETWEEN;
          continue;
        }
        break;
      case ATTRIBUTE_VALUE_QUOTED_AFTER:
        if (code === SLASH || code === GREATER_THAN || isSpace(code)) {
          current = TAG_OPEN_BETWEEN;
          continue;
        }
        return -1;
      case END_TAG:
        return code === GREATER_THAN ? cursor.pos + 1 : -1;
      default:
        return -1;
    }
    if (code === END) {
      return -1;
    }
    cursor.pos++;
  }
}

/** Whether `current` moves on (without consuming) when it sees a line ending. */
function lineEndingTransition(current: number): boolean {
  return (
    current === COMMENT_CLOSE ||
    current === COMMENT_END ||
    current === CDATA_CLOSE ||
    current === CDATA_END ||
    current === INSTRUCTION_CLOSE ||
    current === TAG_CLOSE ||
    current === TAG_OPEN ||
    current === ATTRIBUTE_NAME ||
    current === ATTRIBUTE_VALUE_UNQUOTED ||
    current === ATTRIBUTE_VALUE_QUOTED_AFTER
  );
}

function lineEndingNext(current: number): number {
  switch (current) {
    case COMMENT_CLOSE:
    case COMMENT_END:
      return COMMENT;
    case CDATA_CLOSE:
    case CDATA_END:
      return CDATA;
    case INSTRUCTION_CLOSE:
      return INSTRUCTION;
    case TAG_CLOSE:
      return TAG_CLOSE_BETWEEN;
    case ATTRIBUTE_NAME:
      return ATTRIBUTE_NAME_AFTER;
    default:
      // TAG_OPEN, ATTRIBUTE_VALUE_UNQUOTED, ATTRIBUTE_VALUE_QUOTED_AFTER.
      return TAG_OPEN_BETWEEN;
  }
}

function parseHtml(state: InlineState): boolean {
  const start = state.pos;
  cursor.range = state.range;
  cursor.pos = start;
  const end = scan(state);
  if (end === -1) {
    return false;
  }
  // The value: each line's part, raw line endings, and the kept prefix.
  const text = state.source.text;
  const ranges = state.ranges;
  let value = '';
  let from = start;
  for (let r = state.range; r < cursor.range; r += 2) {
    const lineEnd = ranges[r + 1];
    value += text.slice(from, lineEnd) + text.slice(lineEnd, skipLineEnding(text, lineEnd));
    value += linePrefix(state, r + 2, 3);
    from = ranges[r + 2];
  }
  value += text.slice(from, end);
  pushNode(state, {
    type: 'html',
    value,
    position: { start: point(state.source, start), end: point(state.source, end) },
  });
  state.range = cursor.range;
  state.pos = end;
  return true;
}

const html: InlineRule = {
  name: 'html',
  priority: 200,
  triggers: '<',
  parse: parseHtml,
};

export default html;
