import type { Source } from '../../core/source';
import { point, skipLineEnding } from '../../core/source';
import {
  APOSTROPHE,
  COLON,
  DOT,
  EQUALS,
  GREATER_THAN,
  LEFT_BRACE,
  LESS_THAN,
  QUOTE,
  RIGHT_BRACE,
  SLASH,
  SPACE,
  TAB,
  isIdContinue,
  isIdStart,
  isUnicodeWhitespace,
} from './chars';
import { jsOf, parseExpression } from './acorn';
import type { Estree, Js } from './acorn';
import decodeLiteral from './entities';
import { MdxError, span } from './error';

// JSX tags and expressions without a JS parser, ported state by state from
// `factoryTag` (micromark-extension-mdx-jsx 3.0.2) and
// `factoryMdxExpression` (micromark-factory-mdx-expression 2.0.3, agnostic:
// braces are counted). The scanner reads one line at a time: at a line ending
// it returns MORE, and the caller feeds the next line with `feed`. Inline
// rules feed the ranges of a leaf at once; the flow rule feeds the lines the
// block parser gives it.
//
// With acorn (`js`), braces are not counted: at each `}` the scanner asks
// acorn whether the text so far parses (`parseExpression`), and when it
// does not, the `}` is data and the expression goes on. `code` collects what
// acorn reads: the chunks without the whitespace micromark drops and their
// source offsets, to map acorn's error places back.

/** The construct ended; `end` is the offset after it. */
export const DONE = 0;
/** A line ending was consumed; call `feed` with the next line. */
export const MORE = 1;
/** Not this construct (whitespace after `<`, or text after flow constructs). */
export const NOK = 2;

const EOL = -1;
const EOF = -2;

// What to scan.
/** One tag in text. */
export const TEXT_TAG = 0;
/** One expression in text. */
export const TEXT_EXPRESSION = 1;
/** Tags and expressions to the end of a line, the flow construct. */
export const FLOW = 2;

// Tag states, named after the functions of factoryTag.
const START_AFTER = 1;
const NAME_BEFORE = 2;
const CLOSING_NAME_BEFORE = 3;
const PRIMARY_NAME = 4;
const PRIMARY_NAME_AFTER = 5;
const MEMBER_NAME_BEFORE = 6;
const MEMBER_NAME = 7;
const MEMBER_NAME_AFTER = 8;
const LOCAL_NAME_BEFORE = 9;
const LOCAL_NAME = 10;
const LOCAL_NAME_AFTER = 11;
const ATTRIBUTE_BEFORE = 12;
const ATTRIBUTE_PRIMARY_NAME = 13;
const ATTRIBUTE_PRIMARY_NAME_AFTER = 14;
const ATTRIBUTE_LOCAL_NAME_BEFORE = 15;
const ATTRIBUTE_LOCAL_NAME = 16;
const ATTRIBUTE_LOCAL_NAME_AFTER = 17;
const ATTRIBUTE_VALUE_BEFORE = 18;
const ATTRIBUTE_VALUE_QUOTED_START = 19;
const ATTRIBUTE_VALUE_QUOTED = 20;
const SELF_CLOSING = 21;
const WHITESPACE = 22;
const WHITESPACE_EOL_AFTER = 23;
// Expression states.
const EXPRESSION_BEFORE = 30;
const EXPRESSION_INSIDE = 31;
const EXPRESSION_EOL_AFTER = 32;
// Flow: after a tag or expression.
const FLOW_AFTER = 40;

// What an expression is part of.
const EXPRESSION_ALONE = 0;
const EXPRESSION_ATTRIBUTE = 1;
const EXPRESSION_VALUE = 2;

const trouble = ' (note: to create a link in MDX, use `[text](url)`)';
const comments = ' (note: JS comments in JSX tags are not supported in MDX)';
const nameStartExpect = 'a character that can start a name, such as a letter, `$`, or `_`';
const nameExpect =
  'a name character such as letters, digits, `$`, or `_`; whitespace before attributes; or the end of the tag';
