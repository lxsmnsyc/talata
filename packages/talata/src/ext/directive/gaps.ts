import type { BlockState, OpenBlock } from '../../core/blocks';
import { isSpaceOrTab } from '../../core/chars';
import { advanceLine, consumeColumns } from '../../core/line';
import type { Line } from '../../core/line';
import { isTracked } from '../../blocks/blockquote';
import type { TrackedContainer } from '../../blocks/blockquote';
import OpenList from '../../blocks/list';
import { setFootnoteIndent } from '../../gfm/footnote';

// The content of a container directive is a document of its own, but
// micromark's events of that document interleave with the prefixes of the
// containers around the directive. A quote prefix there is a token inside
// the blocks of the content: a block that ends on a line with one ends at
// the start of that line, or after the prefix, as `closeEnds` sets. The core
// tracks those lines on the root of the nested document (`quoteLine`); this
// runs on each of them before the blocks of the content read the line.

const GREATER_THAN = 62;

/** What follows the last line of the content of a container directive. */
export const NEXT_NONE = 0;
/** The directive goes on after it: its closing fence or an empty last line. */
export const NEXT_LATER = 1;
/** A container starts outside the directive. */
export const NEXT_STARTS = 2;

/** Whether a real line, not the empty one after a final line ending, follows `line`. */
function hasLaterLine(state: BlockState, line: Line): boolean {
  const starts = state.source.lineStarts;
  return line.index + 1 < starts.length && starts[line.index + 1] < state.source.text.length;
}

/**
 * Whether `block`, a container in the content, continues on `next`, a line
 * it has not read yet; consumes its prefix. It reads the block as its own
 * `continue` would, without changing it. `footnote` is where the indent of a
 * footnote definition just before ended, or -1.
 */
function continuesNext(block: OpenBlock, next: Line, footnote: number): boolean {
  if (block instanceof OpenList) {
    // The list decides for its open item, which needs its indent.
    if (next.blank) {
      return true;
    }
    const item = block.item;
    if (item === undefined || item.furtherBlank || next.indent < item.size) {
      return false;
    }
    consumeColumns(next, item.size);
    return true;
  }
  switch (block.name) {
    case 'blockquote': {
      if (next.indent >= next.indentLimit || next.text.charCodeAt(next.nonBlank) !== GREATER_THAN) {
        return false;
      }
      advanceLine(next, next.nonBlank + 1);
      if (next.start < next.end && isSpaceOrTab(next.text.charCodeAt(next.start))) {
        consumeColumns(next, 1);
      }
      return true;
    }
    case 'footnoteDefinition': {
      if (next.blank || (next.indent === 0 && next.start === footnote)) {
        return true;
      }
      if (next.indent < 4) {
        return false;
      }
      consumeColumns(next, 4);
      return true;
    }
    default:
      // A list item continues where its list does.
      return true;
  }
}

/** Whether one of the open containers from `child` on is a block quote. */
function hasQuoteFrom(state: BlockState, child: TrackedContainer | undefined): boolean {
  for (let block = child; block !== undefined; block = block.openChild) {
    if (state.getDepth(block) < 0) {
      return false;
    }
    if (block.name === 'blockquote') {
      return true;
    }
  }
  return false;
}

/**
 * Makes a list item end at `end` or later. `indentEnd` is the end of the last
 * indent the item's walk back stops at (`src/blocks/list-item.ts`).
 */
function raiseIndentEnd(block: OpenBlock, end: number): void {
  if ('indentEnd' in block && typeof block.indentEnd === 'number' && block.indentEnd < end) {
    block.indentEnd = end;
  }
}

/** Columns of indent the open item of `block` needs, when it is a list; else 0. */
function getItemSize(block: OpenBlock): number {
  return block instanceof OpenList && block.item !== undefined ? block.item.size : 0;
}

/**
 * Runs on line `k` of the content (`span`, after the prefixes around), before
 * the blocks of the content read it. `last` is the index of the last line,
 * `next` what follows it (`NEXT_*`), `quoted` the indexes of the lines on
 * which a quote prefix or footnote indent around matched, and `indents` those
 * on which a footnote definition around took its indent.
 */
