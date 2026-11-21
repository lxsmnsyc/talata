import type { Paragraph, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock, OpenParagraph } from '../../core/blocks';
import { paragraphIndents } from '../../blocks/paragraph';
import { matchedOnlyAtEnd } from '../../blocks/blockquote';
import { isEmptyLastLine } from '../../blocks/code-indented';
import type { Line } from '../../core/line';
import { advanceLine, createLine, isLastLine, measureLine } from '../../core/line';
import { point } from '../../core/source';
import { MdxError, span } from './error';
import endsInText from './lookahead';
import { flowError } from './order';
import { prefixEnd } from './prefixes';
import { found, interruptAt, isFence, isRun, tableCells } from './reread';
import { DONE, FLOW, MORE, NOK, Scanner } from './scanner';
import type { Item } from './scanner';
import { dropNode, dropParagraph, flowMarker, markSource, nodesBefore, nodesMarker } from './tags';

// The flow construct: a line that holds only JSX tags and expressions
// (`<a>`, `{b}`, `<c d="e" />  {f}`), as `jsxFlow` of
// micromark-extension-mdx-jsx and the flow expression of
// micromark-extension-mdx-expression read it. Like fenced code it is
// concrete: once it starts, the lines it spans go to it, and a lazy line or
// the end of the content inside it is an error.

const SPACE = 32;

/**
 * The whitespace an expression keeps at the start of `line`: what is left
 * after its container prefixes, with the first 2 characters dropped (a tab
 * counts its extra columns as characters). micromark eats them as a line
 * prefix.
 */
function keptWhitespace(line: Line): string {
  const text = line.text;
  let result = '';
  let skipped = 0;
  for (let v = line.partialTab; v > 0; v--) {
    if (skipped < 2) {
      skipped++;
    } else {
      result += ' ';
    }
  }
  let column = line.visualColumn + line.partialTab;
  for (let i = line.start; i < line.nonBlank; i++) {
    if (text.charCodeAt(i) === SPACE) {
      column++;
      if (skipped < 2) {
        skipped++;
      } else {
        result += ' ';
      }
      continue;
    }
    const width = 4 - (column % 4);
    column += width;
    if (skipped < 2) {
      skipped++;
      for (let v = 1; v < width; v++) {
        if (skipped < 2) {
          skipped++;
        } else {
          result += ' ';
        }
      }
    } else {
      result += '\t';
    }
  }
  return result;
}

// The open flow construct whose last line ended inside a tag or expression,
// and the parse it belongs to. `mdxFlowScope` records where a lazy line
// after it starts.
let pending: OpenMdxFlow | undefined;
let pendingState: BlockState | undefined;

/**
 * A syntax error in flow: thrown at once outside container directives,
 * else it waits (`order.ts`) and the lines read as a paragraph. Returns NOK.
 */
function failWith(state: BlockState, bound: number, error: unknown, at: number): number {
  if (!(error instanceof MdxError)) {
    throw error;
  }
  flowError(state, bound, error, at);
  return NOK;
}

const LEAVES = new Set(['codeFenced', 'mathFlow', 'directiveLeaf', 'headingAtx', 'thematicBreak']);

/** A line for the rules of leaf blocks read again. */
function scratchLine(state: BlockState, start: number, end: number): Line {
  const line = createLine(state.source.text, state.rules.indentLimit);
  line.index = -3;
  line.start = start;
  line.end = end;
  measureLine(line);
  return line;
}

/**
 * The node of a leaf block (fenced code, math, a leaf directive, an ATX
 * heading, a thematic break) on lines `from` to `to` of `lines`, read again
 * by its own rule, or undefined.
 */
function leafBlock(
  state: BlockState,
  lines: number[],
  from: number,
  to: number,
): RootContent | undefined {
  return openLeaf(state, lines, from, to)?.close(state, []);
}

/** The open leaf block on lines `from` to `to` of `lines`, as `leafBlock` reads it. */
function openLeaf(
  state: BlockState,
  lines: number[],
  from: number,
  to: number,
): OpenBlock | undefined {
  const code = state.source.text.charCodeAt(lines[from]);
  if (code >= 128) {
    return undefined;
  }
  for (const rule of state.rules.blockByChar[code]) {
    if (!LEAVES.has(rule.name)) {
      continue;
    }
    const open = rule.start(state, scratchLine(state, lines[from], lines[from + 1]));
    if (open === undefined) {
      continue;
    }
    for (let i = from + 2; i <= to; i += 2) {
      const line = scratchLine(state, lines[i], lines[i + 1]);
      if (!open.continue(state, line)) {
        break;
      }
      open.addLine?.(state, line);
    }
    return open;
  }
  return undefined;
}

