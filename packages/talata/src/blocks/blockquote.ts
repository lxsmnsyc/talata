import type { BlockContent, Blockquote, DefinitionContent, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { isSpaceOrTab } from '../core/chars';
import { advanceLine, consumeColumns } from '../core/line';
import type { Line } from '../core/line';
import { point } from '../core/source';
import type { Source } from '../core/source';

const GREATER_THAN = 62;

/**
 * Block quotes and lists share this state so their end positions match the
 * reference. micromark ends a container at the start of the first line ending
 * after its last token, and a block quote prefix counts as a token.
 */
export interface TrackedContainer extends OpenBlock {
  /** Index of the last line on which a quote prefix at or above this block matched. */
  quoteLine: number;
  /** The open container child, if it is tracked. May be stale once closed. */
  openChild: TrackedContainer | undefined;
  /** End set when a new container closes this block after a matched quote prefix, or -1. */
  closeEnd: number;
  /**
   * Index of the line this block started on when that line interrupted a
   * paragraph, or -1. micromark keeps the interrupt flag for every container
   * that starts on the line, so nested list starts stay restricted.
   */
  interruptLine: number;
  /**
   * Called when a new container starts on a line and closes this block:
   * `position` is where that container starts, after the matched prefixes.
   */
  closedAt?(position: number, lineStart: number): void;
}

export function isTracked(block: OpenBlock): block is TrackedContainer {
  return 'quoteLine' in block;
}

/** The quote line of `parent`, or -1 when it is not tracked. */
export function parentQuoteLine(parent: OpenBlock): number {
  return isTracked(parent) ? parent.quoteLine : -1;
}

/**
 * Called by a rule that starts a new container, right before it returns.
 * The open containers below `state.container` close at the current
 * position when a quote prefix matched on this line: micromark puts their
 * exit there, and the walk back stops at the quote prefix.
 */
export function closeAtNewContainer(state: BlockState, line: Line, position: number): void {
  const parent = state.container;
  if (!isTracked(parent)) {
    return;
  }
  const quoted = parent.quoteLine === line.index;
  const lineStart = state.source.lineStarts[line.index];
  let child = parent.openChild;
  while (child !== undefined) {
    if (quoted) {
      child.closeEnd = position;
    }
    child.closedAt?.(position, lineStart);
    child = child.openChild;
  }
}

/** True when a block start on `line` counts as interrupting a paragraph. */
export function interrupts(state: BlockState, line: Line): boolean {
  if (state.paragraph !== undefined && !state.lazy) {
    return true;
  }
  // micromark also sets its interrupt flag while indented code is open.
  if (state.tip?.name === 'codeIndented') {
    return true;
  }
  const parent = state.container;
  return isTracked(parent) && parent.interruptLine === line.index;
}

/** Records `child` as the open container child of `parent`. */
export function linkChild(parent: OpenBlock, child: TrackedContainer): void {
  if (isTracked(parent)) {
    parent.openChild = child;
  }
}

export function isFlow(node: RootContent): node is BlockContent | DefinitionContent {
  return node.type !== 'text' && node.type !== 'break';
}

/** The end offset of the last child, or -1. */
export function lastChildEnd(children: RootContent[]): number {
  if (children.length === 0) {
    return -1;
  }
  const position = children[children.length - 1].position;
  return position === undefined ? -1 : position.end.offset!;
}

// The source and line index of the last line a quote matched only through
// the end-of-file rule below. micromark treats that line as lazy for the
// quote, so a leaf inside ends before it (`> > ```\n> > a\n>`).
let endOnlySource: Source | undefined;
let endOnlyLine = -1;

/** True when a quote above matched `line` only through the end-of-file rule. */
export function matchedOnlyAtEnd(state: BlockState, line: Line): boolean {
  return endOnlySource === state.source && endOnlyLine === line.index;
}

function consumeQuotePrefix(line: Line): boolean {
  if (line.indent >= 4 || line.text.charCodeAt(line.nonBlank) !== GREATER_THAN) {
    return false;
  }
  advanceLine(line, line.nonBlank + 1);
  if (line.start < line.end && isSpaceOrTab(line.text.charCodeAt(line.start))) {
    consumeColumns(line, 1);
  }
  return true;
}

class OpenBlockquote implements TrackedContainer {
  name = 'blockquote';
  isContainer = true;
  acceptsLazy = true;
  quoteLine: number;
  openChild: TrackedContainer | undefined = undefined;
  closeEnd = -1;
  interruptLine: number;
  start: number;
  end: number;
  /** Where a new container that closed this quote starts, and its line start, or -1. */
  nextEnd = -1;
  nextLineStart = -1;

  constructor(start: number, end: number, line: number, interrupt: boolean) {
    this.start = start;
    this.end = end;
    this.quoteLine = line;
    this.interruptLine = interrupt ? line : -1;
  }

  continue(state: BlockState, line: Line): boolean {
    if (consumeQuotePrefix(line)) {
      this.quoteLine = line.index;
      this.end = line.end;
      return true;
    }
    // The reference keeps nested quotes open over a last line that has no
    // line ending and nothing left after an outer quote prefix: they all end
    // at that prefix.
    const quoteLine = parentQuoteLine(state.container);
    if (
      line.start === line.end &&
      line.partialTab === 0 &&
      line.end === line.text.length &&
      quoteLine === line.index
    ) {
      this.quoteLine = quoteLine;
      this.end = line.end;
      endOnlySource = state.source;
      endOnlyLine = line.index;
      return true;
    }
    return false;
  }

  closedAt(position: number, lineStart: number): void {
    this.nextEnd = position;
    this.nextLineStart = lineStart;
  }

  close(state: BlockState, children: RootContent[]): Blockquote {
    let end = this.end;
    if (this.closeEnd > end) {
      end = this.closeEnd;
    }
    const childEnd = lastChildEnd(children);
    if (childEnd > end) {
      end = childEnd;
      // The last child kept its line ending (fenced code, HTML): the quote
      // exits where the new container starts.
      if (childEnd === this.nextLineStart && this.nextEnd > end) {
        end = this.nextEnd;
      }
    }
    const flow: (BlockContent | DefinitionContent)[] = [];
    for (const child of children) {
      if (isFlow(child)) {
        flow.push(child);
      }
    }
    return {
      type: 'blockquote',
      children: flow,
      position: { start: point(state.source, this.start), end: point(state.source, end) },
    };
  }
}

const blockquote: BlockRule = {
  name: 'blockquote',
  priority: 100,
  canInterruptParagraph: true,
  triggers: '>',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    const position = line.start;
    const marker = line.nonBlank;
    if (!consumeQuotePrefix(line)) {
      return undefined;
    }
    closeAtNewContainer(state, line, position);
    const block = new OpenBlockquote(marker, line.end, line.index, interrupts(state, line));
    linkChild(state.container, block);
    return block;
  },
};

export default blockquote;
