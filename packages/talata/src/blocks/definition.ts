import type { Definition, RootContent } from 'mdast';
import type { BlockState, OpenParagraph, ParagraphPrefixRule } from '../core/blocks';
import { isSpaceOrTab } from '../core/chars';
import { point, skipLineEnding } from '../core/source';
import { normalizeIdentifier } from '../core/state';
import { lineIndent } from './paragraph';

const DOUBLE_QUOTE = 34;
const AMPERSAND = 38;
const APOSTROPHE = 39;
const LEFT_PAREN = 40;
const RIGHT_PAREN = 41;
const COLON = 58;
const SEMICOLON = 59;
const LESS_THAN = 60;
const GREATER_THAN = 62;
const LEFT_BRACKET = 91;
const BACKSLASH = 92;
const RIGHT_BRACKET = 93;
const CARET = 94;
const NUMBER_SIGN = 35;

function isAsciiPunctuation(code: number): boolean {
  return (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) ||
    (code >= 123 && code <= 126)
  );
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isHexDigit(code: number): boolean {
  return isDigit(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

/** Decodes a numeric character reference as micromark does: invalid code points become U+FFFD. */
function decodeNumeric(digits: string, base: number): string {
  const code = Number.parseInt(digits, base);
  if (
    code < 9 ||
    code === 11 ||
    (code > 13 && code < 32) ||
    (code > 126 && code < 160) ||
    (code > 55_295 && code < 57_344) ||
    (code > 64_975 && code < 65_008) ||
    (code & 65_535) === 65_535 ||
    (code & 65_535) === 65_534 ||
    code > 1_114_111
  ) {
    return '�';
  }
  return String.fromCodePoint(code);
}

/**
 * Length of a numeric character reference (`&#123;`, `&#x1F;`) at `start`,
 * or 0. Named references are not decoded yet: they need the entity table that
 * inline-core adds in `src/inline/entities.ts`.
 */
function numericReferenceEnd(value: string, start: number): number {
  let i = start + 1;
  if (value.charCodeAt(i) !== NUMBER_SIGN) {
    return 0;
  }
  i++;
  const hex = value.charCodeAt(i) === 120 || value.charCodeAt(i) === 88; // x X
  if (hex) {
    i++;
  }
  const digitsStart = i;
  const max = hex ? 6 : 7;
  while (
    i - digitsStart < max &&
    (hex ? isHexDigit(value.charCodeAt(i)) : isDigit(value.charCodeAt(i)))
  ) {
    i++;
  }
  if (i === digitsStart || value.charCodeAt(i) !== SEMICOLON) {
    return 0;
  }
  return i + 1;
}

/**
 * Decodes backslash escapes and character references in a string, as
 * micromark's string content does (fenced code info, definitions).
 */
export function decodeString(value: string): string {
  let result = '';
  let run = 0;
  const length = value.length;
  for (let i = 0; i < length; i++) {
    const code = value.charCodeAt(i);
    if (code === BACKSLASH && i + 1 < length && isAsciiPunctuation(value.charCodeAt(i + 1))) {
      result += value.slice(run, i);
      run = i + 1;
      i++;
    } else if (code === AMPERSAND) {
      const end = numericReferenceEnd(value, i);
      if (end > 0) {
        const hex = value.charCodeAt(i + 2) === 120 || value.charCodeAt(i + 2) === 88;
        result +=
          value.slice(run, i) +
          decodeNumeric(value.slice(i + (hex ? 3 : 2), end - 1), hex ? 16 : 10);
        run = end;
        i = end - 1;
      }
    }
  }
  return run === 0 ? value : result + value.slice(run);
}

/**
 * Reads a link reference definition from the paragraph's lines, which are
 * flat [start, end) pairs. A line ending between pairs counts as whitespace.
 */
class Scanner {
  state: BlockState;
  paragraph: OpenParagraph;
  text: string;
  lines: number[];
  /** Index of the current pair's start. */
  pair: number;
  pos: number;
  end: number;

  constructor(state: BlockState, paragraph: OpenParagraph, pair: number) {
    const lines = paragraph.lines;
    this.state = state;
    this.paragraph = paragraph;
    this.text = state.source.text;
    this.lines = lines;
    this.pair = pair;
    this.pos = lines[pair];
    this.end = lines[pair + 1];
  }

  /** Moves to the next line. False when there is none. */
  nextLine(): boolean {
    if (this.pair + 2 >= this.lines.length) {
      return false;
    }
    this.pair += 2;
    this.pos = this.lines[this.pair];
    this.end = this.lines[this.pair + 1];
    return true;
  }

  skipSpaces(): void {
    while (this.pos < this.end && isSpaceOrTab(this.text.charCodeAt(this.pos))) {
      this.pos++;
    }
  }

  /** Skips spaces, tabs and line endings. False when it reached the end of the lines. */
  skipWhitespace(): boolean {
    this.skipSpaces();
    while (this.pos === this.end) {
      if (!this.nextLine()) {
        return false;
      }
      this.skipSpaces();
    }
    return true;
  }

  /**
   * Appends `[from, pos)` and moves past a line ending, adding the raw line
   * ending to the value. Used by labels and titles, which may span lines.
   */
  lineBreak(value: string, from: number): string {
    const text = this.text;
    const end = this.end;
    return value + text.slice(from, end) + text.slice(end, skipLineEnding(text, end));
  }

  /** The label between brackets, raw, or undefined. `pos` is on `[`. */
  label(gfm: boolean): string | undefined {
    const text = this.text;
    this.pos++;
    let value = '';
    let from = this.pos;
    let size = 0;
    let seen = false;
    for (;;) {
      if (this.pos === this.end) {
        value = this.lineBreak(value, from);
        if (!this.nextLine()) {
          return undefined;
        }
        // Unlike titles, labels keep the whitespace at the start of a line.
        const indent = lineIndent(this.state, this.paragraph, this.pos, this.end);
        value += indent;
        size += indent.length;
        from = this.pos;
        continue;
      }
      const code = text.charCodeAt(this.pos);
      if (code === LEFT_BRACKET) {
        return undefined;
      }
      if (code === RIGHT_BRACKET) {
        if (!seen || size > 999) {
          return undefined;
        }
        value += text.slice(from, this.pos);
        this.pos++;
        return value;
      }
      // With GFM, `[^` starts a footnote definition, not a definition.
      if (gfm && code === CARET && size === 0) {
        return undefined;
      }
      size++;
      if (!seen && !isSpaceOrTab(code)) {
        seen = true;
      }
      this.pos++;
      if (code === BACKSLASH && this.pos < this.end) {
        const next = text.charCodeAt(this.pos);
        if (next === LEFT_BRACKET || next === BACKSLASH || next === RIGHT_BRACKET) {
          size++;
          this.pos++;
        }
      }
    }
  }

  /** The destination, raw, or undefined. `pos` is on its first character. */
  destination(): string | undefined {
    const text = this.text;
    const start = this.pos;
    let code = text.charCodeAt(start);
    if (code === LESS_THAN) {
      this.pos++;
      while (this.pos < this.end) {
        code = text.charCodeAt(this.pos);
        if (code === GREATER_THAN) {
          this.pos++;
          return text.slice(start + 1, this.pos - 1);
        }
        if (code === LESS_THAN) {
          return undefined;
        }
        this.pos++;
        if (code === BACKSLASH && this.pos < this.end) {
          const next = text.charCodeAt(this.pos);
          if (next === LESS_THAN || next === GREATER_THAN || next === BACKSLASH) {
            this.pos++;
          }
        }
      }
      return undefined;
    }
    if (code === RIGHT_PAREN || code < 33 || code === 127) {
      return undefined;
    }
    let balance = 0;
    while (this.pos < this.end) {
      code = text.charCodeAt(this.pos);
      if (balance === 0 && (code === RIGHT_PAREN || isSpaceOrTab(code))) {
        break;
      }
      if (code === LEFT_PAREN) {
        balance++;
      } else if (code === RIGHT_PAREN) {
        balance--;
      } else if (code < 33 || code === 127) {
        return undefined;
      }
      this.pos++;
      if (code === BACKSLASH && this.pos < this.end) {
        const next = text.charCodeAt(this.pos);
        if (next === LEFT_PAREN || next === RIGHT_PAREN || next === BACKSLASH) {
          this.pos++;
        }
      }
    }
    return balance === 0 ? text.slice(start, this.pos) : undefined;
  }

  /** The title, raw, or undefined. `pos` is on the opening marker. */
  title(): string | undefined {
    const text = this.text;
    const open = text.charCodeAt(this.pos);
    if (open !== DOUBLE_QUOTE && open !== APOSTROPHE && open !== LEFT_PAREN) {
      return undefined;
    }
    const marker = open === LEFT_PAREN ? RIGHT_PAREN : open;
    this.pos++;
    let value = '';
    let from = this.pos;
    for (;;) {
      if (this.pos === this.end) {
        value = this.lineBreak(value, from);
        if (!this.nextLine()) {
          return undefined;
        }
        from = this.pos;
        continue;
      }
      const code = text.charCodeAt(this.pos);
      if (code === marker) {
        value += text.slice(from, this.pos);
        this.pos++;
        return value;
      }
      this.pos++;
      if (code === BACKSLASH && this.pos < this.end) {
        const next = text.charCodeAt(this.pos);
        if (next === marker || next === BACKSLASH) {
          this.pos++;
        }
      }
    }
  }

  /** Whether only spaces and tabs are left on the line. */
  atLineEnd(): boolean {
    this.skipSpaces();
    return this.pos === this.end;
  }
}

/** Parses one definition at pair `pair`. Returns the node and moves `scanner` to its last line. */
function parseDefinition(state: BlockState, scanner: Scanner): Definition | undefined {
  const text = scanner.text;
  const start = scanner.pos;
  if (text.charCodeAt(start) !== LEFT_BRACKET) {
    return undefined;
  }
  const label = scanner.label(state.options.gfm);
  if (
    label === undefined ||
    scanner.pos === scanner.end ||
    text.charCodeAt(scanner.pos) !== COLON
  ) {
    return undefined;
  }
  scanner.pos++;
  if (!scanner.skipWhitespace()) {
    return undefined;
  }
  const url = scanner.destination();
  if (url === undefined) {
    return undefined;
  }
  // A title needs whitespace before it. Without a valid title, the
  // destination must end its line.
  const destinationPair = scanner.pair;
  const destinationEnd = scanner.pos;
  let title: string | undefined;
  const code = text.charCodeAt(scanner.pos);
  if (scanner.pos === scanner.end || isSpaceOrTab(code)) {
    if (scanner.skipWhitespace()) {
      title = scanner.title();
      if (title !== undefined && !scanner.atLineEnd()) {
        title = undefined;
      }
    }
  }
  if (title === undefined) {
    scanner.pair = destinationPair;
    scanner.pos = destinationEnd;
    scanner.end = scanner.lines[destinationPair + 1];
    if (!scanner.atLineEnd()) {
      return undefined;
    }
  }
  const identifier = normalizeIdentifier(label);
  state.definitions.add(identifier);
  return {
    type: 'definition',
    identifier: identifier.toLowerCase(),
    label: decodeString(label),
    url: decodeString(url),
    title: title === undefined ? null : decodeString(title),
    position: { start: point(state.source, start), end: point(state.source, scanner.end) },
  };
}

// Link reference definitions at the start of a paragraph. Each one starts at
// the start of a line and ends at the end of one.
const definition: ParagraphPrefixRule = {
  name: 'definition',
  priority: 100,
  consume(state: BlockState, paragraph: OpenParagraph, out: RootContent[]): void {
    const lines = paragraph.lines;
    const text = state.source.text;
    if (text.charCodeAt(lines[0]) !== LEFT_BRACKET) {
      return;
    }
    let taken = 0;
    while (taken < lines.length) {
      const scanner = new Scanner(state, paragraph, taken);
      const node = parseDefinition(state, scanner);
      if (node === undefined) {
        break;
      }
      out.push(node);
      taken = scanner.pair + 2;
    }
    if (taken > 0) {
      lines.splice(0, taken);
    }
  },
};

export default definition;
