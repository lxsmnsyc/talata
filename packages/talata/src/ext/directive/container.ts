/* oxlint-disable typescript/no-unsafe-type-assertion -- reads the block parser's own fields and builds mdast nodes that @types/mdast lacks */
import type { BlockContent, DefinitionContent, Paragraph, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import { isSpaceOrTab } from '../../core/chars';
import { advanceLine, consumeColumns, createLine, measureLine } from '../../core/line';
import type { Line } from '../../core/line';
import { point, skipLineEnding } from '../../core/source';
import listItem from '../../blocks/list-item';
import footnoteDefinition from '../../gfm/footnote';
import html from '../../blocks/html';
import codeIndented, { isEmptyLastLine } from '../../blocks/code-indented';
import blockquoteRule, {
  isFlow,
  lastChildEnd,
  linkChild,
  matchedOnlyAtEnd,
  parentQuoteLine,
} from '../../blocks/blockquote';
import type { TrackedContainer } from '../../blocks/blockquote';
import { containerDirectiveDone, labelWithTrailing } from './fixes';
import { enter, hide, leave, snapshot, track } from './scopes';
import type { Inside, Scope, Snapshot } from './scopes';
import { COLON, readHead } from './syntax';
import type { Attributes } from './syntax';

/**
 * Whether `line` closes a directive opened with `size` colons: up to three
 * columns of indent, at least `size` colons, then only
 * spaces and tabs.
 */
function isClosingFence(line: Line, size: number): boolean {
  if (line.indent >= 4) {
    return false;
  }
  const text = line.text;
  const end = line.end;
  let i = line.nonBlank;
  const colons = i;
  while (i < end && text.charCodeAt(i) === COLON) {
    i++;
  }
  if (i - colons < size) {
    return false;
  }
  while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
    i++;
  }
  return i === end;
}

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

/**
 * Whether the next line starts a container: a quote, a list item or a
 * footnote definition, after any whitespace.
 */
function nextStartsContainer(state: BlockState, line: Line, markers: number): boolean {
  const text = state.source.text;
  let i = state.source.lineStarts[line.index + 1];
  // The quote markers of the quotes around the directive come first.
  for (;;) {
    while (isSpaceOrTab(text.charCodeAt(i))) {
      i++;
    }
    if (markers === 0 || text.charCodeAt(i) !== 62) {
      break;
    }
    i++;
    markers--;
  }
  if (markers === 0) {
    // All of them matched: the line continues the directive.
    return false;
  }
  const code = text.charCodeAt(i);
  if (code === 91) {
    return text.charCodeAt(i + 1) === 94;
  }
  let j = i;
  if (code === 42 || code === 43 || code === 45) {
    j++;
  } else {
    while (text.charCodeAt(j) >= 48 && text.charCodeAt(j) <= 57) {
      j++;
    }
    const mark = text.charCodeAt(j);
    if (j === i || (mark !== 46 && mark !== 41)) {
      return false;
    }
    j++;
  }
  const next = text.charCodeAt(j);
  return Number.isNaN(next) || next === 32 || next === 9 || next === 10 || next === 13;
}

/** Whether a real line, not the empty one after a final line ending, follows `line`. */
function hasLaterLine(state: BlockState, line: Line): boolean {
  const starts = state.source.lineStarts;
  return line.index + 1 < starts.length && starts[line.index + 1] < state.source.text.length;
}

/**
 * Whether every container above the closing directive continues over the
 * empty line after a final line ending. The block parser asks this only when
 * the tip is a leaf other than a paragraph (`closeKeepsLineEnding`); a
 * directive that ends the document with a paragraph or a container at its
 * tip needs the answer too, and the parser has no hook for it. The open
 * blocks are read from the parser itself: `stack` holds the blocks above this
 * one, because the parser removes a block before it closes it.
 */
