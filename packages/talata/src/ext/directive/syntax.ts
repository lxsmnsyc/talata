import type { InlineState } from '../../core/inline';
import type { DocumentState } from '../../core/state';
import { PUNCTUATION, WHITESPACE, classifyCharacter } from '../../inline/classify';
import { rangeText, reach } from '../../inline/lines';
import decodeAttribute from './entities';

// The pieces shared by the three directive rules: the name, the `[label]`
// and the `{attributes}`, as `micromark-extension-directive` reads them.
// Text directives read them across the line endings of a paragraph (`ranges`
// holds one pair per line); leaf and container directives read one line.

const TAB = 9;
const SPACE = 32;
const QUOTE = 34;
const HASH = 35;
const APOSTROPHE = 39;
const DASH = 45;
const DOT = 46;
const COLON = 58;
const LESS_THAN = 60;
const EQUALS = 61;
const GREATER_THAN = 62;
const BACKSLASH = 92;
const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;
const UNDERSCORE = 95;
const GRAVE = 96;
const LEFT_BRACE = 123;
const RIGHT_BRACE = 125;

export { COLON, LEFT_BRACE, LEFT_BRACKET };

const EOF = -1;
const EOL = -2;

/**
 * micromark reads a tab as a code that is neither whitespace nor punctuation
 * where it classifies characters, so a tab can be part of a name.
 */
function kindOf(code: number): number {
  return code === TAB ? 0 : classifyCharacter(code);
}

/** Offset after the name that starts at `start`, or -1 when there is none. */
export function readName(text: string, start: number, end: number): number {
  if (start >= end || kindOf(text.charCodeAt(start)) !== 0) {
    return -1;
  }
  let i = start + 1;
  while (i < end) {
    const code = text.charCodeAt(i);
    const kind = kindOf(code);
    if (kind === WHITESPACE || (kind === PUNCTUATION && code !== DASH && code !== UNDERSCORE)) {
      break;
    }
    i++;
  }
  const last = text.charCodeAt(i - 1);
  return last === DASH || last === UNDERSCORE ? -1 : i;
}

export interface Found {
  /** Index of the range that holds the end. */
  range: number;
  /** Offset of the closing `]`, or after the closing `}`. */
  pos: number;
}

/**
 * Finds the `]` that closes the label whose `[` is at `pos` in range
 * `range`. Brackets nest, `\[`, `\\` and `\]` do not count, code spans are
 * not special. Returns undefined when there is no closer, or the label is
 * too deep or has too many escapes. `inline` is set for text directives,
 * whose labels may span lines; the lines looked into count as reached.
 */
export function scanLabel(
  state: DocumentState,
  ranges: number[],
  range: number,
  pos: number,
  inline: InlineState | undefined,
): Found | undefined {
  const text = state.source.text;
  let balance = 0;
  let size = 0;
  let r = range;
  let i = pos + 1;
  for (;;) {
    const end = ranges[r + 1];
    while (i < end) {
      const code = text.charCodeAt(i);
      if (code === RIGHT_BRACKET) {
        if (balance === 0) {
          return { range: r, pos: i };
        }
        balance--;
      } else if (code === LEFT_BRACKET) {
        if (++balance > 32) {
          return undefined;
        }
      } else if (code === BACKSLASH && i + 1 < end) {
        const next = text.charCodeAt(i + 1);
        if (next === LEFT_BRACKET || next === BACKSLASH || next === RIGHT_BRACKET) {
          if (++size > 999) {
            return undefined;
          }
          i++;
        }
      }
      i++;
    }
    if (inline === undefined || r + 2 >= ranges.length) {
      return undefined;
    }
    r += 2;
    i = ranges[r];
    reach(inline, r);
  }
}

export type Attributes = Record<string, string>;

function isBlank(code: number): boolean {
  return code === SPACE || code === TAB || code === EOL;
}

/**
 * Reads the attributes whose `{` is at `pos` in range `range`. Returns the
 * position after the `}`, or undefined when the text is not valid
 * attributes. `inline` is set for text directives, whose attributes may span
 * lines.
 */