const attributeStartExpect =
  'a character that can start an attribute name, such as a letter, `$`, or `_`; whitespace before attributes; or the end of the tag';
const attributeExpect =
  'a character that can start an attribute name, such as a letter, `$`, or `_`; `=` to initialize a value; or the end of the tag';
const lazyTag =
  'Unexpected lazy line in container, expected line to be prefixed with `>` when in a block quote, whitespace when in a list, etc';
const lazyExpression =
  'Unexpected lazy line in expression in container, expected line to be prefixed with `>` when in a block quote, whitespace when in a list, etc';
const eofExpression =
  'Unexpected end of file in expression, expected a corresponding closing brace for `{`';

/** An attribute as `mdast-util-mdx-jsx` builds it. */
export interface Attribute {
  type: 'mdxJsxAttribute' | 'mdxJsxExpressionAttribute';
  name?: string;
  value:
    | string
    | null
    | { type: 'mdxJsxAttributeValueExpression'; value: string; data?: { estree: Estree } };
  position: ReturnType<typeof span>;
  /** With acorn: the program of an expression attribute. */
  data?: { estree: Estree };
}

/** One scanned tag. Offsets are into the source text. */
export interface Tag {
  kind: 'tag';
  close: boolean;
  selfClosing: boolean;
  /** `a`, `a.b.c` or `a:b`; undefined for a fragment. */
  name: string | undefined;
  attributes: Attribute[];
  start: number;
  end: number;
  /** Offset of the `/` after `<`, or -1. */
  closeSlash: number;
  /** Offset of the self-closing `/`, or -1. */
  selfSlash: number;
  /** The first attribute token, trailing whitespace included for one without a value, or -1. */
  firstAttributeStart: number;
  firstAttributeEnd: number;
}

/** One scanned expression. */
export interface Expression {
  kind: 'expression';
  value: string;
  start: number;
  end: number;
  /** With acorn: its program. */
  estree: Estree | undefined;
}

export type Item = Tag | Expression;

/** The `mdxFlowExpression` or `mdxTextExpression` node of `item`, with `data.estree` from acorn. */
export function expressionNode(
  type: 'mdxFlowExpression' | 'mdxTextExpression',
  source: Source,
  item: Expression,
): { type: string; value: string; position: ReturnType<typeof span>; data?: { estree: Estree } } {
  const node: ReturnType<typeof expressionNode> = {
    type,
    value: item.value,
    position: span(source, item.start, item.end),
  };
  if (item.estree !== undefined) {
    node.data = { estree: item.estree };
  }
  return node;
}

function hex(code: number): string {
  return 'U+' + code.toString(16).toUpperCase().padStart(4, '0');
}

function isSpaceOrTab(code: number): boolean {
  return code === SPACE || code === TAB;
}

/** Ends a name: `.`, `/`, `:`, `>`, `{`, a line ending or whitespace (`:` and `.` as the caller allows). */
function endsName(code: number): boolean {
  return (
    code === SLASH ||
    code === GREATER_THAN ||
    code === LEFT_BRACE ||
    code === EOL ||
    (code >= 0 && isUnicodeWhitespace(code))
  );
}

/** Ends a name and starts what follows it: `/`, `>`, `{` or a name. */
function startsAfterName(code: number): boolean {
  return (
    code === SLASH || code === GREATER_THAN || code === LEFT_BRACE || (code >= 0 && isIdStart(code))
  );
}

