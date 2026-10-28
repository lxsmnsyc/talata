import type { Code } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { CR, LF } from '../core/chars';
import { consumeColumns } from '../core/line';
import type { Line } from '../core/line';
import { point, skipLineEnding } from '../core/source';

/**
 * Whether `line` is the last line, has no line ending and nothing is left
 * after the container prefixes (`> ```\n> a\n>`). micromark then ends an open
 * fenced code or HTML block right after the previous line ending.
 */
export function isEmptyLastLine(line: Line): boolean {
  return line.start === line.end && line.partialTab === 0 && line.end === line.text.length;
}

/**
 * Consumes up to `columns` columns of indentation and returns the rest of the
 * line. Columns left of a split tab become spaces.
 */
export function lineContent(line: Line, columns: number): string {
  consumeColumns(line, columns);
  const rest = line.text.slice(line.start, line.end);
  const value = line.partialTab > 0 ? ' '.repeat(line.partialTab) + rest : rest;
  line.start = line.end;
  return value;
}

function continueCode(_state: BlockState, line: Line): boolean {
  return line.blank || line.indent >= 4;
}

class OpenIndentedCode implements OpenBlock {
  name = 'codeIndented';
  isContainer = false;
  acceptsLazy = false;
  start: number;
  /** End of the last line with 4 columns of indentation. */
  end: number;
  /** End of the last line seen. */
  last: number;
  value: string;
  /** Line endings of blank lines that may still turn out to be trailing. */
  pending = '';

  constructor(start: number, end: number, value: string) {
    this.start = start;
    this.end = end;
    this.last = end;
    this.value = value;
  }

  continue: (state: BlockState, line: Line) => boolean = continueCode;

  addLine(state: BlockState, line: Line): void {
    const text = state.source.text;
    const eol = text.slice(this.last, skipLineEnding(text, this.last));
    this.last = line.end;
    if (line.indent < 4) {
      // A blank line with less indentation: kept only if code follows.
      this.pending += eol;
      return;
    }
    this.value += this.pending + eol + lineContent(line, 4);
    this.pending = '';
    this.end = line.end;
  }

  close(state: BlockState): Code {
    // A last line with nothing after its indentation leaves a line ending at
    // the end of the value; the reference drops one.
    let value = this.value;
    const last = value.charCodeAt(value.length - 1);
    if (last === LF) {
      value = value.slice(0, value.charCodeAt(value.length - 2) === CR ? -2 : -1);
    } else if (last === CR) {
      value = value.slice(0, -1);
    }
    return {
      type: 'code',
      lang: null,
      meta: null,
      value,
      position: { start: point(state.source, this.start), end: point(state.source, this.end) },
    };
  }
}

const codeIndented: BlockRule = {
  name: 'codeIndented',
  priority: 800,
  canInterruptParagraph: false,
  start(_state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent < 4) {
      return undefined;
    }
    const start = line.start;
    const value = lineContent(line, 4);
    return new OpenIndentedCode(start, line.end, value);
  },
};

export default codeIndented;
