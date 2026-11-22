import type { Paragraph, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import { consumeColumns } from '../../core/line';
import type { Line } from '../../core/line';
import type { Source } from '../../core/source';
import { point } from '../../core/source';
import { SPAN_SIZE } from '../../core/spans';
import type { Spans } from '../../core/spans';
import { matchedOnlyAtEnd, parentQuoteLine } from '../../blocks/blockquote';
import { isClosingFence } from '../../blocks/code-fenced';
import { isEmptyLastLine } from '../../blocks/code-indented';
import { footnoteIndentAt } from '../../gfm/footnote';
import { NEXT_LATER, NEXT_NONE, NEXT_STARTS, readContentLine } from './gaps';
import { queueLabel } from './labels';
import { COLON, readHead } from './syntax';
import type { Attributes } from './syntax';

// Container directives, as `micromark-extension-directive` reads them: the
// opening fence starts a concrete leaf that collects the raw lines of its
// content, after the containers around took their prefixes, up to a closing
// fence, a lazy line or the end of its flow. The content is a document of
// its own, parsed later from the chunk queue (`BlockState.document`).

/** The spans of a directive's content, with what follows its last line (`NEXT_*` in `gaps.ts`). */
interface ContentSpans extends Spans {
  next: number;
}

interface Node {
  type: string;
  name: string;
  attributes: Attributes;
  children: RootContent[];
}

class OpenContainerDirective implements OpenBlock {
  name = 'containerDirective';
  isContainer = false;
  acceptsLazy = false;
  size: number;
  /** Whitespace columns before the opening fence; content lines lose up to as many. */
  indent: number;
  node: Node;
  start: number;
  /** Line index and end of the opening line. */
  openIndex: number;
  openEnd: number;
  /**
   * The end of the directive when a line ended it: the closing fence, or an
   * empty last line (the line ending before it is part of the directive);
   * -1 otherwise.
   */
  endedAt = -1;
  /** Index of the line of the closing fence, or -1. */
  fenceLine = -1;
  /** Spans of the content lines. Shares the document's own while `shared`. */
  data: number[];
  from: number;
  to: number;
  shared: boolean;
  /** Indexes of the content lines on which a quote prefix or footnote indent around matched. */
  quoted: Set<number> | undefined = undefined;
  /** Indexes of the content lines on which a footnote definition around took its indent. */
  indents: Set<number> | undefined = undefined;
  /** Line index and end of the last content line, or -1. */
  lastIndex = -1;
  lastEnd = -1;

  constructor(
    state: BlockState,
    size: number,
    indent: number,
    node: Node,
    start: number,
    line: Line,
  ) {
    this.size = size;
    this.indent = indent;
    this.node = node;
    this.start = start;
    this.openIndex = line.index;
    this.openEnd = line.end;
    // A nested document's lines are spans already: content lines that the
    // directive and the containers around leave whole are a run of them.
    const spans = documentSpans(state);
    if (spans === undefined) {
      this.data = [];
      this.from = 0;
      this.shared = false;
    } else {
      this.data = spans.data;
      this.from = spans.from + (line.index + 1 - spans.data[spans.from * SPAN_SIZE]);
      this.shared = true;
    }
    this.to = this.from;
  }

  continue(state: BlockState, line: Line): boolean {
    if (this.endedAt !== -1) {
      return false;
    }
    // The closing fence is read before the directive's own indent. The
    // directive does not take it: `closingFence` does, so the directive
    // closes on this line (an MDX re-read sees it close at its fence).
    if (isClosingFence(line, COLON, this.size)) {
      this.endedAt = line.end;
      this.fenceLine = line.index;
      return false;
    }
    // A quote around that matched an empty last line only through its
    // end-of-file rule does not give the line to the directive.
    return !(isEmptyLastLine(line) && matchedOnlyAtEnd(state, line));
  }

  addLine(state: BlockState, line: Line): void {
    const empty = line.start === line.end && line.partialTab === 0;
    if (this.indent > 0) {
      consumeColumns(line, this.indent);
    }
    if (isEmptyLastLine(line)) {
      // The directive ends after what its own indent took, or at the line
      // start when the containers took the whole line.
      this.endedAt = empty ? state.source.lineStarts[line.index] : line.end;
      return;
    }
    this.addSpan(line);
    if (parentQuoteLine(state.container) === line.index) {
      (this.quoted ??= new Set()).add(line.index);
    }
    if (footnoteIndentAt(state, state.source.lineStarts[line.index])) {
      (this.indents ??= new Set()).add(line.index);
    }
    this.lastIndex = line.index;
    this.lastEnd = line.end;
    line.start = line.end;
  }

  /** What follows the last line of the content, as `close` sees it. */
  getNext(state: BlockState): number {
    if (this.endedAt !== -1) {
      return NEXT_LATER;
    }
    if (!state.closeKeepsLineEnding) {
      return NEXT_NONE;
    }
    const index = this.lastIndex === -1 ? this.openIndex : this.lastIndex;
    if (state.source.lineStarts[index + 1] < state.end) {
      // A container starts on the next line of this document.
      return NEXT_STARTS;
    }
    // This document ends: what follows it follows this content too.
    const spans = documentSpans(state);
    return spans === undefined ? NEXT_NONE : spans.next;
  }

  addSpan(line: Line): void {
    if (this.shared) {
      const at = this.to * SPAN_SIZE;
      const data = this.data;
      if (
        at < data.length &&
        data[at] === line.index &&
        data[at + 1] === line.start &&
        data[at + 2] === line.end &&
        data[at + 3] === line.visualColumn &&
        data[at + 4] === line.partialTab
      ) {
        this.to++;
        return;
      }
      // The line differs from the document's: copy the run so far.
      this.data = data.slice(this.from * SPAN_SIZE, at);
      this.to -= this.from;
      this.from = 0;
      this.shared = false;
    }
    this.data.push(line.index, line.start, line.end, line.visualColumn, line.partialTab);
    this.to++;
  }

  close(state: BlockState): RootContent {
    const source = state.source;
    let next = this.getNext(state);
    let endedAt = this.endedAt;
    let to = this.to;
    const at = (to - 1) * SPAN_SIZE;
    if (
      endedAt === -1 &&
      !state.closeKeepsLineEnding &&
      to > this.from &&
      this.data[at + 1] === this.data[at + 2] &&
      this.data[at + 4] === 0
    ) {
      // A lazy line, or the end of a document whose containers do not go on
      // over it, follows an empty last line: micromark checks that before
      // the line starts a chunk, so the content ends after the line ending
      // before it, and the directive where the line is.
      endedAt = this.data[at + 2];
      to--;
      next = NEXT_LATER;
    }
    const finalLineEnding = endedAt !== -1 || state.closeKeepsLineEnding;
    const last = to - 1;
    const quoted = this.quoted;
    const indents = this.indents;
    const spans: ContentSpans = {
      data: this.data,
      from: this.from,
      to,
      finalLineEnding,
      next,
      onLine(inner: BlockState, line: Line, k: number): void {
        readContentLine(inner, line, k, last, next, quoted, indents);
      },
    };
    state.document(this.node, spans);
    let end: number;
    if (endedAt !== -1) {
      end = endedAt;
    } else if (finalLineEnding) {
      const index = this.lastIndex === -1 ? this.openIndex : this.lastIndex;
      end = source.lineStarts[index + 1];
    } else {
      end = this.lastIndex === -1 ? this.openEnd : this.lastEnd;
    }
    markContainers(source);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const result = this.node as unknown as RootContent;
    result.position = { start: point(source, this.start), end: point(source, end) };
    return result;
  }
}

/** The spans of the nested document `state` reads, or undefined at the source. */
function documentSpans(state: BlockState): ContentSpans | undefined {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- made in `close`
  return state.spans as ContentSpans | undefined;
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

/** The closing fence of a container directive: takes its line and emits nothing. */
const fenceLeaf: OpenBlock = {
  name: 'directiveContainerFence',
  isContainer: false,
  acceptsLazy: false,
  continue(): boolean {
    return false;
  },
  close(): undefined {
    return undefined;
  },
};

/**
 * The line of the closing fence that the open directive at the tip found in
 * its `continue`. Starting a block there closes the directive.
 */
export const closingFence: BlockRule = {
  name: 'directiveContainerFence',
  priority: 1,
  canInterruptParagraph: false,
  triggers: ':',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    const tip = state.tip;
    if (!(tip instanceof OpenContainerDirective) || tip.fenceLine !== line.index) {
      return undefined;
    }
    line.start = line.end;
    return fenceLeaf;
  },
};

/** `:::name[label]{attributes}` up to a closing `:::`. */
const containerDirective: BlockRule = {
  name: 'directiveContainer',
  priority: 340,
  canInterruptParagraph: true,
  triggers: ':',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= line.indentLimit) {
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
    const node: Node = {
      type: 'containerDirective',
      name: head.name,
      attributes: head.attributes,
      children: [],
    };
    if (head.labelStart !== -1) {
      const label: Paragraph = {
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
      node.children.push(label);
    }
    const block = new OpenContainerDirective(state, size, line.indent, node, start, line);
    line.start = line.end;
    return block;
  },
};

export default containerDirective;
