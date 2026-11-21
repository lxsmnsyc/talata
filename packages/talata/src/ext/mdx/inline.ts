import type { InlineState } from '../../core/inline';
import type { Source } from '../../core/source';
import { linePrefix, reach } from '../../inline/lines';
import { MdxError } from './error';
import { textError } from './order';
import { DONE, MORE, Scanner } from './scanner';
import type { Item } from './scanner';

const scanner = new Scanner();

// A text error waits (`order.ts`): micromark's first error is not always the
// first one talata meets. A text directive's label is a chunk of its own,
// parsed with ranges inside its leaf's: the chain of chunks seen, outermost
// first, says how deep it is. `mdxChunks` runs at each `:` so the leaf is in
// the chain before the label's parse starts.

interface Chunk {
  ranges: number[];
  start: number;
  end: number;
}

let chainSource: Source | undefined;
let chain: Chunk[] = [];

/** Puts the chunk of `state` in the chain, after the chunks that hold it. */
export function enterChunk(state: InlineState): Chunk[] {
  const ranges = state.ranges;
  if (chainSource !== state.source) {
    chainSource = state.source;
    chain = [];
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].ranges === ranges) {
      chain.length = i + 1;
      return chain;
    }
  }
  const start = ranges[0];
  const end = ranges[ranges.length - 1];
  while (chain.length > 0) {
    const top = chain[chain.length - 1];
    if (top.start <= start && end <= top.end) {
      break;
    }
    chain.pop();
  }
  chain.push({ ranges, start, end });
  return chain;
}

// Leaves and labels that had an error: a later one in the same chunk cannot come first.
const failed = new WeakSet<number[]>();

function record(state: InlineState, error: MdxError): void {
  failed.add(state.ranges);
  const place = error.place;
  const at = place !== undefined && 'offset' in place ? place.offset! : 0;
  const chunks = enterChunk(state);
  textError(state.source, chunks[chunks.length - 1].start, chunks.length - 1, at, error);
}

/**
 * Scans one tag or expression at `state.pos` across the ranges of the leaf.
 * Returns the item, or undefined when it is not one (whitespace after `<`)
 * or has bad syntax (the error waits, see above). Moves `state.range` and
 * `state.pos` past it on success.
 */
export function scanInline(state: InlineState, mode: number): Item | undefined {
  if (failed.has(state.ranges)) {
    return undefined;
  }
  const ranges = state.ranges;
  let range = state.range;
  try {
    scanner.begin(state.source, mode, state.pos, ranges[range + 1], range + 2 >= ranges.length);
    for (;;) {
      const result = scanner.run();
      if (result !== MORE) {
        if (result !== DONE) {
          return undefined;
        }
        break;
      }
      range += 2;
      reach(state, range);
      const start = ranges[range];
      scanner.feed(
        start,
        ranges[range + 1],
        range + 2 >= ranges.length,
        linePrefix(state, range, 2),
        start,
        false,
      );
    }
  } catch (error) {
    if (!(error instanceof MdxError)) {
      throw error;
    }
    record(state, error);
    return undefined;
  }
  const item = scanner.item!;
  state.range = range;
  state.pos = item.end;
  return item;
}
