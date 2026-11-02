import type { InlineState } from '../core/inline';

/**
 * Opening runs, by size, that have no closer up to the end of the leaf: the
 * earliest such start. A later run of that size has no closer either, so a
 * rule that scans for a closer (code span, math) fails at once instead of
 * scanning again. Each rule owns one cache. It holds the entries of one leaf
 * and drops them when another leaf asks, so a miss costs a rescan and never
 * gives a wrong answer.
 */
export interface Exhausted {
  state: InlineState | undefined;
  starts: (number | undefined)[];
}

export function createExhausted(): Exhausted {
  return { state: undefined, starts: [] };
}

/** The earliest failed start of a run of `size` in the leaf `state`, or undefined. */
export function failedStart(
  cache: Exhausted,
  state: InlineState,
  size: number,
): number | undefined {
  if (cache.state !== state) {
    cache.state = state;
    cache.starts = [];
  }
  return cache.starts[size];
}

/** Records that the run of `size` at `start` found no closer. `known` is what `failedStart` returned. */
export function markFailed(
  cache: Exhausted,
  size: number,
  start: number,
  known: number | undefined,
): void {
  if (known === undefined || start < known) {
    cache.starts[size] = start;
  }
}
