import { SPACE, TAB } from './chars';

/**
 * One line as the block parser sees it, without copying text. The block
 * parser reuses one object for every line, so rules must not keep it.
 *
 * Container prefixes consume the line from the left. A tab can be consumed in
 * part: then `start` is the offset after the tab and `partialTab` counts the
 * tab's columns not consumed yet. This matches micromark, where the columns
 * left of a split tab sit at the offset after it.
 */
export interface Line {
  text: string;
  /** 0-based line index. */
  index: number;
  /** Offset of the first character not yet consumed. */
  start: number;
  /** Offset of the line ending, or of the end of the text. */
  end: number;
  /** Visual column (0-based, tab stops of 4) of the current position. Use it only for indentation. */
  visualColumn: number;
  /** Columns of a split tab left before `start`. */
  partialTab: number;
  /** Visual columns of whitespace from the current position to `nonBlank`. */
  indent: number;
  /** Offset of the first character after `start` that is not a space or a tab, or `end`. */
  nonBlank: number;
  /** True when only spaces and tabs remain. */
  blank: boolean;
}

export function createLine(text: string): Line {
  return {
    text,
    index: 0,
    start: 0,
    end: 0,
    visualColumn: 0,
    partialTab: 0,
    indent: 0,
    nonBlank: 0,
    blank: true,
  };
}

/** Recomputes `indent`, `nonBlank` and `blank` from `start`. */
export function measureLine(line: Line): void {
  const text = line.text;
  const end = line.end;
  let column = line.visualColumn + line.partialTab;
  let i = line.start;
  while (i < end) {
    const code = text.charCodeAt(i);
    if (code === SPACE) {
      column++;
    } else if (code === TAB) {
      column += 4 - (column % 4);
    } else {
      break;
    }
    i++;
  }
  line.nonBlank = i;
  line.indent = column - line.visualColumn;
  line.blank = i === end;
}

/**
 * Consumes up to `columns` visual columns of spaces and tabs, splitting a tab
 * when needed. Returns the number of columns consumed.
 */
export function consumeColumns(line: Line, columns: number): number {
  const text = line.text;
  let remaining = columns;
  if (line.partialTab > 0) {
    const take = line.partialTab < remaining ? line.partialTab : remaining;
    line.partialTab -= take;
    line.visualColumn += take;
    remaining -= take;
  }
  while (remaining > 0 && line.start < line.end) {
    const code = text.charCodeAt(line.start);
    if (code === SPACE) {
      line.start++;
      line.visualColumn++;
      remaining--;
    } else if (code === TAB) {
      const width = 4 - (line.visualColumn % 4);
      line.start++;
      if (width <= remaining) {
        line.visualColumn += width;
        remaining -= width;
      } else {
        line.partialTab = width - remaining;
        line.visualColumn += remaining;
        remaining = 0;
      }
    } else {
      break;
    }
  }
  measureLine(line);
  return columns - remaining;
}

/**
 * Moves `start` forward to `offset`, dropping any split tab columns.
 * Use it to consume markers and whole characters.
 */
export function advanceLine(line: Line, offset: number): void {
  const text = line.text;
  let column = line.visualColumn + line.partialTab;
  for (let i = line.start; i < offset; i++) {
    if (text.charCodeAt(i) === TAB) {
      column += 4 - (column % 4);
    } else {
      column++;
    }
  }
  line.start = offset;
  line.visualColumn = column;
  line.partialTab = 0;
  measureLine(line);
}

/** Consumes all leading spaces and tabs. */
export function skipBlank(line: Line): void {
  advanceLine(line, line.nonBlank);
}
