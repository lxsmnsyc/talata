import type { Root, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import type { Line } from '../../core/line';
import { advanceLine } from '../../core/line';
import parse from '../../core/parse';
import type { DocumentState } from '../../core/state';
import type { Source } from '../../core/source';
import { skipLineEnding } from '../../core/source';
import { jsOf, parseEsm } from './acorn';
import type { Code, EsmResult, Js } from './acorn';
import { MdxError, span } from './error';
import { containerDepth, flowError } from './order';

// ESM, as `micromark-extension-mdxjs-esm` 3.0.0: `import` or `export` and a
// space at the start of a line (column 1, so not in a quote or list, and
// never interrupting a paragraph). It runs to a blank line or the end of the
// content, then acorn parses it. When acorn fails at the end of the text and
// more input follows, the blank line is taken and it goes on.
//
// Names imported before are declared first (`var a, b`), so importing one
// again fails. micromark parses the flow of the document before the content
// of container directives, one depth at a time, so ESM in a directive sees
// the names of every import outside it, even later ones. One pass in
// document order cannot see those: each ESM records the names it saw, and
// when they differ from the reference's order the document is parsed again
// with the right names (`reparse`).

interface Record {
  start: number;
  depth: number;
  /** The names declared before it. */
  used: string[];
  /** The names it imports (none when it failed). */
  defined: string[];
}

interface Parse {
  source: Source;
  records: Record[];
  /** Names imported by ESM outside container directives, in document order. */
  top: string[];
  /** Names imported by ESM in container directives so far, a guess for the next. */
  nested: string[];
}

let current: Parse | undefined;

interface Plan {
  text: string;
  /** Names for each ESM in a container directive, by start offset. */
  names: Map<number, string[]>;
  round: number;
}

let plan: Plan | undefined;

function parseOf(source: Source): Parse {
  if (current?.source !== source) {
    current = { source, records: [], top: [], nested: [] };
  }
  return current;
}

function namesFor(source: Source, depth: number, start: number): string[] {
  const state = parseOf(source);
  if (depth === 0) {
    return [...state.top];
  }
  const planned = plan?.text === source.text ? plan.names.get(start) : undefined;
  return planned === undefined ? [...state.top, ...state.nested] : [...planned];
}

function record(source: Source, entry: Record): void {
  const state = parseOf(source);
  state.records.push(entry);
  for (const name of entry.defined) {
    (entry.depth === 0 ? state.top : state.nested).push(name);
  }
}

const OK = 0;
const SWALLOW = 1;
const FAILED = 2;

class OpenMdxEsm implements OpenBlock {
  name = 'mdxjsEsm';
  isContainer = false;
  acceptsLazy = false;
  js: Js;
  /** Flat [start, end) pairs of the lines. */
  lines: number[];
  bound: number;
  depth: number;
  /** End offset once it parsed. */
  end = -1;
  /** True after a syntax error: it takes the rest of the content and makes nothing. */
  failed = false;

  constructor(js: Js, lines: number[], bound: number, depth: number) {
    this.js = js;
    this.lines = lines;
    this.bound = bound;
    this.depth = depth;
  }

  continue(state: BlockState, line: Line): boolean {
    if (this.failed) {
      return true;
    }
    if (this.end !== -1) {
      return false;
    }
    if (!line.blank) {
      return true;
    }
    // At the line ending before a blank line, acorn decides.
    const result = this.attempt(state, false, true);
    if (result === OK) {
      return false;
    }
    return true;
  }

  addLine(_state: BlockState, line: Line): void {
    if (!this.failed) {
      this.lines.push(line.start, line.end);
    }
    advanceLine(line, line.end);
  }

  /** The code of the lines, with the line ending after the last one when `ending`. */
  code(text: string, ending: boolean): Code {
    const lines = this.lines;
    const stops: number[] = [];
    let value = '';
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i + 1] > lines[i]) {
        stops.push(value.length, lines[i]);
        value += text.slice(lines[i], lines[i + 1]);
      }
      if (i + 2 < lines.length || ending) {
        const after = skipLineEnding(text, lines[i + 1]);
        if (after > lines[i + 1]) {
          stops.push(value.length, lines[i + 1]);
          value += text.slice(lines[i + 1], after);
        }
      }
    }
    return { value, stops, start: lines[0] };
  }

  /**
   * Parses the lines. `more`: input follows, so an error at the end of the
   * text lets the construct go on (SWALLOW). Records the result, and passes
   * an error on as a flow error.
   */
  attempt(state: BlockState, ending: boolean, more: boolean): number {
    const source = state.source;
    const start = this.lines[0];
    const names = namesFor(source, this.depth, start);
    let result: EsmResult;
    try {
      result = parseEsm(this.js, source, this.code(source.text, ending), names);
    } catch (error) {
      return this.fail(state, error, names);
    }
    if (result.error === undefined) {
      record(source, { start, depth: this.depth, used: names, defined: result.defined });
      const lines = this.lines;
      this.end = lines[lines.length - 1];
      if (ending) {
        this.end = skipLineEnding(source.text, this.end);
      }
      return OK;
    }
    if (more && result.swallow) {
      return SWALLOW;
    }
    return this.fail(state, result.error, names);
  }

  fail(state: BlockState, error: unknown, names: string[]): number {
    if (!(error instanceof MdxError)) {
      throw error;
    }
    record(state.source, { start: this.lines[0], depth: this.depth, used: names, defined: [] });
    this.failed = true;
    flowError(state, this.bound, error, this.lines[0]);
    return FAILED;
  }

  close(state: BlockState): RootContent | undefined {
    if (this.end === -1 && !this.failed) {
      // The end of the content. When a line ending follows the last line,
      // micromark reads it as the line ending before a blank line first.
      const last = this.lines[this.lines.length - 1];
      const ending = last < state.source.text.length;
      if (ending) {
        if (this.attempt(state, false, true) === SWALLOW) {
          this.attempt(state, true, false);
        }
      } else {
        this.attempt(state, false, false);
      }
    }
    if (this.failed) {
      return undefined;
    }
    const start = this.lines[0];
    const node = {
      type: 'mdxjsEsm',
      value: this.value(state.source.text),
      position: span(state.source, start, this.end),
    };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- not in @types/mdast
    return node as unknown as RootContent;
  }

  /** The text of the lines and the line endings between them, as the reference slices it. */
  value(text: string): string {
    const lines = this.lines;
    let value = '';
    for (let i = 0; i < lines.length; i += 2) {
      if (i > 0) {
        value += text.slice(lines[i - 1], skipLineEnding(text, lines[i - 1]));
      }
      value += text.slice(lines[i], lines[i + 1]);
    }
    if (this.end > lines[lines.length - 1]) {
      value += text.slice(lines[lines.length - 1], this.end);
    }
    return value;
  }
}

