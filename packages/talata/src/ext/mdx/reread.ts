import type { BlockRule, BlockState, OpenParagraph } from '../../core/blocks';
import { createLine, measureLine } from '../../core/line';
import type { Source } from '../../core/source';
import { FLOW, MORE, NOK, Scanner } from './scanner';
import type { Item } from './scanner';

// When a flow construct fails on a later line (text after its last tag),
// micromark reads its lines again as flow, without containers: paragraphs,
// and whatever interrupts them. This finds what interrupts them.

const SPACE = 32;
const TAB = 9;

/** What the last `interruptAt` call found besides the spans. */
export const found: {
  /** For each span: the tags and expressions on it, or undefined. */
  constructs: (Item[] | undefined)[];
  /** Index in the lines of the header row of a table, or -1, and of its last row. Nothing after it was read. */
  tableAt: number;
  tableEnd: number;
  /** The marker of a code or math fence left open at the last line, or -1. */
  openFence: number;
  /** Index in the lines of the opening line of a container directive, or -1. Nothing after it was read. */
  directiveAt: number;
  /**
   * Index in the lines of the first line of tags and expressions still open
   * at the end of the lines, or -1. Nothing after it was read.
   */
  openAt: number;
} = { constructs: [], tableAt: -1, tableEnd: -1, openFence: -1, directiveAt: -1, openAt: -1 };

const probe = new Scanner();

/** Content ranges of the cells of a table row, trimmed, as flat pairs. */
export function tableCells(text: string, start: number, end: number): number[] {
  const cells: number[] = [];
  let i = start;
  if (text.charCodeAt(i) === 124) {
    i++;
  }
  let cell = i;
  for (; i <= end; i++) {
    const code = i < end ? text.charCodeAt(i) : 124;
    if (code === 92) {
      i++;
    } else if (code === 124) {
      let from = cell;
      let to = i;
      while (from < to && (text.charCodeAt(from) === SPACE || text.charCodeAt(from) === TAB)) {
        from++;
      }
      while (to > from && (text.charCodeAt(to - 1) === SPACE || text.charCodeAt(to - 1) === TAB)) {
        to--;
      }
      if (i < end || from < to) {
        cells.push(from, to);
      }
      cell = i + 1;
    }
  }
  return cells;
}

/**
 * Whether the last span ends on line `i`, so that line is no table header:
 * a flow construct, or a setext underline after paragraph text. An
 * underline with no text before it (none, or only definitions) is text.
 */
function endsSpan(
  state: BlockState,
  lines: number[],
  spans: number[],
  base: number,
  i: number,
): boolean {
  const count = spans.length;
  if (count === 0 || spans[count - 1] !== i) {
    return false;
  }
  const text = state.source.text;
  const code = text.charCodeAt(lines[i]);
  if (
    spans[count - 2] !== i ||
    (code !== 61 && code !== 45) ||
    !isRun(text, lines[i], lines[i + 1], code, 1, false)
  ) {
    return true;
  }
  // Text before it: lines after the span before, or from the first line,
  // that definitions do not take.
  const textStart = count >= 4 ? spans[count - 3] + 2 : base;
  if (i <= textStart) {
    return false;
  }
  const paragraph: OpenParagraph = {
    name: 'paragraph',
    isContainer: false,
    acceptsLazy: false,
    lines: lines.slice(textStart, i),
    start: lines[textStart],
    continue: noLine,
    close: noNode,
  };
  for (const rule of state.rules.paragraphPrefixRules) {
    if (paragraph.lines.length === 0) {
      break;
    }
    rule.consume(state, paragraph, []);
  }
  return paragraph.lines.length > 0;
}

function noLine(): boolean {
  return false;
}

function noNode(): undefined {
  return undefined;
}

