import type { AlignType, PhrasingContent, Table, TableCell, TableRow } from 'mdast';
import html from '../blocks/html';
import { paragraphIndents } from '../blocks/paragraph';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { CR, DASH, LF, TAB, isSpaceOrTab } from '../core/chars';
import { createLine, measureLine } from '../core/line';
import type { Line } from '../core/line';
import { point, skipLineEnding } from '../core/source';
import type { Source } from '../core/source';

// GFM tables, as micromark-extension-gfm-table and mdast-util-gfm-table.
// The delimiter row starts the table and takes the open paragraph's last
// line as the header row. Body rows follow until a blank line, a lazy line
// or a block start.

const PIPE = 124; // |
const COLON = 58; // :
const BACKSLASH = 92; // \
const BACKTICK = 96; // `
const LESS_THAN = 60; // <

/** Offset after the data run that starts at `i`. `\\` and `\|` stay inside it. */
function dataEnd(text: string, i: number, end: number): number {
  while (i < end) {
    const code = text.charCodeAt(i);
    if (code === PIPE || isSpaceOrTab(code)) {
      break;
    }
    i++;
    if (code === BACKSLASH && i < end) {
      const next = text.charCodeAt(i);
      if (next === BACKSLASH || next === PIPE) {
        i++;
      }
    }
  }
  return i;
}

/**
 * Number of cells in the header row `[start, end)`, or -1 when it is a
 * single pipe (micromark needs more than one pipe or data run).
 */
function headerCells(text: string, start: number, end: number): number {
  let size = 0;
  let tokens = 0;
  // A cell starts at the line start or after a pipe, once it has a token.
  let seen = false;
  if (text.charCodeAt(start) !== PIPE) {
    seen = true;
    tokens++;
  }
  let i = start;
  while (i < end) {
    const code = text.charCodeAt(i);
    if (isSpaceOrTab(code)) {
      i++;
      continue;
    }
    tokens++;
    if (seen) {
      seen = false;
      size++;
    }
    if (code === PIPE) {
      seen = true;
      i++;
    } else {
      i = dataEnd(text, i, end);
    }
  }
  return tokens > 1 ? size : -1;
}

/**
 * Reads the delimiter row `[start, end)` into `align`. Returns false when it
 * is not one: a cell is `:?-+:?`, and a pipe or colon must appear (else it is
 * a setext underline or thematic break).
 */
function delimiterRow(text: string, start: number, end: number, align: AlignType[]): boolean {
  let seen = false;
  let i = start;
  for (;;) {
    // Before a cell: an optional pipe and whitespace.
    if (i < end && text.charCodeAt(i) === PIPE) {
      seen = true;
      i++;
      while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
        i++;
      }
    }
    if (i === end) {
      break;
    }
    let left = false;
    let code = text.charCodeAt(i);
    if (code === COLON) {
      left = true;
      seen = true;
      i++;
    } else if (code !== DASH) {
      return false;
    }
    if (i === end || text.charCodeAt(i) !== DASH) {
      return false;
    }
    while (i < end && text.charCodeAt(i) === DASH) {
      i++;
    }
    let right = false;
    if (i < end && text.charCodeAt(i) === COLON) {
      right = true;
      seen = true;
      i++;
    }
    if (left) {
      align.push(right ? 'center' : 'left');
    } else {
      align.push(right ? 'right' : null);
    }
    while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
      i++;
    }
    if (i === end) {
      break;
    }
    code = text.charCodeAt(i);
    if (code !== PIPE) {
      return false;
    }
  }
  return seen;
}

/** Offset of the start of the line that holds `offset`. */
function lineStartOf(text: string, offset: number): number {
  let i = offset;
  while (i > 0) {
    const code = text.charCodeAt(i - 1);
    if (code === LF || code === CR) {
      break;
    }
    i--;
  }
  return i;
}

/** Visual column of `offset` in its line, tab stops of 4. */
function columnAt(text: string, offset: number): number {
  let column = 0;
  for (let i = lineStartOf(text, offset); i < offset; i++) {
    if (text.charCodeAt(i) === TAB) {
      column += 4 - (column % 4);
    } else {
      column++;
    }
  }
  return column;
}

/** Visual columns from `whitespace` (after `partialTab` split-tab columns) to `contentStart`. */
function indentColumns(
  text: string,
  whitespace: number,
  contentStart: number,
  partialTab: number,
): number {
  let column = columnAt(text, whitespace);
  const before = column;
  for (let i = whitespace; i < contentStart; i++) {
    if (text.charCodeAt(i) === TAB) {
      column += 4 - (column % 4);
    } else {
      column++;
    }
  }
  return column - before + partialTab;
}