export function readContentLine(
  state: BlockState,
  line: Line,
  k: number,
  last: number,
  next: number,
  quoted: Set<number> | undefined,
  indents: Set<number> | undefined,
): void {
  const afterIndent = indents?.has(line.index) === true;
  if (afterIndent) {
    setFootnoteIndent(state, state.source.lineStarts[line.index]);
  }
  const root = state.getBlock(0);
  if (quoted === undefined || !quoted.has(line.index) || root === undefined || !isTracked(root)) {
    return;
  }
  root.quoteLine = line.index;
  const later = k < last || next === NEXT_LATER;
  const startsNext = k === last && next === NEXT_STARTS;
  const empty = line.start === line.end && line.partialTab === 0;
  if (empty && !later && !startsNext) {
    return;
  }
  // On a blank line before a final line ending they end with the line.
  closeEnds(state, root, line, line.blank && !hasLaterLine(state, line), startsNext, afterIndent);
}

/**
 * Containers in the content end at the start of this line, or with
 * `atLineEnd` at its end, if they close here. A quote ends at its end only
 * when a prefix inside the content is on the line, as the reference walks
 * back to it.
 */
function closeEnds(
  state: BlockState,
  root: TrackedContainer,
  line: Line,
  atLineEnd: boolean,
  startsNext: boolean,
  afterIndent: boolean,
): void {
  const lineStart = state.source.lineStarts[line.index];
  const end = atLineEnd ? line.end : lineStart;
  // A list item or footnote prefix inside, before the quote, is a token on the line.
  let indented = false;
  // Columns of the list item prefixes on a blank line.
  let need = 0;
  // A quote does not continue over a blank line: the blocks in it end with it.
  let quoted = false;
  // The open block the loop saw before `child`.
  let previous: TrackedContainer | undefined;
  // The line after the prefixes of the quotes inside that continue on it,
  // while only such quotes are between the root and `child`.
  let direct = true;
  // A container starts on the next line and no quote is open inside: the
  // content keeps its final line ending, and the blocks inside end after it,
  // as their last children do, not at this blank line.
  const keepsEnding = startsNext && !hasQuoteFrom(state, root.openChild);
  const rest: Line = { ...line };
  // Where the indent of a footnote definition just before ended, or -1.
  let follow = -1;
  let blank = line.blank;
  let indent = line.indent;
  for (
    let child: TrackedContainer | undefined = root.openChild;
    child !== undefined;
    previous = child, child = child.openChild
  ) {
    if (state.getDepth(child) < 0) {
      // `openChild` stays linked after a block closes, and so do the blocks
      // in it: a closed block keeps the end it had.
      break;
    }
    if (!blank && direct) {
      // Quote markers and item and footnote indents on the line, read by
      // column, so that a quote marker after them is read where its block
      // expects it.
      direct = continuesNext(child, rest, follow);
      follow = child.name === 'footnoteDefinition' && !rest.blank ? rest.start : -1;
      if (direct && child.name === 'blockquote') {
        // The quote continues on this line; the blocks in it see the rest.
        blank = rest.blank;
        indent = rest.indent;
        need = 0;
        continue;
      }
    }
    if (child.name === 'blockquote') {
      if (blank && !quoted && previous?.name === 'listItem') {
        // The quote in an item ends here; a container that starts on a
        // later line does not move the item's end there. A quote that
        // closed on an earlier blank line fixed the end then.
        raiseIndentEnd(previous, line.end);
      }
      // On a blank line, whitespace left after those prefixes is not one.
      const prefixOnly = !blank || (indent <= need && !quoted);
      child.closeEnd =
        atLineEnd && indented && prefixOnly && line.start < line.end ? line.end : lineStart;
      quoted = true;
    } else {
      // In a quote that ends on this blank line, the blocks end with it.
      child.closeEnd = blank && quoted ? lineStart : end;
      indented = indented || child.name === 'listItem' || child.name === 'footnoteDefinition';
      // A footnote definition takes no indent on a blank line.
      need += getItemSize(child);
    }
    if (afterIndent && child.name === 'listItem') {
      // The indent of a footnote definition around is a token on this
      // line: an item that ends here ends at the line start, as the list.
      raiseIndentEnd(child, lineStart);
    }
    if (line.blank && !quoted && child.name === 'listItem' && !keepsEnding) {
      // A list item ends at its last content, or after the quote prefix of
      // this blank line when its last child kept its line ending. A quote
      // inside that continues on the line keeps the item open past it.
      child.closedAt?.(line.end, lineStart);
    }
  }
}
