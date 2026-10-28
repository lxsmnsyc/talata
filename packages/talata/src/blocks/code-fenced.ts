import type { Code } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { CR, LF, isSpaceOrTab } from '../core/chars';
import type { Line } from '../core/line';
import { point, skipLineEnding } from '../core/source';
import { isEmptyLastLine, lineContent } from './code-indented';
import { matchedOnlyAtEnd } from './blockquote';
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
  /**
   * Content as the reference buffers it: every line ending after the opening
   * fence, and content lines without their prefixes.
   */
  raw = '';
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

  continue(state: BlockState, line: Line): boolean {
    if (this.closed || (isEmptyLastLine(line) && matchedOnlyAtEnd(state, line))) {
      return false;
    }
    this.closing = isClosingFence(line, this.marker, this.size);
    return true;
  }

  addLine(state: BlockState, line: Line): void {
    const text = state.source.text;
    const next = skipLineEnding(text, this.end);
    const eol = text.slice(this.end, next);
    if (isEmptyLastLine(line)) {
      // micromark ends the block after the line ending, with no content line.
      this.end = next;
      this.raw += eol;
      return;
    }
    this.end = line.end;
    if (this.closing) {
      this.closed = true;
      this.raw += eol;
      line.start = line.end;
      return;
    }
    this.raw += eol + lineContent(line, this.indent);
  }

  close(state: BlockState): Code {
    let end = this.end;
    let raw = this.raw;
    if (!this.closed && state.closeKeepsLineEnding) {
      end = skipLineEnding(state.source.text, end);
      raw += state.source.text.slice(this.end, end);
    }
    return {
      type: 'code',
      lang: this.lang,
      meta: this.meta,
      value: trimLineEndings(raw),
      position: { start: point(state.source, this.start), end: point(state.source, end) },
    };
  }
}

/**
 * Drops one line ending from each end, as the reference's
 * `/^(\r?\n|\r)|(\r?\n|\r)$/g` does. A `\r` after the fence and a `\n`
 * after an empty first line go together as one `\r\n`.
 */
function trimLineEndings(raw: string): string {
  let from = 0;
  const first = raw.charCodeAt(0);
  if (first === CR) {
    from = raw.charCodeAt(1) === LF ? 2 : 1;
  } else if (first === LF) {
    from = 1;
  }
  let to = raw.length;
  if (to > from) {
    const last = raw.charCodeAt(to - 1);
    if (last === LF) {
      to = to - 1 > from && raw.charCodeAt(to - 2) === CR ? to - 2 : to - 1;
    } else if (last === CR) {
      to--;
    }
  }
  return raw.slice(from, to);
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