export function readAttributes(
  state: DocumentState,
  ranges: number[],
  range: number,
  pos: number,
  inline: InlineState | undefined,
): { found: Found; attributes: Attributes } | undefined {
  const text = state.source.text;
  const multiline = inline !== undefined;
  let r = range;
  let p = pos + 1;
  // Flat pairs: name, value.
  const list: string[] = [];

  const code = (): number => {
    if (p < ranges[r + 1]) {
      return text.charCodeAt(p);
    }
    return multiline && r + 2 < ranges.length ? EOL : EOF;
  };
  const step = (): void => {
    if (p < ranges[r + 1]) {
      p++;
    } else {
      r += 2;
      p = ranges[r];
      reach(inline!, r);
    }
  };
  const slice = (fromRange: number, from: number): string =>
    fromRange === r ? text.slice(from, p) : rangeText(inline!, fromRange, from, p);

  for (;;) {
    let c = code();
    if (c === HASH || c === DOT) {
      const name = c === HASH ? 'id' : 'class';
      step();
      c = code();
      if (
        c === EOF ||
        c === EOL ||
        c === QUOTE ||
        c === HASH ||
        c === APOSTROPHE ||
        c === DOT ||
        c === LESS_THAN ||
        c === EQUALS ||
        c === GREATER_THAN ||
        c === GRAVE ||
        c === RIGHT_BRACE ||
        c === SPACE ||
        c === TAB
      ) {
        return undefined;
      }
      const fromRange = r;
      const from = p;
      step();
      for (;;) {
        c = code();
        if (
          c === EOF ||
          c === QUOTE ||
          c === APOSTROPHE ||
          c === LESS_THAN ||
          c === EQUALS ||
          c === GREATER_THAN ||
          c === GRAVE
        ) {
          return undefined;
        }
        if (c === HASH || c === DOT || c === RIGHT_BRACE || isBlank(c)) {
          break;
        }
        step();
      }
      list.push(name, decodeAttribute(slice(fromRange, from)));
      continue;
    }
    if (isBlank(c)) {
      step();
      continue;
    }
    const kind = c === EOF ? WHITESPACE : classifyCharacter(c);
    if (kind === WHITESPACE || (kind === PUNCTUATION && c !== DASH && c !== UNDERSCORE)) {
      return end(c);
    }
    // An attribute name.
    const nameRange = r;
    const nameStart = p;
    step();
    for (;;) {
      c = code();
      if (c === EOF || c === EOL) {
        break;
      }
      const k = kindOf(c);
      if (
        k === WHITESPACE ||
        (k === PUNCTUATION && c !== DASH && c !== DOT && c !== COLON && c !== UNDERSCORE)
      ) {
        break;
      }
      step();
    }
    list.push(slice(nameRange, nameStart), '');
    while (isBlank(code())) {
      step();
    }
    if (code() !== EQUALS) {
      continue;
    }
    step();
    // The value.
    for (;;) {
      c = code();
      if (
        c === EOF ||
        c === LESS_THAN ||
        c === EQUALS ||
        c === GREATER_THAN ||
        c === GRAVE ||
        c === RIGHT_BRACE
      ) {
        return undefined;
      }
      if (isBlank(c)) {
        step();
        continue;
      }
      break;
    }
    if (c === QUOTE || c === APOSTROPHE) {
      const marker = c;
      step();
      const fromRange = r;
      const from = p;
      for (;;) {
        c = code();
        if (c === EOF) {
          return undefined;
        }
        if (c === marker) {
          break;
        }
        step();
      }
      if (r !== fromRange || p !== from) {
        list[list.length - 1] = decodeAttribute(slice(fromRange, from));
      }
      step();
      c = code();
      if (c !== RIGHT_BRACE && !isBlank(c)) {
        return undefined;
      }
    } else {
      const fromRange = r;
      const from = p;
      step();
      for (;;) {
        c = code();
        if (
          c === EOF ||
          c === QUOTE ||
          c === APOSTROPHE ||
          c === LESS_THAN ||
          c === EQUALS ||
          c === GREATER_THAN ||
          c === GRAVE
        ) {
          return undefined;
        }
        if (c === RIGHT_BRACE || isBlank(c)) {
          break;
        }
        step();
      }
      list[list.length - 1] = decodeAttribute(slice(fromRange, from));
    }
  }

  function end(c: number): { found: Found; attributes: Attributes } | undefined {
    if (c !== RIGHT_BRACE) {
      return undefined;
    }
    const attributes: Attributes = {};
    for (let i = 0; i < list.length; i += 2) {
      const key = list[i];
      if (key === 'class' && attributes.class) {
        attributes.class += ' ' + list[i + 1];
      } else {
        attributes[key] = list[i + 1];
      }
    }
    return { found: { range: r, pos: p + 1 }, attributes };
  }
}

export interface Head {
  name: string;
  /** Offsets of the label content, or -1. */
  labelStart: number;
  labelEnd: number;
  attributes: Attributes;
  /** Offset after the label and attributes. */
  end: number;
}

/**
 * Reads the rest of a one-line leaf or container fence, after the colons:
 * name, optional label, optional attributes, then only spaces and tabs.
 */
export function readHead(state: DocumentState, from: number, lineEnd: number): Head | undefined {
  const text = state.source.text;
  const nameEnd = readName(text, from, lineEnd);
  if (nameEnd === -1) {
    return undefined;
  }
  const ranges = [nameEnd, lineEnd];
  let i = nameEnd;
  let labelStart = -1;
  let labelEnd = -1;
  if (i < lineEnd && text.charCodeAt(i) === LEFT_BRACKET) {
    const label = scanLabel(state, ranges, 0, i, undefined);
    if (label === undefined) {
      return undefined;
    }
    labelStart = i + 1;
    labelEnd = label.pos;
    i = label.pos + 1;
  }
  let attributes: Attributes = {};
  if (i < lineEnd && text.charCodeAt(i) === LEFT_BRACE) {
    const read = readAttributes(state, ranges, 0, i, undefined);
    if (read === undefined) {
      return undefined;
    }
    attributes = read.attributes;
    i = read.found.pos;
  }
  const attributesEnd = i;
  while (i < lineEnd) {
    const code = text.charCodeAt(i);
    if (code !== SPACE && code !== TAB) {
      return undefined;
    }
    i++;
  }
  return {
    name: text.slice(from, nameEnd),
    labelStart,
    labelEnd,
    attributes,
    end: attributesEnd,
  };
}