/** Whether line `i` of `lines` is a table delimiter row for the line before it. */
function isTableStart(text: string, lines: number[], i: number): boolean {
  const start = lines[i];
  const end = lines[i + 1];
  // A pipe or a colon: `-` alone is a setext underline.
  let marked = false;
  for (let j = start; j < end; j++) {
    const code = text.charCodeAt(j);
    if (code === 124 || code === 58) {
      marked = true;
    } else if (code !== 45 && code !== SPACE && code !== TAB) {
      return false;
    }
  }
  if (!marked) {
    return false;
  }
  const delimiter = tableCells(text, start, end);
  for (let j = 0; j < delimiter.length; j += 2) {
    let from = delimiter[j];
    const to = delimiter[j + 1];
    if (text.charCodeAt(from) === 58) {
      from++;
    }
    let dashes = 0;
    while (from < to && text.charCodeAt(from) === 45) {
      from++;
      dashes++;
    }
    if (dashes === 0 || (from < to && !(from === to - 1 && text.charCodeAt(from) === 58))) {
      return false;
    }
  }
  return tableCells(text, lines[i - 2], lines[i - 1]).length === delimiter.length;
}

function hasRule(state: BlockState, code: number, name: string): BlockRule | undefined {
  for (const rule of state.rules.blockByChar[code]) {
    if (rule.name === name) {
      return rule;
    }
  }
  return undefined;
}

/** Whether `text` from `from` to `end` is `marker` repeated `min` or more times, then whitespace. */
export function isRun(
  text: string,
  from: number,
  end: number,
  marker: number,
  min: number,
  spaced: boolean,
): boolean {
  let count = 0;
  for (let i = from; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code === marker) {
      count++;
    } else if (code !== SPACE && code !== TAB) {
      return false;
    } else if (!spaced && count > 0) {
      for (let j = i; j < end; j++) {
        const rest = text.charCodeAt(j);
        if (rest !== SPACE && rest !== TAB) {
          return false;
        }
      }
      return count >= min;
    }
  }
  return count >= min;
}

/**
 * The lines from `from` on that end a paragraph in flow: blank lines and
 * flow constructs that can interrupt it, as pairs of indexes in `lines` of
 * their first and last line. The lines read start at `base`.
 */
export function interruptAt(state: BlockState, lines: number[], from: number, base = 0): number[] {
  const text = state.source.text;
  const spans: number[] = [];
  found.constructs = [];
  found.tableAt = -1;
  found.openFence = -1;
  found.directiveAt = -1;
  found.openAt = -1;
  for (let i = from; i < lines.length; i += 2) {
    const start = lines[i];
    const end = lines[i + 1];
    if (start === end) {
      spans.push(i, i);
      found.constructs.push(undefined);
      continue;
    }
    if (
      state.options.gfm &&
      i >= base + 2 &&
      !endsSpan(state, lines, spans, base, i - 2) &&
      isTableStart(text, lines, i)
    ) {
      // A GFM table from the line before: the paragraph ends before that
      // line, and the table takes the rest. The block parser reads it
      // (`OpenMdxFlow.handOver`); the spans stop before it.
      found.tableAt = i - 2;
      if (spans.length > 0 && spans[spans.length - 1] === i - 2) {
        // An underline that is text: the header row.
        spans.length -= 2;
        found.constructs.length--;
      }
      // Body rows up to a blank line or a flow construct, which may throw.
      let row = i + 2;
      while (row < lines.length && lines[row] !== lines[row + 1]) {
        const first = text.charCodeAt(lines[row]);
        // A setext underline is a row: no paragraph is open in a table.
        const flow =
          first === 60 || first === 123
            ? probeConstruct(lines, row, text, state.source) !== -1 || found.openAt !== -1
            : startsFlow(state, lines, row) &&
              first !== 61 &&
              (first !== 45 || isRun(text, lines[row], lines[row + 1], 45, 3, true));
        if (flow) {
          break;
        }
        row += 2;
      }
      found.tableEnd = row - 2;
      return spans;
    }
    const code = text.charCodeAt(start);
    let last = startsFlow(state, lines, i) ? i : -1;
    let items: Item[] | undefined;
    if (code === 60 || code === 123) {
      last = probeConstruct(lines, i, text, state.source);
      if (found.openAt !== -1) {
        return spans;
      }
      items = probe.items;
    } else if (last !== -1 && code === 58 && text.startsWith(':::', start)) {
      // A container directive: its content is a document of its own, which
      // the block parser reads (`OpenMdxFlow.handOver`). The spans stop
      // before it.
      found.directiveAt = i;
      return spans;
    } else if (last !== -1 && (code === 96 || code === 126 || code === 36)) {
      // Code or math to its closing fence: those lines are not text.
      let size = 0;
      while (text.charCodeAt(start + size) === code) {
        size++;
      }
      last = i + 2;
      while (last < lines.length && !isFence(text, lines[last], lines[last + 1], code, size)) {
        last += 2;
      }
      if (last >= lines.length) {
        found.openFence = code;
        spans.push(i, lines.length - 2);
        found.constructs.push(undefined);
        return spans;
      }
    }
    if (last !== -1) {
      spans.push(i, Math.min(last, lines.length - 2));
      found.constructs.push(items);
      i = last;
    }
  }
  return spans;
}

