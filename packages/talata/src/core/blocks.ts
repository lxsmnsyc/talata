import type { PhrasingContent, RootContent } from 'mdast';
import { isTracked } from '../blocks/blockquote';
import type { TrackedContainer } from '../blocks/blockquote';
import { footnoteIndentLine, setFootnoteIndent } from '../gfm/footnote';
import openParagraph from '../blocks/paragraph';
import thematicBreak, { isThematicBreak } from '../blocks/thematic-break';
import { CR, LF } from './chars';
import { documentPass, textPass } from './chunks';
import type { ChunkQueue } from './chunks';
import { createLine, isLastLine, measureLine } from './line';
import type { Line } from './line';
import type { Registry } from './registry';
import { SPAN_SIZE } from './spans';
import type { Spans } from './spans';
import type { DocumentState, ParseOptions } from './state';
import type { Source } from './source';

/** State that block rules see. One object per parse. */
export interface BlockState extends DocumentState {
  /** The innermost open container that matched the current line. New blocks go here. */
  container: OpenBlock;
  /**
   * The open paragraph at the tip of the open blocks, if any. It is set even
   * when the current line did not reach it through all containers; then
   * `lazy` is true.
   */
  paragraph: OpenParagraph | undefined;
  /** True when `paragraph` is set but the current line did not match all containers above it. */
  lazy: boolean;
  /**
   * The open leaf at the tip when every container matched the line, whether
   * or not it continued; undefined otherwise. Lists refuse some starts after
   * indented code (`    a\n2. b`), as after a paragraph.
   */
  tip: OpenBlock | undefined;
  /**
   * True when an open container did not match the line and no container
   * started on it (micromark's lazy line, with or without a paragraph).
   * Indented code that starts on such a line ends with it.
   */
  unmatched: boolean;
  /**
   * Index of the last line a block quote matched only through its
   * end-of-file rule (nothing after an outer quote prefix on a last line
   * with no line ending), or -1. micromark treats that line as lazy for the
   * quote, so fenced code and HTML inside end before it.
   */
  endOnlyLine: number;
  /**
   * True while open blocks close because a container starts on the current
   * line, or because the document ends after a line ending that every open
   * container continues over. micromark then keeps the line ending after the
   * last line of a fenced code or HTML block (kinds 1 to 5) in that block.
   */
  closeKeepsLineEnding: boolean;
  /**
   * True: rules with `opensContainer` do not start for the rest of the
   * document. micromark stops looking for containers after a construct that
   * it tries to the end of the document and fails (an unclosed frontmatter
   * fence). A rule sets it from `start`. Containers that are not CommonMark
   * containers, such as directives, do not set `opensContainer` and keep
   * starting; a rule may set the flag back to false.
   */
  containerStartsOff: boolean;
  /**
   * Index in the open blocks of `block` (0 is the document), or -1 when it is
   * not open. The counterpart of `getBlock`.
   */
  getDepth(block: OpenBlock): number;
  /**
   * The open block at `depth` (0 is the document), or undefined. Read it to
   * ask the containers around a block; the counterpart of `getDepth`. Do not
   * close or change what it returns.
   */
  getBlock(depth: number): OpenBlock | undefined;
  /**
   * Removes the open paragraph so a rule can convert it (setext headings).
   * Paragraph prefix rules run first, so definitions at its start become
   * nodes. A rule calls it before it knows whether it starts: when it returns
   * undefined (no matched paragraph, or definitions consumed every line), the
   * rule returns undefined too. When it returns a paragraph, the rule must
   * return a block.
   */
  takeParagraph(): OpenParagraph | undefined;
  /**
   * Removes the last `count` lines of the matched open paragraph and returns
   * them as flat [start, end) pairs. The lines left close as a paragraph
   * (prefix rules first), before the block the rule returns. GFM tables use it
   * for the header row. Prefix rules do not see the removed lines. Returns
   * undefined, changing nothing, when the paragraph is lazy or has fewer than
   * `count` lines. When it returns lines, the rule must return a block.
   */
  splitParagraph(count: number): number[] | undefined;
  /**
   * Opens `block` as an extra container from inside `BlockRule.start`, before
   * the block the rule returns. That block then goes inside it. List items use
   * it to open the list. A rule that calls it must return a block: the line
   * restore after a failed start does not undo it.
   */
  openContainer(block: OpenBlock): void;
  /**
   * Schedules inline parsing of `ranges` into `node.children` after all
   * blocks close. `indents` holds flat triples for lines with whitespace
   * after their container prefixes: line ending offset, offset after the
   * prefixes, split-tab columns (`OpenParagraph` keeps them).
   */
  inline(node: { children: PhrasingContent[] }, ranges: number[], indents?: number[]): void;
  /** 0 for the source, d for the content of a container directive inside d - 1 others. */
  readonly depth: number;
  /** End offset of this document's last line: the source length, or the end of the last span. Look-ahead stops here. */
  readonly end: number;
  /** The lines of this document when it is the content of a container directive; undefined for the source. */
  readonly spans: Spans | undefined;
  /**
   * From `BlockRule.start`, when the leaf it returns may still fail on a
   * later line (an MDX flow tag or expression that does not end on its line,
   * ESM). The paragraph or interruptible leaf at the tip, the one `attach`
   * would close, comes off the stack without closing ("held"). The core
   * records this line, from where `tryStart` began, and every later line of
   * this document's flow, until `commit` or `rewind`. The leaf must be
   * concrete (no `interruptible`), and `start` must return it. At most one
   * mark is open per document.
   */
  mark(): FlowMark;
  /**
   * From `continue` of the marked leaf, on the line where it succeeds. The
   * held leaf closes now (prefix rules, then its inline chunk), so its node
   * comes before the marked leaf's. Recording stops.
   */
  commit(mark: FlowMark): void;
  /**
   * From `addLine` of the marked leaf, on the line where it fails (its
   * `continue` returned true for that line). The marked leaf leaves the
   * stack without `close`, the held leaf is the tip again, and the recorded
   * lines are read again, this one included. On the first recorded line the
   * candidates up to and including `rule` are skipped. `processLine` returns
   * after `addLine` returns.
   */
  rewind(mark: FlowMark, rule: BlockRule): void;
  /**
   * From `close` of a container directive: queues `spans` as the document at
   * depth `this.depth + 1`, at `documentPass(this.depth + 1)`, ordered by the
   * first span's start. Its nodes go into `node.children` when it runs.
   * Nothing is queued for empty content.
   */
  document(node: { children: RootContent[] }, spans: Spans): void;
}

