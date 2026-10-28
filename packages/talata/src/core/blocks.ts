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
   * Removes the open paragraph so a rule can convert it (setext headings,
   * GFM tables). Paragraph prefix rules run first, so definitions at its start
   * become nodes. Returns undefined when there is no matched paragraph or no
   * line is left. Call it only when the rule then returns a block.
   */
  takeParagraph(): OpenParagraph | undefined;
  /** Schedules inline parsing of `ranges` into `node.children` after all blocks close. */
  inline(node: { children: PhrasingContent[] }, ranges: number[]): void;
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
   * block's prefix from `line` (containers) or the whole line (leaves) and
   * return the open block. On failure, return undefined and leave `line`
   * unchanged.
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
   * Whether the block continues on `line`. Containers consume their prefix.
   * Leaves return false to close. A leaf that returns true gets `addLine`.
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
  /** Open blocks from the document to the tip. */
  stack: OpenBlock[] = [document];
  /** Closed child nodes of each open block, parallel to `stack`. */
  children: RootContent[][] = [[]];
  inlineNodes: { children: PhrasingContent[] }[] = [];
  inlineRanges: number[][] = [];

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
    this.closeTo(0);
    return this.children[0];
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
    if (!deepest.isContainer && deepest.name !== 'paragraph') {
      // A matched leaf such as a code block takes the line as content.
      if (deepest.addLine !== undefined) {
        deepest.addLine(this, line);
      }
      return;
    }

    const top = stack.length - 1;
    const tip = stack[top];
    const paragraph = isParagraph(tip) ? tip : undefined;
    let containerIndex = deepest.isContainer ? matched : matched - 1;
    this.container = stack[containerIndex];
    this.paragraph = paragraph;
    this.lazy = paragraph !== undefined && matched !== top;

    let started = false;
    const text = line.text;
    const rules = this.rules;
    while (!line.blank) {
      const code = text.charCodeAt(line.nonBlank);
      const candidates = code < 128 ? rules.blockByChar[code] : rules.blockOther;
      let block: OpenBlock | undefined;
      for (const rule of candidates) {
        if (this.paragraph !== undefined && !rule.canInterruptParagraph) {
          continue;
        }
        block = rule.start(this, line);
        if (block !== undefined) {
          break;
        }
      }
      if (block === undefined) {
        break;
      }
      started = true;
      this.closeTo(containerIndex);
      stack.push(block);
      this.children.push(block.isContainer ? [] : NO_CHILDREN);
      this.paragraph = undefined;
      this.lazy = false;
      if (!block.isContainer) {
        return;
      }
      containerIndex = stack.length - 1;
      this.container = block;
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
    if (last.name === 'paragraph') {
      last.addLine!(this, line);
    } else if (!line.blank) {
      stack.push(openParagraph(this, line));
      this.children.push(NO_CHILDREN);
    }
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
    if (paragraph === undefined || this.lazy) {
      return undefined;
    }
    this.stack.pop();
    this.children.pop();
    this.paragraph = undefined;
    this.runPrefixRules(paragraph, this.children[this.children.length - 1]);
    return paragraph.lines.length === 0 ? undefined : paragraph;
  }

  inline(node: { children: PhrasingContent[] }, ranges: number[]): void {
    this.inlineNodes.push(node);
    this.inlineRanges.push(ranges);
  }
}