/** Whether line `i` of `lines` starts a one-line flow construct or a fence that interrupts a paragraph. */
function startsFlow(state: BlockState, lines: number[], i: number): boolean {
  const text = state.source.text;
  const start = lines[i];
  const end = lines[i + 1];
  const code = text.charCodeAt(start);
  if (code === 35) {
    let marks = 0;
    while (text.charCodeAt(start + marks) === 35) {
      marks++;
    }
    const after = text.charCodeAt(start + marks);
    return marks <= 6 && (start + marks === end || after === SPACE || after === TAB);
  }
  if (code === 96 || code === 126) {
    let run = start;
    while (text.charCodeAt(run) === code) {
      run++;
    }
    // A backtick fence has no backtick in its info.
    return run - start >= 3 && (code === 126 || !text.slice(run, end).includes('`'));
  }
  if (code === 42 || code === 95) {
    return isRun(text, start, end, code, 3, true);
  }
  if (code === 45) {
    return isRun(text, start, end, code, 3, true) || isRun(text, start, end, code, 1, false);
  }
  if (code === 61) {
    return isRun(text, start, end, code, 1, false);
  }
  if (code === 36) {
    let fence = start;
    while (text.charCodeAt(fence) === 36) {
      fence++;
    }
    return (
      fence - start >= 2 &&
      !text.slice(fence, end).includes('$') &&
      hasRule(state, code, 'mathFlow') !== undefined
    );
  }
  if (code === 58) {
    return startsDirective(state, start, end);
  }
  return false;
}

/** Whether a leaf or container directive starts on the line from `start` to `end`. */
function startsDirective(state: BlockState, start: number, end: number): boolean {
  const text = state.source.text;
  // A container fence has the head of a leaf after its first colons.
  let from = start;
  if (text.startsWith(':::', start)) {
    if (hasRule(state, 58, 'directiveContainer') === undefined) {
      return false;
    }
    while (text.charCodeAt(from + 2) === 58) {
      from++;
    }
  }
  const rule = hasRule(state, 58, 'directiveLeaf');
  if (rule === undefined || !text.startsWith('::', start)) {
    return false;
  }
  // The leaf rule reads the head; its label is parsed as in the reference.
  const line = createLine(text, state.rules.indentLimit);
  line.start = from;
  line.end = end;
  measureLine(line);
  return rule.start(state, line) !== undefined;
}

/**
 * The index of the last line of the tags and expressions that start line
 * `i`, read again over the next lines, or -1 when they end in text. When
 * they are still open at the end of the lines, `found.openAt` is `i`: the
 * block reads the next lines into them as for any open construct. A syntax
 * error throws: the reference's error too.
 */
function probeConstruct(lines: number[], i: number, text: string, source: Source): number {
  const end = lines[i + 1];
  probe.begin(source, FLOW, lines[i], end, end === text.length);
  let result = probe.run();
  let last = i;
  while (result === MORE) {
    last += 2;
    if (last >= lines.length) {
      found.openAt = i;
      return -1;
    }
    const lineEnd = lines[last + 1];
    probe.feed(lines[last], lineEnd, lineEnd === text.length, '', lines[last], false);
    result = probe.run();
  }
  return result === NOK ? -1 : last;
}

/** Whether `text` from `start` to `end` is a closing fence of `size` or more `marker`s. */
export function isFence(
  text: string,
  start: number,
  end: number,
  marker: number,
  size: number,
): boolean {
  let i = start;
  while (i < end && (text.charCodeAt(i) === SPACE || text.charCodeAt(i) === TAB)) {
    i++;
  }
  const from = i;
  while (i < end && text.charCodeAt(i) === marker) {
    i++;
  }
  if (i - from < size) {
    return false;
  }
  while (i < end && (text.charCodeAt(i) === SPACE || text.charCodeAt(i) === TAB)) {
    i++;
  }
  return i === end;
}
