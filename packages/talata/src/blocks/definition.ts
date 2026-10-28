import type { Definition, RootContent } from 'mdast';
import type { BlockState, OpenParagraph, ParagraphPrefixRule } from '../core/blocks';
import { isSpaceOrTab } from '../core/chars';
import { point, skipLineEnding } from '../core/source';
import { normalizeIdentifier } from '../core/state';
import decodeString from './decode';
import { paragraphIndents } from './paragraph';

const DOUBLE_QUOTE = 34;
const APOSTROPHE = 39;
const LEFT_PAREN = 40;
const RIGHT_PAREN = 41;
const COLON = 58;
const LESS_THAN = 60;
const GREATER_THAN = 62;
const LEFT_BRACKET = 91;
const BACKSLASH = 92;
const RIGHT_BRACKET = 93;
const CARET = 94;

/**
 * Reads a link reference definition from the paragraph's lines, which are
 * flat [start, end) pairs. A line ending between pairs counts as whitespace.
 */
class Scanner {
  text: string;
  lines: number[];
  /** Index of the current pair's start. */
  pair: number;
  pos: number;
  end: number;

  /** Whitespace of continuation lines (see `paragraphIndents`) and a forward-only index into it. */
  indents: number[] | undefined;
  indent = 0;

  constructor(state: BlockState, paragraph: OpenParagraph) {
    const lines = paragraph.lines;
    this.text = state.source.text;
    this.lines = lines;
    this.pair = 0;
    this.pos = lines[0];
    this.end = lines[1];
    this.indents = paragraphIndents(paragraph);
  }

  /** Starts a definition at pair `pair`. */
  reset(pair: number): void {
    this.pair = pair;
    this.pos = this.lines[pair];
    this.end = this.lines[pair + 1];
  }

  /**
   * The whitespace after container prefixes before the content of the
   * current line. Columns of a split tab become spaces. Lines only move
   * forward between calls, so the lookup is linear over a paragraph.
   */
  lineIndent(): string {
    const indents = this.indents;
    if (indents === undefined) {
      return '';
    }
    let i = this.indent;
    while (i < indents.length && indents[i] < this.end) {
      i += 3;
    }
    this.indent = i;
    if (i >= indents.length || indents[i] !== this.end) {
      return '';
    }
    return ' '.repeat(indents[i + 2]) + this.text.slice(indents[i + 1], this.pos);
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
        const indent = this.lineIndent();
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
    const scanner = new Scanner(state, paragraph);
    while (taken < lines.length) {
      scanner.reset(taken);
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