export class Scanner {
  source!: Source;
  text = '';
  /** Cursor. */
  pos = 0;
  /** End of the current line's content (its line ending, or the end of the input). */
  end = 0;
  /** True: nothing follows `end` (the end of the leaf or of the flow content). */
  last = false;
  /** True for text: lazy lines are allowed. */
  allowLazy = true;
  mode: number = TEXT_TAG;
  state = 0;
  returnState = 0;
  /** Flow: the tags and expressions found so far. */
  items: Item[] = [];
  /** The last item done (text modes). */
  item: Item | undefined;
  // Tag being scanned.
  tag: Tag | undefined;
  nameStart = 0;
  attribute: Attribute | undefined;
  attributeNameStart = 0;
  marker = 0;
  literal = '';
  literalStart = 0;
  // Expression being scanned.
  expressionKind: number = EXPRESSION_ALONE;
  expressionStart = 0;
  size = 0;
  value = '';
  chunkStart = 0;
  /** The acorn bound to the parse, or undefined. */
  js: Js | undefined;
  /** With acorn: the code before the current chunk, and where the chunk starts in the source. */
  code = '';
  stops: number[] = [];
  codeStart = 0;
  /** With acorn: the chunk starts with columns of a split tab, so it exists even when empty. */
  virtualStart = false;
  /** With acorn: the error of the last `}` that did not end the expression. */
  lastCrash: MdxError | undefined;
  /** With acorn: the program of the expression that just ended. */
  estree: Estree | undefined;
  /**
   * With acorn, flow that interrupts a paragraph: micromark's interrupt
   * check reads the lines first, so a line ending ends after the next
   * line's container prefixes (`lineStart` of `feed`).
   */
  interrupts = false;
  /**
   * With `interrupts`: what calls `onComment` and `onToken` again for each
   * program. micromark parses such flow twice, its interrupt check first,
   * so the flow rule runs these when the construct ends.
   */
  replay: (() => void)[] | undefined;

  /** Starts a scan at `pos`, on `<` or `{`. */
  begin(source: Source, mode: number, pos: number, end: number, last: boolean): void {
    this.interrupts = false;
    this.replay = undefined;
    this.source = source;
    this.text = source.text;
    this.mode = mode;
    this.allowLazy = mode !== FLOW;
    this.pos = pos;
    this.end = end;
    this.last = last;
    this.items = [];
    this.item = undefined;
    this.js = jsOf(source);
    this.startConstruct();
  }

  /** Takes the state of `other`, to scan ahead without changing it. */
  copy(other: Scanner): void {
    Object.assign(this, other);
    this.items = [...other.items];
    this.stops = [...other.stops];
    if (other.tag !== undefined) {
      this.tag = { ...other.tag, attributes: [...other.tag.attributes] };
    }
  }

  /** Opens a tag or an expression at `pos`. */
  startConstruct(): void {
    if (this.text.charCodeAt(this.pos) === LESS_THAN) {
      this.tag = {
        kind: 'tag',
        close: false,
        selfClosing: false,
        name: undefined,
        attributes: [],
        start: this.pos,
        end: this.pos,
        closeSlash: -1,
        selfSlash: -1,
        firstAttributeStart: -1,
        firstAttributeEnd: -1,
      };
      this.pos++;
      this.state = START_AFTER;
    } else {
      this.tag = undefined;
      this.startExpression(EXPRESSION_ALONE);
    }
  }

  startExpression(kind: number): void {
    this.expressionKind = kind;
    this.expressionStart = this.pos;
    this.pos++;
    this.size = 0;
    this.value = '';
    this.chunkStart = this.pos;
    this.lastCrash = undefined;
    this.estree = undefined;
    this.state = EXPRESSION_BEFORE;
    if (this.js !== undefined) {
      this.code = '';
      this.stops = [];
      this.codeStart = this.pos;
      this.virtualStart = false;
    }
  }

  /** With acorn: adds the source from `codeStart` to `pos` to the code. */
  addChunk(): void {
    if (this.pos > this.codeStart || this.virtualStart) {
      this.stops.push(this.code.length, this.codeStart);
      this.code += this.text.slice(this.codeStart, this.pos);
    }
  }

