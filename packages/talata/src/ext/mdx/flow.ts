import type { RootContent } from 'mdast';
import type { BlockRule, BlockState, FlowMark, OpenBlock } from '../../core/blocks';
import { matchedOnlyAtEnd } from '../../blocks/blockquote';
import { isEmptyLastLine } from '../../blocks/code-indented';
import type { Line } from '../../core/line';
import { advanceLine, isLastLine } from '../../core/line';
import { point } from '../../core/source';
import { bindJs } from './acorn';
import type { Js } from './acorn';
import { span } from './error';
import { DONE, FLOW, MORE, NOK, Scanner } from './scanner';
import type { Item } from './scanner';
import { flowMarker, markSource } from './tags';

// The flow construct: a line that holds only JSX tags and expressions
// (`<a>`, `{b}`, `<c d="e" />  {f}`), as `jsxFlow` of
// micromark-extension-mdx-jsx and the flow expression of
// micromark-extension-mdx-expression read it. Both are concrete: once one
// starts, the lines it spans go to it. A construct that does not end on its
// first line takes a flow mark. When text follows its last tag on a later
// line, micromark undoes it and reads the lines again with the next
// constructs: the construct rewinds its flow layer. A lazy line or the end
// of the content inside it is an error, thrown where met.

const SPACE = 32;

/**
 * The whitespace an expression keeps at the start of `line`: what is left
 * after its container prefixes, with the first 2 characters dropped (a tab
 * counts its extra columns as characters). micromark eats them as a line
 * prefix.
 */
function keptWhitespace(line: Line): string {
  const text = line.text;
  let result = '';
  let skipped = 0;
  for (let v = line.partialTab; v > 0; v--) {
    if (skipped < 2) {
      skipped++;
    } else {
      result += ' ';
    }
  }
  let column = line.visualColumn + line.partialTab;
  for (let i = line.start; i < line.nonBlank; i++) {
    if (text.charCodeAt(i) === SPACE) {
      column++;
      if (skipped < 2) {
        skipped++;
      } else {
        result += ' ';
      }
      continue;
    }
    const width = 4 - (column % 4);
    column += width;
    if (skipped < 2) {
      skipped++;
      for (let v = 1; v < width; v++) {
        if (skipped < 2) {
          skipped++;
        } else {
          result += ' ';
        }
      }
    } else {
      result += '\t';
    }
  }
  return result;
}

// One scanner for first lines; a construct that spans lines keeps it.
let shared = new Scanner();

class OpenMdxFlow implements OpenBlock {
  name = 'mdxFlow';
  isContainer = false;
  acceptsLazy = false;
  /** The rule that started it, for `rewind`. */
  rule: BlockRule;
  /** Set while the construct is open at the end of its last line. */
  scanner: Scanner | undefined = undefined;
  /** The flow mark while `scanner` is set. */
  mark: FlowMark | undefined = undefined;
  items: Item[] = [];
  /** Index of the last line it took. */
  lastLine: number;
  /** Text after the last tag on the current line: `addLine` rewinds. */
  failed = false;
  /** The construct ended on a line after its first: it takes no more lines. */
  done = false;
  /**
   * End of the construct with the whitespace after it. A list item around
   * ends there, so the marker node does too.
   */
  end = 0;

  constructor(rule: BlockRule, line: Line) {
    this.rule = rule;
    this.lastLine = line.index;
  }

  continue(state: BlockState, line: Line): boolean {
    const scanner = this.scanner;
    if (scanner === undefined || this.done) {
      return false;
    }
    if (isEmptyLastLine(line)) {
      // micromark ends the content before an empty last line in a
      // container, or reads it as lazy when a quote matched it only there.
      const at = state.source.lineStarts[line.index];
      if (matchedOnlyAtEnd(state, line)) {
        scanner.feed(at, at, false, '', at, true);
      }
      scanner.feedEnd(at);
      scanner.run();
    }
    scanner.feed(
      line.nonBlank,
      line.end,
      isLastLine(line),
      keptWhitespace(line),
      line.start,
      false,
    );
    const result = scanner.run();
    if (result === MORE) {
      return true;
    }
    this.scanner = undefined;
    if (result === DONE) {
      this.items = scanner.items;
      this.end = scanner.pos;
      this.done = true;
      state.commit(this.mark!);
    } else {
      // Text after the last tag: the reference reads the lines again.
      this.failed = true;
    }
    return true;
  }

  addLine(state: BlockState, line: Line): void {
    if (this.failed) {
      state.rewind(this.mark!, this.rule);
      return;
    }
    this.lastLine = line.index;
    advanceLine(line, line.end);
  }

  onLazyLine(state: BlockState, line: Line): void {
    // A lazy line with nothing after the prefixes (no split tab either) and no
    // line ending: micromark closes the flow at the end of the line before,
    // so the error points at the line start.
    const at =
      line.start === line.end && line.partialTab === 0 && isLastLine(line)
        ? state.source.lineStarts[line.index]
        : line.start;
    // Always throws: a construct in flow allows no lazy line.
    this.scanner?.feed(at, at, false, '', at, true);
  }

  close(state: BlockState): RootContent | undefined {
    const scanner = this.scanner;
    if (scanner !== undefined) {
      this.fail(state, scanner);
    }
    const items = this.items;
    const first = items[0];
    if (items.length === 1 && first.kind === 'expression' && first.end === this.end) {
      const node = {
        type: 'mdxFlowExpression',
        value: first.value,
        position: span(state.source, first.start, first.end),
      };
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- not in @types/mdast
      return node as unknown as RootContent;
    }
    markSource(state.source);
    return flowMarker(state.source, items, this.end);
  }

  /**
   * The construct is still open when its content ends: a container starts,
   * or the document ends. After a final line ending that a container does
   * not go on over, the empty line there is lazy.
   */
  fail(state: BlockState, scanner: Scanner): never {
    const source = state.source;
    const next = this.lastLine + 1;
    let at = next < source.lineStarts.length ? source.lineStarts[next] : source.text.length;
    if (!state.closeKeepsLineEnding) {
      const spans = state.spans;
      if (spans === undefined || spans.finalLineEnding) {
        scanner.feed(at, at, false, '', at, true);
      } else {
        // The content ends without a line ending: the end of file.
        at = state.end;
      }
    }
    scanner.feedEnd(at);
    scanner.run();
    // A scanner fed the end of file always throws.
    throw new Error('unreachable: open MDX construct at ' + JSON.stringify(point(source, at)));
  }
}

/** The rule for tags and expressions on a line of their own, with the acorn of `js` if any. */
export default function createMdxFlow(js: Js | undefined): BlockRule {
  const rule: BlockRule = {
    name: 'mdxFlow',
    priority: 320,
    canInterruptParagraph: true,
    triggers: '<{',
    start(state: BlockState, line: Line): OpenBlock | undefined {
      if (line.indent >= line.indentLimit) {
        return undefined;
      }
      if (js !== undefined) {
        bindJs(state.source, js);
      }
      const scanner = shared;
      scanner.begin(state.source, FLOW, line.nonBlank, line.end, isLastLine(line));
      const result = scanner.run();
      if (result === NOK) {
        return undefined;
      }
      const block = new OpenMdxFlow(rule, line);
      if (result === DONE) {
        block.items = scanner.items;
        block.end = scanner.pos;
      } else {
        // micromark is still trying the construct at the line ending.
        block.scanner = scanner;
        block.mark = state.mark();
        shared = new Scanner();
      }
      advanceLine(line, line.end);
      return block;
    },
  };
  return rule;
}