/** Opaque to rules. */
export interface FlowMark {
  /** Index of its first line among the recorded lines. */
  readonly line: number;
}

export interface BlockRule {
  name: string;
  /** Lower runs first. */
  priority: number;
  /** True when the rule may start while a paragraph is open (the rule can still refuse). */
  canInterruptParagraph: boolean;
  /**
   * ASCII characters that can be the first non-blank character of the rule's
   * line. Leave it out for rules that do not start with a fixed character
   * (indented code); those run for every line.
   */
  triggers?: string;
  /** True: only registered when `options.gfm` is true. */
  gfm?: boolean;
  /**
   * True for rules that start CommonMark containers (quote, list item,
   * footnote definition). They are skipped while `BlockState.containerStartsOff`.
   */
  opensContainer?: boolean;
  /**
   * Tries to start a block on the rest of `line`. On success, consume the
   * block's prefix from `line` (containers) or handle the whole line
   * (leaves), and return the open block. On failure, return undefined; the
   * parser restores `start`, `visualColumn` and `partialTab`.
   * A container must consume at least one character or column: after a
   * container that consumed nothing, no more rules run on the line.
   */
  start(state: BlockState, line: Line): OpenBlock | undefined;
}

export interface OpenBlock {
  /** The rule or node name, such as 'paragraph' or 'blockquote'. */
  name: string;
  isContainer: boolean;
  /**
   * Called on each open block that a starting container closes, innermost
   * first and before any of them closes. It runs for container starts only.
   */
  willClose?(state: BlockState, line: Line): void;
  /** Containers: a paragraph inside may continue on a line that does not match this container. */
  acceptsLazy: boolean;
  /**
   * Leaves other than paragraphs: when true, block rules run on each line
   * this block continues on, and a block that starts closes it. Only lines
   * no rule starts go to `addLine`. GFM table bodies use it.
   */
  interruptible?: boolean;
  /**
   * Leaves: when true and the block interrupts a lazy paragraph on a line
   * that has a line ending, the containers that did not match stay open and
   * the block goes in the paragraph's container. micromark cannot finish the
   * interrupt check of kind 7 HTML before the next line, so it does not exit
   * those containers (`> a\n<x>\n> c` keeps `<x>\nc` in the quote).
   */
  keepsLazyContainers?: boolean;
  /**
   * Containers: whether `block` may be a direct child. When a new block
   * starts and the matched container refuses it, the container closes, and
   * so on up. A list accepts only list items. Leave it out to accept all.
   */
  canContain?(block: OpenBlock): boolean;
  /**
   * Whether the block continues on `line`. Containers consume their prefix.
   * Leaves return false to close. A leaf that returns true gets `addLine`.
   * `line.end === line.text.length` means this is the last line and it has
   * no line ending.
   */
  continue(state: BlockState, line: Line): boolean;
  /** Leaves that take more than their first line. */
  addLine?(state: BlockState, line: Line): void;
  /**
   * Builds the mdast node with its position. `children` holds the closed
   * child nodes of a container (empty for leaves). Return undefined to emit
   * nothing.
   */
  close(state: BlockState, children: RootContent[]): RootContent | undefined;
  /**
   * Marked leaves: the line is lazy for this leaf (a container around it did
   * not match and no container started). Called before any leaf rule runs on
   * the line and before the leaf closes. `line.start` is after the prefixes
   * that matched. An MDX construct throws its lazy-line error here.
   */
  onLazyLine?(state: BlockState, line: Line): void;
}