  /**
   * With acorn, at a `}`: whether the expression ends here. When the code
   * does not parse, the error becomes the last crash and the `}` is data.
   */
  parsesAtBrace(): boolean {
    const length = this.code.length;
    const stops = this.stops.length;
    this.addChunk();
    const result = parseExpression(
      this.js!,
      this.source,
      { value: this.code, stops: this.stops, start: this.expressionStart + 1 },
      this.expressionKind,
      this.replay,
    );
    // The chunk goes on past the `}`: take it back out.
    this.code = this.code.slice(0, length);
    this.stops.length = stops;
    if (result instanceof MdxError) {
      this.lastCrash = result;
      return false;
    }
    this.estree = result;
    return true;
  }

  /**
   * Feeds the line after a line ending: content from `pos` (its first
   * character that is not whitespace) to `end`. `kept` is the whitespace an
   * expression keeps from the start of the line (`linePrefix` with 2
   * dropped). `lineStart` is the offset after the container prefixes, where
   * a lazy line error points. `lazy`: the containers around did not continue.
   */
  feed(
    pos: number,
    end: number,
    last: boolean,
    kept: string,
    lineStart: number,
    lazy: boolean,
  ): void {
    if (lazy && !this.allowLazy) {
      throw new MdxError(
        this.state === EXPRESSION_EOL_AFTER ? lazyExpression : lazyTag,
        point(this.source, lineStart),
      );
    }
    this.pos = pos;
    this.end = end;
    this.last = last;
    if (this.state === EXPRESSION_EOL_AFTER) {
      this.value += kept;
      this.chunkStart = pos;
      this.state = EXPRESSION_BEFORE;
      if (this.js !== undefined) {
        if (this.interrupts) {
          this.stops.push(this.code.length, lineStart);
        }
        // acorn reads the kept whitespace from the source: a tab split by
        // the line prefix keeps its columns in `kept` but not in the code.
        let real = 0;
        while (
          real < kept.length &&
          pos - real - 1 >= 0 &&
          this.text.charCodeAt(pos - real - 1) === kept.charCodeAt(kept.length - real - 1)
        ) {
          real++;
        }
        this.codeStart = pos - real;
        this.virtualStart = real < kept.length;
      }
    } else {
      this.state = WHITESPACE;
    }
  }

  /**
   * With acorn, in an expression, after `feed`: a place at the start of the
   * fed line maps to `offset`. micromark ends a line ending in text after
   * the next line's container prefixes once a lookahead reached that line.
   */
  lineStartAt(offset: number): void {
    if (this.js !== undefined && this.state === EXPRESSION_BEFORE) {
      this.stops.push(this.code.length, offset);
    }
  }

  /** The end of input right after a line ending, at `at`. */
  feedEnd(at: number): void {
    this.feed(at, at, true, '', at, false);
  }

  crash(code: number, at: string, expect: string): never {
    const what =
      code === EOF
        ? 'end of file'
        : 'character `' +
          (code === 96 ? '` ` `' : String.fromCodePoint(code)) +
          '` (' +
          hex(code) +
          ')';
    throw new MdxError(
      'Unexpected ' + what + ' ' + at + ', expected ' + expect,
      point(this.source, this.pos),
    );
  }

  /** Consumes the line ending at `pos` and asks for the next line. */
  lineEnding(next: number): number {
    this.state = next;
    return MORE;
  }

  /** The raw line ending at `end`. */
  lineEndingText(): string {
    return this.text.slice(this.end, skipLineEnding(this.text, this.end));
  }

  /** A tag ended at `pos` (on `>`). */
  tagEnd(): number {
    this.pos++;
    const tag = this.tag!;
    tag.end = this.pos;
    return this.itemDone(tag);
  }

