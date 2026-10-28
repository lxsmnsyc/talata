import type { Paragraph } from 'mdast';
import type { BlockState, OpenParagraph } from '../core/blocks';
import type { Line } from '../core/line';
import { point } from '../core/source';

const LEFT_BRACKET = 91;

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
   * definitions that span lines keep that whitespace. Only recorded when
   * the paragraph starts with `[`, as only definitions read it.
   */
  indents: number[] | undefined = undefined;
  bracket: boolean;

  constructor(line: Line) {
    this.lines = [line.nonBlank, line.end];
    this.start = line.nonBlank;
    this.bracket = line.text.charCodeAt(line.nonBlank) === LEFT_BRACKET;
  }

  continue: (state: BlockState, line: Line) => boolean = continueParagraph;

  addLine(_state: BlockState, line: Line): void {
    if (this.bracket && (line.nonBlank !== line.start || line.partialTab !== 0)) {
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
 * Whitespace after container prefixes on continuation lines, as flat triples
 * in line order: line ending offset, start of the whitespace, split tab
 * columns. Undefined when no line has any, or the paragraph does not start
 * with `[`.
 */
export function paragraphIndents(paragraph: OpenParagraph): number[] | undefined {
  return paragraph instanceof OpenParagraphBlock ? paragraph.indents : undefined;
}

/** Opens a paragraph whose first line is the rest of `line`. */
export default function openParagraph(_state: BlockState, line: Line): OpenParagraph {
  return new OpenParagraphBlock(line);
}