/** Whether `text` from `start` to `end` is a run of `marker` and trailing whitespace. */
function isUnderline(text: string, start: number, end: number, marker: number): boolean {
  let i = start;
  while (i < end && text.charCodeAt(i) === marker) {
    i++;
  }
  while (i < end && (text.charCodeAt(i) === SPACE || text.charCodeAt(i) === 9)) {
    i++;
  }
  return i === end;
}

function neverContinue(): boolean {
  return false;
}

function closeNothing(): undefined {
  return undefined;
}

// One scanner for first lines; a construct that spans lines keeps it.
let shared = new Scanner();

class OpenMdxFlow implements OpenBlock {
  name = 'mdxFlow';
  /** Content start of the first line, read as `OpenParagraph.start` once the construct failed. */
  start: number;
  isContainer = false;
  acceptsLazy = false;
  keepsLazyContainers = false;
  /** Set while the construct continues on the next line. */
  scanner: Scanner | undefined;
  items: Item[] = [];
  /** True when the construct turned out to be a paragraph (text after a tag on a later line). */
  failed = false;
  /** True when the paragraph of a failed construct ended inside it. */
  ended = false;
  /** Paragraphs the failed lines made before the one this block goes on as. */
  heads: RootContent[] = [];
  /** Fenced code or math the failed lines left open: it takes the next lines. */
  inner: OpenBlock | undefined;
  /** The marker of a container directive the failed lines left open, or -1; and its size. */
  fence = -1;
  fenceSize = 0;
  /** Flat [start, end) pairs of the lines, for the paragraph. */
  lines: number[];
  indents: number[] | undefined;
  lastLine: number;
  /** Offset where a lazy line after `lastLine` starts, or -1. */
  lazyAt = -1;
  /**
   * The paragraph it interrupted on a line it did not finish; the block
   * parser closed it. micromark is still trying the construct, so when it
   * fails the paragraph goes on.
   */
  interrupted: OpenParagraph | undefined;
  /** Its paragraph node while a construct that interrupts it is still open (`join`). */
  deferred: Paragraph | undefined;
  /** The `indents` triple of the first line, for a paragraph it joins. */
  firstIndent: number[];
  /** Depth of the container it is in (for `flowError`). */
  bound = 0;
  /**
   * End of the construct with the whitespace after it. A list item around
   * ends there, so the marker node does too.
   */
  end = 0;

  constructor(line: Line) {
    this.lines = [line.nonBlank, line.end];
    this.start = line.nonBlank;
    this.lastLine = line.index;
    this.firstIndent =
      line.nonBlank !== line.start || line.partialTab !== 0
        ? [line.end, line.start, line.partialTab]
        : [];
  }

  continue(state: BlockState, line: Line): boolean {
    if (this.name === 'paragraph') {
      return !line.blank;
    }
    if (this.inner !== undefined) {
      return this.inner.continue(state, line);
    }
    if (this.fence !== -1) {
      // Inside a directive that the failed lines opened: up to its fence.
      if (isFence(line.text, line.start, line.end, this.fence, this.fenceSize)) {
        this.fence = -1;
      }
      return true;
    }
    if (this.ended) {
      return false;
    }
    const scanner = this.scanner;
    if (scanner === undefined) {
      return false;
    }
    let result: number;
    try {
      if (isEmptyLastLine(line)) {
        // micromark ends the content before an empty last line in a
        // container, or reads it as lazy when a quote matched it only there.
        const at = state.source.lineStarts[line.index];
        if (matchedOnlyAtEnd(state, line)) {
          scanner.feed(at, at, false, '', at, true);
        }
        scanner.feedEnd(at);
        scanner.run();
      }
      scanner.feed(
        line.nonBlank,
        line.end,
        isLastLine(line),
        keptWhitespace(line),
        line.start,
        false,
      );
      result = scanner.run();
    } catch (error) {
      result = failWith(state, this.bound, error, line.start);
      // The error waits; nothing after it in this content shows.
      this.ended = true;
    }
    if (result === MORE) {
      return true;
    }
    this.scanner = undefined;
    pending = undefined;
    if (result === DONE) {
      this.items = scanner.items;
      this.end = scanner.pos;
      this.finishInterrupted(state);
      return true;
    }
    // Text after the last tag: the reference reads the lines as a paragraph.
    // Blocks may interrupt it from the next line on (see `addLine`).
    this.failed = true;
    return true;
  }

