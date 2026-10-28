import type { Code } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { isSpaceOrTab } from '../core/chars';
import type { Line } from '../core/line';
import { point, skipLineEnding } from '../core/source';
import { isEmptyLastLine, lineContent } from './code-indented';
import decodeString from './decode';

const BACKTICK = 96;

/** Whether `line` is a closing fence: at least `size` markers, then only spaces and tabs. */
function isClosingFence(line: Line, marker: number, size: number): boolean {
  if (line.indent >= 4) {
    return false;
  }
  const text = line.text;
  const end = line.end;
  let i = line.nonBlank;
  while (i < end && text.charCodeAt(i) === marker) {
    i++;
  }
  if (i - line.nonBlank < size) {
    return false;
  }
  while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
    i++;
  }
  return i === end;
}

class OpenFencedCode implements OpenBlock {
  name = 'codeFenced';
  isContainer = false;
  acceptsLazy = false;
  marker: number;
  size: number;
  /** Columns of indentation before the opening fence; removed from content lines. */
  indent: number;
  start: number;
  end: number;
  lang: string | null;
  meta: string | null;
  value = '';
  lines = 0;
  /** Length of the line ending before the last content line, when that line is empty. */
  emptyLast = 0;
  /** The current line is the closing fence. */
  closing = false;
  closed = false;

  constructor(
    marker: number,
    size: number,
    indent: number,
    start: number,
    end: number,
    lang: string | null,
    meta: string | null,
  ) {
    this.marker = marker;
    this.size = size;
    this.indent = indent;
    this.start = start;
    this.end = end;
    this.lang = lang;
    this.meta = meta;
  }

  continue(_state: BlockState, line: Line): boolean {
    if (this.closed) {
      return false;
    }
    this.closing = isClosingFence(line, this.marker, this.size);
    return true;
  }

  addLine(state: BlockState, line: Line): void {
    const text = state.source.text;
    const next = skipLineEnding(text, this.end);
    if (isEmptyLastLine(line)) {
      // micromark ends the block after the line ending, with no content line.
      this.end = next;
      this.emptyLast = 0;
      return;
    }
    const eol = text.slice(this.end, next);
    this.end = line.end;
    if (this.closing) {
      this.closed = true;
      line.start = line.end;
      return;
    }
    const content = lineContent(line, this.indent);
    // The line ending after the opening fence is not part of the value.
    this.value = this.lines === 0 ? content : this.value + eol + content;
    this.emptyLast = this.lines > 0 && content === '' ? eol.length : 0;
    this.lines++;
  }

  close(state: BlockState): Code {
    let end = this.end;
    let value = this.value;
    if (!this.closed && state.closeKeepsLineEnding) {
      end = skipLineEnding(state.source.text, end);
    } else if (!this.closed && this.emptyLast > 0) {
      // Without a closing fence or a kept line ending, the reference drops
      // the line ending before an empty last line.
      value = value.slice(0, value.length - this.emptyLast);
    }
    return {
      type: 'code',
      lang: this.lang,
      meta: this.meta,
      value,
      position: { start: point(state.source, this.start), end: point(state.source, end) },
    };
  }
}

const codeFenced: BlockRule = {
  name: 'codeFenced',
  priority: 300,
  canInterruptParagraph: true,
  triggers: '`~',
  start(_state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    const text = line.text;
    const start = line.nonBlank;
    const end = line.end;
    const marker = text.charCodeAt(start);
    let i = start;
    while (i < end && text.charCodeAt(i) === marker) {
      i++;
    }
    const size = i - start;
    if (size < 3) {
      return undefined;
    }
    while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
      i++;
    }
    // The info string: a language up to the first space or tab, then meta.
    // A backtick fence cannot have a backtick in it.
    const langStart = i;
    while (i < end && !isSpaceOrTab(text.charCodeAt(i))) {
      if (marker === BACKTICK && text.charCodeAt(i) === BACKTICK) {
        return undefined;
      }
      i++;
    }
    const langEnd = i;
    while (i < end && isSpaceOrTab(text.charCodeAt(i))) {
      i++;
    }
    const metaStart = i;
    if (marker === BACKTICK) {
      for (; i < end; i++) {
        if (text.charCodeAt(i) === BACKTICK) {
          return undefined;
        }
      }
    }
    const lang = langStart < langEnd ? decodeString(text.slice(langStart, langEnd)) : null;
    const meta = metaStart < end ? decodeString(text.slice(metaStart, end)) : null;
    const indent = line.indent;
    line.start = end;
    return new OpenFencedCode(marker, size, indent, start, end, lang, meta);
  },
};

export default codeFenced;