  /** An expression ended at `pos` (on `}`). */
  expressionEnd(): number {
    this.value += this.text.slice(this.chunkStart, this.pos);
    this.pos++;
    const kind = this.expressionKind;
    if (kind === EXPRESSION_ALONE) {
      return this.itemDone({
        kind: 'expression',
        value: this.value,
        start: this.expressionStart,
        end: this.pos,
        estree: this.estree,
      });
    }
    const tag = this.tag!;
    const position = span(this.source, this.expressionStart, this.pos);
    const estree = this.estree;
    if (kind === EXPRESSION_ATTRIBUTE) {
      const attribute: Attribute = {
        type: 'mdxJsxExpressionAttribute',
        value: this.value,
        position,
      };
      if (estree !== undefined) {
        attribute.data = { estree };
      }
      tag.attributes.push(attribute);
      this.noteAttribute(this.expressionStart, this.pos);
    } else {
      const attribute = this.attribute!;
      attribute.value = { type: 'mdxJsxAttributeValueExpression', value: this.value };
      if (estree !== undefined) {
        attribute.value.data = { estree };
      }
      attribute.position.end = position.end;
      this.noteAttribute(attribute.position.start.offset!, this.pos);
    }
    this.returnState = ATTRIBUTE_BEFORE;
    this.state = WHITESPACE;
    return -1;
  }

  itemDone(item: Item): number {
    if (this.mode !== FLOW) {
      this.item = item;
      return DONE;
    }
    this.items.push(item);
    this.state = FLOW_AFTER;
    return -1;
  }

  noteAttribute(start: number, end: number): void {
    const tag = this.tag!;
    if (tag.firstAttributeStart === -1) {
      tag.firstAttributeStart = start;
      tag.firstAttributeEnd = end;
    }
  }

  /** Starts an attribute name at `pos`. */
  startAttribute(): void {
    this.attribute = {
      type: 'mdxJsxAttribute',
      name: '',
      value: null,
      position: span(this.source, this.pos, this.pos),
    };
    this.tag!.attributes.push(this.attribute);
    this.attributeNameStart = this.pos;
    this.nameStart = this.pos;
    this.pos++;
  }

  /** An attribute without a value ends at `pos`, after its trailing whitespace. */
  endBareAttribute(): void {
    this.noteAttribute(this.attribute!.position.start.offset!, this.pos);
  }

  /** Runs to the end of the construct, a line ending or a failure. Returns DONE, MORE or NOK. */
  run(): number {
    const source = this.text;
    for (;;) {
      const pos = this.pos;
      let code = EOL;
      if (pos < this.end) {
        code = source.charCodeAt(pos);
      } else if (this.last) {
        code = EOF;
      }
      const result = this.step(code);
      if (result !== -1) {
        return result;
      }
    }
  }