// The header line's start after its container prefixes and its split-tab
// columns, set by `headerPrefix`.
let prefixStart = 0;
let prefixTab = 0;

/**
 * Finds where the header line (the paragraph's last line) starts after its
 * container prefixes. The paragraph records that only for continuation lines
 * with whitespace there; else it is the content start.
 */
function headerPrefix(state: BlockState, lines: number[]): void {
  prefixStart = lines[lines.length - 2];
  prefixTab = 0;
  if (lines.length < 4 || state.paragraph === undefined) {
    return;
  }
  const indents = paragraphIndents(state.paragraph);
  if (indents === undefined || indents.length === 0) {
    return;
  }
  const last = indents.length - 3;
  if (indents[last] === lines[lines.length - 1]) {
    prefixStart = indents[last + 1];
    prefixTab = indents[last + 2];
  }
}

/** Unescapes `\|` in inline code under `nodes`, as mdast-util-gfm-table does in tables. */
function unescapePipes(nodes: PhrasingContent[]): void {
  for (const node of nodes) {
    if (node.type === 'inlineCode') {
      const value = node.value;
      let result = '';
      let run = 0;
      let i = 0;
      while (i < value.length - 1) {
        if (value.charCodeAt(i) !== BACKSLASH) {
          i++;
          continue;
        }
        const next = value.charCodeAt(i + 1);
        if (next === PIPE) {
          result += value.slice(run, i);
          run = i + 1;
        }
        // `\\` stays, and cannot escape a pipe after it.
        i += 2;
      }
      if (run > 0) {
        node.value = result + value.slice(run);
      }
    } else if ('children' in node) {
      unescapePipes(node.children);
    }
  }
}

/** Inline target for a cell whose code spans may hold `\|`. */
class PipeCell {
  cell: TableCell;

  constructor(cell: TableCell) {
    this.cell = cell;
  }

  get children(): PhrasingContent[] {
    return this.cell.children;
  }

  set children(nodes: PhrasingContent[]) {
    unescapePipes(nodes);
    this.cell.children = nodes;
  }
}

/** Whether `[start, end)` holds a backtick and an escaped pipe. */
function needsUnescape(text: string, start: number, end: number): boolean {
  let tick = false;
  let pipe = false;
  for (let i = start; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code === BACKTICK) {
      tick = true;
    } else if (code === BACKSLASH && i + 1 < end) {
      i++;
      if (text.charCodeAt(i) === PIPE) {
        pipe = true;
      }
    }
  }
  return tick && pipe;
}

// Cells of one row as flat triples: cell start, content start (-1 when
// empty), content end. Reused across rows.
const cells: number[] = [];

/**
 * Splits the row `[start, end)` into `cells`. A leading pipe does not
 * separate. Each later pipe starts a cell; the last cell is dropped when it
 * has no content and is not the only one, so a trailing pipe belongs to the
 * cell before it.
 */
function scanCells(text: string, start: number, end: number): void {
  cells.length = 0;
  let cellStart = start;
  let contentStart = -1;
  let contentEnd = -1;
  let i = start;
  if (text.charCodeAt(i) === PIPE) {
    i++;
  }
  while (i < end) {
    const code = text.charCodeAt(i);
    if (isSpaceOrTab(code)) {
      i++;
    } else if (code === PIPE) {
      cells.push(cellStart, contentStart, contentEnd);
      cellStart = i;
      contentStart = -1;
      i++;
    } else {
      if (contentStart < 0) {
        contentStart = i;
      }
      i = dataEnd(text, i, end);
      contentEnd = i;
    }
  }
  if (contentStart >= 0 || cells.length === 0) {
    cells.push(cellStart, contentStart, contentEnd);
  }
}

function buildRow(state: BlockState, start: number, end: number): TableRow {
  const source = state.source;
  const text = source.text;
  scanCells(text, start, end);
  const children: TableCell[] = [];
  for (let c = 0; c < cells.length; c += 3) {
    const cellEnd = c + 3 < cells.length ? cells[c + 3] : end;
    const cell: TableCell = {
      type: 'tableCell',
      children: [],
      position: { start: point(source, cells[c]), end: point(source, cellEnd) },
    };
    const contentStart = cells[c + 1];
    if (contentStart >= 0) {
      const contentEnd = cells[c + 2];
      const target = needsUnescape(text, contentStart, contentEnd) ? new PipeCell(cell) : cell;
      state.inline(target, [contentStart, contentEnd]);
    }
    children.push(cell);
  }
  return {
    type: 'tableRow',
    children,
    position: { start: point(source, start), end: point(source, end) },
  };
}

