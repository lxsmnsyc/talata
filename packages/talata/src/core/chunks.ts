import type { PhrasingContent } from 'mdast';
import { parseInline } from './inline';
import type { DocumentState } from './state';

// micromark tokenizes in passes: the document first, then, pass after pass,
// the content that the pass before spliced in (`subtokenize`). The queue
// runs talata's later work in that order: text of leaves, labels, and the
// content of container directives as documents of their own.

/** Pass of the content of a container directive at `depth` (1 or more directives around it). */
export function documentPass(depth: number): number {
  return 2 * depth - 1;
}

/** Pass of text (paragraph, heading, table cell, leaf or container directive label) at `depth`, inside `labels` text directive labels. */
export function textPass(depth: number, labels: number): number {
  return 2 * depth + 1 + labels;
}

export interface ChunkQueue {
  /** -1 while the block parser reads the source, then the pass of the running chunk. */
  readonly pass: number;
  /**
   * Inline parse of `ranges` into `node.children`, ordered by `ranges[0]`.
   * `BlockState.inline` calls it with `textPass(state.depth, 0)`. Empty
   * `ranges` (v5 scope hooks of talata/directive) take the highest start
   * added before them in that pass, or -1. The sort is stable.
   * `node.children` is assigned for empty ranges too (the hooks run in its
   * setter). Once `run` returned, it parses at once, as `add` runs.
   */
  text(
    pass: number,
    node: { children: PhrasingContent[] },
    ranges: number[],
    indents?: number[],
  ): void;
  /**
   * Any other chunk. `start` is the first offset it reads. `pass` must be
   * above `this.pass`. Once `run` returned, nothing is left to run it later:
   * it runs at once, in the caller's context (an inline parse in a
   * transform, such as talata/mdx reading an image label again, meets a text
   * directive label).
   */
  add(pass: number, start: number, run: () => void): void;
  /**
   * Runs passes in increasing order. In a pass, chunks run by start, equal
   * starts in the order added. A running chunk adds only to later passes.
   * Nothing is caught: the first error thrown ends the parse.
   */
  run(): void;
}

/** The chunks of one pass, in parallel arrays, so a text chunk allocates no object. */
interface Pass {
  /** The node of a text chunk, or the function of any other chunk. */
  targets: ({ children: PhrasingContent[] } | (() => void))[];
  ranges: (number[] | undefined)[];
  indents: (number[] | undefined)[];
  starts: number[];
  /** The highest start added, or -1. */
  highest: number;
  /** False once a start was lower than one added before it. */
  sorted: boolean;
}

/** Adds one chunk to `found`. */
function pushChunk(
  found: Pass,
  target: { children: PhrasingContent[] } | (() => void),
  ranges: number[] | undefined,
  indents: number[] | undefined,
  start: number,
): void {
  if (start < found.highest) {
    found.sorted = false;
  } else {
    found.highest = start;
  }
  found.targets.push(target);
  found.ranges.push(ranges);
  found.indents.push(indents);
  found.starts.push(start);
}

class Queue implements ChunkQueue {
  pass = -1;
  state: DocumentState;
  /** Indexed by pass number. */
  passes: (Pass | undefined)[] = [];
  /** The pass added to last, and its number. */
  last: Pass | undefined = undefined;
  lastPass = -1;
  /** `run` returned. */
  done = false;

  constructor(state: DocumentState) {
    this.state = state;
  }

  /** The pass `pass` to add to, created on first use. */
  open(pass: number): Pass {
    const last = this.last;
    if (last !== undefined && pass === this.lastPass) {
      return last;
    }
    if (pass <= this.pass) {
      throw new Error(`Chunk pass ${pass} is not after the running pass ${this.pass}`);
    }
    let found = this.passes[pass];
    if (found === undefined) {
      while (this.passes.length < pass) {
        this.passes.push(undefined);
      }
      found = { targets: [], ranges: [], indents: [], starts: [], highest: -1, sorted: true };
      this.passes[pass] = found;
    }
    this.last = found;
    this.lastPass = pass;
    return found;
  }

  text(
    pass: number,
    node: { children: PhrasingContent[] },
    ranges: number[],
    indents?: number[],
  ): void {
    if (this.done) {
      node.children = parseInline(this.state, ranges, indents);
      return;
    }
    const found = this.open(pass);
    // Empty ranges (v5 scope hooks) run after every chunk added before them,
    // also one added out of order (a container directive's label is queued
    // before the paragraph it interrupts closes).
    const start = ranges.length > 0 ? ranges[0] : found.highest;
    pushChunk(found, node, ranges, indents, start);
  }

  add(pass: number, start: number, run: () => void): void {
    if (this.done) {
      run();
      return;
    }
    pushChunk(this.open(pass), run, undefined, undefined, start);
  }

  run(): void {
    const passes = this.passes;
    // `passes` grows while chunks add to later passes.
    for (let pass = 0; pass < passes.length; pass++) {
      const found = passes[pass];
      if (found === undefined) {
        continue;
      }
      passes[pass] = undefined;
      this.pass = pass;
      this.last = undefined;
      const targets = found.targets;
      const count = targets.length;
      if (found.sorted) {
        for (let i = 0; i < count; i++) {
          this.runChunk(found, i);
        }
      } else {
        const starts = found.starts;
        const order: number[] = [];
        for (let i = 0; i < count; i++) {
          order.push(i);
        }
        order.sort((a, b) => starts[a] - starts[b] || a - b);
        for (const i of order) {
          this.runChunk(found, i);
        }
      }
    }
    this.done = true;
  }

  runChunk(found: Pass, i: number): void {
    const target = found.targets[i];
    if (typeof target === 'function') {
      target();
    } else {
      target.children = parseInline(this.state, found.ranges[i]!, found.indents[i]);
    }
  }
}

/** The queue of one parse. Text chunks parse with `parseInline` against `state`. */
export function createChunkQueue(state: DocumentState): ChunkQueue {
  return new Queue(state);
}
