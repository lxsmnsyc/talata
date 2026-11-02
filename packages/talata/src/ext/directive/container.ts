import type { BlockContent, DefinitionContent, Paragraph, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import { isSpaceOrTab } from '../../core/chars';
import { advanceLine, consumeColumns, createLine, measureLine } from '../../core/line';
import type { Line } from '../../core/line';
import type { Source } from '../../core/source';
import { point, skipLineEnding } from '../../core/source';
import {
  isFlow,
  isTracked,
  lastChildEnd,
  linkChild,
  matchedOnlyAtEnd,
  parentQuoteLine,
} from '../../blocks/blockquote';
import type { TrackedContainer } from '../../blocks/blockquote';
import { isClosingFence } from '../../blocks/code-fenced';
import { isEmptyLastLine } from '../../blocks/code-indented';
import OpenList, { isThematicBreak } from '../../blocks/list';
import { footnoteIndentAt } from '../../gfm/footnote';
import { queueLabel } from './labels';
import { enter, hide, leave, snapshot, takeEarly } from './scopes';
import type { Scope, Snapshot, Taken } from './scopes';
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
  /** What the content defined, taken out at the start of the line that closes this block. */
  taken: Taken | undefined = undefined;
  /** `containerStartsOff` before this directive opened. */
  startsOff: boolean;
  /**
   * Set by `continuesAfter`: the next line does not continue the containers
   * around this block and starts no container, so micromark reads it as lazy.
   */
  lazyNext = false;
  /** Set by `continuesAfter`: the next line does not continue the containers around, and starts one. */
  startsNext = false;
  /** The last line this block called `endContent` on. */
  endedLine = -1;

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

  /**
   * A container starts outside this block, which closes. The blocks inside
   * keep their line ending only when every container between them and the
   * outermost closing directive continues over an empty line, as at the end
   * of a document. Called innermost first.
   */
  willClose(state: BlockState, line: Line, keepsLineEnding: boolean): void {
    const reached = state.getDepth(state.container);
    let keeps = keepsLineEnding;
    for (const directive of openDirectives.get(state.source) ?? []) {
      if (state.getDepth(directive) > reached) {
        keeps = keeps && directive.segmentKeeps(state, line);
      }
      if (directive === this) {
        break;
      }
    }
    // The content ended before this line: the line is not lazy for the
    // blocks inside (a table there does not take it as a body row).
    const unmatched = state.unmatched;
    state.unmatched = false;
    const sizes = snapshot(state);
    state.closeOpenBlocks(state.getDepth(this), { keepsLineEnding: keeps });
    state.unmatched = unmatched;
    if (this.taken !== undefined) {
      // Definitions that close now are part of the content.
      takeEarly(state, sizes, this.taken);
    }
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
    for (let depth = state.getDepth(this) + 1; ; depth++) {
      const block = state.getBlock(depth);
      if (block === undefined || !block.isContainer || !isTracked(block)) {
        break;
      }
      inside.push(block);
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
      consumeColumns(line, this.indent);
    }
    const later = this.continuesAfter(state, line);
    if (!later && this.lazyNext) {
      // micromark reads the next line as lazy, so the content ends with this
      // line, as a document without a final line ending.
      state.endContent(this);
      this.endedLine = line.index;
    }
    if (isEmptyLastLine(line)) {
      // Nothing is left of the last line of the content: the blocks inside
      // end after the line ending before it. A line ending of this line
      // stays in the directive.
      const text = state.source.text;
      this.end = emptyBefore ? skipLineEnding(text, this.end) : line.end;
      this.closeInside(state, line, false);
      return true;
    }
    const empty = line.start === line.end && line.partialTab === 0;
    if ((!empty || later || this.startsNext) && this.quoteLine === line.index) {
      // On a blank line before a final line ending they end with the line.
      this.closeEnds(state, line, line.blank && !hasLaterLine(state, line));
    }
    this.end = line.end;
    return true;
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
    // Columns of the list item prefixes on a blank line.
    let need = 0;
    // A quote does not continue over a blank line: the blocks in it end with it.
    let quoted = false;
    // A footnote definition around this block took its indent on this line.
    // The other prefixes around (quote markers, item indents) do not stop the
    // reference's walk back from a list's end; that indent does.
    const afterIndent = footnoteIndentAt(state, lineStart);
    // The open block the loop saw before `child`.
    let previous: TrackedContainer | undefined;
    // The line after the prefixes of the quotes inside that continue on it,
    // while only such quotes are between this block and `child`.
    let direct = true;
    // A container starts on the next line and no quote is open inside: this
    // block's content keeps its final line ending, and the blocks inside end
    // after it, as their last children do, not at this blank line.
    const keepsEnding = this.startsNext && !hasQuoteInside(this.getInside(state));
    const rest: Line = { ...line };
    // Where the indent of a footnote definition just before ended, or -1.
    let follow = -1;
    let blank = line.blank;
    let indent = line.indent;
    for (
      let child: TrackedContainer | undefined = this.openChild;
      child !== undefined;
      previous = child, child = child.openChild
    ) {
      if (state.getDepth(child) < 0) {
        // `openChild` stays linked after a block closes, and so do the blocks
        // in it: a closed block keeps the end it had.
        break;
      }
      if (!blank && direct) {
        // Quote markers and item and footnote indents on the line, read by
        // column, so that a quote marker after them is read where its block
        // expects it.
        direct = continuesNext(child, rest, follow);
        follow = child.name === 'footnoteDefinition' && !rest.blank ? rest.start : -1;
        if (direct && child.name === 'blockquote') {
          // The quote continues on this line; the blocks in it see the rest.
          blank = rest.blank;
          indent = rest.indent;
          need = 0;
          continue;
        }
      }
      if (child.name === 'blockquote') {
        if (blank && !quoted && previous?.name === 'listItem') {
          // The quote in an item ends here; a container that starts on a
          // later line does not move the item's end there. A quote that
          // closed on an earlier blank line fixed the end then.
          raiseIndentEnd(previous, line.end);
        }
        // On a blank line, whitespace left after those prefixes is not one.
        const prefixOnly = !blank || (indent <= need && !quoted);
        child.closeEnd =
          atLineEnd && indented && prefixOnly && line.start < line.end ? line.end : lineStart;
        quoted = true;
      } else {
        // In a quote that ends on this blank line, the blocks end with it.
        child.closeEnd = blank && quoted ? lineStart : end;
        indented = indented || child.name === 'listItem' || child.name === 'footnoteDefinition';
        // A footnote definition takes no indent on a blank line.
        need += getItemSize(child);
      }
      if (afterIndent && child.name === 'listItem') {
        // The indent of a footnote definition around is a token on this
        // line: an item that ends here ends at the line start, as the list.
        raiseIndentEnd(child, lineStart);
      }
      if (line.blank && !quoted && child.name === 'listItem' && !keepsEnding) {
        // A list item ends at its last content, or after the quote prefix of
        // this blank line when its last child kept its line ending. A quote
        // inside that continues on the line keeps the item open past it.
        child.closedAt?.(line.end, lineStart);
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
    this.startsNext = false;
    if (!hasLaterLine(state, line)) {
      // Before a final line ending, in a quote, the content ends as before a lazy line.
      // A footnote definition's indent alone does not count.
      this.lazyNext =
        this.quoteLine === line.index && hasQuoteBetween(state, 0, state.getDepth(this));
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
    const depth = state.getDepth(this);
    let footnote = -1;
    for (let i = 1; i < depth; i++) {
      const block = state.getBlock(i)!;
      if (
        block instanceof OpenContainerDirective &&
        isClosingFence(next, COLON, block.size) &&
        !hasQuoteBetween(state, i, depth)
      ) {
        // A directive around closes on the next line before its content reads
        // it, so this block's content ends with that content document. At the
        // end of a content document, micromark marks the next line lazy when
        // a block quote does not continue at EOF. List items and footnote
        // definitions do continue there, through their blank-line rule.
        return true;
      }
      if (!continuesNext(block, next, footnote)) {
        // micromark reads the line as lazy unless a container starts on it.
        this.startsNext = next.indent < 4 && isContainerStart(state, text, next.nonBlank, next.end);
        // A container that starts outside a directive around this block ends
        // that directive's content. When a quote in that content holds this
        // block, this block's content ends as before a lazy line.
        this.lazyNext = !this.startsNext || isQuotedInDirective(state, i, depth);
        return false;
      }
      // A definition that matched a line that is not blank (its indent, or right
      // after the indent of the one around) lets the next one follow it.
      footnote = block.name === 'footnoteDefinition' && !next.blank ? next.start : -1;
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
      hide(state, this.before, this.taken, children, this.depth + 1, this.scope);
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

/**
 * Whether `block`, a container around a directive, continues on `next`, a
 * later line; consumes its prefix. It reads the block as its own `continue`
 * would, without changing it. `footnote` is where the indent of a footnote
 * definition just before ended, or -1.
 */
function continuesNext(block: OpenBlock, next: Line, footnote: number): boolean {
  if (block instanceof OpenList) {
    // The list decides for its open item, which needs its indent.
    if (next.blank) {
      return true;
    }
    const item = block.item;
    if (item === undefined || item.furtherBlank || next.indent < item.size) {
      return false;
    }
    consumeColumns(next, item.size);
    return true;
  }
  if (block instanceof OpenContainerDirective) {
    if (block.indent > 0) {
      consumeColumns(next, block.indent);
    }
    return true;
  }
  switch (block.name) {
    case 'blockquote': {
      if (next.indent >= 4 || next.text.charCodeAt(next.nonBlank) !== GREATER_THAN) {
        return false;
      }
      advanceLine(next, next.nonBlank + 1);
      if (next.start < next.end && isSpaceOrTab(next.text.charCodeAt(next.start))) {
        consumeColumns(next, 1);
      }
      return true;
    }
    case 'footnoteDefinition': {
      if (next.blank || (next.indent === 0 && next.start === footnote)) {
        return true;
      }
      if (next.indent < 4) {
        return false;
      }
      consumeColumns(next, 4);
      return true;
    }
    default:
      // A list item continues where its list does.
      return true;
  }
}

/** Whether one of `blocks` is a block quote. */
function hasQuoteInside(blocks: TrackedContainer[]): boolean {
  for (const block of blocks) {
    if (block.name === 'blockquote') {
      return true;
    }
  }
  return false;
}

/**
 * Whether a block quote is open between the depths `outer` and `inner`, both
 * left out, above a container directive that is also between them.
 */
function isQuotedInDirective(state: BlockState, outer: number, inner: number): boolean {
  let directive = false;
  for (let depth = outer + 1; depth < inner; depth++) {
    const block = state.getBlock(depth);
    if (block instanceof OpenContainerDirective) {
      directive = true;
    } else if (directive && block?.name === 'blockquote') {
      return true;
    }
  }
  return false;
}

/** Whether a block quote is open between the depths `outer` and `inner`, both left out. */
function hasQuoteBetween(state: BlockState, outer: number, inner: number): boolean {
  for (let depth = outer + 1; depth < inner; depth++) {
    if (state.getBlock(depth)?.name === 'blockquote') {
      return true;
    }
  }
  return false;
}

/**
 * Makes a list item end at `end` or later. `indentEnd` is the end of the last
 * indent the item's walk back stops at (`src/blocks/list-item.ts`).
 */
function raiseIndentEnd(block: OpenBlock, end: number): void {
  if ('indentEnd' in block && typeof block.indentEnd === 'number' && block.indentEnd < end) {
    block.indentEnd = end;
  }
}

/** Columns of indent the open item of `block` needs, when it is a list; else 0. */
function getItemSize(block: OpenBlock): number {
  return block instanceof OpenList && block.item !== undefined ? block.item.size : 0;
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
    let open = openDirectives.get(state.source);
    if (open !== undefined && open.length > 0) {
      // Directives that did not match the line close when this block
      // attaches, without line endings. Close them first, so the inline
      // pass leaves their content before it reads this label (`scopes.ts`).
      const reached = state.getDepth(state.container);
      if (state.getDepth(open[open.length - 1]) > reached) {
        state.closeOpenBlocks(reached, { keepsLineEnding: false });
      }
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
    open.push(block);
    // The content is a document of its own, where quotes and lists start.
    state.containerStartsOff = false;
    linkChild(state.container, block);
    advanceLine(line, line.end);
    return block;
  },
};

/**
 * Runs first on every line that is not blank, and starts nothing. Each
 * directive that did not match the line closes on it: what its content
 * defined leaves the definition sets now, before a footnote definition on
 * the line adds its label (`scopes.ts`). After `endContent`, the blocks
 * inside close here, and the line is lazy again for the blocks that start.
 */
const directiveScope: BlockRule = {
  name: 'directiveScope',
  priority: 1,
  canInterruptParagraph: true,
  start(state: BlockState, line: Line): undefined {
    const open = openDirectives.get(state.source);
    if (open === undefined || open.length === 0) {
      return undefined;
    }
    const reached = state.getDepth(state.container);
    let ended = false;
    for (let i = open.length - 1; i >= 0; i--) {
      const directive = open[i];
      const depth = state.getDepth(directive);
      if (depth <= reached) {
        break;
      }
      if (directive.endedLine === line.index - 1) {
        // The content ended on the line before (`endContent`), so the core
        // shows this line as not lazy. That holds for the blocks inside,
        // which close now; blocks that start on the line are outside.
        state.closeOpenBlocks(depth, { keepsLineEnding: false });
        ended = true;
      }
      if (directive.taken === undefined && directive.before !== undefined) {
        directive.taken = takeEarly(state, directive.before);
      }
    }
    if (ended) {
      state.unmatched = true;
    }
    return undefined;
  },
};

export { directiveScope };
export default containerDirective;
