import type { Root } from 'mdast';
import type { BlockState } from '../../core/blocks';
import type { Source } from '../../core/source';
import type { MdxError } from './error';

// Which syntax error the reference throws first. micromark tokenizes the
// flow of the document first, then the chunks nested in it in passes: each
// pass tokenizes, in document order, the chunks the pass before made. Found
// by trying inputs against the reference, with `d` container directives
// around: flow is pass 2d - 1, text (paragraphs, headings, cells, leaf and
// container labels) pass 2d + 1, and each text directive around a label one
// more. So `:::a\n<1\n:::\n<2` fails at `<2` (top-level flow), `a :b[<1] <2`
// at `<2`, and `:::x\nb <1\n:::\n:a[<2]` at `<2`. The chunk queue
// (`core/chunks.ts`) runs the content of container directives and text in
// that order, so every error throws where it is met. One exception: the
// tree build (`build.ts`) parses image labels again without the `!`, and
// what it meets there is not an error of the reference. Once `throwWaiting`
// ran for a parse, text errors are dropped. Nothing else waits here:
// `throwWaiting` stays until mdx-layers-flow removes this file.

interface Waiting {
  /** Flow: false. Text: true. */
  text: boolean;
  /** Text: start of the leaf or label. */
  chunk: number;
  /** Text: the number of text directive labels around. */
  labels: number;
  /** Offset of the error, or of the line where flow content failed. */
  at: number;
  error: MdxError;
}

const waiting = new WeakMap<Source, Waiting[]>();

const CONTAINER = 'containerDirective';

/** The number of container directives in the open blocks from depth 1 to `bound`. */
export function containerDepth(state: BlockState, bound: number): number {
  let depth = 0;
  for (let i = 1; i <= bound; i++) {
    if (state.getBlock(i)!.name === CONTAINER) {
      depth++;
    }
  }
  return depth;
}

// Lines whose flow errors the reference never meets (see `quietFlowErrors`).
const quiet = new WeakMap<Source, number[]>();

/**
 * Flow errors from `from` to `to` in blocks deeper than `depth` are
 * dropped: a construct the reference tried over those lines failed, so it
 * checked no containers on them, and they are rows of the table at `depth`.
 * Flow constructs that start in the table's container still run there.
 */
export function quietFlowErrors(source: Source, from: number, to: number, depth: number): void {
  let list = quiet.get(source);
  if (list === undefined) {
    list = [];
    quiet.set(source, list);
  }
  list.push(from, to, depth);
}

function isQuiet(source: Source, at: number, bound: number): boolean {
  const list = quiet.get(source);
  if (list !== undefined) {
    for (let i = 0; i < list.length; i += 3) {
      if (list[i] <= at && at <= list[i + 1] && bound > list[i + 2]) {
        return true;
      }
    }
  }
  return false;
}

/** A flow error at `at` in a block whose container is at depth `bound`: thrown now, unless quiet. */
export function flowError(state: BlockState, bound: number, error: MdxError, at: number): void {
  if (isQuiet(state.source, at, bound)) {
    return;
  }
  throw error;
}

// Parses whose tree build started (`throwWaiting` ran).
const built = new WeakSet<Source>();

/**
 * A text error in the leaf or label that starts at `chunk`, inside `labels`
 * text directive labels: thrown now, or dropped during the tree build.
 */
export function textError(
  source: Source,
  _chunk: number,
  _labels: number,
  _at: number,
  error: MdxError,
): void {
  if (!built.has(source)) {
    throw error;
  }
}

interface Content {
  /** Offset after the opening line. */
  start: number;
  end: number;
}

/** Content ranges of the container directives in `tree`. */
function containers(tree: Root, text: string): Content[] {
  const result: Content[] = [];
  const blank = blankEnd(text);
  const stack: { type: string; children?: unknown[]; position?: Root['position'] }[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === CONTAINER && node.position !== undefined) {
      let start = node.position.start.offset ?? 0;
      while (
        start < text.length &&
        text.charCodeAt(start) !== 10 &&
        text.charCodeAt(start) !== 13
      ) {
        start++;
      }
      // Content that runs to the end of the text holds an error there (the
      // end of file in a construct inside it), also when only blank lines
      // and quote markers follow its end.
      const end = node.position.end.offset ?? text.length;
      result.push({ start, end: end >= blank ? text.length + 1 : end });
    }
    if (node.children !== undefined) {
      for (const child of node.children) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mdast nodes, read loosely
        stack.push(child as (typeof stack)[number]);
      }
    }
  }
  return result;
}

/** Throws the first waiting error of the parse of `source`, if any. */
export function throwWaiting(tree: Root, source: Source): void {
  built.add(source);
  const list = waiting.get(source);
  if (list === undefined) {
    return;
  }
  waiting.delete(source);
  // Container contents nest. Sweep them in document order with the errors
  // sorted by where they count: how many contents hold each error, and the
  // start of the innermost.
  const contents = containers(tree, source.text);
  contents.sort((a, b) => a.start - b.start || b.end - a.end);
  const bases: number[] = [];
  const order: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    bases.push(entry.text ? entry.chunk : entry.at);
    order.push(i);
  }
  order.sort((a, b) => bases[a] - bases[b]);
  const arounds: number[] = Array.from({ length: list.length });
  const chunks: number[] = Array.from({ length: list.length });
  const open: Content[] = [];
  let next = 0;
  for (const i of order) {
    const base = bases[i];
    while (next < contents.length && contents[next].start <= base) {
      const content = contents[next++];
      while (open.length > 0 && open[open.length - 1].end <= content.start) {
        open.pop();
      }
      open.push(content);
    }
    while (open.length > 0 && open[open.length - 1].end <= base) {
      open.pop();
    }
    arounds[i] = open.length;
    chunks[i] = open.length > 0 ? open[open.length - 1].start : -1;
  }
  let best: number[] | undefined;
  let first: MdxError | undefined;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const around = arounds[i];
    const key = entry.text
      ? [2 * around + 1 + entry.labels, entry.chunk, entry.at]
      : [2 * around - 1, chunks[i], entry.at];
    if (best === undefined || before(key, best)) {
      best = key;
      first = entry.error;
    }
  }
  throw first!;
}

/** Where the whitespace, line endings and quote markers at the end of `text` start. */
function blankEnd(text: string): number {
  let i = text.length;
  while (i > 0) {
    const code = text.charCodeAt(i - 1);
    if (code !== 10 && code !== 13 && code !== 32 && code !== 9 && code !== 62) {
      break;
    }
    i--;
  }
  return i;
}

function before(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i];
    }
  }
  return false;
}