  // oxlint-disable-next-line max-lines-per-function, complexity -- one case per micromark state
  step(code: number): number {
    switch (this.state) {
      case START_AFTER:
        // Deviate from JSX, which allows arbitrary whitespace.
        if (code === EOL || isSpaceOrTab(code)) {
          return NOK;
        }
        this.returnState = NAME_BEFORE;
        this.state = WHITESPACE;
        return -1;
      case WHITESPACE:
        if (code === EOL) {
          // In a quoted value every line ending is part of the value.
          if (this.returnState === ATTRIBUTE_VALUE_QUOTED_START) {
            this.literal += this.lineEndingText();
          }
          return this.lineEnding(WHITESPACE_EOL_AFTER);
        }
        if (code >= 0 && isUnicodeWhitespace(code)) {
          this.pos++;
          return -1;
        }
        this.state = this.returnState;
        return -1;
      case NAME_BEFORE:
        if (code === SLASH) {
          this.tag!.close = true;
          this.tag!.closeSlash = this.pos;
          this.pos++;
          this.returnState = CLOSING_NAME_BEFORE;
          this.state = WHITESPACE;
          return -1;
        }
        if (code === GREATER_THAN) {
          return this.tagEnd();
        }
        if (code >= 0 && isIdStart(code)) {
          this.nameStart = this.pos;
          this.pos++;
          this.state = PRIMARY_NAME;
          return -1;
        }
        return this.crash(
          code,
          'before name',
          nameStartExpect +
            (code === 33 ? ' (note: to create a comment in MDX, use `{/* text */}`)' : ''),
        );
      case CLOSING_NAME_BEFORE:
        if (code === GREATER_THAN) {
          return this.tagEnd();
        }
        if (code >= 0 && isIdStart(code)) {
          this.nameStart = this.pos;
          this.pos++;
          this.state = PRIMARY_NAME;
          return -1;
        }
        return this.crash(
          code,
          'before name',
          nameStartExpect + (code === 42 || code === SLASH ? comments : ''),
        );
      case PRIMARY_NAME:
        if (code >= 0 && isIdContinue(code)) {
          this.pos++;
          return -1;
        }
        if (code === DOT || code === COLON || endsName(code)) {
          this.tag!.name = text(this, this.nameStart);
          this.returnState = PRIMARY_NAME_AFTER;
          this.state = WHITESPACE;
          return -1;
        }
        return this.crash(code, 'in name', nameExpect + (code === 64 ? trouble : ''));
      case PRIMARY_NAME_AFTER:
        if (code === DOT) {
          this.pos++;
          this.returnState = MEMBER_NAME_BEFORE;
          this.state = WHITESPACE;
          return -1;
        }
        if (code === COLON) {
          this.pos++;
          this.returnState = LOCAL_NAME_BEFORE;
          this.state = WHITESPACE;
          return -1;
        }
        if (startsAfterName(code)) {
          this.state = ATTRIBUTE_BEFORE;
          return -1;
        }
        return this.crash(code, 'after name', attributeStartExpect);
      case MEMBER_NAME_BEFORE:
        if (code >= 0 && isIdStart(code)) {
          this.nameStart = this.pos;
          this.pos++;
          this.state = MEMBER_NAME;
          return -1;
        }
        return this.crash(code, 'before member name', attributeStartExpect);
      case MEMBER_NAME:
        if (code >= 0 && isIdContinue(code)) {
          this.pos++;
          return -1;
        }
        if (code === DOT || endsName(code)) {
          this.tag!.name += '.' + text(this, this.nameStart);
          this.returnState = MEMBER_NAME_AFTER;
          this.state = WHITESPACE;
          return -1;
        }
        return this.crash(code, 'in member name', nameExpect + (code === 64 ? trouble : ''));
      case MEMBER_NAME_AFTER:
        if (code === DOT) {
          this.pos++;
          this.returnState = MEMBER_NAME_BEFORE;
          this.state = WHITESPACE;
          return -1;
        }
        if (startsAfterName(code)) {
          this.state = ATTRIBUTE_BEFORE;
          return -1;
        }
        return this.crash(code, 'after member name', attributeStartExpect);
      case LOCAL_NAME_BEFORE:
        if (code >= 0 && isIdStart(code)) {
          this.nameStart = this.pos;
          this.pos++;
          this.state = LOCAL_NAME;
          return -1;
        }
        return this.crash(
          code,
          'before local name',
          nameStartExpect + (code === 43 || (code > 46 && code < 58) ? trouble : ''),
        );
      case LOCAL_NAME:
        if (code >= 0 && isIdContinue(code)) {
          this.pos++;
          return -1;
        }
        if (endsName(code)) {
          this.tag!.name += ':' + text(this, this.nameStart);
          this.returnState = LOCAL_NAME_AFTER;
          this.state = WHITESPACE;
          return -1;
        }
        return this.crash(code, 'in local name', nameExpect);
      case LOCAL_NAME_AFTER:
        if (startsAfterName(code)) {
          this.state = ATTRIBUTE_BEFORE;
          return -1;
        }
        return this.crash(code, 'after local name', attributeStartExpect);
      case ATTRIBUTE_BEFORE:
        if (code === SLASH) {
          this.tag!.selfClosing = true;
          this.tag!.selfSlash = this.pos;
          this.pos++;
          this.returnState = SELF_CLOSING;
          this.state = WHITESPACE;
          return -1;
        }
        if (code === GREATER_THAN) {
          return this.tagEnd();
        }
        if (code === LEFT_BRACE) {
          this.startExpression(EXPRESSION_ATTRIBUTE);
          return -1;
        }
        if (code >= 0 && isIdStart(code)) {
          this.startAttribute();
          this.state = ATTRIBUTE_PRIMARY_NAME;
          return -1;
        }
        return this.crash(code, 'before attribute name', attributeStartExpect);
      case ATTRIBUTE_PRIMARY_NAME:
        if (code >= 0 && isIdContinue(code)) {
          this.pos++;
          return -1;
        }
        if (code === COLON || code === EQUALS || endsName(code)) {
          this.endAttributeName(false);
          this.returnState = ATTRIBUTE_PRIMARY_NAME_AFTER;
          this.state = WHITESPACE;
          return -1;
        }
        return this.crash(
          code,
          'in attribute name',
          'an attribute name character such as letters, digits, `$`, or `_`; `=` to initialize a value; whitespace before attributes; or the end of the tag',
        );
      case ATTRIBUTE_PRIMARY_NAME_AFTER:
        if (code === COLON) {
          this.pos++;
          this.returnState = ATTRIBUTE_LOCAL_NAME_BEFORE;
          this.state = WHITESPACE;
          return -1;
        }
        if (code === EQUALS) {
          this.pos++;
          this.returnState = ATTRIBUTE_VALUE_BEFORE;
          this.state = WHITESPACE;
          return -1;
        }
        if (startsAfterName(code)) {
          this.endBareAttribute();
          this.state = ATTRIBUTE_BEFORE;
          return -1;
        }
        return this.crash(code, 'after attribute name', attributeExpect);
      case ATTRIBUTE_LOCAL_NAME_BEFORE:
        if (code >= 0 && isIdStart(code)) {
          this.nameStart = this.pos;
          this.pos++;
          this.state = ATTRIBUTE_LOCAL_NAME;
          return -1;
        }
        return this.crash(code, 'before local attribute name', attributeExpect);
      case ATTRIBUTE_LOCAL_NAME:
        if (code >= 0 && isIdContinue(code)) {
          this.pos++;
          return -1;
        }
        if (code === EQUALS || endsName(code)) {
          this.endAttributeName(true);
          this.returnState = ATTRIBUTE_LOCAL_NAME_AFTER;
          this.state = WHITESPACE;
          return -1;
        }
        return this.crash(
          code,
          'in local attribute name',
          'an attribute name character such as letters, digits, `$`, or `_`; `=` to initialize a value; whitespace before attributes; or the end of the tag',
        );
      case ATTRIBUTE_LOCAL_NAME_AFTER:
        if (code === EQUALS) {
          this.pos++;
          this.returnState = ATTRIBUTE_VALUE_BEFORE;
          this.state = WHITESPACE;
          return -1;
        }
        if (startsAfterName(code)) {
          this.endBareAttribute();
          this.state = ATTRIBUTE_BEFORE;
          return -1;
        }
        return this.crash(code, 'after local attribute name', attributeExpect);
      case ATTRIBUTE_VALUE_BEFORE:
        if (code === QUOTE || code === APOSTROPHE) {
          this.marker = code;
          this.pos++;
          this.literal = '';
          this.state = ATTRIBUTE_VALUE_QUOTED_START;
          return -1;
        }
        if (code === LEFT_BRACE) {
          this.startExpression(EXPRESSION_VALUE);
          return -1;
        }
        return this.crash(
          code,
          'before attribute value',
          'a character that can start an attribute value, such as `"`, `\'`, or `{`' +
            (code === LESS_THAN
              ? ' (note: to use an element or fragment as a prop value in MDX, use `{<element />}`)'
              : ''),
        );
      case ATTRIBUTE_VALUE_QUOTED_START:
        if (code === EOF) {
          return this.crash(
            code,
            'in attribute value',
            'a corresponding closing quote `' + String.fromCodePoint(this.marker) + '`',
          );
        }
        if (code === this.marker) {
          this.pos++;
          const attribute = this.attribute!;
          attribute.value = decodeLiteral(this.literal);
          attribute.position.end = point(this.source, this.pos);
          this.noteAttribute(attribute.position.start.offset!, this.pos);
          this.returnState = ATTRIBUTE_BEFORE;
          this.state = WHITESPACE;
          return -1;
        }
        if (code === EOL) {
          this.returnState = ATTRIBUTE_VALUE_QUOTED_START;
          this.state = WHITESPACE;
          return -1;
        }
        this.literalStart = this.pos;
        this.state = ATTRIBUTE_VALUE_QUOTED;
        return -1;
      case ATTRIBUTE_VALUE_QUOTED:
        if (code === EOF || code === EOL || code === this.marker) {
          this.literal += text(this, this.literalStart);
          this.state = ATTRIBUTE_VALUE_QUOTED_START;
          return -1;
        }
        this.pos++;
        return -1;
      case SELF_CLOSING:
        if (code === GREATER_THAN) {
          return this.tagEnd();
        }
        return this.crash(
          code,
          'after self-closing slash',
          '`>` to end the tag' + (code === 42 || code === SLASH ? comments : ''),
        );
      case EXPRESSION_BEFORE:
        if (code === EOF) {
          throw this.lastCrash ?? new MdxError(eofExpression, point(this.source, this.pos));
        }
        if (code === EOL) {
          const ending = this.lineEndingText();
          this.value += text(this, this.chunkStart) + ending;
          if (this.js !== undefined) {
            this.addChunk();
            this.virtualStart = false;
            this.stops.push(this.code.length, this.pos);
            this.code += ending;
          }
          return this.lineEnding(EXPRESSION_EOL_AFTER);
        }
        if (code === RIGHT_BRACE && this.size === 0) {
          if (this.js === undefined || this.parsesAtBrace()) {
            return this.expressionEnd();
          }
          this.pos++;
        }
        this.state = EXPRESSION_INSIDE;
        return -1;
      case EXPRESSION_INSIDE:
        if ((code === RIGHT_BRACE && this.size === 0) || code === EOF || code === EOL) {
          this.state = EXPRESSION_BEFORE;
          return -1;
        }
        if (code === LEFT_BRACE) {
          // With acorn braces are not counted.
          if (this.js === undefined) {
            this.size++;
          }
        } else if (code === RIGHT_BRACE) {
          this.size--;
        }
        this.pos++;
        return -1;
      case FLOW_AFTER:
        if (isSpaceOrTab(code)) {
          this.pos++;
          return -1;
        }
        // After an expression only a tag may follow (the flow expression
        // construct tries only JSX after itself); after a tag, either.
        if (
          code === LESS_THAN ||
          (code === LEFT_BRACE && this.items[this.items.length - 1].kind === 'tag')
        ) {
          this.startConstruct();
          return -1;
        }
        return code === EOL || code === EOF ? DONE : NOK;
      default:
        throw new Error('unreachable state ' + this.state);
    }
  }

  /** Records the attribute name from `nameStart` to `pos`. */
  endAttributeName(local: boolean): void {
    const attribute = this.attribute!;
    const name = text(this, this.nameStart);
    attribute.name = local ? attribute.name + ':' + name : name;
    attribute.position.end = point(this.source, this.pos);
  }
}

/** The source from `from` to the cursor. */
function text(scanner: Scanner, from: number): string {
  return scanner.text.slice(from, scanner.pos);
}