  addLine(state: BlockState, line: Line): void {
    this.lastLine = line.index;
    if (this.inner !== undefined) {
      this.inner.addLine?.(state, line);
      return;
    }
    if (line.nonBlank !== line.start || line.partialTab !== 0) {
      this.indents ??= [];
      this.indents.push(line.end, line.start, line.partialTab);
    }
    this.lines.push(line.nonBlank, line.end);
    advanceLine(line, line.end);
    if (this.failed && this.ended) {
      this.lines.length = 0;
    } else if (this.failed && this.name !== 'paragraph') {
      // The lines read again as flow, without containers. When one of them
      // ends the paragraph, its text fails on the open tag, and the lines
      // after it do not show. Else the block is a paragraph from the next
      // line on: lazy lines, setext underlines and interrupts as for any.
      let from = 2;
      const interrupted = this.interrupted;
      if (interrupted?.lines.length === 0) {
        // Definitions took every line: the paragraph starts where it did.
        this.start = interrupted.start;
      } else if (interrupted !== undefined) {
        from = interrupted.lines.length + 2;
        this.join(state, interrupted);
      }
      this.interrupted = undefined;
      let spans: number[];
      try {
        spans = interruptAt(state, this.bound, this.lines, from);
      } catch (error) {
        failWith(state, this.bound, error, line.start);
        spans = [this.lines.length - 2, this.lines.length - 2];
      }
      if (spans.length > 0) {
        // Paragraphs before, between and after the lines that end them.
        // The first fails on the open tag when its text has it as a tag.
        // The one after the last goes on as this block.
        const tail = this.rereadNodes(state, spans);
        if (found.tableAt !== -1) {
          // Each header cell is a text chunk of its own.
          const cells = tableCells(
            state.source.text,
            this.lines[found.tableAt],
            this.lines[found.tableAt + 1],
          );
          for (let i = 0; i < cells.length; i += 2) {
            state.inline({ children: [] }, [cells[i], cells[i + 1]]);
          }
        }
        this.lines = this.lines.slice(tail);
        this.start = this.lines.length > 0 ? this.lines[0] : this.start;
        this.fence = found.openFence;
        this.fenceSize = found.openFenceSize;
      }
      if (this.lines.length === 0) {
        this.ended = true;
      } else {
        this.name = 'paragraph';
        if (this.heads.length > 0) {
          // A setext underline or a table may take this block as their
          // paragraph without closing it: the transform puts the nodes
          // before then before the node that starts here.
          nodesBefore(state.source, this.start, this.heads);
        }
      }
    }
  }

  /**
   * The paragraph it interrupted goes on with this block's lines. A failed
   * construct before it left its node without text (`deferred`): this block
   * takes its arrays and drops that node, in time linear in the new lines.
   * A paragraph of the block parser has its node and its text queued: the
   * transform drops the node, its text is parsed from no ranges, and this
   * block copies its lines.
   */
  join(state: BlockState, interrupted: OpenParagraph): void {
    if (interrupted instanceof OpenMdxFlow && interrupted.deferred !== undefined) {
      dropNode(interrupted.deferred);
      markSource(state.source);
      interrupted.deferred = undefined;
      const lines = interrupted.lines;
      for (const offset of this.lines) {
        lines.push(offset);
      }
      const indents = interrupted.indents ?? [];
      for (const value of this.firstIndent) {
        indents.push(value);
      }
      for (const value of this.indents ?? []) {
        indents.push(value);
      }
      this.lines = lines;
      this.indents = indents;
    } else {
      const lines = interrupted.lines;
      dropParagraph(state.source, lines[0], lines[lines.length - 1]);
      this.indents = [
        ...(paragraphIndents(interrupted) ?? []),
        ...this.firstIndent,
        ...(this.indents ?? []),
      ];
      this.lines = [...lines, ...this.lines];
      lines.length = 0;
    }
    this.start = interrupted.start;
  }

  /** The construct ended: the failed construct it interrupted gets its text now. */
  finishInterrupted(state: BlockState): void {
    const interrupted = this.interrupted;
    this.interrupted = undefined;
    if (interrupted instanceof OpenMdxFlow && interrupted.deferred !== undefined) {
      state.inline(interrupted.deferred, interrupted.lines, interrupted.inlineIndents());
      interrupted.deferred = undefined;
    }
  }

