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
   * definitions that span lines keep that whitespace.
   */
  indents: number[] | undefined = undefined;

  constructor(line: Line) {
    this.lines = [line.nonBlank, line.end];
    this.start = line.nonBlank;
  }

  continue: (state: BlockState, line: Line) => boolean = continueParagraph;

  addLine(_state: BlockState, line: Line): void {
    if (line.nonBlank !== line.start || line.partialTab !== 0) {
      this.indents ??= [];
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
    state.inline(node, lines);
    return node;
  }
}

/**
 * The whitespace after container prefixes before `content`, the content
 * start of the paragraph line that ends at `end`. Columns of a split tab
 * become spaces. Empty for the first line, which no caller needs.
 */
export function lineIndent(
  state: BlockState,
  paragraph: OpenParagraph,
  content: number,
  end: number,
): string {
  const indents = paragraph instanceof OpenParagraphBlock ? paragraph.indents : undefined;
  if (indents === undefined) {
    return '';
  }
  for (let i = 0; i < indents.length; i += 3) {
    if (indents[i] === end) {
      return ' '.repeat(indents[i + 2]) + state.source.text.slice(indents[i + 1], content);
    }
  }
  return '';
}

/** Opens a paragraph whose first line is the rest of `line`. */
export default function openParagraph(_state: BlockState, line: Line): OpenParagraph {
  return new OpenParagraphBlock(line);
}