export interface OpenParagraph extends OpenBlock {
  /** Flat pairs of [start, end) offsets, one pair per line: content start to line end. */
  lines: number[];
  /**
   * Content start of the first line as opened. Prefix rules do not change it.
   * The reference starts a setext heading here, before any definitions.
   */
  start: number;
}

/**
 * Runs when a paragraph closes or is taken, before it becomes a node.
 * Definitions use it to consume link reference definitions from the start of
 * the paragraph.
 */
export interface ParagraphPrefixRule {
  name: string;
  priority: number;
  gfm?: boolean;
  /** Push the nodes it builds to `out` and remove the lines it consumed from the front of `paragraph.lines`. */
  consume(state: BlockState, paragraph: OpenParagraph, out: RootContent[]): void;
}

const NO_CHILDREN: RootContent[] = [];

export function isParagraph(block: OpenBlock): block is OpenParagraph {
  return block.name === 'paragraph';
}

const document: OpenBlock = {
  name: 'root',
  isContainer: true,
  acceptsLazy: true,
  continue(): boolean {
    return true;
  },
  close(): undefined {
    return undefined;
  },
};

/**
 * The root of a nested document. It has the fields of a tracked container
 * (`TrackedContainer` in `blocks/blockquote.ts`), so the blocks inside link
 * to it and read its `quoteLine`. micromark's events of the content
 * interleave with the prefixes of the containers around, so a quote prefix
 * or footnote indent there counts as a token for the blocks inside, as one
 * around them in the same document would. `Spans.onLine` sets `quoteLine`.
 */
function createNestedRoot(): TrackedContainer {
  return {
    name: 'root',
    isContainer: true,
    acceptsLazy: true,
    quoteLine: -1,
    openChild: undefined,
    closeEnd: -1,
    interruptLine: -1,
    continue(): boolean {
      return true;
    },
    close(): undefined {
      return undefined;
    },
  };
}

/**
 * Numbers per recorded line: index, start, end, visual column, split-tab
 * columns, matched, unmatched, flags, and where its facts start in
 * `BlockParser.facts` and how many open blocks they cover.
 */
const RECORD_SIZE = 10;
/** Record flags: `line.last`. */
const LAST = 1;

/** A flow mark while it is open. */
class OpenMark implements FlowMark {
  line = 0;
  /** The marked leaf, once its rule's `start` returned it. */
  block: OpenBlock | undefined = undefined;
  /** The leaf that came off the stack without closing, and its children. */
  held: OpenBlock | undefined;
  heldChildren: RootContent[];
  /** Index in the stack of the container of the marked leaf's flow. */
  containerIndex: number;

  constructor(held: OpenBlock | undefined, heldChildren: RootContent[], containerIndex: number) {
    this.held = held;
    this.heldChildren = heldChildren;
    this.containerIndex = containerIndex;
  }
}

/**
 * The block parser of one document: the source, or the content of a
 * container directive. Its document layer (`processLine`) decides the
 * containers of each line once; the flow layer (`flowLine`) reads the leaves
 * of the innermost matched container and can go back to a mark.
 */
export class BlockParser implements BlockState {
  source: Source;
  options: ParseOptions;
  definitions: Set<string>;
  footnotes: Set<string>;
  rules: Registry;
  queue: ChunkQueue;
  depth: number;
  end: number;
  container: OpenBlock = document;
  paragraph: OpenParagraph | undefined = undefined;
  lazy = false;
  tip: OpenBlock | undefined = undefined;
  unmatched = false;
  endOnlyLine = -1;
  closeKeepsLineEnding = false;
  containerStartsOff = false;
  /** The line `run` reuses. */
  line!: Line;
  /** Open blocks from the document to the tip. */
  stack: OpenBlock[] = [document];
  /** Closed child nodes of each open block, parallel to `stack`. */
  children: RootContent[][] = [[]];
  /** Index in `stack` of `container`. */
  containerIndex = 0;
  /** The lines of a nested document, or undefined for the source. */
  spans: Spans | undefined;
  /** The pass of this document's text chunks. */
  textPass: number;
  /** The open flow mark, if any. */
  flowMark: OpenMark | undefined = undefined;
  /** Lines recorded while a mark is open, `RECORD_SIZE` numbers each. */
  records: number[] = [];
  /**
   * Per recorded line, what the document layer left for the flow to read:
   * the footnote indent line (`footnoteIndentAt`), then the `quoteLine` of
   * each open block (-1 when it is not tracked). A replay puts them back.
   */
  facts: number[] = [];
  /** While a replay runs: the index of the next record it reads; -1 otherwise. */
  replayAt = -1;
  /** While a replay runs: the container of the rewound mark's flow, and the `unmatched` of the line. */
  replayContainer = 0;
  replayUnmatched = false;
  /** The rule a rewind skips through on the first replayed line. */
  skipRule: BlockRule | undefined = undefined;
  /** The deepest open block that matched the current line, or the last container that started on it. */
  lineMatched = 0;