/** The number of colons of a directive fence at `start`, or 0. */
function colons(text: string, start: number): number {
  let size = 0;
  while (text.charCodeAt(start + size) === 58) {
    size++;
  }
  return size >= 3 ? size : 0;
}

/**
 * Whether a container directive opens in the lines before `at` and stays
 * open there. The re-read does not open containers (left to
 * fix-mdx-reread-container): ESM inside it would be content, parsed in a
 * later pass, so it is not read here.
 */
function opensDirective(state: BlockState, lines: number[], from: number, at: number): boolean {
  let registered = false;
  for (const rule of state.rules.blockByChar[58]) {
    registered ||= rule.name === 'directiveContainer';
  }
  if (!registered) {
    return false;
  }
  const text = state.source.text;
  let open = 0;
  for (let i = from; i < at; i += 2) {
    const size = colons(text, lines[i]);
    if (size === 0) {
      continue;
    }
    if (open === 0) {
      // An opener has a name, which starts with a letter.
      const code = text.charCodeAt(lines[i] + size) | 32;
      if (code >= 97 && code <= 122) {
        open = size;
      }
    } else if (size >= open && isBlankAfter(text, lines[i] + size, lines[i + 1])) {
      open = 0;
    }
  }
  return open !== 0;
}

function isBlankAfter(text: string, from: number, end: number): boolean {
  for (let i = from; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code !== 32 && code !== 9) {
      return false;
    }
  }
  return true;
}

/**
 * Whether line `i` of `lines` (flat [content start, end) pairs of lines
 * read again) can start ESM where flow starts: acorn is on, the line is at
 * column 1 with `import` or `export`, and no container directive opener
 * left open since line `from` comes before it (the re-read opens the
 * directive, whose content the block parser reads).
 */