  /** The `indents` to queue with the lines. */
  inlineIndents(): number[] | undefined {
    // An array, empty or not: lines without an entry have no whitespace
    // after their containers, as for a paragraph of more than one line.
    return this.lines.length > 2 ? (this.indents ?? []) : this.indents;
  }

  /**
   * Nodes for `lines`, read as a paragraph: definitions at its start (the
   * paragraph prefix rules), then the paragraph with its text queued.
   */
  paragraphNodes(state: BlockState, lines: number[]): RootContent[] {
    const out: RootContent[] = [];
    const open: OpenParagraph = {
      name: 'paragraph',
      isContainer: false,
      acceptsLazy: false,
      lines,
      start: lines[0],
      continue: neverContinue,
      close: closeNothing,
    };
    for (const rule of state.rules.paragraphPrefixRules) {
      if (open.lines.length === 0) {
        break;
      }
      rule.consume(state, open, out);
    }
    if (open.lines.length > 0) {
      out.push(this.paragraph(state, open.lines));
    }
    return out;
  }

  /**
   * The nodes of the lines read again, up to the last span: paragraphs
   * between the spans, and on the spans the tags and expressions, setext
   * headings, and the leaf blocks their own rules read. Returns the index
   * in the lines where the paragraph this block goes on as starts.
   */
  rereadNodes(state: BlockState, spans: number[]): number {
    const text = state.source.text;
    const lines = this.lines;
    const heads = this.heads;
    let segment = 0;
    for (let k = 0; k < spans.length; k += 2) {
      const from = spans[k];
      let paragraph: RootContent | undefined;
      if (from > segment) {
        for (const node of this.paragraphNodes(state, lines.slice(segment, from))) {
          heads.push(node);
          paragraph = node;
        }
      }
      segment = spans[k + 1] + 2;
      const items = found.constructs[k / 2];
      if (items !== undefined) {
        markSource(state.source);
        heads.push(flowMarker(state.source, items, items[items.length - 1].end));
        continue;
      }
      const code = text.charCodeAt(lines[from]);
      if (
        from === spans[k + 1] &&
        (code === 61 || code === 45) &&
        isUnderline(text, lines[from], lines[from + 1], code)
      ) {
        if (paragraph?.type === 'paragraph') {
          // A setext underline: the paragraph before is its heading.
          Object.assign(paragraph, { type: 'heading', depth: code === 61 ? 1 : 2 });
          paragraph.position!.end = point(state.source, lines[from + 1]);
          continue;
        }
        if (code === 61 || !isRun(text, lines[from], lines[from + 1], code, 3, true)) {
          // No paragraph before: the line is text of the next paragraph.
          segment = from;
          continue;
        }
      }
      if (k + 2 === spans.length && found.openFence !== -1 && found.openFence !== 58) {
        // Code or math left open: this block reads its next lines into it.
        this.inner = openLeaf(state, lines, from, spans[k + 1]);
        if (this.inner !== undefined) {
          found.openFence = -1;
          continue;
        }
      }
      const node = leafBlock(state, lines, from, spans[k + 1]);
      if (node !== undefined) {
        heads.push(node);
      }
    }
    return segment;
  }

  /** A paragraph of `lines`, its text queued. */
  paragraph(state: BlockState, lines: number[]): Paragraph {
    const node: Paragraph = {
      type: 'paragraph',
      children: [],
      position: span(state.source, lines[0], lines[lines.length - 1]),
    };
    // An array, empty or not: lines without an entry have no whitespace
    // after their containers, as for a paragraph of more than one line.
    state.inline(node, lines, lines.length > 2 ? (this.indents ?? []) : this.indents);
    return node;
  }