  constructor(state: DocumentState, spans?: Spans, depth = 0) {
    this.source = state.source;
    this.options = state.options;
    this.definitions = state.definitions;
    this.footnotes = state.footnotes;
    this.rules = state.rules;
    this.queue = state.queue;
    this.spans = spans;
    this.depth = depth;
    this.textPass = textPass(depth, 0);
    this.end =
      spans === undefined || spans.to <= spans.from
        ? state.source.text.length
        : spans.data[(spans.to - 1) * SPAN_SIZE + 2];
    if (spans !== undefined) {
      const root = createNestedRoot();
      this.container = root;
      this.stack[0] = root;
    }
  }

  /** Parses all lines and returns the document's children. */
  run(): RootContent[] {
    const line = createLine(this.source.text, this.rules.indentLimit);
    this.line = line;
    if (this.spans === undefined) {
      this.readSource(line);
    } else {
      this.readSpans(line, this.spans);
    }
    this.closeTo(0);
    this.closeKeepsLineEnding = false;
    return this.children[0];
  }

  /** The line source of the source text. */
  readSource(line: Line): void {
    const text = this.source.text;
    const starts = this.source.lineStarts;
    let count = starts.length;
    // A line ending at the end of the text does not start a real line.
    if (starts[count - 1] === text.length) {
      count--;
    }
    for (let i = 0; i < count; i++) {
      let end = text.length;
      if (i + 1 < starts.length) {
        end = starts[i + 1] - 1;
        if (end > starts[i] && text.charCodeAt(end) === LF && text.charCodeAt(end - 1) === CR) {
          end--;
        }
      }
      line.index = i;
      line.start = starts[i];
      line.end = end;
      line.visualColumn = 0;
      line.partialTab = 0;
      line.last = end === text.length;
      measureLine(line);
      this.processLine(line);
    }
    if (count < starts.length) {
      this.closeKeepsLineEnding = this.continuesOverEnd(line, starts.length - 1);
    }
  }

  /** The line source of a nested document. */
  readSpans(line: Line, spans: Spans): void {
    const data = spans.data;
    const to = spans.to;
    for (let k = spans.from; k < to; k++) {
      const at = k * SPAN_SIZE;
      line.index = data[at];
      line.start = data[at + 1];
      line.end = data[at + 2];
      line.visualColumn = data[at + 3];
      line.partialTab = data[at + 4];
      line.last = k === to - 1 && !spans.finalLineEnding;
      measureLine(line);
      spans.onLine?.(this, line, k);
      this.processLine(line);
    }
    if (spans.finalLineEnding && to > spans.from) {
      this.closeKeepsLineEnding = this.continuesOverEnd(line, data[(to - 1) * SPAN_SIZE] + 1);
    }
  }

  /**
   * After a final line ending: whether every open block above the tip
   * continues on the empty line `index` after it, read from the line start.
   * Asked for every tip, so a container or a paragraph at the tip sees the
   * answer in `closeKeepsLineEnding` as a leaf does.
   */
  continuesOverEnd(line: Line, index: number): boolean {
    const stack = this.stack;
    const at = this.source.lineStarts[index];
    line.index = index;
    line.start = at;
    line.end = at;
    line.visualColumn = 0;
    line.partialTab = 0;
    line.last = true;
    measureLine(line);
    for (let i = 1; i < stack.length - 1; i++) {
      this.container = stack[i - 1];
      if (!stack[i].continue(this, line)) {
        return false;
      }
    }
    return true;
  }

  /** The document layer: the open containers continue on `line`, then the flow reads the rest. */
  processLine(line: Line): void {
    const stack = this.stack;
    const mark = this.flowMark;
    if (mark !== undefined) {
      this.processMarkedLine(line, mark);
      return;
    }
    let matched = 0;
    for (let i = 1; i < stack.length; i++) {
      const block = stack[i];
      this.container = stack[i - 1];
      if (!block.continue(this, line)) {
        break;
      }
      matched = i;
      if (!block.isContainer) {
        // A matched leaf other than a paragraph takes the line as content,
        // unless it is interruptible and a block starts.
        if (!isParagraph(block) && block.interruptible !== true) {
          block.addLine?.(this, line);
          return;
        }
        break;
      }
    }
    this.flowLine(line, matched, undefined);
  }

