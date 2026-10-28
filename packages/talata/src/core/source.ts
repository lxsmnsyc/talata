import type { Root } from 'mdast';
import { BOM, CR, LF } from './chars';

/** A unist position. mdast does not re-export the unist types, so they are derived here. */
export type Position = NonNullable<Root['position']>;
export type Point = Position['start'];

export interface Source {
  /** The text the parser reads: a leading BOM removed and NUL replaced by U+FFFD, as micromark does. */
  text: string;
  /** Offset of the first character of each line. A line ending at the end of the text starts one more, empty, line. */
  lineStarts: number[];
  /** Line index (0-based) of the last `point()` lookup. Speeds up lookups that move forward. */
  lastLine: number;
}

export function createSource(value: string): Source {
  let text = value;
  if (text.length > 0 && text.charCodeAt(0) === BOM) {
    text = text.slice(1);
  }
  if (text.includes('\0')) {
    text = text.replaceAll('\0', '�');
  }
  const lineStarts = [0];
  const length = text.length;
  for (let i = 0; i < length; i++) {
    const code = text.charCodeAt(i);
    if (code === LF) {
      lineStarts.push(i + 1);
    } else if (code === CR) {
      if (i + 1 < length && text.charCodeAt(i + 1) === LF) {
        i++;
      }
      lineStarts.push(i + 1);
    }
  }
  return { text, lineStarts, lastLine: 0 };
}

/**
 * Converts an offset to a unist point: 1-based line, 1-based column counting
 * one per UTF-16 code unit (a tab is one column), 0-based offset.
 */
export function point(source: Source, offset: number): Point {
  const starts = source.lineStarts;
  let index = source.lastLine;
  if (!(starts[index] <= offset && (index + 1 === starts.length || offset < starts[index + 1]))) {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    index = low;
    source.lastLine = index;
  }
  return { line: index + 1, column: offset - starts[index] + 1, offset };
}

/** Offset just after the line ending that starts at `offset`. Returns `offset` when there is none. */
export function skipLineEnding(text: string, offset: number): number {
  const code = text.charCodeAt(offset);
  if (code === LF) {
    return offset + 1;
  }
  if (code === CR) {
    return text.charCodeAt(offset + 1) === LF ? offset + 2 : offset + 1;
  }
  return offset;
}
