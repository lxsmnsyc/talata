import type { Link } from 'mdast';
import type { Delimiter, InlineRule, InlineState } from '../core/inline';
import { DEAD_BRACKET } from '../core/inline';
import { point, skipLineEnding } from '../core/source';
import {
  OTHER,
  PUNCTUATION,
  WHITESPACE,
  classifyCharacter,
  isAsciiAlpha,
  isAsciiAlphanumeric,
  isAsciiPunctuation,
} from '../inline/classify';
import { containerEnd, wasReached, workSteps } from '../inline/lines';
import { pushNode } from '../inline/text';

// GFM literal autolinks (`www.a.b`, `http://a.b`, `a@b.c`) as
// micromark-extension-gfm-autolink-literal tokenizes them. These links have
// positions; the transform in `autolink-literal-transform.ts` finds the ones
// micromark misses, without positions.
//
// micromark tries an email at the start of every run of atext characters and
// `www` or `http` at every `w` or `h`. Only a few characters can make one
// succeed, so this rule waits for them: `.` (after `www`, or in an email
// before its `@`), `:` (after `http` or `https`), `@`, and `_` (an email
// takes `_` before emphasis does). It then takes back the plain text before
// the trigger that the link starts in.

const BANG = 33;
const QUOTE = 34;
const AMPERSAND = 38;
const APOSTROPHE = 39;
const LEFT_PAREN = 40;
const RIGHT_PAREN = 41;
const ASTERISK = 42;
const PLUS = 43;
const COMMA = 44;
const DASH = 45;
const DOT = 46;
const SLASH = 47;
const COLON = 58;
const SEMICOLON = 59;
const LESS_THAN = 60;
const QUESTION = 63;
const AT = 64;
const LEFT_BRACKET = 91;
const BACKSLASH = 92;
const RIGHT_BRACKET = 93;
const UNDERSCORE = 95;
const TILDE = 126;
const SPACE = 32;
const TAB = 9;