  /**
   * `processLine` while the tip is a marked leaf. When every container
   * matched, the line is recorded and goes to the leaf. Otherwise only
   * container rules run first: a container that starts closes the leaf, and
   * with none the line is lazy for the leaf (`onLazyLine`), which closes.
   */
  processMarkedLine(line: Line, mark: OpenMark): void {
    const stack = this.stack;
    const top = stack.length - 1;
    const leaf = stack[top];
    let matched = 0;
    for (let i = 1; i < top; i++) {
      this.container = stack[i - 1];
      if (!stack[i].continue(this, line)) {
        break;
      }
      matched = i;
    }
    if (matched === top - 1) {
      const records = this.records;
      const at = records.length;
      records.push(
        line.index,
        line.start,
        line.end,
        line.visualColumn,
        line.partialTab,
        matched,
        0,
        line.last ? LAST : 0,
        this.facts.length,
        top,
      );
      this.recordFacts(top);
      this.container = stack[top - 1];
      if (leaf.continue(this, line)) {
        if (this.flowMark === mark) {
          records[at + 5] = top;
        }
        leaf.addLine?.(this, line);
        return;
      }
      // The leaf ended without `commit` or `rewind`: it closes as committed.
      this.flowLine(line, matched, undefined);
      return;
    }
    this.containerIndex = matched;
    this.container = stack[matched];
    this.paragraph = undefined;
    this.lazy = false;
    this.tip = undefined;
    this.unmatched = true;
    this.lineMatched = matched;
    if (!line.blank) {
      const start = line.start;
      const partialTab = line.partialTab;
      const block = this.tryStartContainer(line);
      if (block !== undefined) {
        this.attachStarted(line, block, start, partialTab, false);
        return;
      }
    }
    leaf.onLazyLine?.(this, line);
    this.closeTo(top - 1);
    this.flowLine(line, matched, undefined);
  }

  /**
   * The flow layer: the part of `processLine` after the containers, with
   * `matched` the deepest open block that continued. In a replay containers
   * do not start, `containerIndex` is the rewound mark's and `unmatched` the
   * recorded value; `skip` is the rewound rule on the first replayed line.
   */
  flowLine(line: Line, matched: number, skip: BlockRule | undefined): void {
    const replaying = this.replayAt >= 0;
    const stack = this.stack;
    const deepest = stack[matched];
    // A matched leaf other than a paragraph takes the line as content, unless
    // it is interruptible and a block starts.
    const leaf = !deepest.isContainer && !isParagraph(deepest);
    if (leaf && deepest.interruptible !== true) {
      deepest.addLine?.(this, line);
      return;
    }

    const top = stack.length - 1;
    const tip = stack[top];
    const paragraph = !leaf && isParagraph(tip) ? tip : undefined;
    if (replaying) {
      this.containerIndex = this.replayContainer;
    } else {
      this.containerIndex = deepest.isContainer ? matched : matched - 1;
    }
    this.container = stack[this.containerIndex];
    this.paragraph = paragraph;
    this.lazy = paragraph !== undefined && matched !== top;
    if (this.lazy && !this.allowsLazy(matched, top)) {
      // A container that refuses lazy lines ends the paragraph: rules see none.
      this.paragraph = undefined;
      this.lazy = false;
    }
    this.tip = !tip.isContainer && matched >= top - 1 ? tip : undefined;
    if (replaying) {
      this.unmatched = this.replayUnmatched;
    } else {
      this.unmatched = this.containerIndex < (tip.isContainer ? top : top - 1);
    }
    this.lineMatched = matched;

    if (!line.blank) {
      const start = line.start;
      const partialTab = line.partialTab;
      const block = this.tryStart(
        line,
        skip === undefined ? 0 : this.candidatesAfter(line, skip),
        replaying,
      );
      if (block !== undefined) {
        this.attachStarted(line, block, start, partialTab, replaying);
        return;
      }
    }

    if (leaf) {
      deepest.addLine?.(this, line);
      return;
    }
    if (paragraph !== undefined && this.lazy && !line.blank) {
      paragraph.addLine!(this, line);
      return;
    }
    // A replay closes no container, even on a lazy first line.
    this.closeTo(replaying && matched < this.containerIndex ? this.containerIndex : matched);
    const last = stack[stack.length - 1];
    if (isParagraph(last)) {
      last.addLine!(this, line);
    } else if (!line.blank) {
      this.attach(openParagraph(this, line));
    }
  }

