import { SPACE, TAB, isSpaceOrTab } from '../core/chars';
import type { InlineState } from '../core/inline';
import { skipLineEnding } from '../core/source';

// Helpers for inline rules that cross line endings (code spans, links, raw
// HTML). A cursor is a range index (even) and an offset in that range.

const GREATER_THAN = 62;

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

/** Moves the cursor to the start of the next range. */
export function nextLine(state: InlineState, cursor: Cursor): void {
  cursor.range += 2;
  cursor.pos = state.ranges[cursor.range];
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

/**
 * The whitespace micromark keeps at the start of the line of range `range`
 * (not the first): what is left of the line after its container prefixes.
 * Split-tab columns become spaces. The first `skip` characters are dropped,
 * counting a tab's extra columns as characters, as micromark's line prefix
 * limit does.
 *
 * The ranges do not say where container prefixes end, so this guesses: all
 * whitespace when only whitespace precedes the range, else what follows a
 * block quote marker and its optional space. A list item's indent is counted
 * as kept whitespace, which is wrong (see the parser-core change request).
 */
export function linePrefix(state: InlineState, range: number, skip: number): string {
  const text = state.source.text;
  const start = state.ranges[range];
  const lineStart = skipLineEnding(text, state.ranges[range - 1]);
  let from = start;
  while (from > lineStart && isSpaceOrTab(text.charCodeAt(from - 1))) {
    from--;
  }
  if (from === start) {
    return '';
  }
  let column = 0;
  let virtual = 0;
  if (from > lineStart) {
    for (let i = lineStart; i < from; i++) {
      column = text.charCodeAt(i) === TAB ? column + 4 - (column % 4) : column + 1;
    }
    if (text.charCodeAt(from - 1) === GREATER_THAN) {
      // The block quote takes one column after its marker.
      const width = text.charCodeAt(from) === TAB ? 4 - (column % 4) : 1;
      virtual = width - 1;
      column += width;
      from++;
    }
  }
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
