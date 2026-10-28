import type {
  BlockContent,
  DefinitionContent,
  FootnoteDefinition,
  FootnoteReference,
  RootContent,
} from 'mdast';
import {
  closeAtNewContainer,
  interrupts,
  isFlow,
  lastChildEnd,
  linkChild,
  parentQuoteLine,
} from '../blocks/blockquote';
import type { TrackedContainer } from '../blocks/blockquote';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { CR, LF, SPACE, TAB, isSpaceOrTab } from '../core/chars';
import type { Delimiter, InlineRule, InlineState } from '../core/inline';
import { nodeIndex } from '../core/inline';
import { advanceLine, consumeColumns } from '../core/line';
import type { Line } from '../core/line';
import { point, skipLineEnding } from '../core/source';
import { normalizeIdentifier } from '../core/state';
import { decodeString } from '../inline/decode';
import { rangeText } from '../inline/lines';
import { flushText, pushNode } from '../inline/text';

// GFM footnotes, as micromark-extension-gfm-footnote parses them:
// definitions (`[^a]: b`) are containers whose later lines are indented by
// 4 columns, and calls (`[^a]`) resolve only against defined labels.

const BACKSLASH = 92;
const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;
const CARET = 94;
const COLON = 58;
const MAX_LABEL = 999;

/**
 * Scans a label from `from` (after `[^`) to its `]`. Returns the offset of
 * the `]`, or -1. Labels have no whitespace, no unescaped `[` and at most
 * 999 characters; `\` escapes `[`, `\` and `]`.
 */
function scanLabel(text: string, from: number, end: number): number {
  let size = 0;
  let i = from;
  for (;;) {
    if (size > MAX_LABEL || i >= end) {
      return -1;
    }
    const code = text.charCodeAt(i);
    if (code === RIGHT_BRACKET) {
      return size === 0 ? -1 : i;
    }
    if (code === LEFT_BRACKET || code === SPACE || code === TAB || code === LF || code === CR) {
      return -1;
    }
    size++;
    i++;
    if (code === BACKSLASH && i < end) {
      const next = text.charCodeAt(i);
      if (next === LEFT_BRACKET || next === BACKSLASH || next === RIGHT_BRACKET) {
        size++;
        i++;
      }
    }
  }
}

// The last line on which a definition consumed its indent.
// Per document, so a finished parse is not kept alive.
const indentLines = new WeakMap<BlockState, number>();

/**
 * True when a footnote definition consumed its indent on the line that
 * starts at `lineStart`, the line being parsed. mdast-util-from-markdown's
 * list item walk back skips quote prefixes but stops at that indent, so an
 * item closed on such a line ends at the event that closes it.
 */
export function footnoteIndentAt(state: BlockState, lineStart: number): boolean {
  return indentLines.get(state) === lineStart;
}

/**
 * True when a footnote definition among `children` (or nested in one) spans
 * a blank line: its label line with nothing after it, or a line between or
 * after its children. mdast-util-from-markdown counts those for
 * the spread of a list item around it: only lists and block quotes hide
 * their blank lines.
 */
export function footnoteBlankLine(children: (BlockContent | DefinitionContent)[]): boolean {
  for (const child of children) {
    if (child.type !== 'footnoteDefinition') {
      continue;
    }
    // Lines with nothing on them inside the definition's span: the label
    // line when no child starts on it, and lines between or after children.
    const inner = child.children;
    let line = child.position!.start.line;
    let gap = 1;
    for (const node of inner) {
      const position = node.position!;
      if (position.start.line - line >= gap) {
        return true;
      }
      line = position.end.line;
      gap = 2;
    }
    if (child.position!.end.line - line >= gap || footnoteBlankLine(inner)) {
      return true;
    }
  }
  return false;
}

class OpenFootnoteDefinition implements TrackedContainer {
  name = 'footnoteDefinition';
  isContainer = true;
  acceptsLazy = true;
  quoteLine = -1;
  openChild: TrackedContainer | undefined = undefined;
  closeEnd = -1;
  interruptLine: number;
  start: number;
  /** End of the last line with a token of this block: its label, its indent or a quote prefix above. */
  end: number;
  identifier: string;
  label: string;
  /** Where the event that closes this block ends on a later line, and its line start, or -1. */
  nextEnd = -1;
  nextLineStart = -1;
  /** The block continued on the last line, which has no line ending. */
  matchedEnd = false;
  /** The last non-blank line this block matched, and the offset after its indent. */
  indentLine = -1;
  indentEnd = -1;

  constructor(
    start: number,
    end: number,
    identifier: string,
    label: string,
    interruptLine: number,
  ) {
    this.start = start;
    this.end = end;
    this.identifier = identifier;
    this.label = label;
    this.interruptLine = interruptLine;
  }

  continue(state: BlockState, line: Line): boolean {
    // A blank line continues without consuming anything; other lines need
    // exactly 4 columns of indent. That indent is a token, which ends the
    // reference's walk back like a quote prefix does, so it counts as one.
    if (line.blank) {
      this.quoteLine = parentQuoteLine(state.container);
      if (this.quoteLine === line.index) {
        this.end = line.end;
      }
    } else {
      if (line.indent >= 4) {
        consumeColumns(line, 4);
      } else if (!(line.indent === 0 && followsIndent(state.container, line))) {
        return false;
      }
      this.indentLine = line.index;
      this.indentEnd = line.start;
      this.quoteLine = line.index;
      this.end = line.end;
      indentLines.set(state, state.source.lineStarts[line.index]);
    }
    this.matchedEnd = line.end === line.text.length;
    return true;
  }

