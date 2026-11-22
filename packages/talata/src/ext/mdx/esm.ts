import type { RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import type { Line } from '../../core/line';
import { advanceLine } from '../../core/line';
import type { Source } from '../../core/source';
import { skipLineEnding } from '../../core/source';
import { parseEsm } from './acorn';
import type { Code, Js } from './acorn';
import { span } from './error';

// ESM, as `micromark-extension-mdxjs-esm` 3.0.0: `import` or `export` and a
// space at the start of a line (column 1, so not in a quote or list, and
// never interrupting a paragraph). It runs to a blank line or the end of the
// content, then acorn parses it. When acorn fails at the end of the text and
// more input follows, the blank line is taken and it goes on.
//
// Names imported before are declared first (`var a, b`), so importing one
// again fails. micromark adds them per parse in tokenizer order: the flow of
// the document first, then the content of container directives, one depth at
// a time. The chunk queue parses the content in that order.

interface Parse {
  source: Source;
  /** Names imported so far. */
  defined: string[];
}

let current: Parse | undefined;

function definedOf(source: Source): string[] {
  if (current?.source !== source) {
    current = { source, defined: [] };
  }
  return current.defined;
}

const OK = 0;
const SWALLOW = 1;

class OpenMdxEsm implements OpenBlock {
  name = 'mdxjsEsm';
  isContainer = false;
  acceptsLazy = false;
  js: Js;
  /** Flat [start, end) pairs of the lines. */
  lines: number[];
  /** End offset once it parsed. */
  end = -1;

  constructor(js: Js, lines: number[]) {
    this.js = js;
    this.lines = lines;
  }

  continue(state: BlockState, line: Line): boolean {
    if (this.end !== -1) {
      return false;
    }
    if (!line.blank) {
      return true;
    }
    // At the line ending before a blank line, acorn decides.
    return this.attempt(state, false, true) !== OK;
  }

  addLine(_state: BlockState, line: Line): void {
    this.lines.push(line.start, line.end);
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
   * text lets the construct go on (SWALLOW). Throws a syntax error.
   */
  attempt(state: BlockState, ending: boolean, more: boolean): number {
    const source = state.source;
    const defined = definedOf(source);
    const result = parseEsm(this.js, source, this.code(source.text, ending), defined);
    if (result.error === undefined) {
      for (const name of result.defined) {
        defined.push(name);
      }
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
    throw result.error;
  }

  close(state: BlockState): RootContent | undefined {
    if (this.end === -1) {
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
      const block = new OpenMdxEsm(js, [at, line.end]);
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
        const block = new OpenMdxEsm(js, [headerStart, headerEnd, start, end]);
        advanceLine(line, line.end);
        return block;
      }
      return undefined;
    },
  };
}
