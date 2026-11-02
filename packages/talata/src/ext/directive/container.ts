import type { BlockContent, DefinitionContent, Paragraph, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import { isSpaceOrTab } from '../../core/chars';
import { advanceLine, consumeColumns, createLine, measureLine } from '../../core/line';
import type { Line } from '../../core/line';
import type { Source } from '../../core/source';
import { point, skipLineEnding } from '../../core/source';
import {
  isFlow,
  lastChildEnd,
  linkChild,
  matchedOnlyAtEnd,
  parentQuoteLine,
} from '../../blocks/blockquote';
import type { TrackedContainer } from '../../blocks/blockquote';
import { isClosingFence } from '../../blocks/code-fenced';
import html from '../../blocks/html';
import { isEmptyLastLine } from '../../blocks/code-indented';
import { isThematicBreak } from '../../blocks/list';
import { queueLabel } from './labels';
import { enter, hide, leave, snapshot } from './scopes';
import type { Scope, Snapshot } from './scopes';
import { COLON, readHead } from './syntax';
import type { Attributes } from './syntax';

// Container directives. For the reference the content of a directive is a
// document of its own: the blocks inside end when the directive ends, as at
// the end of a document, and quote prefixes around the directive are not
// part of that content.

const GREATER_THAN = 62;

/** The open directives of each parse, outermost first. */
const openDirectives = new WeakMap<Source, OpenContainerDirective[]>();

// Line checks

/**
 * The empty line after a final line ending, which the block parser only
 * shows to containers when it asks whether they continue over the end.
 */
function isVirtualLine(state: BlockState, line: Line): boolean {
  const starts = state.source.lineStarts;
  return (
    line.index === starts.length - 1 &&
    starts[line.index] === state.source.text.length &&
    line.end === line.start &&
    line.start === state.source.text.length
  );
}

/** Whether a real line, not the empty one after a final line ending, follows `line`. */
function hasLaterLine(state: BlockState, line: Line): boolean {
  const starts = state.source.lineStarts;
  return line.index + 1 < starts.length && starts[line.index + 1] < state.source.text.length;
}

/**
 * Whether the next line starts a container (a quote, a list item or a
 * footnote definition) after the quote markers of the `markers` quotes
 * around the directive.
 */
function nextStartsContainer(state: BlockState, line: Line, markers: number): boolean {
  const text = state.source.text;
  let i = state.source.lineStarts[line.index + 1];
  for (;;) {
    while (isSpaceOrTab(text.charCodeAt(i))) {
      i++;
    }
    if (markers === 0 || text.charCodeAt(i) !== GREATER_THAN) {
      break;
    }
    i++;
    markers--;
  }
  if (markers === 0) {
    // All of them matched: the line continues the directive.
    return false;
  }
  let end = i;
  while (end < text.length && text.charCodeAt(end) !== 10 && text.charCodeAt(end) !== 13) {
    end++;
  }
  return isContainerStart(state, text, i, end);
}

/** Whether `line`, where the containers around a directive stopped matching, starts no container. */
function isLazy(state: BlockState, line: Line): boolean {
  return line.indent >= 4 || !isContainerStart(state, line.text, line.nonBlank, line.end);
}

// The text of each parse with one more character, for `createEmptyLine`.
const paddedTexts = new WeakMap<Source, string>();

/** An empty line at the end of `line` that is not the last line, so no block thinks it is at the end. */
function createEmptyLine(state: BlockState, line: Line): Line {
  let padded = paddedTexts.get(state.source);
  if (padded === undefined) {
    padded = line.text + ' ';
    paddedTexts.set(state.source, padded);
  }
  const empty = createLine(padded);
  // No quote prefix is ever on this line, whatever the containers say.
  empty.index = -2;
  empty.start = line.end;
  empty.end = line.end;
  measureLine(empty);
  return empty;
}

/**
 * Whether a CommonMark container (a quote, a list item or a footnote
 * definition) can start at `i`. Used where the parser has not tried yet.
 */
function isContainerStart(state: BlockState, text: string, i: number, end: number): boolean {
  const code = text.charCodeAt(i);
  if (code === GREATER_THAN) {
    return true;
  }
  if (code === 91) {
    // A footnote definition: `[^label]:` with GFM.
    if (!state.options.gfm || text.charCodeAt(i + 1) !== 94) {
      return false;
    }
    // The label holds no whitespace and no brackets.
    let j = i + 2;
    while (j < end) {
      const next = text.charCodeAt(j);
      if (next === 93) {
        break;
      }
      if (isSpaceOrTab(next) || next === 91) {
        return false;
      }
      j += next === 92 ? 2 : 1;
    }
    return j > i + 2 && j + 1 < end && text.charCodeAt(j + 1) === COLON;
  }
  let j = i;
  if (code === 42 || code === 43 || code === 45) {
    if (code !== 43 && isThematicBreak(text, i, end)) {
      return false;
    }
    j++;
  } else {
    while (text.charCodeAt(j) >= 48 && text.charCodeAt(j) <= 57) {
      j++;
    }
    const mark = text.charCodeAt(j);
    if (j === i || j - i > 9 || (mark !== 46 && mark !== 41)) {
      return false;
    }
    j++;
  }
  const next = text.charCodeAt(j);
  return Number.isNaN(next) || next === 32 || next === 9 || next === 10 || next === 13;
}

/**
 * Whether `block` continues over an empty line. A quote does not, and is not
 * asked: its continue marks the end of the document.
 */
function continuesOverEmpty(state: BlockState, block: OpenBlock, empty: Line): boolean {
  return block.name !== 'blockquote' && block.continue(state, empty);
}

// The open block

class OpenContainerDirective implements TrackedContainer {
  name = 'containerDirective';
  isContainer = true;
  /** A flow construct for the reference: blocks that its start closes do not keep their line ending. */
  startsContainer = false as const;
  acceptsLazy = false;
  quoteLine = -1;
  openChild: TrackedContainer | undefined = undefined;
  closeEnd = -1;
  interruptLine = -1;
  size: number;
  /** Whitespace columns before the opening fence; content lines lose as many. */
  indent: number;
  node: { type: string; name: string; attributes: Attributes; children: RootContent[] };
  label: Paragraph | undefined;
  start: number;
  /** End of the last line the container matched. */
  end: number;
  closed = false;
  /** An outer directive set the end. */
  forced = false;
  /** The containers around this block continue over the empty line after a final line ending. */
  atEnd = false;
  /** Directive containers around this one. */
  depth: number;
  scope: Scope;
  before: Snapshot | undefined = undefined;
  /** `containerStartsOff` before this directive opened. */
  startsOff: boolean;
  /**
   * Columns of indent (list items, footnote definitions) that the containers
   * around this block need before each of their quote markers and after the
   * last one, outermost first. One more entry than `quotes`.
   */
  runs: number[] = [];
  /** Quotes around this block. */
  quotes = 0;
  /**
   * Set by `continuesAfter`: the next line does not continue the containers
   * around this block and starts no container, so micromark reads it as lazy.
   */
  lazyNext = false;
  /** The last line this block consumed its own indent on, the offset after it, and its columns. */
  indentLine = -1;
  indentEnd = -1;
  indentColumns = 0;

  constructor(
    size: number,
    indent: number,
    node: OpenContainerDirective['node'],
    label: Paragraph | undefined,
    start: number,
    end: number,
    depth: number,
    startsOff: boolean,
  ) {
    this.size = size;
    this.indent = indent;
    this.node = node;
    this.label = label;
    this.start = start;
    this.end = end;
    this.depth = depth;
    this.scope = { started: false };
    this.startsOff = startsOff;
  }

  /** Closing the open containers inside: a new container starts outside, and the chain stops here. */
  closedAt(): void {
    this.openChild = undefined;
  }

  /**
   * Called on the first line after the opening one, or at the end. A
   * paragraph that the opening line closed has queued its inline content by
   * then, so this directive's content comes after it.
   */
  begin(state: BlockState): void {
    if (this.before === undefined) {
      this.before = snapshot(state);
      enter(state, this.scope);
    }
  }

  /** The open containers above this block, innermost last. */
  getInside(state: BlockState): TrackedContainer[] {
    const inside: TrackedContainer[] = [];
    let depth = state.getDepth(this);
    for (let child = this.openChild; child !== undefined; child = child.openChild) {
      depth++;
      if (state.getDepth(child) !== depth) {
        break;
      }
      inside.push(child);
    }
    return inside;
  }

  /** The block under `blocks[i]`, from a list that `getInside` made. */
  getParent(blocks: TrackedContainer[], i: number): OpenBlock {
    return i === 0 ? this : blocks[i - 1];
  }

  /**
   * Whether the blocks inside keep their line ending when they end here: every
   * container between this one and the tip continues over an empty line, as
   * the parser asks at the end of a document.
   */
  keepsFor(state: BlockState, line: Line): boolean {
    const empty = createEmptyLine(state, line);
    const container = state.container;
    let keeps = true;
    const blocks = this.getInside(state);
    for (let i = 0; i < blocks.length; i++) {
      const inside = blocks[i];
      if (inside.name !== 'containerDirective') {
        state.container = this.getParent(blocks, i);
        if (!continuesOverEmpty(state, inside, empty)) {
          keeps = false;
          break;
        }
      }
    }
    state.container = container;
    return keeps;
  }

  /**
   * Whether the containers between this block and the next directive inside
   * (or the tip) continue over an empty line. Blocks that end with this
   * block's content read this, as the blocks of a document read it at its end.
   */
  segmentKeeps(state: BlockState, line: Line): boolean {
    const empty = createEmptyLine(state, line);
    const container = state.container;
    let keeps = true;
    const blocks = this.getInside(state);
    for (let i = 0; i < blocks.length; i++) {
      const inside = blocks[i];
      if (inside instanceof OpenContainerDirective) {
        break;
      }
      state.container = this.getParent(blocks, i);
      if (!continuesOverEmpty(state, inside, empty)) {
        keeps = false;
        break;
      }
    }
    state.container = container;
    return keeps;
  }

  /**
   * Closes the blocks inside as if the content stopped after the line before:
   * the reference hands the content to a document of its own. With `itself`
   * this block closes too.
   */
  closeInside(state: BlockState, line: Line, itself: boolean): void {
    // Directives inside end where this one's content ends, when every
    // container between them continues over the empty line.
    const empty = createEmptyLine(state, line);
    const container = state.container;
    let chain = true;
    const blocks = this.getInside(state);
    for (let i = 0; i < blocks.length; i++) {
      const inside = blocks[i];
      if (inside instanceof OpenContainerDirective) {
        if (chain) {
          inside.end = skipLineEnding(line.text, inside.end);
        }
        inside.forced = true;
      } else if (chain) {
        state.container = this.getParent(blocks, i);
        chain = continuesOverEmpty(state, inside, empty);
      }
    }
    state.container = container;
    const keepsLineEnding = this.keepsFor(state, line);
    const depth = state.getDepth(this);
    state.closeOpenBlocks(itself ? depth - 1 : depth, { keepsLineEnding });
  }

  /**
   * Reads the prefixes of the containers around this block from what they
   * consumed on `line`: a quote marker, or columns of indent (list items,
   * footnote definitions). Call it on lines where something follows the
   * prefixes, so each container consumed all it needs.
   */
  measurePrefix(state: BlockState, line: Line): void {
    const text = line.text;
    const to = line.start;
    const runs: number[] = [];
    let column = 0;
    let run = 0;
    // Columns of whitespace that the quote before takes.
    let skip = 0;
    // The indents of the directives around this one are not prefixes.
    const around: OpenContainerDirective[] = [];
    for (const directive of openDirectives.get(state.source) ?? []) {
      if (directive === this) {
        break;
      }
      if (directive.indentLine === line.index) {
        around.push(directive);
      }
    }
    for (let i = state.source.lineStarts[line.index]; i <= to; i++) {
      for (const directive of around) {
        if (directive.indentEnd === i) {
          run -= directive.indentColumns;
        }
      }
      if (i === to) {
        break;
      }
      const code = text.charCodeAt(i);
      if (code === GREATER_THAN) {
        runs.push(run);
        run = 0;
        column++;
        skip = 1;
        continue;
      }
      // A list marker on the start line counts as the indent it stands for.
      let width = code === 9 ? 4 - (column % 4) : 1;
      column += width;
      if (skip > 0 && isSpaceOrTab(code)) {
        width--;
      }
      skip = 0;
      run += width;
    }
    runs.push(run - line.partialTab);
    // A quote may also be indented by up to three columns of its own, so the
    // need is the least indent seen on the lines so far.
    const previous = this.runs;
    if (previous.length === runs.length) {
      for (let i = 0; i < runs.length; i++) {
        if (previous[i] < runs[i]) {
          runs[i] = previous[i];
        }
      }
    }
    this.runs = runs;
    this.quotes = runs.length - 1;
  }

  continue(state: BlockState, line: Line): boolean {
    if (isVirtualLine(state, line)) {
      // The parser asks the blocks from the document up, so the ones around
      // this block continued.
      this.atEnd = true;
      return !this.closed;
    }
    // A paragraph before this block closes while this block opens, so the
    // definitions inside start with the second line.
    this.begin(state);
    this.quoteLine = parentQuoteLine(state.container);
    if (this.closed || (isEmptyLastLine(line) && matchedOnlyAtEnd(state, line))) {
      return false;
    }
    if (!line.blank) {
      this.measurePrefix(state, line);
    }
    // The closing fence is read before anything else, so blocks inside it
    // see an empty line and end.
    if (isClosingFence(line, COLON, this.size)) {
      this.closed = true;
      this.end = line.end;
      advanceLine(line, line.end);
      // This block ends with the line, so that nothing after it counts as
      // following an unmatched container.
      this.closeInside(state, line, true);
      return false;
    }
    // On a last line with nothing after this block's own indent, the blocks
    // inside end before the line; this block takes the indent if any.
    const emptyBefore = isEmptyLastLine(line);
    if (this.indent > 0) {
      const column = line.visualColumn;
      consumeColumns(line, this.indent);
      this.indentLine = line.index;
      this.indentEnd = line.start;
      this.indentColumns = line.visualColumn - column;
    }
    const last = isEmptyLastLine(line);
    const empty = line.start === line.end && line.partialTab === 0;
    const later = this.continuesAfter(state, line);
    // The next line does not continue the containers around, but starts one.
    const next = !later && hasLaterLine(state, line) && !this.lazyNext;
    if (last || (empty && !later && line.end < line.text.length && this.lazyNext)) {
      // Nothing is left of the last line: the blocks inside end after the
      // line ending before it. A line ending of this line stays in the
      // directive.
      const text = state.source.text;
      this.end = line.end < text.length || !emptyBefore ? line.end : skipLineEnding(text, this.end);
      if (next && this.quoteLine === line.index) {
        // A container starts on the next line: the content took this line.
        this.closeEnds(state, line, true);
      }
      if (hasLaterLine(state, line) && nextStartsContainer(state, line, this.quotes)) {
        this.takeBlankLine(state, line);
      }
      this.closeInside(state, line, false);
      return true;
    }
    if (!later && this.lazyNext && this.onlyQuotesLeft(state, line)) {
      // The content ends with this line, which holds only the markers of the
      // quotes inside. micromark reads it as a last line without a line
      // ending: the quotes take it, the leaves in them end before it.
      for (const inside of this.getInside(state)) {
        inside.closeEnd = line.end;
      }
      this.end = line.end;
      const depth = state.getDepth(this);
      state.closeOpenBlocks(depth, { keepsLineEnding: true });
      advanceLine(line, line.end);
      return true;
    }
    if ((!empty || later || next) && this.quoteLine === line.index) {
      // On a blank line before a final line ending they end with the line.
      this.closeEnds(state, line, line.blank && !hasLaterLine(state, line));
    }
    this.end = line.end;
    return true;
  }

  /**
   * Whether the rest of `line` is the markers of the quotes inside this block
   * and nothing else, and those quotes are all the open containers inside.
   */
  onlyQuotesLeft(state: BlockState, line: Line): boolean {
    const inside = this.getInside(state);
    if (inside.length === 0) {
      return false;
    }
    for (const block of inside) {
      if (block.name !== 'blockquote') {
        return false;
      }
    }
    // A last line without a line ending is one for the parser too.
    const text = line.text;
    if (line.end === text.length) {
      return false;
    }
    // Each quote takes its marker and one space; anything more is content.
    let markers = 0;
    for (let i = line.start; i < line.end; i++) {
      const code = text.charCodeAt(i);
      if (code === GREATER_THAN) {
        markers++;
      } else if (code !== 32 || text.charCodeAt(i - 1) !== GREATER_THAN) {
        return false;
      }
    }
    return markers === inside.length;
  }

  /** Directives and footnote definitions inside still take a blank last line; the rest do not. */
  takeBlankLine(state: BlockState, line: Line): void {
    const text = state.source.text;
    const container = state.container;
    const blocks = this.getInside(state);
    for (let i = 0; i < blocks.length; i++) {
      const inside = blocks[i];
      if (inside instanceof OpenContainerDirective) {
        inside.end = skipLineEnding(text, line.end);
      } else if (inside.name === 'footnoteDefinition') {
        state.container = this.getParent(blocks, i);
        if (!inside.continue(state, line)) {
          break;
        }
      } else {
        break;
      }
    }
    state.container = container;
  }

  /**
   * Containers inside end at the start of this line, or with `atLineEnd` at
   * its end, if they close here. A quote ends at its end only when a prefix
   * inside the directive is on the line, as the reference walks back to it.
   */
  closeEnds(state: BlockState, line: Line, atLineEnd: boolean): void {
    const lineStart = state.source.lineStarts[line.index];
    const end = atLineEnd ? line.end : lineStart;
    // A list item or footnote prefix inside, before the quote, is a token on the line.
    let indented = false;
    for (
      let child: TrackedContainer | undefined = this.openChild;
      child !== undefined;
      child = child.openChild
    ) {
      if (child.name === 'blockquote') {
        child.closeEnd = atLineEnd && indented && line.start < line.end ? line.end : lineStart;
      } else {
        child.closeEnd = end;
        indented = indented || child.name === 'listItem' || child.name === 'footnoteDefinition';
      }
      if (line.blank && child.name === 'listItem') {
        // A list item ends at its last content, or after the quote prefix of
        // this blank line when its last child kept its line ending.
        child.closedAt?.(line.end, state.source.lineStarts[line.index]);
      }
      if (child instanceof OpenContainerDirective) {
        // Its own content is handled by its own line.
        break;
      }
    }
  }

  /**
   * Whether a line follows that this block can still continue. Inside a
   * quote that line needs a quote marker too.
   */
  continuesAfter(state: BlockState, line: Line): boolean {
    this.lazyNext = false;
    if (!hasLaterLine(state, line)) {
      // Before a final line ending, in a quote, the content ends as before a lazy line.
      this.lazyNext = this.quoteLine === line.index;
      return false;
    }
    // The containers around this block, on the next line.
    const text = state.source.text;
    const starts = state.source.lineStarts;
    const next = createLine(text);
    next.index = line.index + 1;
    next.start = starts[next.index];
    next.end = next.index + 1 < starts.length ? starts[next.index + 1] - 1 : text.length;
    if (
      next.end > next.start &&
      text.charCodeAt(next.end) === 10 &&
      text.charCodeAt(next.end - 1) === 13
    ) {
      next.end--;
    }
    measureLine(next);
    const runs = this.runs;
    for (let i = 0; i < runs.length; i++) {
      const need = runs[i];
      if (need > 0) {
        if (!next.blank && next.indent < need) {
          this.lazyNext = isLazy(state, next);
          return false;
        }
        consumeColumns(next, need);
      }
      if (i === runs.length - 1) {
        break;
      }
      if (next.indent >= 4 || text.charCodeAt(next.nonBlank) !== GREATER_THAN) {
        this.lazyNext = isLazy(state, next);
        return false;
      }
      advanceLine(next, next.nonBlank + 1);
      if (next.start < next.end && isSpaceOrTab(text.charCodeAt(next.start))) {
        consumeColumns(next, 1);
      }
    }
    return true;
  }

  close(state: BlockState, children: RootContent[]): RootContent {
    const text = state.source.text;
    let end = this.end;
    if (!this.closed && !this.forced) {
      // The blocks inside do not decide this: the content is a document of its own.
      const next = skipLineEnding(text, end);
      if (state.closeKeepsLineEnding || (this.atEnd && next === text.length)) {
        end = next;
      }
    }
    const childEnd = lastChildEnd(children);
    if (childEnd > end) {
      end = childEnd;
    }
    if (this.before !== undefined) {
      hide(state, this.before, children, this.depth + 1, this.scope);
    }
    this.begin(state);
    leave(state);
    state.containerStartsOff = this.startsOff;
    const open = openDirectives.get(state.source);
    if (open?.[open.length - 1] === this) {
      open.pop();
    }
    const flow: (BlockContent | DefinitionContent)[] = [];
    if (this.label !== undefined) {
      flow.push(this.label);
    }
    for (const child of children) {
      if (isFlow(child)) {
        flow.push(child);
      }
    }
    const node = this.node;
    node.children = flow;
    markContainers(state.source);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const result = node as unknown as RootContent;
    result.position = { start: point(state.source, this.start), end: point(state.source, end) };
    return result;
  }
}

// Parses that made container directives, for the list item transform.
const withContainers = new WeakSet<Source>();

function markContainers(source: Source): void {
  withContainers.add(source);
}

/** Whether this parse made a container directive. */
export function hasContainers(source: Source): boolean {
  return withContainers.has(source);
}

// The rules

/** Directive containers that matched the current line, around a block that starts on it. */
function countDirectives(state: BlockState, open: OpenContainerDirective[]): number {
  const reached = state.getDepth(state.container);
  let count = 0;
  for (const directive of open) {
    const depth = state.getDepth(directive);
    if (depth > 0 && depth <= reached) {
      count++;
    }
  }
  return count;
}

/** `:::name[label]{attributes}` up to a closing `:::`. */
const containerDirective: BlockRule = {
  name: 'directiveContainer',
  priority: 340,
  canInterruptParagraph: true,
  triggers: ':',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const start = line.nonBlank;
    let i = start;
    while (text.charCodeAt(i) === COLON) {
      i++;
    }
    const size = i - start;
    if (size < 3) {
      return undefined;
    }
    const head = readHead(state, i, line.end);
    if (head === undefined) {
      return undefined;
    }
    let label: Paragraph | undefined;
    if (head.labelStart !== -1) {
      label = {
        type: 'paragraph',
        data: { directiveLabel: true },
        children: [],
        position: {
          start: point(state.source, head.labelStart - 1),
          end: point(state.source, head.labelEnd + 1),
        },
      };
      if (head.labelEnd > head.labelStart) {
        queueLabel(state, label, head.labelStart, head.labelEnd);
      }
    }
    let open = openDirectives.get(state.source);
    if (open === undefined) {
      open = [];
      openDirectives.set(state.source, open);
    }
    const node = {
      type: 'containerDirective',
      name: head.name,
      attributes: head.attributes,
      children: [],
    };
    const block = new OpenContainerDirective(
      size,
      line.indent,
      node,
      label,
      start,
      line.end,
      countDirectives(state, open),
      state.containerStartsOff,
    );
    block.measurePrefix(state, line);
    open.push(block);
    // The content is a document of its own, where quotes and lists start.
    state.containerStartsOff = false;
    linkChild(state.container, block);
    advanceLine(line, line.end);
    return block;
  },
};

