import type { PhrasingContent, RootContent } from 'mdast';
import openParagraph from '../blocks/paragraph';
import { CR, LF } from './chars';
import { createLine, measureLine } from './line';
import type { Line } from './line';
import type { Registry } from './registry';
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

export class BlockParser implements BlockState {
  source: Source;
  options: ParseOptions;
  definitions: Set<string>;
  footnotes: Set<string>;
  rules: Registry;
  container: OpenBlock = document;
  paragraph: OpenParagraph | undefined = undefined;
  lazy = false;
  tip: OpenBlock | undefined = undefined;
  unmatched = false;
  endOnlyLine = -1;
  closeKeepsLineEnding = false;
  /** Open blocks from the document to the tip. */
  stack: OpenBlock[] = [document];
  /** Closed child nodes of each open block, parallel to `stack`. */
  children: RootContent[][] = [[]];
  /** Index in `stack` of `container`. */
  containerIndex = 0;
  inlineNodes: { children: PhrasingContent[] }[] = [];
  inlineRanges: number[][] = [];
  inlineIndents: (number[] | undefined)[] = [];

  constructor(state: DocumentState) {
    this.source = state.source;
    this.options = state.options;
    this.definitions = state.definitions;
    this.footnotes = state.footnotes;
    this.rules = state.rules;
  }

  /** Parses all lines and returns the document's children. */
  run(): RootContent[] {
    const text = this.source.text;
    const starts = this.source.lineStarts;
    let count = starts.length;
    // A line ending at the end of the text does not start a real line.
    if (starts[count - 1] === text.length) {
      count--;
    }
    const line = createLine(text);
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
      measureLine(line);
      this.processLine(line);
    }
    if (count < starts.length) {
      this.closeKeepsLineEnding = this.continuesOverEnd(line);
    }
    this.closeTo(0);
    this.closeKeepsLineEnding = false;
    return this.children[0];
  }

  /**
   * After a final line ending: whether every open container continues on the
   * empty line after it. Only asked when the tip is a leaf other than a
   * paragraph, the only blocks that read the answer.
   */
  continuesOverEnd(line: Line): boolean {
    const stack = this.stack;
    const tip = stack[stack.length - 1];
    if (tip.isContainer || isParagraph(tip)) {
      return false;
    }
    const end = this.source.text.length;
    line.index = this.source.lineStarts.length - 1;
    line.start = end;
    line.end = end;
    line.visualColumn = 0;
    line.partialTab = 0;
    measureLine(line);
    for (let i = 1; i < stack.length - 1; i++) {
      this.container = stack[i - 1];
      if (!stack[i].continue(this, line)) {
        return false;
      }
    }
    return true;
  }

  processLine(line: Line): void {
    const stack = this.stack;
    let matched = 0;
    for (let i = 1; i < stack.length; i++) {
      const block = stack[i];
      this.container = stack[i - 1];
      if (!block.continue(this, line)) {
        break;
      }
      matched = i;
      if (!block.isContainer) {
        break;
      }
    }
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
    this.containerIndex = deepest.isContainer ? matched : matched - 1;
    this.container = stack[this.containerIndex];
    this.paragraph = paragraph;
    this.lazy = paragraph !== undefined && matched !== top;
    this.tip = !tip.isContainer && matched >= top - 1 ? tip : undefined;
    this.unmatched = this.containerIndex < (tip.isContainer ? top : top - 1);

    let started = false;
    while (!line.blank) {
      const start = line.start;
      const partialTab = line.partialTab;
      const block = this.tryStart(line);
      if (block === undefined) {
        break;
      }
      started = true;
      if (this.lazy && block.keepsLazyContainers === true && line.end < line.text.length) {
        // Close only the paragraph; the block takes its place.
        this.containerIndex = stack.length - 2;
      }
      this.attach(block);
      this.paragraph = undefined;
      this.lazy = false;
      this.tip = undefined;
      this.unmatched = false;
      if (!block.isContainer) {
        return;
      }
      if (line.start === start && line.partialTab === partialTab) {
        // The container consumed nothing; running rules again would loop.
        break;
      }
    }

    if (!started && leaf) {
      deepest.addLine?.(this, line);
      return;
    }
    if (
      !started &&
      paragraph !== undefined &&
      this.lazy &&
      !line.blank &&
      this.allowsLazy(matched, top)
    ) {
      paragraph.addLine!(this, line);
      return;
    }
    if (!started) {
      this.closeTo(matched);
    }
    const last = stack[stack.length - 1];
    if (isParagraph(last)) {
      last.addLine!(this, line);
    } else if (!line.blank) {
      this.attach(openParagraph(this, line));
    }
  }

  /** Runs the candidate rules for the rest of `line`. Restores the line after each failure. */
  tryStart(line: Line): OpenBlock | undefined {
    const code = line.text.charCodeAt(line.nonBlank);
    const rules = this.rules;
    const candidates = code < 128 ? rules.blockByChar[code] : rules.blockOther;
    const start = line.start;
    const visualColumn = line.visualColumn;
    const partialTab = line.partialTab;
    for (const rule of candidates) {
      if (this.paragraph !== undefined && !rule.canInterruptParagraph) {
        continue;
      }
      const block = rule.start(this, line);
      if (block !== undefined) {
        return block;
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

  /**
   * Adds `block` under the current container: closes unmatched blocks, then
   * containers that refuse it.
   */
  attach(block: OpenBlock): void {
    this.closeKeepsLineEnding = block.isContainer;
    this.closeTo(this.containerIndex);
    const stack = this.stack;
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
    this.inlineNodes.push(node);
    this.inlineRanges.push(ranges);
    this.inlineIndents.push(indents);
  }
}
