import type { Point, Position, Source } from '../../core/source';
import { point } from '../../core/source';

/**
 * A syntax error in MDX. The reference throws a `VFileMessage` with the same
 * `reason` and `place`. `message` is the reason followed by the place, as
 * `1:5` or `1:1-1:4`; an error with no place (a tag left open at the end of
 * the document) has the reason only.
 */
export class MdxError extends Error {
  reason: string;
  place: Point | Position | undefined;

  constructor(reason: string, place: Point | Position | undefined) {
    super(place === undefined ? reason : reason + ' at ' + stringifyPlace(place));
    this.name = 'MdxError';
    this.reason = reason;
    this.place = place;
  }
}

function stringifyPoint(value: Point): string {
  return value.line + ':' + value.column;
}

/** `line:column` for a point, `line:column-line:column` for a position. */
export function stringifyPlace(place: Point | Position): string {
  if ('start' in place) {
    return stringifyPoint(place.start) + '-' + stringifyPoint(place.end);
  }
  return stringifyPoint(place);
}

/** The position from offset `start` to `end`. */
export function span(source: Source, start: number, end: number): Position {
  return { start: point(source, start), end: point(source, end) };
}
