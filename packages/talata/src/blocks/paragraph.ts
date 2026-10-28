import type { Paragraph } from 'mdast';
import type { BlockState, OpenParagraph } from '../core/blocks';
import type { Line } from '../core/line';
import { point } from '../core/source';

// Paragraphs are not a registered rule: the block parser opens one for any
// non-blank line that no rule starts, and adds lazy continuation lines to it.

function continueParagraph(_state: BlockState, line: Line): boolean {
  return !line.blank;
}

class OpenParagraphBlock implements OpenParagraph {
  name = 'paragraph';
  isContainer = false;
  acceptsLazy = false;
  lines: number[];
  start: number;
  /**
   * Lines with whitespace after their container prefixes, as flat triples:
   * line ending offset, start of the whitespace, split tab columns. Labels of
   * definitions that span lines keep that whitespace, and so do code spans,
   * raw HTML and line ending positions (passed to `inline`). Created with
   * the first continuation line.
   */
  indents: number[] | undefined = undefined;

  constructor(line: Line) {
    this.lines = [line.nonBlank, line.end];
    this.start = line.nonBlank;
  }

  continue: (state: BlockState, line: Line) => boolean = continueParagraph;

  addLine(_state: BlockState, line: Line): void {
    if (this.indents === undefined) {
      this.indents = [];
    }
    if (line.nonBlank !== line.start || line.partialTab !== 0) {
      this.indents.push(line.end, line.start, line.partialTab);
    }
    this.lines.push(line.nonBlank, line.end);
  }

  close(state: BlockState): Paragraph {
    const lines = this.lines;
    // Starts at the first content character, ends at the end of the last line
    // (trailing whitespace included), as the reference does.
    const node: Paragraph = {
      type: 'paragraph',
      children: [],
      position: {
        start: point(state.source, lines[0]),
        end: point(state.source, lines[lines.length - 1]),
      },
    };
    state.inline(node, lines, this.indents);
    return node;
  }
}

/**
 * Whitespace after container prefixes on continuation lines, as flat triples
 * in line order: line ending offset, start of the whitespace, split tab
 * columns. Undefined for a paragraph of one line.
 */
export function paragraphIndents(paragraph: OpenParagraph): number[] | undefined {
  return paragraph instanceof OpenParagraphBlock ? paragraph.indents : undefined;
}

/** Opens a paragraph whose first line is the rest of `line`. */
export default function openParagraph(_state: BlockState, line: Line): OpenParagraph {
  return new OpenParagraphBlock(line);
}
