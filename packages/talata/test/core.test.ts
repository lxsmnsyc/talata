import type { BlockContent, Blockquote, DefinitionContent, Html, Root, RootContent } from 'mdast';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';
import { blockRules, paragraphPrefixRules } from '../src/blocks';
import type { BlockRule, BlockState, OpenBlock, ParagraphPrefixRule } from '../src/core/blocks';
import { advanceLine, consumeColumns, createLine, measureLine } from '../src/core/line';
import parse from '../src/core/parse';
import { createRegistry } from '../src/core/registry';
import type { Registry } from '../src/core/registry';
import { createSource, point } from '../src/core/source';
import { normalizeIdentifier } from '../src/core/state';
import type { Transform } from '../src/core/transform';
import { inlineRules } from '../src/inline';

describe('source and point', () => {
  it('computes line starts for LF, CR and CRLF', () => {
    expect(createSource('a\nb\r\nc\rd').lineStarts).toEqual([0, 2, 5, 7]);
    expect(createSource('a\n').lineStarts).toEqual([0, 2]);
  });

  it('drops a leading BOM and replaces NUL', () => {
    expect(createSource('﻿a\0').text).toBe('a�');
  });

  it('maps offsets to points in any order', () => {
    const source = createSource('ab\r\ncd\n\nef');
    expect(point(source, 9)).toEqual({ line: 4, column: 2, offset: 9 });
    expect(point(source, 0)).toEqual({ line: 1, column: 1, offset: 0 });
    expect(point(source, 4)).toEqual({ line: 2, column: 1, offset: 4 });
    expect(point(source, 7)).toEqual({ line: 3, column: 1, offset: 7 });
    expect(point(source, 10)).toEqual({ line: 4, column: 3, offset: 10 });
  });
});

describe('line', () => {
  it('splits a tab and keeps the rest before start', () => {
    const line = createLine('>\t\tfoo');
    line.end = 6;
    line.start = 1;
    line.visualColumn = 1;
    measureLine(line);
    expect(line.indent).toBe(7);
    expect(consumeColumns(line, 1)).toBe(1);
    // The first tab spans columns 1 to 4; one column is consumed.
    expect(line).toMatchObject({ start: 2, partialTab: 2, visualColumn: 2, indent: 6 });
    expect(consumeColumns(line, 4)).toBe(4);
    expect(line).toMatchObject({ start: 3, partialTab: 2, visualColumn: 6, indent: 2 });
  });
});

describe('normalizeIdentifier', () => {
  it('collapses whitespace, trims and folds case', () => {
    expect(normalizeIdentifier(' Foo \t\r\n Bar  ')).toBe('FOO BAR');
    expect(normalizeIdentifier('ẞ')).toBe('SS');
  });
});

// Positions and trees compared to the reference on inputs core-skeleton covers.
const positionCases = [
  '',
  '\n\n',
  'foo',
  'foo\n\n\n',
  '  aaa  \n bbb\t\n',
  'aaa     \nbbb     \n',
  'aaa\t\t\nbbb',
  'a \t \nb',
  'aaa  ',
  'aaa\n\t\tbbb  \t',
  'a\r\nb\rc\r\n\r\nd',
  'a  \r\nb',
  '﻿foo',
  '﻿\n# a',
  'a\0b',
  '   ',
  '#   ',
  '#\tfoo\t#',
  '# foo \t',
  '### foo ###     \n',
  '## #\n# #a\n#\t#',
  '- - - -    \n',
  '   ***\t',
  'foo\n# bar\n---\nbaz',
  'é\n\u{1F600} b\nc',
];

describe('positions against the reference', () => {
  for (const markdown of positionCases) {
    it(JSON.stringify(markdown), () => {
      expect(fromMarkdown(markdown)).toEqual(reference(markdown));
    });
  }
});

// A test-only block quote, enough to exercise the container stack, lazy
// continuation and split tabs. The real one is built by blocks-container.
class TestQuote implements OpenBlock {
  name = 'blockquote';
  isContainer = true;
  acceptsLazy = true;
  start: number;
  end: number;

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }

  continue(_state: BlockState, line: Line): boolean {
    if (!consumeQuotePrefix(line)) {
      return false;
    }
    this.end = line.end;
    return true;
  }

  close(state: BlockState, children: RootContent[]): Blockquote {
    let end = this.end;
    const last = children.length > 0 ? children[children.length - 1] : undefined;
    if (last?.position !== undefined && last.position.end.offset! > end) {
      end = last.position.end.offset!;
    }
    const flow: (BlockContent | DefinitionContent)[] = [];
    for (const child of children) {
      if (isFlow(child)) {
        flow.push(child);
      }
    }
    return {
      type: 'blockquote',
      children: flow,
      position: { start: point(state.source, this.start), end: point(state.source, end) },
    };
  }
}