/**
 * Runs first on every line that is not blank, and starts nothing. When a
 * directive did not match the line, it closes on it, with the blocks inside.
 * If a container starts, the parser keeps the line ending of the blocks it
 * closes; inside a directive they keep it only when every container between
 * them and the directive continues over an empty line, so they close first
 * here when one does not.
 */
const directiveEnd: BlockRule = {
  name: 'directiveEnd',
  priority: 1,
  canInterruptParagraph: true,
  start(state: BlockState, line: Line): undefined {
    const open = openDirectives.get(state.source);
    if (open === undefined || open.length === 0) {
      return undefined;
    }
    // The directives that close on this line, innermost first.
    const reached = state.getDepth(state.container);
    const closing: OpenContainerDirective[] = [];
    for (let i = open.length - 1; i >= 0 && state.getDepth(open[i]) > reached; i--) {
      closing.push(open[i]);
    }
    if (closing.length === 0) {
      return undefined;
    }
    // A block that ends with a directive's content keeps its line ending when
    // every container between it and the outermost closing directive
    // continues over an empty line, and a container starts.
    const keeps: boolean[] = [];
    let all = true;
    for (let i = closing.length - 1; i >= 0; i--) {
      all = all && closing[i].segmentKeeps(state, line);
      keeps[i] = all;
    }
    const starts = line.indent < 4 && isContainerStart(state, line.text, line.nonBlank, line.end);
    // The content of each directive ended before this line, like a document
    // ends: the line is not lazy for the blocks inside (a table there does
    // not take it as a body row).
    const unmatched = state.unmatched;
    state.unmatched = false;
    for (let i = 0; i < closing.length; i++) {
      state.closeOpenBlocks(state.getDepth(closing[i]), { keepsLineEnding: keeps[i] && starts });
    }
    // The directives close too, before a definition on this line can add a
    // label that their content defined as well (`scopes.ts`).
    const outermost = closing[closing.length - 1];
    state.closeOpenBlocks(state.getDepth(outermost) - 1, { keepsLineEnding: starts });
    state.unmatched = unmatched;
    return undefined;
  },
};

/**
 * HTML (kind 7) that starts on a lazy line in a directive. The parser keeps
 * the containers it did not match open when the line has a line ending, as
 * micromark cannot finish the check before the next line. When the
 * directive's content ends with this line, micromark sees it without its
 * line ending, so the containers close.
 */
const directiveHtml: BlockRule = {
  name: 'directiveHtml',
  priority: 399,
  canInterruptParagraph: true,
  triggers: '<',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    const open = openDirectives.get(state.source);
    if (!state.lazy || open === undefined || open.length === 0) {
      return undefined;
    }
    const reached = state.getDepth(state.container);
    let directive: OpenContainerDirective | undefined;
    for (let i = open.length - 1; i >= 0 && directive === undefined; i--) {
      const depth = state.getDepth(open[i]);
      if (depth > 0 && depth <= reached) {
        directive = open[i];
      }
    }
    if (directive === undefined || directive.continuesAfter(state, line) || !directive.lazyNext) {
      return undefined;
    }
    const block = html.start(state, line);
    if (block !== undefined) {
      block.keepsLazyContainers = false;
    }
    return block;
  },
};

export { directiveEnd, directiveHtml };
export default containerDirective;