  /**
   * Adds `block`, which started on `line` at `start` and `partialTab`, then
   * runs the rules again on the rest of the line after a container. A line
   * left without a leaf goes to a paragraph.
   */
  attachStarted(
    line: Line,
    block: OpenBlock,
    start: number,
    partialTab: number,
    noContainers: boolean,
  ): void {
    const stack = this.stack;
    let current = block;
    let from = start;
    let tab = partialTab;
    for (;;) {
      if (
        this.lazy &&
        current.keepsLazyContainers === true &&
        !isLastLine(line) &&
        this.flowMark?.block !== current
      ) {
        // Close only the paragraph; the block takes its place.
        this.containerIndex = stack.length - 2;
      }
      this.attach(current);
      this.paragraph = undefined;
      this.lazy = false;
      this.tip = undefined;
      this.unmatched = false;
      if (!current.isContainer) {
        return;
      }
      this.lineMatched = stack.length - 1;
      if ((line.start === from && line.partialTab === tab) || line.blank) {
        // The container consumed nothing; running rules again would loop.
        break;
      }
      from = line.start;
      tab = line.partialTab;
      const next = this.tryStart(line, 0, noContainers);
      if (next === undefined) {
        break;
      }
      current = next;
    }
    const last = stack[stack.length - 1];
    if (isParagraph(last)) {
      last.addLine!(this, line);
    } else if (!line.blank) {
      this.attach(openParagraph(this, line));
    }
  }

  /**
   * Runs the candidate rules for the rest of `line` from candidate `from`,
   * without the rules that open containers when `noContainers`. Restores the
   * line after each failure.
   */
  tryStart(line: Line, from: number, noContainers: boolean): OpenBlock | undefined {
    const code = line.text.charCodeAt(line.nonBlank);
    const rules = this.rules;
    const candidates = code < 128 ? rules.blockByChar[code] : rules.blockOther;
    const start = line.start;
    const visualColumn = line.visualColumn;
    const partialTab = line.partialTab;
    for (let k = from; k < candidates.length; k++) {
      const rule = candidates[k];
      if (this.paragraph !== undefined && !rule.canInterruptParagraph) {
        continue;
      }
      if (rule.opensContainer === true && (this.containerStartsOff || noContainers)) {
        continue;
      }
      const block = rule.start(this, line);
      if (block !== undefined) {
        const mark = this.flowMark;
        if (mark !== undefined && mark.block === undefined) {
          this.markStarted(mark, line, block, start, visualColumn, partialTab);
        }
        return block;
      }
      if (this.flowMark !== undefined && this.flowMark.block === undefined) {
        throw new Error(`Block rule ${rule.name} called mark() and returned no block`);
      }
      if (
        line.start !== start ||
        line.visualColumn !== visualColumn ||
        line.partialTab !== partialTab
      ) {
        line.start = start;
        line.visualColumn = visualColumn;
        line.partialTab = partialTab;
        measureLine(line);
      }
    }
    return undefined;
  }

  /** `tryStart` with only the rules that open containers. */
  tryStartContainer(line: Line): OpenBlock | undefined {
    const code = line.text.charCodeAt(line.nonBlank);
    const rules = this.rules;
    const candidates = code < 128 ? rules.blockByChar[code] : rules.blockOther;
    const start = line.start;
    const visualColumn = line.visualColumn;
    const partialTab = line.partialTab;
    // micromark's list start refuses a thematic break line while that
    // construct is on. Elsewhere the thematic break rule runs first; here
    // only container rules run.
    if (
      (code === 42 || code === 45) &&
      line.indent < line.indentLimit &&
      isThematicBreak(line.text, line.nonBlank, line.end) &&
      candidates.includes(thematicBreak)
    ) {
      return undefined;
    }
    for (const rule of candidates) {
      if (rule.opensContainer !== true || this.containerStartsOff) {
        continue;
      }
      const block = rule.start(this, line);
      if (block !== undefined) {
        return block;
      }
      line.start = start;
      line.visualColumn = visualColumn;
      line.partialTab = partialTab;
      measureLine(line);
    }
    return undefined;
  }

  /** Index of the candidate after `rule` among the candidates for `line`. */
  candidatesAfter(line: Line, rule: BlockRule): number {
    const code = line.text.charCodeAt(line.nonBlank);
    const candidates = code < 128 ? this.rules.blockByChar[code] : this.rules.blockOther;
    return candidates.indexOf(rule) + 1;
  }

  /**
   * Adds `block` under the current container: closes unmatched blocks, then
   * containers that refuse it.
   */
  attach(block: OpenBlock): void {
    this.closeKeepsLineEnding = block.isContainer;
    const stack = this.stack;
    // Blocks that a starting container closes hear it first, innermost first.
    // No extension uses the hook now; it stays because without this call V8
    // inlines `attach` differently and the readmes input parses 7% slower.
    for (let i = this.closeKeepsLineEnding ? stack.length - 1 : 0; i > this.containerIndex; i--) {
      stack[i].willClose?.(this, this.line);
    }
    this.closeTo(this.containerIndex);
    while (stack.length > 1) {
      const parent = stack[stack.length - 1];
      if (parent.canContain === undefined || parent.canContain(block)) {
        break;
      }
      this.closeTip();
    }
    this.closeKeepsLineEnding = false;
    stack.push(block);
    this.children.push(block.isContainer ? [] : NO_CHILDREN);
    if (block.isContainer) {
      this.containerIndex = stack.length - 1;
      this.container = block;
    } else {
      this.containerIndex = stack.length - 2;
      this.container = stack[this.containerIndex];
    }
  }