function isFlow(node: RootContent): node is BlockContent | DefinitionContent {
  return node.type !== 'text' && node.type !== 'break';
}

type Line = Parameters<BlockRule['start']>[1];

function consumeQuotePrefix(line: Line): boolean {
  if (line.indent >= 4 || line.text.charCodeAt(line.nonBlank) !== 62) {
    return false;
  }
  advanceLine(line, line.nonBlank + 1);
  const next = line.text.charCodeAt(line.start);
  if (line.start < line.end && (next === 32 || next === 9)) {
    consumeColumns(line, 1);
  }
  return true;
}

const testQuote: BlockRule = {
  name: 'testQuote',
  priority: 100,
  canInterruptParagraph: true,
  triggers: '>',
  start(_state: BlockState, line: Line): OpenBlock | undefined {
    const marker = line.nonBlank;
    if (!consumeQuotePrefix(line)) {
      return undefined;
    }
    return new TestQuote(marker, line.end);
  },
};

// A test-only prefix rule: leading lines that start with `%` become html nodes.
const testPrefix: ParagraphPrefixRule = {
  name: 'testPrefix',
  priority: 0,
  consume(state: BlockState, paragraph, out): void {
    const text = state.source.text;
    const lines = paragraph.lines;
    let taken = 0;
    while (taken < lines.length && text.charCodeAt(lines[taken]) === 37) {
      const node: Html = {
        type: 'html',
        value: text.slice(lines[taken], lines[taken + 1]),
        position: {
          start: point(state.source, lines[taken]),
          end: point(state.source, lines[taken + 1]),
        },
      };
      out.push(node);
      taken += 2;
    }
    lines.splice(0, taken);
  },
};

// A test-only transform: records how many text nodes the tree has, which
// proves it runs after inline parsing.
let textCount = 0;

function countTexts(node: Root | RootContent): number {
  let count = node.type === 'text' ? 1 : 0;
  if ('children' in node) {
    for (const child of node.children) {
      count += countTexts(child);
    }
  }
  return count;
}

const testTransform: Transform = {
  name: 'testTransform',
  transform(tree: Root): void {
    textCount = countTexts(tree);
  },
};

function registry(): Registry {
  return createRegistry(
    {
      blockRules: [...blockRules, testQuote],
      paragraphPrefixRules: [...paragraphPrefixRules, testPrefix],
      inlineRules,
      transforms: [testTransform],
    },
    { gfm: false },
  );
}

describe('container stack with a test-only block quote', () => {
  const rules = registry();
  const cases = [
    '>\tfoo',
    '>\t# foo',
    ' >\t***',
    '>  # foo',
    '> foo\nbar',
    '> foo\n> bar',
    '> foo\n---',
    '> foo\n# bar',
    '>',
    '> \n> a',
    '> a\n>\n',
    '> a\n\n',
    '> a\n>  \n',
    '  >  a  \n  >  b  ',
    '> > a\nb\n> c',
    '> a\n> # b\n> c',
  ];
  for (const markdown of cases) {
    it(JSON.stringify(markdown), () => {
      const tree = parse(markdown, { gfm: false }, rules);
      expect(tree).toEqual(reference(markdown));
    });
  }
});

function types(tree: Root): string[] {
  const result: string[] = [];
  for (const node of tree.children) {
    result.push(node.type);
  }
  return result;
}

describe('paragraph prefix rules and transforms', () => {
  const rules = registry();

  it('consumes leading lines before the paragraph', () => {
    const tree = parse('%a\n%b\nfoo\n%c', { gfm: false }, rules);
    expect(types(tree)).toEqual(['html', 'html', 'paragraph']);
    expect(tree.children[2].position?.start).toEqual({ line: 3, column: 1, offset: 6 });
  });

  it('drops a paragraph with no lines left', () => {
    const tree = parse('%a\n\nb', { gfm: false }, rules);
    expect(types(tree)).toEqual(['html', 'paragraph']);
  });

  it('runs transforms after inline parsing', () => {
    parse('a\n\n# b\n\nc', { gfm: false }, rules);
    expect(textCount).toBe(3);
  });
});