export function startsEsm(state: BlockState, lines: number[], from: number, i: number): boolean {
  const text = state.source.text;
  return (
    jsOf(state.source) !== undefined &&
    lines[i] !== lines[i + 1] &&
    isKeyword(text, lines[i]) &&
    (text.charCodeAt(lines[i] - 1) === 10 || text.charCodeAt(lines[i] - 1) === 13) &&
    !opensDirective(state, lines, from, i)
  );
}

/** `import` or `export` and a space at `at`. */
function isKeyword(text: string, at: number): boolean {
  const word = text.slice(at, at + 7);
  return word === 'import ' || word === 'export ';
}

/** The ESM rule of one `mdx({ acorn })`. */
export function createEsm(js: Js): BlockRule {
  return {
    name: 'mdxjsEsm',
    priority: 310,
    canInterruptParagraph: false,
    triggers: 'ei',
    start(state: BlockState, line: Line): OpenBlock | undefined {
      const at = line.nonBlank;
      if (at !== state.source.lineStarts[line.index] || !isKeyword(line.text, at)) {
        return undefined;
      }
      const bound = state.getDepth(state.container);
      const block = new OpenMdxEsm(js, [at, line.end], bound, containerDepth(state, bound));
      advanceLine(line, line.end);
      return block;
    },
  };
}

/**
 * ESM on the header row of a GFM table that interrupts a paragraph. The
 * table check runs while the paragraph is open and ESM cannot interrupt it,
 * but once the check passes micromark reads the header line again with no
 * paragraph, and ESM, tried before tables, starts there. It takes the
 * delimiter row as its next line (`a\nexport |b\n-|-`). Runs on the
 * delimiter row before the table rule, and asks that rule.
 */
export function createEsmHeader(js: Js): BlockRule {
  return {
    name: 'mdxjsEsmHeader',
    priority: 749,
    canInterruptParagraph: true,
    triggers: '|:-',
    gfm: true,
    start(state: BlockState, line: Line): OpenBlock | undefined {
      const paragraph = state.paragraph;
      if (paragraph === undefined || state.lazy || line.index === 0) {
        return undefined;
      }
      const lines = paragraph.lines;
      const count = lines.length;
      // With one line the ESM rule had its chance already.
      if (count < 4) {
        return undefined;
      }
      const headerStart = lines[count - 2];
      const headerEnd = lines[count - 1];
      if (
        headerStart !== state.source.lineStarts[line.index - 1] ||
        !isKeyword(line.text, headerStart)
      ) {
        return undefined;
      }
      const start = line.start;
      const end = line.end;
      for (const rule of state.rules.blockByChar[line.text.charCodeAt(line.nonBlank)]) {
        if (rule.name !== 'table') {
          continue;
        }
        // The table takes the header line from the paragraph; ESM takes it from the table.
        if (rule.start(state, line) === undefined) {
          return undefined;
        }
        const bound = state.getDepth(state.container);
        const block = new OpenMdxEsm(
          js,
          [headerStart, headerEnd, start, end],
          bound,
          containerDepth(state, bound),
        );
        advanceLine(line, line.end);
        return block;
      }
      return undefined;
    },
  };
}

function sameNames(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Called first by the transform. When an ESM in a container directive saw
 * other names than the reference's order gives it, parses the document again
 * with those names and puts the new tree's children in `tree`. Returns true
 * then: the tree is built.
 */
export function reparse(tree: Root, state: DocumentState): boolean {
  const source = state.source;
  if (current?.source !== source) {
    return false;
  }
  const records = current.records;
  current = undefined;
  let nested = false;
  for (const entry of records) {
    if (entry.depth > 0) {
      nested = true;
    }
  }
  if (!nested) {
    return false;
  }
  // The reference's order: by depth, then in document order.
  const sorted = records.toSorted((a, b) => a.depth - b.depth || a.start - b.start);
  const names = new Map<number, string[]>();
  let defined: string[] = [];
  let stable = true;
  for (const entry of sorted) {
    if (entry.depth > 0) {
      names.set(entry.start, defined);
      if (!sameNames(entry.used, defined)) {
        stable = false;
      }
    }
    if (entry.defined.length > 0) {
      defined = [...defined, ...entry.defined];
    }
  }
  const round = plan?.text === source.text ? plan.round + 1 : 1;
  if (stable || round > 16) {
    return false;
  }
  const saved = plan;
  plan = { text: source.text, names, round };
  try {
    const again = parse(source.withNul ?? source.text, state.options, state.rules);
    tree.children = again.children;
  } finally {
    plan = saved;
  }
  return true;
}