  openContainer(block: OpenBlock): void {
    this.attach(block);
    this.paragraph = undefined;
    this.lazy = false;
    this.tip = undefined;
    this.unmatched = false;
  }

  allowsLazy(matched: number, top: number): boolean {
    for (let i = matched + 1; i < top; i++) {
      if (!this.stack[i].acceptsLazy) {
        return false;
      }
    }
    return true;
  }

  getDepth(block: OpenBlock): number {
    return this.stack.lastIndexOf(block);
  }

  getBlock(depth: number): OpenBlock | undefined {
    return this.stack[depth];
  }

  /** Closes open blocks until `depth` is the tip. */
  closeTo(depth: number): void {
    while (this.stack.length - 1 > depth) {
      this.closeTip();
    }
  }

  closeTip(): void {
    const block = this.stack.pop()!;
    const children = this.children.pop()!;
    const parent = this.children[this.children.length - 1];
    if (this.containerIndex >= this.stack.length) {
      this.containerIndex = this.stack.length - 1;
      this.container = this.stack[this.containerIndex];
    }
    const mark = this.flowMark;
    if (mark?.block === block) {
      // A marked leaf that closes without `commit` or `rewind` (a container
      // started, a lazy line, the end of the document) closes as committed.
      this.endMark(mark, parent);
    }
    if (isParagraph(block)) {
      this.runPrefixRules(block, parent);
      if (block.lines.length === 0) {
        return;
      }
    }
    const node = block.close(this, children);
    if (node !== undefined) {
      parent.push(node);
    }
  }

  runPrefixRules(paragraph: OpenParagraph, out: RootContent[]): void {
    for (const rule of this.rules.paragraphPrefixRules) {
      if (paragraph.lines.length === 0) {
        return;
      }
      rule.consume(this, paragraph, out);
    }
  }

  takeParagraph(): OpenParagraph | undefined {
    const paragraph = this.paragraph;
    // An empty paragraph was already taken on this line (see below).
    if (paragraph === undefined || this.lazy || paragraph.lines.length === 0) {
      return undefined;
    }
    this.stack.pop();
    this.children.pop();
    this.runPrefixRules(paragraph, this.children[this.children.length - 1]);
    if (paragraph.lines.length === 0) {
      // Definitions took every line. The rules after this one still see a
      // paragraph being interrupted, as in micromark (`[a]: /u\n-` gives a
      // paragraph "-", not an empty list item).
      return undefined;
    }
    this.paragraph = undefined;
    return paragraph;
  }

  splitParagraph(count: number): number[] | undefined {
    const paragraph = this.paragraph;
    if (paragraph === undefined || this.lazy || count < 1) {
      return undefined;
    }
    const lines = paragraph.lines;
    if (count * 2 > lines.length) {
      return undefined;
    }
    const taken = lines.splice(lines.length - count * 2);
    if (lines.length === 0) {
      this.stack.pop();
      this.children.pop();
    } else {
      this.closeTip();
    }
    this.paragraph = undefined;
    return taken;
  }

  inline(node: { children: PhrasingContent[] }, ranges: number[], indents?: number[]): void {
    this.queue.text(this.textPass, node, ranges, indents);
  }

  document(node: { children: RootContent[] }, spans: Spans): void {
    if (spans.to <= spans.from) {
      return;
    }
    const depth = this.depth + 1;
    this.queue.add(documentPass(depth), spans.data[spans.from * SPAN_SIZE + 1], () => {
      for (const child of parseDocument(this, spans, depth)) {
        node.children.push(child);
      }
    });
  }

  mark(): FlowMark {
    if (this.flowMark !== undefined) {
      throw new Error('A flow mark is already open in this document');
    }
    const stack = this.stack;
    const tip = stack[stack.length - 1];
    let held: OpenBlock | undefined;
    let heldChildren = NO_CHILDREN;
    // The paragraph `attach` would close, lazy or not, or an interruptible
    // leaf that matched the line, stays open off the stack while the marked
    // leaf is tried. micromark keeps the containers of a lazy line open only
    // for a lazy paragraph: a table there closes with them.
    if (this.paragraph === tip || (this.tip === tip && tip.interruptible === true)) {
      held = tip;
      stack.pop();
      heldChildren = this.children.pop()!;
      this.containerIndex = stack.length - 1;
      this.container = stack[this.containerIndex];
    }
    const mark = new OpenMark(held, heldChildren, this.containerIndex);
    this.flowMark = mark;
    return mark;
  }

  /** The rule that took `mark` returned `block`: records the line from where `tryStart` began. */
  markStarted(
    mark: OpenMark,
    line: Line,
    block: OpenBlock,
    start: number,
    visualColumn: number,
    partialTab: number,
  ): void {
    mark.block = block;
    if (this.replayAt >= 0) {
      // A replayed line is recorded already.
      mark.line = this.replayAt - 1;
      return;
    }
    const records = this.records;
    mark.line = records.length / RECORD_SIZE;
    records.push(
      line.index,
      start,
      line.end,
      visualColumn,
      partialTab,
      this.lineMatched,
      this.unmatched ? 1 : 0,
      line.last ? LAST : 0,
      this.facts.length,
      this.stack.length,
    );
    this.recordFacts(this.stack.length);
  }