  close(state: BlockState): RootContent | undefined {
    const scanner = this.scanner;
    if (scanner !== undefined) {
      this.scanner = undefined;
      pending = undefined;
      try {
        this.fail(state, scanner);
      } catch (error) {
        failWith(state, this.bound, error, this.lines[this.lines.length - 1]);
        this.failed = true;
      }
    }
    if (this.interrupted !== undefined) {
      if (this.failed) {
        this.join(state, this.interrupted);
        this.interrupted = undefined;
      } else {
        this.finishInterrupted(state);
      }
    }
    if (this.failed) {
      const nodes = this.heads;
      nodesBefore(state.source, this.start, undefined);
      const inner = this.inner?.close(state, []);
      if (inner !== undefined) {
        nodes.push(inner);
      }
      if (this.lines.length > 0) {
        if (pending?.interrupted === this) {
          // A construct that does not end on its line interrupts it: until
          // that one ends or fails, the paragraph has no text.
          this.deferred = {
            type: 'paragraph',
            children: [],
            position: span(state.source, this.lines[0], this.lines[this.lines.length - 1]),
          };
          nodes.push(this.deferred);
        } else {
          nodes.push(this.paragraph(state, this.lines));
        }
      }
      if (nodes.length <= 1) {
        return nodes[0];
      }
      markSource(state.source);
      return nodesMarker(state.source, nodes);
    }
    const items = this.items;
    const first = items[0];
    if (items.length === 1 && first.kind === 'expression' && first.end === this.end) {
      const node = {
        type: 'mdxFlowExpression',
        value: first.value,
        position: span(state.source, first.start, first.end),
      };
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- not in @types/mdast
      return node as unknown as RootContent;
    }
    markSource(state.source);
    return flowMarker(state.source, items, this.end);
  }

  /**
   * The construct is still open when the block closes: the line after it is
   * lazy (an error in flow), or the content ends (the end of the document or
   * a container that starts), which the scanner reads as the end of file.
   */
  fail(state: BlockState, scanner: Scanner): never {
    const source = state.source;
    const next = this.lastLine + 1;
    const at = next < source.lineStarts.length ? source.lineStarts[next] : source.text.length;
    if (!state.closeKeepsLineEnding) {
      if (this.lazyAt === -1) {
        // A line that a quote around does not take is lazy.
        const after = prefixEnd(state, this.bound, at);
        if (after !== -1) {
          scanner.feed(after, after, false, '', after, true);
        }
      } else {
        scanner.feed(this.lazyAt, this.lazyAt, false, '', this.lazyAt, true);
      }
    }
    scanner.feedEnd(at);
    scanner.run();
    // A scanner fed the end of file always throws.
    throw new Error('unreachable: open MDX construct at ' + JSON.stringify(point(source, at)));
  }
}

/** Tags and expressions on a line of their own. */
export const mdxFlow: BlockRule = {
  name: 'mdxFlow',
  priority: 320,
  canInterruptParagraph: true,
  triggers: '<{',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= line.indentLimit) {
      return undefined;
    }
    if (
      pendingState === state &&
      pending?.lazyAt === line.start &&
      pending.lastLine === line.index - 1
    ) {
      // A lazy line after an open construct: the construct fails first.
      return undefined;
    }
    const scanner = shared;
    let result: number;
    try {
      scanner.begin(state.source, FLOW, line.nonBlank, line.end, isLastLine(line));
      result = scanner.run();
    } catch (error) {
      result = failWith(state, state.getDepth(state.container), error, line.nonBlank);
    }
    if (result === NOK) {
      return undefined;
    }
    if (result === MORE && state.tip?.interruptible === true && endsInText(state, line, scanner)) {
      // micromark is still trying the construct at the line ending: when it
      // fails, the table it would interrupt goes on.
      return undefined;
    }
    const block = new OpenMdxFlow(line);
    // In a lazy paragraph it interrupts, it goes in the paragraph's container.
    block.bound =
      result === MORE && state.lazy && state.paragraph !== undefined
        ? state.getDepth(state.paragraph) - 1
        : state.getDepth(state.container);
    if (result === MORE) {
      block.interrupted = state.paragraph;
    }
    if (result === DONE) {
      block.items = scanner.items;
      block.end = scanner.pos;
    } else {
      block.scanner = scanner;
      // micromark is still trying the construct at the line ending, so a
      // lazy paragraph it interrupts stays open, and the containers too.
      block.keepsLazyContainers = true;
      shared = new Scanner();
      pending = block;
      pendingState = state;
    }
    advanceLine(line, line.end);
    return block;
  },
};

/**
 * For `mdxFlowScope`: when `line` did not reach the open flow construct of
 * the line before, records where it starts after the containers that
 * matched. A lazy line error points there.
 */
export function noteLazyLine(state: BlockState, line: Line): void {
  if (pending !== undefined && pendingState === state && pending.lastLine === line.index - 1) {
    pending.lazyAt = line.start;
  }
}
