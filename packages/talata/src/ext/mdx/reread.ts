import type { BlockRule, BlockState } from '../../core/blocks';
import { createLine, measureLine } from '../../core/line';
import { skipLineEnding } from '../../core/source';
import { quoteMissing } from './prefixes';
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
  /** Index in the lines of the header row of a table, or -1. */
  tableAt: number;
  /** The marker of a fence left open at the last line, or -1, and its size. */
  openFence: number;
  openFenceSize: number;
} = { constructs: [], tableAt: -1, openFence: -1, openFenceSize: 0 };

const probe = new Scanner();

/**
 * Feeds `probe` the source line after the line ending at `lineEnd`, or the
 * end of the text. A line that a quote around does not take is lazy, which
 * throws. Returns the end of that line.
 */
function feedSourceLine(state: BlockState, bound: number, lineEnd: number): number {
  const text = state.source.text;
  const next = skipLineEnding(text, lineEnd);
  const lazy = quoteMissing(state, bound, next);
  if (lazy !== -1) {
    probe.feed(lazy, lazy, false, '', lazy, true);
  }
  if (next === lineEnd || next === text.length) {
    probe.feedEnd(next);
    return next;
  }
  let stop = next;
  while (stop < text.length && text.charCodeAt(stop) !== 10 && text.charCodeAt(stop) !== 13) {
    stop++;
  }
  let first = next;
  while (first < stop && (text.charCodeAt(first) === SPACE || text.charCodeAt(first) === TAB)) {
    first++;
  }
  probe.feed(first, stop, stop === text.length, '', next, false);
  return stop;
}

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
 * their first and last line.
 */
export function interruptAt(
  state: BlockState,
  bound: number,
  lines: number[],
  from: number,
): number[] {
  const text = state.source.text;
  const spans: number[] = [];
  found.constructs = [];
  found.tableAt = -1;
  found.openFence = -1;
  for (let i = from; i < lines.length; i += 2) {
    const start = lines[i];
    const end = lines[i + 1];
    if (start === end) {
      spans.push(i, i);
      found.constructs.push(undefined);
      continue;
    }
    if (state.options.gfm && i >= 2 && isTableStart(text, lines, i)) {
      // A GFM table from the line before: the paragraph ends before that
      // line, and the table takes the rest.
      found.tableAt = i - 2;
      if (spans.length > 0 && spans[spans.length - 1] === i - 2) {
        spans.length -= 2;
      }
      // Body rows up to a blank line or a flow construct, which may throw.
      let row = i + 2;
      while (row < lines.length && lines[row] !== lines[row + 1]) {
        const first = text.charCodeAt(lines[row]);
        const flow =
          first === 60 || first === 123
            ? probeConstruct(state, bound, lines, row) !== -1
            : startsFlow(state, lines, row);
        if (flow) {
          break;
        }
        row += 2;
      }
      spans.push(i - 2, row - 2);
      found.constructs.push(undefined);
      i = row - 2;
      continue;
    }
    const code = text.charCodeAt(start);
    let last = startsFlow(state, lines, i) ? i : -1;
    let items: Item[] | undefined;
    if (code === 60 || code === 123) {
      last = probeConstruct(state, bound, lines, i);
      items = probe.items;
    } else if (last !== -1 && code === 58 && text.startsWith(':::', start)) {
      // A container directive to its closing fence: its content is a
      // document of its own, read later than this text.
      let size = 0;
      while (text.charCodeAt(start + size) === 58) {
        size++;
      }
      last = i + 2;
      while (last < lines.length && !isFence(text, lines[last], lines[last + 1], 58, size)) {
        last += 2;
      }
      if (last >= lines.length) {
        // Still open: the lines after these go to it, up to its fence.
        found.openFence = 58;
        found.openFenceSize = size;
        spans.push(i, lines.length - 2);
        found.constructs.push(undefined);
        return spans;
      }
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
        found.openFenceSize = size;
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
 * `i`, read again over the next lines and then the source after them, or -1
 * when they end in text. A syntax error throws: the reference's error too.
 */
function probeConstruct(state: BlockState, bound: number, lines: number[], i: number): number {
  const text = state.source.text;
  const end = lines[i + 1];
  probe.begin(state.source, FLOW, lines[i], end, end === text.length);
  let result = probe.run();
  let last = i;
  let lineEnd = end;
  while (result === MORE) {
    last += 2;
    if (last < lines.length) {
      lineEnd = lines[last + 1];
      probe.feed(lines[last], lineEnd, lineEnd === text.length, '', lines[last], false);
    } else {
      lineEnd = feedSourceLine(state, bound, lineEnd);
    }
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