  /** Records the facts of the current line for the first `count` open blocks. */
  recordFacts(count: number): void {
    const facts = this.facts;
    const stack = this.stack;
    facts.push(footnoteIndentLine(this));
    for (let i = 0; i < count; i++) {
      const block = stack[i];
      facts.push(isTracked(block) ? block.quoteLine : -1);
    }
  }

  /** Puts back the facts of the record at `at`. */
  restoreFacts(at: number): void {
    const records = this.records;
    const facts = this.facts;
    const stack = this.stack;
    let k = records[at + 8];
    setFootnoteIndent(this, facts[k++]);
    const count = Math.min(records[at + 9], stack.length);
    for (let i = 0; i < count; i++, k++) {
      const block = stack[i];
      if (facts[k] !== -1 && isTracked(block)) {
        block.quoteLine = facts[k];
      }
    }
  }

  commit(mark: FlowMark): void {
    if (mark !== this.flowMark) {
      throw new Error('The flow mark is not open');
    }
    // The marked leaf is the tip; its container's children are below it.
    this.endMark(this.flowMark, this.children[this.children.length - 2]);
  }

  /** Ends the open mark: the held leaf closes into `parent`, before the marked leaf. */
  endMark(mark: OpenMark, parent: RootContent[]): void {
    this.flowMark = undefined;
    const held = mark.held;
    if (held !== undefined) {
      mark.held = undefined;
      let node: RootContent | undefined;
      if (isParagraph(held)) {
        this.runPrefixRules(held, parent);
        if (held.lines.length > 0) {
          node = held.close(this, mark.heldChildren);
        }
      } else {
        node = held.close(this, mark.heldChildren);
      }
      if (node !== undefined) {
        parent.push(node);
      }
    }
    if (this.replayAt < 0) {
      this.records.length = 0;
      this.facts.length = 0;
    }
  }

  rewind(mark: FlowMark, rule: BlockRule): void {
    const open = this.flowMark;
    if (open === undefined || open !== mark) {
      throw new Error('The flow mark is not open');
    }
    this.flowMark = undefined;
    // The marked leaf leaves without `close`; the held leaf is the tip again.
    this.stack.pop();
    this.children.pop();
    if (open.held !== undefined) {
      this.stack.push(open.held);
      this.children.push(open.heldChildren);
    }
    this.replayContainer = open.containerIndex;
    this.skipRule = rule;
    if (this.replayAt >= 0) {
      // A rewind inside a replay: the running replay goes on from the mark.
      this.replayAt = open.line;
      return;
    }
    this.replay(open.line);
  }

  /**
   * Reads the recorded lines from `from` to the last again, through the flow
   * only: the container decisions of those lines stand.
   */
  replay(from: number): void {
    const current = this.line;
    const line = createLine(this.source.text, this.rules.indentLimit);
    this.line = line;
    const records = this.records;
    const stack = this.stack;
    this.replayAt = from;
    while (this.replayAt * RECORD_SIZE < records.length) {
      const at = this.replayAt * RECORD_SIZE;
      this.replayAt++;
      line.index = records[at];
      line.start = records[at + 1];
      line.end = records[at + 2];
      line.visualColumn = records[at + 3];
      line.partialTab = records[at + 4];
      const flags = records[at + 7];
      line.last = (flags & LAST) !== 0;
      measureLine(line);
      this.replayUnmatched = records[at + 6] === 1;
      this.restoreFacts(at);
      const skip = this.skipRule;
      this.skipRule = undefined;
      const containerIndex = this.replayContainer;
      let matched = records[at + 5];
      if (matched > containerIndex) {
        matched = containerIndex;
      }
      const top = stack.length - 1;
      if (matched === containerIndex && top > containerIndex) {
        // Every container matched: the flow's open leaf may continue.
        this.container = stack[containerIndex];
        if (stack[top].continue(this, line)) {
          matched = top;
        }
      }
      this.flowLine(line, matched, skip);
    }
    this.replayAt = -1;
    this.skipRule = undefined;
    this.line = current;
    if (this.flowMark === undefined) {
      records.length = 0;
      this.facts.length = 0;
    }
  }
}

/**
 * Parses `spans` as a document at `depth` with its own document and flow
 * layers. Definitions and footnotes go into the shared sets; text and nested
 * documents go to `state.queue`. Returns the children. Run by the chunk that
 * `BlockState.document` queued.
 */
export function parseDocument(state: DocumentState, spans: Spans, depth: number): RootContent[] {
  return new BlockParser(state, spans, depth).run();
}
