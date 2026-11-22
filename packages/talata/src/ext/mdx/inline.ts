import type { InlineState } from '../../core/inline';
import type { Source } from '../../core/source';
import { containerEnd, linePrefix, reach, wasReached } from '../../inline/lines';
import { MdxError } from './error';
import { DONE, MORE, Scanner } from './scanner';
import type { Item } from './scanner';

const scanner = new Scanner();

// A text error throws at once: the chunk queue runs text in micromark's
// order, so the first error met is the reference's. The tree build
// (`build.ts`) parses image labels again without the `!`, and what it meets
// there is not an error of the reference: it is dropped, and the rest of the
// leaf or label is text.

// Parses whose tree build started.
const building = new WeakSet<Source>();

/** From the tree build: text errors of the parse of `source` are dropped from now on. */
export function startBuild(source: Source): void {
  building.add(source);
}

// Labels read again by the tree build that had a dropped error.
const failed = new WeakSet<number[]>();

/**
 * Scans one tag or expression at `state.pos` across the ranges of the leaf.
 * Returns the item, or undefined when it is not one (whitespace after `<`)
 * or throws on bad syntax (see above; dropped during the tree build, then
 * undefined). Moves `state.range` and `state.pos` past it on success.
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
      const reached = wasReached(state, range);
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
      if (reached) {
        scanner.lineStartAt(containerEnd(state, range));
      }
    }
  } catch (error) {
    if (!(error instanceof MdxError)) {
      throw error;
    }
    if (!building.has(state.source)) {
      throw error;
    }
    failed.add(state.ranges);
    return undefined;
  }
  const item = scanner.item!;
  state.range = range;
  state.pos = item.end;
  return item;
}