function continuesOverEnd(state: BlockState): boolean {
  const parser = state as unknown as { stack: OpenBlock[]; container: OpenBlock };
  const stack = parser.stack;
  const text = state.source.text;
  const line = createLine(text);
  line.index = state.source.lineStarts.length - 1;
  line.start = text.length;
  line.end = text.length;
  measureLine(line);
  for (let i = 1; i < stack.length; i++) {
    parser.container = stack[i - 1];
    if (!stack[i].continue(state, line)) {
      return false;
    }
  }
  return true;
}

/**
 * Whether `block` continues over an empty line. A quote does not, and is not
 * asked: its continue marks the end of the document.
 */
function continuesOverEmpty(state: BlockState, block: OpenBlock, empty: Line): boolean {
  return block.name !== 'blockquote' && block.continue(state, empty);
}

let forcing = false;
const patched = new WeakSet<object>();

/**
 * The parser keeps the line ending of the blocks that a new container
 * closes. Blocks inside a directive that closes with them do not: for the
 * reference the directive's content is a document that ended before.
 */
function patchKeeps(state: BlockState): void {
  if (patched.has(state)) {
    return;
  }
  patched.add(state);
  const parser = state as unknown as {
    closeKeepsLineEnding: boolean;
    stack: OpenBlock[];
    containerIndex: number;
  };
  let value = parser.closeKeepsLineEnding;
  Object.defineProperty(parser, 'closeKeepsLineEnding', {
    configurable: true,
    get(): boolean {
      if (!value || forcing) {
        return value;
      }
      let directive = -1;
      for (let i = parser.containerIndex + 1; i < parser.stack.length; i++) {
        if (parser.stack[i].name === 'containerDirective') {
          directive = i;
        }
      }
      if (directive === -1) {
        return true;
      }
      // The innermost directive that closes ends its content here: the block
      // that closes keeps its line ending when the containers between them
      // continue over an empty line.
      const text = state.source.text;
      // A line that is not the last one, so no block thinks it is at the end.
      const empty = createLine(text + ' ');
      empty.index = -2;
      empty.start = text.length;
      empty.end = text.length;
      measureLine(empty);
      for (let i = directive + 1; i < parser.stack.length; i++) {
        const block = parser.stack[i];
        if (!(block.name === 'containerDirective')) {
          (parser as unknown as { container: OpenBlock }).container = parser.stack[i - 1];
          if (!continuesOverEmpty(state, block, empty)) {
            return false;
          }
        }
      }
      return true;
    },
    set(next: boolean) {
      value = next;
    },
  });
}

class OpenContainerDirective implements TrackedContainer {
  name = 'containerDirective';
  /**
   * The block parser reads this first to learn whether the blocks it closes
   * keep their line ending, which it does for a new container. A directive
   * is not a container for the reference, so the first read says no.
   */
  reads = 0;
  get isContainer(): boolean {
    return this.reads++ > 0;
  }
  acceptsLazy = false;
  quoteLine = -1;
  /** The open container inside. */
  inner: TrackedContainer | undefined = undefined;
  /** A container that starts outside closes this block: the chain of open containers stops here. */
  outside = false;
  get openChild(): TrackedContainer | undefined {
    if (this.outside) {
      this.outside = false;
      return undefined;
    }
    return this.inner;
  }
  set openChild(child: TrackedContainer | undefined) {
    this.inner = child;
  }
  closedAt(): void {
    this.outside = true;
  }
  closeEnd = -1;
  interruptLine = -1;
  size: number;
  /** Whitespace characters before the opening fence; content lines lose as many. */
  indent: number;
  node: { type: string; name: string; attributes: Attributes; children: RootContent[] };
  label: Paragraph | undefined;
  start: number;
  /** End of the last line the container matched. */
  end: number;
  closed = false;
  /** An outer directive set the end. */
  forced = false;
  /** Directive containers around this one. */
  depth: number;
  scope: Scope;
  before: Snapshot | undefined = undefined;

  constructor(
    size: number,
    indent: number,
    node: OpenContainerDirective['node'],
    label: Paragraph | undefined,
    start: number,
    end: number,
    depth: number,
  ) {
    this.depth = depth;
    this.scope = { started: false, start: end };
    this.size = size;
    this.indent = indent;
    this.node = node;
    this.label = label;
    this.start = start;
    this.end = end;
  }