/** Lowercase ASCII letter of `code`, or the code itself. */
function lower(code: number): number {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

function isGfmAtext(code: number): boolean {
  return (
    code === PLUS ||
    code === DASH ||
    code === DOT ||
    code === UNDERSCORE ||
    isAsciiAlphanumeric(code)
  );
}

function isWhitespace(code: number): boolean {
  return classifyCharacter(code) === WHITESPACE;
}

// The leaf the scans below work on, so their memos apply to it only.
let owner: InlineState | undefined;

// A failed trail check from `trailFrom` stopped at `trailTo`; a check at any
// offset in between fails the same way.
let trailOwner: InlineState | undefined;
let trailEnd = -1;
let trailFrom = -1;
let trailTo = -1;

/**
 * Whether the punctuation at `index` starts the trail of a domain or path:
 * trailing punctuation up to whitespace, `<` or the end, so not part of the
 * link (micromark's `trail`).
 */
function isTrail(text: string, index: number, end: number): boolean {
  if (trailOwner === owner && trailEnd === end && index >= trailFrom && index < trailTo) {
    return false;
  }
  let k = index;
  for (;;) {
    if (__TALATA_TEST__) {
      workSteps.count++;
    }
    if (k >= end) {
      return true;
    }
    const code = text.charCodeAt(k);
    if (
      code === BANG ||
      code === QUOTE ||
      code === APOSTROPHE ||
      code === RIGHT_PAREN ||
      code === ASTERISK ||
      code === COMMA ||
      code === DOT ||
      code === COLON ||
      code === SEMICOLON ||
      code === QUESTION ||
      code === UNDERSCORE ||
      code === TILDE
    ) {
      k++;
      continue;
    }
    if (code === AMPERSAND) {
      // `&` and letters and `;` are a trail as a whole.
      k++;
      if (k >= end || !isAsciiAlpha(text.charCodeAt(k))) {
        break;
      }
      while (k < end && isAsciiAlpha(text.charCodeAt(k))) {
        k++;
      }
      if (k >= end || text.charCodeAt(k) !== SEMICOLON) {
        break;
      }
      k++;
      continue;
    }
    if (code === RIGHT_BRACKET) {
      // `](` and `][` could start a resource or reference.
      k++;
      if (k >= end) {
        return true;
      }
      const next = text.charCodeAt(k);
      if (next === LEFT_PAREN || next === LEFT_BRACKET || isWhitespace(next)) {
        return true;
      }
      continue;
    }
    if (code === LESS_THAN || isWhitespace(code)) {
      return true;
    }
    break;
  }
  trailOwner = owner;
  trailEnd = end;
  trailFrom = index;
  trailTo = k;
  return false;
}

// A domain scan from `domainFrom` failed on underscores in its last two
// segments. A later scan from up to `domainTo` (the dot before those
// segments) ends at the same place with the same segments, so fails too.
let domainOwner: InlineState | undefined;
let domainRangeEnd = -1;
let domainFrom = -1;
let domainTo = -1;

/** End of the domain starting at `index`, or -1 (micromark's `domain`). */
function scanDomain(text: string, index: number, end: number): number {
  if (domainOwner === owner && domainRangeEnd === end && index >= domainFrom && index <= domainTo) {
    return -1;
  }
  let underscoreInLast = false;
  let underscoreInLastButOne = false;
  let seen = false;
  let lastDot = -1;
  let dotBefore = -1;
  let i = index;
  while (i < end) {
    if (__TALATA_TEST__) {
      workSteps.count++;
    }
    const code = text.charCodeAt(i);
    if (code === DOT || code === UNDERSCORE) {
      if (isTrail(text, i, end)) {
        break;
      }
      if (code === UNDERSCORE) {
        underscoreInLast = true;
      } else {
        underscoreInLastButOne = underscoreInLast;
        underscoreInLast = false;
        dotBefore = lastDot;
        lastDot = i;
      }
      i++;
      continue;
    }
    const kind = classifyCharacter(code);
    if (kind === WHITESPACE || (code !== DASH && kind === PUNCTUATION)) {
      break;
    }
    seen = true;
    i++;
  }
  if (!seen) {
    return -1;
  }
  if (underscoreInLast || underscoreInLastButOne) {
    domainOwner = owner;
    domainRangeEnd = end;
    domainFrom = index;
    domainTo = dotBefore;
    return -1;
  }
  return i;
}

/** End of the path starting at `index` (micromark's `path`). */
function scanPath(text: string, index: number, end: number): number {
  let opened = 0;
  let closed = 0;
  let i = index;
  while (i < end) {
    const code = text.charCodeAt(i);
    if (code === LEFT_PAREN) {
      opened++;
      i++;
      continue;
    }
    if (code === RIGHT_PAREN && closed < opened) {
      closed++;
      i++;
      continue;
    }
    if (
      code === BANG ||
      code === QUOTE ||
      code === AMPERSAND ||
      code === APOSTROPHE ||
      code === RIGHT_PAREN ||
      code === ASTERISK ||
      code === COMMA ||
      code === DOT ||
      code === COLON ||
      code === SEMICOLON ||
      code === LESS_THAN ||
      code === QUESTION ||
      code === RIGHT_BRACKET ||
      code === UNDERSCORE ||
      code === TILDE
    ) {
      if (isTrail(text, i, end)) {
        return i;
      }
      if (code === RIGHT_PAREN) {
        closed++;
      }
      i++;
      continue;
    }
    if (isWhitespace(code)) {
      return i;
    }
    i++;
  }
  return i;
}

// The delimiters [0, cleanLength) of `bracketState` hold no bracket, and
// `cleanLast` was the last of them. `openBracket` was found at `openIndex`.
let bracketState: InlineState | undefined;
let cleanLength = 0;
let cleanLast: Delimiter | undefined;
let openBracket: Delimiter | undefined;
let openIndex = -1;

/**
 * Whether a `[` or `![` is open (micromark's `previousUnbalanced`): open
 * brackets stay on the delimiter stack until a `]` closes or drops them.
 */
function unbalanced(state: InlineState): boolean {
  const delimiters = state.delimiters;
  const length = delimiters.length;
  let from = 0;
  if (bracketState === state) {
    if (
      openIndex !== -1 &&
      openIndex < length &&
      delimiters[openIndex] === openBracket &&
      openBracket.marker !== DEAD_BRACKET
    ) {
      return true;
    }
    if (cleanLength <= length && (cleanLength === 0 || delimiters[cleanLength - 1] === cleanLast)) {
      from = cleanLength;
    }
  }
  bracketState = state;
  openIndex = -1;
  openBracket = undefined;
  for (let i = from; i < length; i++) {
    const marker = delimiters[i].marker;
    if (marker === LEFT_BRACKET || marker === BANG) {
      cleanLength = i;
      cleanLast = i > 0 ? delimiters[i - 1] : undefined;
      openIndex = i;
      openBracket = delimiters[i];
      return true;
    }
  }
  cleanLength = length;
  cleanLast = length > 0 ? delimiters[length - 1] : undefined;
  return false;
}

/** Drops the pending text from `from` on: the plain source the link starts with. */
function takeBack(state: InlineState, from: number): void {
  const drop = state.textEnd - from;
  state.text = state.text.slice(0, state.text.length - drop);
  if (state.textStart === from) {
    state.textStart = -1;
    return;
  }
  // Text before a range start ends with the line ending, where `endRange`
  // put its end.
  const range = state.range;
  if (from === state.ranges[range] && range > 0) {
    state.textEnd = wasReached(state, range)
      ? containerEnd(state, range)
      : skipLineEnding(state.source.text, state.ranges[range - 1]);
  } else {
    state.textEnd = from;
  }
}

/** Whether the plain text pending before the trigger covers `from`. */
function pendingFrom(state: InlineState, from: number): boolean {
  return from === state.pos || (state.textStart !== -1 && state.textStart <= from);
}

function emit(state: InlineState, from: number, to: number, url: string): boolean {
  if (from < state.pos) {
    takeBack(state, from);
  }
  const source = state.source;
  const node: Link = {
    type: 'link',
    title: null,
    url,
    children: [
      {
        type: 'text',
        value: source.text.slice(from, to),
        position: { start: point(source, from), end: point(source, to) },
      },
    ],
    position: { start: point(source, from), end: point(source, to) },
  };
  pushNode(state, node);
  state.pos = to;
  return true;
}

// The last atext run an email was tried for, and failed.
let emailState: InlineState | undefined;
let emailFrom = -1;
let emailTo = -1;

/** An odd run of backslashes before `index` escapes the punctuation there. */
function isEscaped(text: string, index: number, rangeStart: number): boolean {
  if (!isAsciiPunctuation(text.charCodeAt(index))) {
    return false;
  }
  let count = 0;
  let i = index - 1;
  while (i >= rangeStart && text.charCodeAt(i) === BACKSLASH) {
    count++;
    i--;
  }
  return count % 2 === 1;
}

/** An email literal in the atext run around `pos` (micromark's `emailAutolink`). */
function parseEmail(state: InlineState): boolean {
  const pos = state.pos;
  if (emailState === state && pos >= emailFrom && pos <= emailTo) {
    return false;
  }
  const text = state.source.text;
  const end = state.end;
  const rangeStart = state.ranges[state.range];
  let start = pos;
  while (start > rangeStart && isGfmAtext(text.charCodeAt(start - 1))) {
    if (__TALATA_TEST__) {
      workSteps.count++;
    }
    start--;
  }
  let at = pos;
  while (at < end && isGfmAtext(text.charCodeAt(at))) {
    if (__TALATA_TEST__) {
      workSteps.count++;
    }
    at++;
  }
  emailState = state;
  emailFrom = start;
  emailTo = at;
  if (at === start || at >= end || text.charCodeAt(at) !== AT) {
    return false;
  }
  // micromark starts an email only after a character that is not atext or
  // `/`, and never inside an escape or another construct.
  if (
    start > rangeStart &&
    (text.charCodeAt(start - 1) === SLASH || isEscaped(text, start, rangeStart))
  ) {
    return false;
  }
  if (!pendingFrom(state, start) || unbalanced(state)) {
    return false;
  }
  let i = at + 1;
  let data = false;
  let dot = false;
  while (i < end) {
    const code = text.charCodeAt(i);
    if (code === DOT) {
      // A dot not followed by an alphanumeric ends the domain.
      if (i + 1 < end && isAsciiAlphanumeric(text.charCodeAt(i + 1))) {
        dot = true;
        i++;
        continue;
      }
      break;
    }
    if (code === DASH || code === UNDERSCORE || isAsciiAlphanumeric(code)) {
      data = true;
      i++;
      continue;
    }
    break;
  }
  if (!data || !dot || !isAsciiAlpha(text.charCodeAt(i - 1))) {
    return false;
  }
  return emit(state, start, i, 'mailto:' + text.slice(start, i));
}

/** The character before `index` lets `www` start (micromark's `previousWww`). */
function previousWww(code: number): boolean {
  return (
    code === LEFT_PAREN ||
    code === ASTERISK ||
    code === UNDERSCORE ||
    code === LEFT_BRACKET ||
    code === RIGHT_BRACKET ||
    code === TILDE ||
    code === SPACE ||
    code === TAB
  );
}

/** `www.` ending at the `.` at `state.pos` (micromark's `wwwAutolink`). */
function parseWww(state: InlineState): boolean {
  const text = state.source.text;
  const dot = state.pos;
  const start = dot - 3;
  const rangeStart = state.ranges[state.range];
  if (
    start < rangeStart ||
    lower(text.charCodeAt(start)) !== 119 ||
    lower(text.charCodeAt(start + 1)) !== 119 ||
    lower(text.charCodeAt(start + 2)) !== 119
  ) {
    return false;
  }
  if (start > rangeStart && !previousWww(text.charCodeAt(start - 1))) {
    return false;
  }
  const end = state.end;
  // `www.` needs something after it, a line ending included.
  if (dot + 1 >= end && state.range + 2 >= state.ranges.length) {
    return false;
  }
  if (!pendingFrom(state, start) || unbalanced(state)) {
    return false;
  }
  owner = state;
  const domainEnd = scanDomain(text, start, end);
  if (domainEnd === -1) {
    return false;
  }
  const to = scanPath(text, domainEnd, end);
  return emit(state, start, to, 'http://' + text.slice(start, to));
}

/** `http://` or `https://` with the `:` at `state.pos` (micromark's `protocolAutolink`). */
function parseProtocol(state: InlineState): boolean {
  const text = state.source.text;
  const colon = state.pos;
  const rangeStart = state.ranges[state.range];
  let start = colon - 4;
  if (
    colon - 5 >= rangeStart &&
    lower(text.charCodeAt(colon - 5)) === 104 &&
    lower(text.charCodeAt(colon - 4)) === 116 &&
    lower(text.charCodeAt(colon - 3)) === 116 &&
    lower(text.charCodeAt(colon - 2)) === 112 &&
    lower(text.charCodeAt(colon - 1)) === 115
  ) {
    start = colon - 5;
  } else if (
    start < rangeStart ||
    lower(text.charCodeAt(start)) !== 104 ||
    lower(text.charCodeAt(start + 1)) !== 116 ||
    lower(text.charCodeAt(start + 2)) !== 116 ||
    lower(text.charCodeAt(start + 3)) !== 112
  ) {
    return false;
  }
  if (start > rangeStart && isAsciiAlpha(text.charCodeAt(start - 1))) {
    return false;
  }
  const end = state.end;
  if (
    colon + 3 >= end ||
    text.charCodeAt(colon + 1) !== SLASH ||
    text.charCodeAt(colon + 2) !== SLASH
  ) {
    return false;
  }
  const after = text.charCodeAt(colon + 3);
  if (after < 32 || after === 127 || classifyCharacter(after) !== OTHER) {
    return false;
  }
  if (!pendingFrom(state, start) || unbalanced(state)) {
    return false;
  }
  owner = state;
  const domainEnd = scanDomain(text, colon + 3, end);
  if (domainEnd === -1) {
    return false;
  }
  const to = scanPath(text, domainEnd, end);
  return emit(state, start, to, text.slice(start, to));
}

/**
 * Drops the memos' references to the last leaf, so the document can be
 * collected. The autolink transform calls it once the inline phase is done.
 */
export function releaseAutolinkMemos(): void {
  owner = undefined;
  trailOwner = undefined;
  domainOwner = undefined;
  bracketState = undefined;
  cleanLast = undefined;
  openBracket = undefined;
  emailState = undefined;
}

function parseAutolinkLiteral(state: InlineState): boolean {
  const code = state.source.text.charCodeAt(state.pos);
  if (code === COLON) {
    return parseProtocol(state);
  }
  if (parseEmail(state)) {
    return true;
  }
  return code === DOT && parseWww(state);
}

const autolinkLiteral: InlineRule = {
  name: 'autolinkLiteral',
  // Before emphasis: an email takes a `_` first.
  priority: 90,
  triggers: '.:@_',
  gfm: true,
  parse: parseAutolinkLiteral,
};

export default autolinkLiteral;
