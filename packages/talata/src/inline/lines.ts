import { SPACE, TAB, isSpaceOrTab } from '../core/chars';
import type { InlineState } from '../core/inline';
import { skipLineEnding } from '../core/source';

// Helpers for inline rules that cross line endings (code spans, links, raw
// HTML). A cursor is a range index (even) and an offset in that range.

const GREATER_THAN = 62;

/**
 * For tests: a count of inner loop steps in the inline rules that scan
 * ahead or back (code spans, raw HTML, label lookups, emphasis pairing), so
 * tests can check that work grows linearly without timing anything.
 */
export const workSteps: { count: number } = { count: 0 };

/** Returned by `peek` at the end of a range that a line ending follows. */
export const LINE_ENDING = -1;
/** Returned by `peek` at the end of the last range. */
export const END = -2;

export interface Cursor {
  range: number;
  pos: number;
}

/** The character code at the cursor, `LINE_ENDING` or `END`. */
export function peek(state: InlineState, cursor: Cursor): number {
  if (cursor.pos < state.ranges[cursor.range + 1]) {
    return state.source.text.charCodeAt(cursor.pos);
  }
  return cursor.range + 2 < state.ranges.length ? LINE_ENDING : END;
}

/**
 * Container prefixes of continuation lines, set by paragraphs and keyed by
 * their `lines` array (the ranges the inline parser gets): flat triples of
 * the line's end offset (its range end), offset after the
 * container prefixes, and split-tab columns left there. A line with no entry
 * has no whitespace between its containers and its content.
 */
export const lineIndents: WeakMap<number[], number[]> = new WeakMap();

// The furthest range a construct has looked into in the current leaf.
// micromark feeds a leaf to its text tokenizer one line at a time, and a
// line ending's end point skips the next line's container prefixes only
// when that line was fed before the line ending was consumed: after a
// lookahead (a code span, raw HTML or link resource attempt) reached it.
let reachState: InlineState | undefined;
let reached = 0;

/** Records that a construct looked into range `range`. */
export function reach(state: InlineState, range: number): void {
  if (reachState !== state) {
    reachState = state;
    reached = 0;
  }
  if (range > reached) {
    reached = range;
  }
}

/** Whether a construct has looked into range `range`. */
export function wasReached(state: InlineState, range: number): boolean {
  return reachState === state && reached >= range;
}

/** Moves the cursor to the start of the next range. */
export function nextLine(state: InlineState, cursor: Cursor): void {
  cursor.range += 2;
  cursor.pos = state.ranges[cursor.range];
  reach(state, cursor.range);
}

/** Skips spaces, tabs and line endings. */
export function skipWhitespace(state: InlineState, cursor: Cursor): void {
  const text = state.source.text;
  const ranges = state.ranges;
  for (;;) {
    const end = ranges[cursor.range + 1];
    while (cursor.pos < end && isSpaceOrTab(text.charCodeAt(cursor.pos))) {
      cursor.pos++;
    }
    if (cursor.pos < end || cursor.range + 2 >= ranges.length) {
      return;
    }
    nextLine(state, cursor);
  }
}

/** Index of the range that holds `offset`, searching back from the current one. */
export function rangeIndex(state: InlineState, offset: number): number {
  let range = state.range;
  while (range > 0 && state.ranges[range] > offset) {
    range -= 2;
  }
  return range;
}

// Split-tab columns left at the offset `containerEnd` returned.
let splitColumns = 0;

/**
 * Offset after the container prefixes on the line of range `range` (not the
 * first). Sets `splitColumns`. Paragraphs register exact values in
 * `lineIndents`; for other leaves this guesses from the source: all
 * whitespace when only whitespace precedes the range, else what follows a
 * block quote marker and its optional space.
 */
export function containerEnd(state: InlineState, range: number): number {
  const ranges = state.ranges;
  const start = ranges[range];
  const indents = lineIndents.get(ranges);
  splitColumns = 0;
  if (indents !== undefined) {
    // Line ending offsets grow, so search them in halves.
    const lineEnd = ranges[range + 1];
    let low = 0;
    let high = indents.length / 3;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (indents[middle * 3] < lineEnd) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    if (low * 3 < indents.length && indents[low * 3] === lineEnd) {
      splitColumns = indents[low * 3 + 2];
      return indents[low * 3 + 1];
    }
    return start;
  }
  const text = state.source.text;
  const lineStart = skipLineEnding(text, ranges[range - 1]);
  let from = start;
  while (from > lineStart && isSpaceOrTab(text.charCodeAt(from - 1))) {
    from--;
  }
  if (from === start || from === lineStart || text.charCodeAt(from - 1) !== GREATER_THAN) {
    return from;
  }
  // The block quote takes one column after its marker.
  if (text.charCodeAt(from) === TAB) {
    splitColumns = 3 - (visualColumn(text, lineStart, from) % 4);
  }
  return from + 1;
}

/** Visual column (tab stops of 4) of `offset` on the line starting at `lineStart`. */
function visualColumn(text: string, lineStart: number, offset: number): number {
  let column = 0;
  for (let i = lineStart; i < offset; i++) {
    column = text.charCodeAt(i) === TAB ? column + 4 - (column % 4) : column + 1;
  }
  return column;
}

/**
 * The whitespace micromark keeps at the start of the line of range `range`
 * (not the first): what is left of the line after its container prefixes.
 * Split-tab columns become spaces. The first `skip` characters are dropped,
 * counting a tab's extra columns as characters, as micromark's line prefix
 * limit does.
 */
export function linePrefix(state: InlineState, range: number, skip: number): string {
  const text = state.source.text;
  const start = state.ranges[range];
  const from = containerEnd(state, range);
  let virtual = splitColumns;
  if (from === start && virtual === 0) {
    return '';
  }
  let column = visualColumn(text, skipLineEnding(text, state.ranges[range - 1]), from);
  let result = '';
  let skipped = 0;
  for (; virtual > 0; virtual--) {
    if (skipped < skip) {
      skipped++;
    } else {
      result += ' ';
    }
  }
  for (let i = from; i < start; i++) {
    if (text.charCodeAt(i) === SPACE) {
      column++;
      if (skipped < skip) {
        skipped++;
      } else {
        result += ' ';
      }
      continue;
    }
    const width = 4 - (column % 4);
    column += width;
    if (skipped < skip) {
      skipped++;
      // Columns of a tab whose start was dropped stay as spaces.
      for (let v = 1; v < width; v++) {
        if (skipped < skip) {
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

/**
 * The source from `from` (in range `range`) to `to`, with raw line endings
 * and the whitespace `linePrefix` keeps on later lines.
 */
export function rangeText(state: InlineState, range: number, from: number, to: number): string {
  const text = state.source.text;
  const ranges = state.ranges;
  let result = '';
  let pos = from;
  for (;;) {
    const end = ranges[range + 1];
    if (to <= end || range + 2 >= ranges.length) {
      return result + text.slice(pos, to);
    }
    result += text.slice(pos, end) + text.slice(end, skipLineEnding(text, end));
    range += 2;
    result += linePrefix(state, range, 0);
    pos = ranges[range];
  }
}
