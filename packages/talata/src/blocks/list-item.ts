import type { BlockContent, DefinitionContent, ListItem, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { CR, LF } from '../core/chars';
import { advanceLine, consumeColumns } from '../core/line';
import type { Line } from '../core/line';
import { point } from '../core/source';
import {
  closeAtNewContainer,
  interrupts,
  isFlow,
  lastChildEnd,
  linkChild,
  parentQuoteLine,
} from './blockquote';
import type { TrackedContainer } from './blockquote';
import OpenList, { readMarker } from './list';
import type { ItemState } from './list';

const DIGIT_1 = 49;

class OpenListItem implements TrackedContainer, ItemState {
  name = 'listItem';
  isContainer = true;
  acceptsLazy = true;
  quoteLine = -1;
  openChild: TrackedContainer | undefined = undefined;
  // Items end at their last content: the reference skips quote prefixes here.
  closeEnd = -1;
  interruptLine = -1;
  size: number;
  initialBlank: boolean;
  furtherBlank = false;
  start: number;
  firstEnd: number;
  /**
   * Where the event that closes this item ends when it is on a later line: a
   * sibling's marker and whitespace, or a new container's position. -1 if none.
   */
  nextEnd = -1;
  /** Start of the line of `nextEnd`. */
  nextLineStart = -1;
  /** The item continued on the last line, which has no line ending. */
  matchedEnd = false;

  constructor(start: number, firstEnd: number, size: number, initialBlank: boolean) {
    this.start = start;
    this.firstEnd = firstEnd;
    this.size = size;
    this.initialBlank = initialBlank;
  }

  continue(state: BlockState, line: Line): boolean {
    this.quoteLine = parentQuoteLine(state.container);
    if (line.blank) {
      this.furtherBlank = this.furtherBlank || this.initialBlank;
      consumeColumns(line, this.size);
      this.matchedEnd = line.end === line.text.length;
      return true;
    }
    const further = this.furtherBlank;
    this.furtherBlank = false;
    this.initialBlank = false;
    if (further || line.indent < this.size) {
      return false;
    }
    consumeColumns(line, this.size);
    this.matchedEnd = line.end === line.text.length;
    return true;
  }

  closedAt(position: number, lineStart: number): void {
    this.nextEnd = position;
    this.nextLineStart = lineStart;
  }

  close(state: BlockState, children: RootContent[]): ListItem {
    const flow: (BlockContent | DefinitionContent)[] = [];
    for (const child of children) {
      if (isFlow(child)) {
        flow.push(child);
      }
    }
    let end = this.firstEnd;
    const childEnd = lastChildEnd(children);
    if (childEnd > end) {
      end = childEnd;
      // The last child kept its line ending (fenced code, HTML). The
      // reference then finds no line ending before the event that closes the
      // item, and ends the item at that event.
      const text = state.source.text;
      const before = text.charCodeAt(childEnd - 1);
      if (before === LF || before === CR) {
        if (this.nextLineStart === childEnd) {
          end = this.nextEnd;
        } else if (this.matchedEnd) {
          end = text.length;
        }
      }
    }
    // Spread when a blank line separates two direct children.
    let spread = false;
    for (let i = 1; i < flow.length && !spread; i++) {
      spread = flow[i].position!.start.line - flow[i - 1].position!.end.line >= 2;
    }
    return {
      type: 'listItem',
      spread,
      checked: null,
      children: flow,
      position: { start: point(state.source, this.start), end: point(state.source, end) },
    };
  }
}

const listItem: BlockRule = {
  name: 'listItem',
  priority: 700,
  canInterruptParagraph: true,
  triggers: '*+-0123456789',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const start = line.nonBlank;
    const found = readMarker(text, start, line.end);
    if (found === undefined) {
      return undefined;
    }
    const parent = state.container;
    const sibling =
      parent instanceof OpenList &&
      parent.ordered === found.ordered &&
      parent.marker === found.code;
    // micromark restricts list starts only when every container matched the
    // line and a paragraph is open, and keeps that for the rest of the line.
    const interrupt = !sibling && interrupts(state, line);
    if (interrupt && found.ordered && (found.digits !== 1 || text.charCodeAt(start) !== DIGIT_1)) {
      return undefined;
    }
    const position = line.start;
    const base = line.visualColumn;
    advanceLine(line, found.end);
    let size: number;
    const initialBlank = line.blank;
    if (initialBlank) {
      if (interrupt) {
        return undefined;
      }
      size = line.visualColumn - base + 1;
    } else {
      const indent = line.indent;
      if (indent === 0) {
        return undefined;
      }
      consumeColumns(line, indent <= 4 ? indent : 1);
      size = line.visualColumn - base;
    }
    let list: OpenList;
    if (sibling) {
      list = parent;
      const previous = list.openChild;
      if (previous instanceof OpenListItem) {
        previous.closedAt(line.start, state.source.lineStarts[line.index]);
      }
    } else {
      closeAtNewContainer(state, line, position);
      list = new OpenList(found, start);
      linkChild(parent, list);
      state.openContainer(list);
    }
    const item = new OpenListItem(start, line.end, size, initialBlank);
    if (interrupt) {
      item.interruptLine = line.index;
    }
    list.item = item;
    list.openChild = item;
    return item;
  },
};

export default listItem;
