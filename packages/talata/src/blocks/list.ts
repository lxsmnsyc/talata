import type { List, ListItem, RootContent } from 'mdast';
import type { BlockState, OpenBlock } from '../core/blocks';
import { ASTERISK, DASH, isSpaceOrTab } from '../core/chars';
import type { Line } from '../core/line';
import { point } from '../core/source';
import { lastChildEnd, parentQuoteLine } from './blockquote';
import type { TrackedContainer } from './blockquote';

const PLUS = 43;
const DOT = 46;
const RIGHT_PAREN = 41;
const DIGIT_0 = 48;
const DIGIT_9 = 57;

/** What the list needs to know about its last item to decide continuation. */
export interface ItemState {
  /** Columns of indentation a continuation line needs. */
  size: number;
  /** A blank line followed an item that started blank; the next non-blank line is not in it. */
  furtherBlank: boolean;
}

/** A list marker: `ordered` is false for bullets. `code` is the bullet or the delimiter. */
export interface Marker {
  ordered: boolean;
  code: number;
  digits: number;
  value: number;
  /** Offset after the marker. */
  end: number;
}

const marker: Marker = { ordered: false, code: 0, digits: 0, value: 0, end: 0 };

/**
 * Reads a list marker at `start`. Returns a reused object, or undefined.
 * Does not check what follows the marker.
 */
export function readMarker(text: string, start: number, end: number): Marker | undefined {
  const code = text.charCodeAt(start);
  if (code === ASTERISK || code === PLUS || code === DASH) {
    marker.ordered = false;
    marker.code = code;
    marker.digits = 0;
    marker.value = 0;
    marker.end = start + 1;
    return marker;
  }
  let i = start;
  let value = 0;
  while (i < end && i - start < 9) {
    const digit = text.charCodeAt(i);
    if (digit < DIGIT_0 || digit > DIGIT_9) {
      break;
    }
    value = value * 10 + digit - DIGIT_0;
    i++;
  }
  if (i === start || i >= end) {
    return undefined;
  }
  const delimiter = text.charCodeAt(i);
  if (delimiter !== DOT && delimiter !== RIGHT_PAREN) {
    return undefined;
  }
  marker.ordered = true;
  marker.code = delimiter;
  marker.digits = i - start;
  marker.value = value;
  marker.end = i + 1;
  return marker;
}

/** True when `start` to `end` is a thematic break made of `*` or `-`. */
export function isThematicBreak(text: string, start: number, end: number): boolean {
  const code = text.charCodeAt(start);
  let count = 0;
  for (let i = start; i < end; i++) {
    const next = text.charCodeAt(i);
    if (next === code) {
      count++;
    } else if (!isSpaceOrTab(next)) {
      return false;
    }
  }
  return count >= 3;
}

function isItem(block: OpenBlock): boolean {
  return block.name === 'listItem';
}

export default class OpenList implements TrackedContainer {
  name = 'list';
  isContainer = true;
  acceptsLazy = true;
  quoteLine = -1;
  openChild: TrackedContainer | undefined = undefined;
  closeEnd = -1;
  interruptLine = -1;
  ordered: boolean;
  /** The bullet character, or the delimiter of an ordered list. */
  marker: number;
  value: number;
  start: number;
  end: number;
  item: ItemState | undefined = undefined;

  constructor(found: Marker, start: number) {
    this.ordered = found.ordered;
    this.marker = found.code;
    this.value = found.value;
    this.start = start;
    this.end = start;
  }

  canContain: (block: OpenBlock) => boolean = isItem;

  /** True when `line` starts an item of this list. */
  startsSibling(line: Line): boolean {
    if (line.indent >= 4) {
      return false;
    }
    const text = line.text;
    const start = line.nonBlank;
    const found = readMarker(text, start, line.end);
    if (found === undefined || found.ordered !== this.ordered || found.code !== this.marker) {
      return false;
    }
    if (found.end < line.end && !isSpaceOrTab(text.charCodeAt(found.end))) {
      return false;
    }
    return !(!this.ordered && this.marker !== PLUS && isThematicBreak(text, start, line.end));
  }

  continue(state: BlockState, line: Line): boolean {
    const item = this.item;
    const matched =
      line.blank ||
      (item !== undefined && !item.furtherBlank && line.indent >= item.size) ||
      this.startsSibling(line);
    if (!matched) {
      return false;
    }
    this.quoteLine = parentQuoteLine(state.container);
    if (this.quoteLine === line.index) {
      // A quote prefix on this line ends up inside the list.
      this.end = line.end;
    }
    return true;
  }

  close(state: BlockState, children: RootContent[]): List {
    const items: ListItem[] = [];
    for (const child of children) {
      if (child.type === 'listItem') {
        items.push(child);
      }
    }
    let end = this.end;
    if (this.closeEnd > end) {
      end = this.closeEnd;
    }
    const childEnd = lastChildEnd(children);
    if (childEnd > end) {
      end = childEnd;
    }
    const endPoint = point(state.source, end);
    // Spread when a blank line separates two items, or the last item from
    // the end of the list.
    let spread = false;
    for (let i = 1; i < items.length && !spread; i++) {
      spread = items[i].position!.start.line - items[i - 1].position!.end.line >= 2;
    }
    if (!spread && items.length > 0) {
      spread = endPoint.line - items[items.length - 1].position!.end.line >= 2;
    }
    return {
      type: 'list',
      ordered: this.ordered,
      start: this.ordered ? this.value : null,
      spread,
      children: items,
      position: { start: point(state.source, this.start), end: endPoint },
    };
  }
}