// End of the last table a lazy line closed, per document.
const lazyCloseEnds = new WeakMap<Source, number>();

function continueTable(_state: BlockState, line: Line): boolean {
  return !line.blank;
}

class OpenTable implements OpenBlock {
  name = 'table';
  isContainer = false;
  acceptsLazy = false;
  interruptible = true;
  align: AlignType[];
  /** Flat [start, end) pairs: the header row, then body rows. */
  rows: number[];
  /** End of the delimiter row. */
  delimiterEnd: number;

  constructor(align: AlignType[], rows: number[], delimiterEnd: number) {
    this.align = align;
    this.rows = rows;
    this.delimiterEnd = delimiterEnd;
  }

  continue: (state: BlockState, line: Line) => boolean = continueTable;

  addLine(_state: BlockState, line: Line): void {
    this.rows.push(line.nonBlank, line.end);
  }

  close(state: BlockState): Table {
    const rows = this.rows;
    const children: TableRow[] = [];
    for (let r = 0; r < rows.length; r += 2) {
      children.push(buildRow(state, rows[r], rows[r + 1]));
    }
    const end = rows.length > 2 ? rows[rows.length - 1] : this.delimiterEnd;
    // Closed by a line an open container did not match, with no new
    // container: micromark's flow goes on, so that line was a lazy body row
    // and a paragraph it opens cannot use it as a header.
    if (state.unmatched && !state.closeKeepsLineEnding) {
      lazyCloseEnds.set(state.source, end);
    }
    return {
      type: 'table',
      align: this.align,
      children,
      position: { start: point(state.source, rows[0]), end: point(state.source, end) },
    };
  }
}

/** Whether the line holding `start` comes right after a table that a lazy line closed. */
function followsLazyClose(state: BlockState, start: number): boolean {
  const end = lazyCloseEnds.get(state.source);
  if (end === undefined) {
    return false;
  }
  const text = state.source.text;
  return lineStartOf(text, start) === skipLineEnding(text, end);
}

// One line object for the header row when it turns out to start HTML.
let headerLine: Line | undefined;

/**
 * micromark's table check runs while the paragraph is open, but once it
 * passes the header line is parsed again with no paragraph. Kind 7 HTML,
 * which cannot interrupt a paragraph, then starts there and takes the
 * delimiter row as its second line (`a\n<n>\n|-`).
 */
function headerHtml(state: BlockState, line: Line, end: number): OpenBlock | undefined {
  const text = line.text;
  headerLine ??= createLine(text);
  const header = headerLine;
  header.text = text;
  header.index = line.index - 1;
  header.start = prefixStart;
  header.end = end;
  // Split-tab columns sit before `start`.
  header.visualColumn = columnAt(text, prefixStart) - prefixTab;
  header.partialTab = prefixTab;
  measureLine(header);
  const block = html.start(state, header);
  header.text = '';
  if (block !== undefined) {
    block.addLine!(state, line);
  }
  return block;
}

const table: BlockRule = {
  name: 'table',
  // After list items (a container on the delimiter line wins) and before
  // indented code.
  priority: 750,
  canInterruptParagraph: true,
  triggers: '|:-',
  gfm: true,
  start(state: BlockState, line: Line): OpenBlock | undefined {
    const paragraph = state.paragraph;
    if (paragraph === undefined || state.lazy || line.indent >= 4) {
      return undefined;
    }
    const lines = paragraph.lines;
    if (lines.length === 0) {
      return undefined;
    }
    const text = line.text;
    const align: AlignType[] = [];
    if (!delimiterRow(text, line.nonBlank, line.end, align)) {
      return undefined;
    }
    const count = lines.length;
    const headerStart = lines[count - 2];
    const headerEnd = lines[count - 1];
    if (headerCells(text, headerStart, headerEnd) !== align.length) {
      return undefined;
    }
    if (count === 2 && followsLazyClose(state, headerStart)) {
      return undefined;
    }
    headerPrefix(state, lines);
    // A continuation line with 4 or more columns of indentation does not try
    // an interrupt in micromark, so it cannot be a header.
    if (count > 2 && indentColumns(text, prefixStart, headerStart, prefixTab) >= 4) {
      return undefined;
    }
    const header = state.splitParagraph(1);
    if (header === undefined) {
      return undefined;
    }
    if (count > 2 && text.charCodeAt(headerStart) === LESS_THAN) {
      const block = headerHtml(state, line, headerEnd);
      if (block !== undefined) {
        return block;
      }
    }
    line.start = line.end;
    return new OpenTable(align, header, line.end);
  },
};

export default table;