  closedAt(position: number, lineStart: number): void {
    this.nextEnd = position;
    this.nextLineStart = lineStart;
  }

  close(state: BlockState, children: RootContent[]): FootnoteDefinition {
    const flow: (BlockContent | DefinitionContent)[] = [];
    for (const child of children) {
      if (isFlow(child)) {
        flow.push(child);
      }
    }
    let end = this.end;
    if (this.closeEnd > end) {
      end = this.closeEnd;
    }
    const childEnd = lastChildEnd(children);
    if (childEnd > end) {
      end = childEnd;
      // The last child kept its line ending (fenced code, HTML): the block
      // ends at the event that closes it, as list items do.
      const text = state.source.text;
      const before = text.charCodeAt(childEnd - 1);
      if (before === LF || before === CR) {
        if (this.nextLineStart === childEnd) {
          end = this.nextEnd;
        } else if (this.matchedEnd) {
          end = text.length;
        }
      }
    }
    return {
      type: 'footnoteDefinition',
      identifier: this.identifier,
      label: this.label,
      children: flow,
      position: { start: point(state.source, this.start), end: point(state.source, end) },
    };
  }
}

/**
 * micromark checks the indent through the last token, so a definition right
 * inside another one whose indent just matched continues with no indent of
 * its own (`[^a]: [^b]: c\n    d` keeps `d` in `b`).
 */
function followsIndent(parent: OpenBlock, line: Line): boolean {
  return (
    parent instanceof OpenFootnoteDefinition &&
    parent.indentLine === line.index &&
    parent.indentEnd === line.start
  );
}

const footnoteDefinition: BlockRule = {
  name: 'footnoteDefinition',
  priority: 150,
  canInterruptParagraph: true,
  triggers: '[',
  gfm: true,
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const start = line.nonBlank;
    if (text.charCodeAt(start + 1) !== CARET) {
      return undefined;
    }
    const close = scanLabel(text, start + 2, line.end);
    if (close === -1 || close + 1 >= line.end || text.charCodeAt(close + 1) !== COLON) {
      return undefined;
    }
    const raw = text.slice(start + 2, close);
    const identifier = normalizeIdentifier(raw);
    state.footnotes.add(identifier);
    const position = line.start;
    // All whitespace after the colon goes, so no indented code can start.
    let after = close + 2;
    while (after < line.end && isSpaceOrTab(text.charCodeAt(after))) {
      after++;
    }
    advanceLine(line, after);
    closeAtNewContainer(state, line, position);
    const block = new OpenFootnoteDefinition(
      start,
      line.end,
      identifier.toLowerCase(),
      decodeString(raw),
      interrupts(state, line) ? line.index : -1,
    );
    linkChild(state.container, block);
    return block;
  },
};

export default footnoteDefinition;

function reference(
  state: InlineState,
  raw: string,
  identifier: string,
  start: number,
  end: number,
): FootnoteReference {
  return {
    type: 'footnoteReference',
    identifier: identifier.toLowerCase(),
    label: decodeString(raw),
    position: { start: point(state.source, start), end: point(state.source, end) },
  };
}

/** `[^a]`: a call to a defined footnote. Runs before links. */
export const footnoteCall: InlineRule = {
  name: 'footnoteCall',
  priority: 450,
  triggers: '[',
  gfm: true,
  parse(state: InlineState): boolean {
    if (state.footnotes.size === 0) {
      return false;
    }
    const text = state.source.text;
    const start = state.pos;
    if (start + 1 >= state.end || text.charCodeAt(start + 1) !== CARET) {
      return false;
    }
    const close = scanLabel(text, start + 2, state.end);
    if (close === -1) {
      return false;
    }
    const raw = text.slice(start + 2, close);
    const identifier = normalizeIdentifier(raw);
    if (!state.footnotes.has(identifier)) {
      return false;
    }
    pushNode(state, reference(state, raw, identifier, start, close + 1));
    state.pos = close + 1;
    return true;
  },
};

/**
 * Called by the link rule when `]` closes an image bracket that formed no
 * image. micromark then reads `![^a]` as `!` and a footnote call when the
 * label, normalized, is `^` and a defined footnote. On success the nodes
 * after the bracket are gone, the bracket node is the text `!`, and the call
 * is pushed; the link rule drops the delimiters and moves past `]`.
 */
export function imageFootnoteCall(
  state: InlineState,
  bracket: Delimiter,
  labelRange: number,
  close: number,
): boolean {
  if (state.footnotes.size === 0) {
    return false;
  }
  const id = normalizeIdentifier(rangeText(state, labelRange, bracket.end, close));
  if (id.charCodeAt(0) !== CARET || !state.footnotes.has(id.slice(1))) {
    return false;
  }
  // The call string starts one character after `[`, wherever `^` is.
  // When `![` ends its line, that character is the line ending, and the
  // string starts on the next line after its container prefix, whitespace
  // kept.
  const lineEnd = state.ranges[labelRange + 1];
  let raw: string;
  if (bracket.end + 1 > lineEnd) {
    const text = state.source.text;
    raw = rangeText(state, labelRange, lineEnd, close).slice(
      skipLineEnding(text, lineEnd) - lineEnd,
    );
  } else {
    raw = rangeText(state, labelRange, bracket.end + 1, close);
  }
  flushText(state);
  const nodes = state.nodes;
  nodes.length = nodeIndex(state, bracket.node) + 1;
  const node = bracket.node;
  node.value = '!';
  node.position = {
    start: point(state.source, bracket.start),
    end: point(state.source, bracket.start + 1),
  };
  nodes.push(reference(state, raw, normalizeIdentifier(raw), bracket.start + 1, close + 1));
  state.pos = close + 1;
  return true;
}