  /**
   * Called on the first line after the opening one, or at the end. A
   * paragraph that the opening line closed has queued its inline content by
   * then, so this directive's content comes after it.
   */
  begin(state: BlockState): void {
    if (this.before === undefined) {
      track(state);
      this.before = snapshot(state);
      enter(state, this.scope);
    }
  }

  /**
   * Whether the blocks inside keep their line ending when they end here: every
   * container between this one and the tip continues over an empty line, as
   * the parser asks at the end of a document.
   */
  keepsFor(state: BlockState, line: Line): boolean {
    const parser = state as unknown as { stack: OpenBlock[]; container: OpenBlock };
    const stack = parser.stack;
    const empty = createLine(line.text + ' ');
    // No quote prefix is ever on this line, whatever the containers say.
    empty.index = -2;
    empty.start = line.end;
    empty.end = line.end;
    measureLine(empty);
    for (let i = stack.indexOf(this) + 1; i < stack.length - 1; i++) {
      parser.container = stack[i - 1];
      if (
        !(stack[i].name === 'containerDirective') &&
        !continuesOverEmpty(state, stack[i], empty)
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Closes the blocks inside as if the content stopped after the line before:
   * the reference hands the content to a document of its own.
   */
  closeInside(state: BlockState, line: Line, itself = false): void {
    const parser = state as unknown as {
      stack: OpenBlock[];
      closeKeepsLineEnding: boolean;
      closeTo(depth: number): void;
    };
    // Directives inside end where this one's content ends, when every
    // container between them continues over the empty line.
    {
      const empty = createLine(line.text + ' ');
      // No quote prefix is ever on this line, whatever the containers say.
      empty.index = -2;
      empty.start = line.end;
      empty.end = line.end;
      measureLine(empty);
      let chain = true;
      for (let i = parser.stack.indexOf(this) + 1; i < parser.stack.length; i++) {
        const inside = parser.stack[i];
        if (inside instanceof OpenContainerDirective) {
          if (chain) {
            inside.end = skipLineEnding(line.text, inside.end);
          }
          inside.forced = true;
        } else if (chain) {
          (parser as unknown as { container: OpenBlock }).container = parser.stack[i - 1];
          chain = continuesOverEmpty(state, inside, empty);
        }
      }
    }
    patchKeeps(state);
    parser.closeKeepsLineEnding = this.keepsFor(state, line);
    forcing = true;
    parser.closeTo(parser.stack.indexOf(this) - (itself ? 1 : 0));
    forcing = false;
    parser.closeKeepsLineEnding = false;
  }

  continue(state: BlockState, line: Line): boolean {
    // The prefixes of quotes around this block are not part of the content it
    // hands to blocks inside, but quotes around it still count for the blocks
    // inside that a new container closes.
    if (isVirtualLine(state, line)) {
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
    if (isClosingFence(line, this.size)) {
      this.closed = true;
      this.end = line.end;
      advanceLine(line, line.end);
      // This block ends with the line, so that nothing after it counts as
      // following an unmatched container.
      this.closeInside(state, line, true);
      return false;
    }
    const last = isEmptyLastLine(line);
    if (this.indent > 0) {
      consumeColumns(line, this.indent);
    }
    patchKeeps(state);
    const empty = line.start === line.end && line.partialTab === 0;
    const later = this.continuesAfter(state, line);
    const next =
      !later &&
      hasLaterLine(state, line) &&
      nextStartsContainer(state, line, this.quotesAround(state));
    if (last || (empty && !later && line.end < line.text.length && this.quoteLine === line.index)) {
      // Nothing is left of the last line: the blocks inside end after the
      // line ending before it. A line ending of this line stays in the
      // directive.
      const text = state.source.text;
      this.end = line.end < text.length ? line.end : skipLineEnding(text, this.end);
      if (next && this.quoteLine === line.index) {
        this.closeEnds(state, line);
      }
      if (hasLaterLine(state, line) && nextStartsContainer(state, line, this.quotesAround(state))) {
        // Directives and footnote definitions inside still take the blank line, the rest do not.
        const parser = state as unknown as { stack: OpenBlock[]; container: OpenBlock };
        for (let i = parser.stack.indexOf(this) + 1; i < parser.stack.length; i++) {
          const inside = parser.stack[i];
          if (inside.name === 'containerDirective') {
            (inside as OpenContainerDirective).end = skipLineEnding(text, line.end);
            continue;
          }
          if (inside.name !== 'footnoteDefinition') {
            break;
          }
          parser.container = parser.stack[i - 1];
          if (!inside.continue(state, line)) {
            break;
          }
        }
      }
      this.closeInside(state, line);
      return true;
    }
    if ((!empty || later || next) && this.quoteLine === line.index) {
      this.closeEnds(state, line);
    }
    this.end = line.end;
    return true;
  }

  /** Quotes around this block. */
  quotesAround(state: BlockState): number {
    const parser = state as unknown as { stack: OpenBlock[] };
    let count = 0;
    for (const open of parser.stack) {
      if (open === this) {
        break;
      }
      if (open.name === 'blockquote') {
        count++;
      }
    }
    return count;
  }

  /** Containers inside end at the start of this line if they close here. */
  closeEnds(state: BlockState, line: Line): void {
    for (
      let child: TrackedContainer | undefined = this.inner;
      child !== undefined;
      child = child.openChild
    ) {
      child.closeEnd = state.source.lineStarts[line.index];
      if (child.name === 'containerDirective') {
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
    if (!hasLaterLine(state, line)) {
      return false;
    }
    if (this.quoteLine !== line.index) {
      return true;
    }
    // One marker for each quote around this block.
    const parser = state as unknown as { stack: OpenBlock[] };
    let markers = this.quotesAround(state);
    let room = 3;
    for (const open of parser.stack) {
      if (open === this) {
        break;
      }
      if (open.name === 'listItem') {
        room += (open as unknown as { size: number }).size;
      }
    }
    const text = state.source.text;
    let i = state.source.lineStarts[line.index + 1];
    let column = 0;
    let from = 0;
    while (markers > 0) {
      for (let code = text.charCodeAt(i); isSpaceOrTab(code); code = text.charCodeAt(i)) {
        column = code === 9 ? column + 4 - (column % 4) : column + 1;
        i++;
      }
      // Whitespace after a marker starts with the column the quote takes.
      if (column - from > room || text.charCodeAt(i) !== 62) {
        return false;
      }
      i++;
      column++;
      from = column + 1;
      room = 3;
      markers--;
    }
    return true;
  }

  close(state: BlockState, children: RootContent[]): RootContent {
    let end = this.end;
    if (!this.closed && !this.forced) {
      const text = state.source.text;
      const next = skipLineEnding(text, end);
      const keeps = state.closeKeepsLineEnding;
      if (keeps || (next === text.length && next > end && continuesOverEnd(state))) {
        end = next;
      }
    }
    const childEnd = lastChildEnd(children);
    if (childEnd > end) {
      end = childEnd;
    }
    if (this.before !== undefined) {
      const inside = {
        definitions: new Map<string, number>(),
        footnotes: new Map<string, number>(),
      };
      collectIdentifiers(children, inside);
      hide(state, this.before, inside, this.depth + 1, this.scope);
    }
    this.begin(state);
    leave(state);
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
    containerDirectiveDone(state, node);
    (node as unknown as { position: unknown }).position = {
      start: point(state.source, this.start),
      end: point(state.source, end),
    };
    return node as unknown as RootContent;
  }
}

/** Identifiers of the definitions in `nodes`, leaving out the directives inside, which hid their own. */
function collectIdentifiers(nodes: RootContent[], into: Inside): void {
  for (const node of nodes) {
    if (node.type === 'definition' || node.type === 'footnoteDefinition') {
      const map = node.type === 'definition' ? into.definitions : into.footnotes;
      map.set(node.identifier, (map.get(node.identifier) ?? 0) + 1);
    }
    if (node.type !== ('containerDirective' as string) && 'children' in node) {
      collectIdentifiers(node.children, into);
    }
  }
}

function trailing(state: BlockState, label: Paragraph, start: number, end: number): void {
  const text = state.source.text;
  let from = end;
  while (from > start && isSpaceOrTab(text.charCodeAt(from - 1))) {
    from--;
  }
  if (from < end) {
    labelWithTrailing(state, label, from, end);
  }
}

/** `:::name[label]{attributes}` up to a closing `:::`. */
const containerDirective: BlockRule = {
  // Not 'directiveContainer': the frontmatter extension drops rules of that name
  // after an unclosed fence, but the reference still starts a directive there.
  name: 'directiveFence',
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
        state.inline(label, [head.labelStart, head.labelEnd]);
        trailing(state, label, head.labelStart, head.labelEnd);
      }
    }
    const indent = line.indent;
    const end = line.end;
    const parent = state.container;
    let depth = 0;
    // Only the directives that matched this line are around the new one.
    const parser = state as unknown as { stack: OpenBlock[]; containerIndex: number };
    for (let level = 1; level <= parser.containerIndex; level++) {
      if (parser.stack[level].name === 'containerDirective') {
        depth++;
      }
    }
    const node = {
      type: 'containerDirective',
      name: head.name,
      attributes: head.attributes,
      children: [],
    };
    const block = new OpenContainerDirective(size, indent, node, label, start, end, depth);
    linkChild(parent, block);
    advanceLine(line, end);
    return block;
  },
};

const lazyHtml: BlockRule = {
  ...html,
  name: 'directiveHtml',
  priority: 399,
  start(state: BlockState, line: Line): OpenBlock | undefined {
    const block = html.start(state, line);
    if (block !== undefined && state.lazy && inUnmatchedDirective(state)) {
      // A line the directive does not take cannot keep it open.
      block.keepsLazyContainers = false;
    }
    return block;
  },
};

function inUnmatchedDirective(state: BlockState): boolean {
  const parser = state as unknown as { stack: OpenBlock[]; containerIndex: number };
  for (let i = parser.containerIndex + 1; i < parser.stack.length; i++) {
    if (parser.stack[i].name === 'containerDirective') {
      return true;
    }
  }
  return false;
}

/**
 * A paragraph at the tip of an unmatched directive cannot be continued, so
 * indented code may start where the block parser sees a lazy line.
 */
export const directiveCode: BlockRule = {
  name: 'directiveCode',
  priority: 799,
  canInterruptParagraph: true,
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (state.paragraph === undefined || !state.lazy || line.indent < 4) {
      return undefined;
    }
    return inUnmatchedDirective(state) ? codeIndented.start(state, line) : undefined;
  },
};

/** True when a directive container matched the line, so the line is in its content. */
function insideDirective(state: BlockState): boolean {
  const parser = state as unknown as { stack: OpenBlock[]; containerIndex: number };
  for (let i = 1; i <= parser.containerIndex; i++) {
    if (parser.stack[i].name === 'containerDirective') {
      return true;
    }
  }
  return false;
}

function insideOnly(rule: BlockRule, name: string): BlockRule {
  return {
    ...rule,
    name,
    priority: rule.priority + 1,
    start: (state, line) => (insideDirective(state) ? rule.start(state, line) : undefined),
  };
}

/**
 * Quotes, lists and footnote definitions inside a directive. After an
 * unclosed frontmatter fence the frontmatter extension drops these rules from
 * the document, but the content of a directive is a document of its own for the
 * reference, so they start there.
 */
export const insideRules: BlockRule[] = [
  insideOnly(blockquoteRule, 'directiveBlockquote'),
  insideOnly(listItem, 'directiveListItem'),
  insideOnly(footnoteDefinition, 'directiveFootnoteDefinition'),
];

export { lazyHtml };
export default containerDirective;
