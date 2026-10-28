import type {
  BlockContent,
  Blockquote,
  DefinitionContent,
  Delete,
  Heading,
  Html,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from 'mdast';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';
import { blockRules, paragraphPrefixRules } from '../src/blocks';
import type {
  BlockRule,
  BlockState,
  OpenBlock,
  OpenParagraph,
  ParagraphPrefixRule,
} from '../src/core/blocks';
import type { InlineRule, InlineState } from '../src/core/inline';
import { advanceLine, consumeColumns, createLine, measureLine } from '../src/core/line';
import parse from '../src/core/parse';
import { createRegistry } from '../src/core/registry';
import type { Registry } from '../src/core/registry';
import { createSource, point } from '../src/core/source';
import { normalizeIdentifier } from '../src/core/state';
import type { Transform } from '../src/core/transform';
import { inlineRules, mergeText, nodeIndex, pushNode, resolveSpan } from '../src/inline';

describe('source and point', () => {
  it('computes line starts for LF, CR and CRLF', () => {
    expect(createSource('a\nb\r\nc\rd').lineStarts).toEqual([0, 2, 5, 7]);
    expect(createSource('a\n').lineStarts).toEqual([0, 2]);
  });

  it('drops a leading BOM and replaces NUL', () => {
    expect(createSource('\uFEFFa\0').text).toBe('a�');
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
  '\uFEFFfoo',
  '\uFEFF\n# a',
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

  continue(state: BlockState, line: Line): boolean {
    if (!consumeQuotePrefix(line)) {
      // The reference keeps a nested quote open over a last line that has
      // no line ending and only whitespace left after an outer prefix.
      if (
        line.blank &&
        line.end === line.text.length &&
        line.start > state.source.lineStarts[line.index]
      ) {
        this.end = line.end;
      }
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

// A test-only rule that consumes part of the line and then fails. The parser
// must restore the line, so `#` lines still parse as headings.
const testGreedy: BlockRule = {
  name: 'testGreedy',
  priority: 0,
  canInterruptParagraph: true,
  triggers: '#',
  start(_state: BlockState, line: Line): OpenBlock | undefined {
    consumeColumns(line, 2);
    advanceLine(line, line.nonBlank + 1);
    return undefined;
  },
};

function lineText(state: BlockState, lines: number[]): string {
  let value = '';
  for (let i = 0; i < lines.length; i += 2) {
    value += (i > 0 ? '\n' : '') + state.source.text.slice(lines[i], lines[i + 1]);
  }
  return value;
}

// A test-only table: a `|-` line takes the paragraph's last line as its
// header. Its body continues on any non-blank line until a block starts.
class TestTable implements OpenBlock {
  name = 'testTable';
  isContainer = false;
  acceptsLazy = false;
  interruptible = true;
  rows: number[];

  constructor(rows: number[]) {
    this.rows = rows;
  }

  continue(_state: BlockState, line: Line): boolean {
    return !line.blank && this.rows.length > 0;
  }

  addLine(_state: BlockState, line: Line): void {
    this.rows.push(line.nonBlank, line.end);
  }

  close(state: BlockState): Html {
    const rows = this.rows;
    return {
      type: 'html',
      value: lineText(state, rows),
      position: {
        start: point(state.source, rows[0]),
        end: point(state.source, rows[rows.length - 1]),
      },
    };
  }
}

const testTable: BlockRule = {
  name: 'testTable',
  priority: 450,
  canInterruptParagraph: true,
  triggers: '|',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    const text = line.text;
    if (line.end - line.nonBlank !== 2 || text.charCodeAt(line.nonBlank + 1) !== 45) {
      return undefined;
    }
    const header = state.splitParagraph(1);
    if (header === undefined) {
      return undefined;
    }
    header.push(line.nonBlank, line.end);
    return new TestTable(header);
  },
};

function neverContinue(): boolean {
  return false;
}

// A test-only setext underline (`===` only), to check where the heading starts.
class TestSetext implements OpenBlock {
  name = 'heading';
  isContainer = false;
  acceptsLazy = false;
  node: Heading;

  constructor(node: Heading) {
    this.node = node;
  }

  continue: () => boolean = neverContinue;

  close(): Heading {
    return this.node;
  }
}

const testSetext: BlockRule = {
  name: 'testSetext',
  priority: 500,
  canInterruptParagraph: true,
  triggers: '=',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    if (line.indent >= 4) {
      return undefined;
    }
    for (let i = line.nonBlank; i < line.end; i++) {
      if (line.text.charCodeAt(i) !== 61) {
        return undefined;
      }
    }
    const paragraph: OpenParagraph | undefined = state.takeParagraph();
    if (paragraph === undefined) {
      return undefined;
    }
    const node: Heading = {
      type: 'heading',
      depth: 1,
      children: [],
      position: {
        start: point(state.source, paragraph.start),
        end: point(state.source, line.end),
      },
    };
    state.inline(node, paragraph.lines);
    return new TestSetext(node);
  },
};

// A test-only list: `+ ` items. The item rule opens the list itself with
// `openContainer`, and the list accepts only items.
class TestList implements OpenBlock {
  name = 'testList';
  isContainer = true;
  acceptsLazy = true;
  start: number;

  constructor(start: number) {
    this.start = start;
  }

  canContain(block: OpenBlock): boolean {
    return block.name === this.childName;
  }

  childName = 'testItem';

  continue(): boolean {
    return this.start >= 0;
  }

  close(state: BlockState, children: RootContent[]): List {
    const items: ListItem[] = [];
    for (const child of children) {
      if (child.type === 'listItem') {
        items.push(child);
      }
    }
    return {
      type: 'list',
      ordered: false,
      start: null,
      spread: false,
      children: items,
      position: {
        start: point(state.source, this.start),
        end: items[items.length - 1].position!.end,
      },
    };
  }
}

class TestItem implements OpenBlock {
  name = 'testItem';
  isContainer = true;
  acceptsLazy = true;
  start: number;

  constructor(start: number) {
    this.start = start;
  }

  continue(_state: BlockState, line: Line): boolean {
    if (line.blank || line.indent < 2) {
      return false;
    }
    consumeColumns(line, 2);
    return this.start >= 0;
  }

  close(state: BlockState, children: RootContent[]): ListItem {
    const flow: (BlockContent | DefinitionContent)[] = [];
    for (const child of children) {
      if (isFlow(child)) {
        flow.push(child);
      }
    }
    return {
      type: 'listItem',
      spread: false,
      checked: null,
      children: flow,
      position: {
        start: point(state.source, this.start),
        end:
          flow.length > 0
            ? flow[flow.length - 1].position!.end
            : point(state.source, this.start + 1),
      },
    };
  }
}

const testItem: BlockRule = {
  name: 'testItem',
  priority: 700,
  canInterruptParagraph: true,
  triggers: '+',
  start(state: BlockState, line: Line): OpenBlock | undefined {
    const marker = line.nonBlank;
    const next = line.text.charCodeAt(marker + 1);
    if (line.indent >= 4 || (marker + 1 < line.end && next !== 32)) {
      return undefined;
    }
    if (state.container.name !== 'testList') {
      state.openContainer(new TestList(marker));
    }
    advanceLine(line, marker + 1);
    consumeColumns(line, 1);
    return new TestItem(marker);
  },
};

// A test-only container that consumes nothing. The parser must not loop.
class TestEmpty implements OpenBlock {
  name = 'testEmpty';
  isContainer = true;
  acceptsLazy = false;
  start: number;

  constructor(start: number) {
    this.start = start;
  }

  continue(): boolean {
    return this.start < 0;
  }

  close(state: BlockState, children: RootContent[]): Blockquote {
    const flow: (BlockContent | DefinitionContent)[] = [];
    for (const child of children) {
      if (isFlow(child)) {
        flow.push(child);
      }
    }
    return {
      type: 'blockquote',
      children: flow,
      position: { start: point(state.source, this.start), end: point(state.source, this.start) },
    };
  }
}

const testEmpty: BlockRule = {
  name: 'testEmpty',
  priority: 900,
  canInterruptParagraph: true,
  triggers: '!',
  start(_state: BlockState, line: Line): OpenBlock | undefined {
    return new TestEmpty(line.nonBlank);
  },
};

// Test-only inline rules: `~~` strikethrough and `[text](url)` links, enough
// to check span-scoped resolving against the reference with GFM.
function isTilde(state: InlineState, offset: number): boolean {
  return state.source.text.charCodeAt(offset) === 126;
}

function isWhitespaceAt(state: InlineState, offset: number): boolean {
  const code = state.source.text.charCodeAt(offset);
  return Number.isNaN(code) || code === 32 || code === 10 || code === 9;
}

const testTilde: InlineRule = {
  name: 'testTilde',
  priority: 0,
  triggers: '~',
  parse(state: InlineState): boolean {
    const start = state.pos;
    if (!isTilde(state, start + 1) || isTilde(state, start + 2)) {
      return false;
    }
    const node: Text = {
      type: 'text',
      value: '~~',
      position: { start: point(state.source, start), end: point(state.source, start + 2) },
    };
    pushNode(state, node);
    state.delimiters.push({
      marker: 126,
      node,
      start,
      end: start + 2,
      canOpen: !isWhitespaceAt(state, start + 2),
      canClose: !isWhitespaceAt(state, start - 1),
      active: true,
    });
    state.pos = start + 2;
    return true;
  },
  resolve(state: InlineState, bottom: number): void {
    const delimiters = state.delimiters;
    for (let i = bottom; i < delimiters.length; i++) {
      const closer = delimiters[i];
      if (closer.marker !== 126 || !closer.canClose) {
        continue;
      }
      let j = i - 1;
      while (j >= bottom && (delimiters[j].marker !== 126 || !delimiters[j].canOpen)) {
        j--;
      }
      if (j < bottom) {
        continue;
      }
      const opener = delimiters[j];
      const from = nodeIndex(state, opener.node);
      const to = nodeIndex(state, closer.node);
      const children = state.nodes.slice(from + 1, to);
      mergeText(children);
      const node: Delete = {
        type: 'delete',
        children,
        position: {
          start: point(state.source, opener.start),
          end: point(state.source, closer.end),
        },
      };
      state.nodes.splice(from, to - from + 1, node);
      delimiters.splice(j, i - j + 1);
      i = j - 1;
    }
  },
};

const testBracket: InlineRule = {
  name: 'testBracket',
  priority: 0,
  triggers: '[]',
  parse(state: InlineState): boolean {
    const text = state.source.text;
    const start = state.pos;
    if (text.charCodeAt(start) === 91) {
      const node: Text = {
        type: 'text',
        value: '[',
        position: { start: point(state.source, start), end: point(state.source, start + 1) },
      };
      pushNode(state, node);
      state.delimiters.push({
        marker: 91,
        node,
        start,
        end: start + 1,
        canOpen: true,
        canClose: false,
        active: true,
      });
      state.pos = start + 1;
      return true;
    }
    let open = state.delimiters.length - 1;
    while (open >= 0 && state.delimiters[open].marker !== 91) {
      open--;
    }
    const close = text.indexOf(')', start);
    if (open < 0 || text.charCodeAt(start + 1) !== 40 || close === -1 || close >= state.end) {
      return false;
    }
    const bracket = state.delimiters[open];
    resolveSpan(state, open + 1);
    const index = nodeIndex(state, bracket.node);
    const children = state.nodes.splice(index + 1);
    state.nodes.length = index;
    state.delimiters.length = open;
    mergeText(children);
    const link: Link = {
      type: 'link',
      url: text.slice(start + 2, close),
      title: null,
      children,
      position: { start: point(state.source, bracket.start), end: point(state.source, close + 1) },
    };
    pushNode(state, link);
    state.pos = close + 1;
    return true;
  },
};

function registry(useGfm = false): Registry {
  return createRegistry(
    {
      blockRules: [
        ...blockRules,
        testQuote,
        testGreedy,
        testTable,
        testSetext,
        testItem,
        testEmpty,
      ],
      paragraphPrefixRules: [...paragraphPrefixRules, testPrefix],
      inlineRules: [...inlineRules, testTilde, testBracket],
      transforms: [testTransform],
    },
    { gfm: useGfm },
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
    '> > a\n> ',
    '> > a\n> \n',
    '> > a\n>',
    '> > a\n> b',
    '> a\n  ',
    '# a\n#b',
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

function outline(nodes: (Root | RootContent | PhrasingContent)[]): string {
  let result = '';
  for (const node of nodes) {
    if (result !== '') {
      result += ' ';
    }
    result += node.type;
    if ('value' in node) {
      result += JSON.stringify(node.value);
    }
    if ('children' in node) {
      result += '(' + outline(node.children) + ')';
    }
  }
  return result;
}

describe('block framework', () => {
  const rules = registry();
  const run = (markdown: string): string =>
    outline(parse(markdown, { gfm: false }, rules).children);

  it('restores the line after a rule fails', () => {
    expect(parse('  # a', { gfm: false }, rules)).toEqual(reference('  # a'));
  });

  it('splits the last paragraph lines off for a table header', () => {
    expect(run('a\nb\n| c\n|-\nd')).toBe('paragraph(text"a\\nb") html"| c\\n|-\\nd"');
    expect(run('%x\n| c\n|-')).toBe('html"%x" html"| c\\n|-"');
    expect(run('| c\n|-')).toBe('html"| c\\n|-"');
  });

  it('lets block starts interrupt an interruptible leaf', () => {
    expect(run('| c\n|-\nd\n# e\nf')).toBe(
      'html"| c\\n|-\\nd" heading(text"e") paragraph(text"f")',
    );
    expect(run('| c\n|-\n+ d')).toBe('html"| c\\n|-" list(listItem(paragraph(text"d")))');
  });

  it('never continues an interruptible leaf lazily', () => {
    expect(run('> a\n> | b\n> |-\nc')).toBe(
      'blockquote(paragraph(text"a") html"| b\\n|-") paragraph(text"c")',
    );
  });

  it('keeps the paragraph start for setext headings after prefix rules', () => {
    const tree = parse('%a\nb\n===', { gfm: false }, rules);
    expect(outline(tree.children)).toBe('html"%a" heading(text"b")');
    expect(tree.children[1].position?.start).toEqual({ line: 1, column: 1, offset: 0 });
    expect(run('%a\n===')).toBe('html"%a" paragraph(text"===")');
  });

  it('opens a list and its item from one start', () => {
    expect(run('+ a\n+ b')).toBe('list(listItem(paragraph(text"a")) listItem(paragraph(text"b")))');
    expect(run('+ a\n  ***')).toBe('list(listItem(paragraph(text"a") thematicBreak))');
  });

  it('closes containers that cannot hold the new block', () => {
    expect(run('+ a\n***')).toBe('list(listItem(paragraph(text"a"))) thematicBreak');
    expect(run('+ a\nb\n\nc')).toBe('list(listItem(paragraph(text"a\\nb"))) paragraph(text"c")');
  });

  it('stops after a container that consumed nothing', () => {
    expect(run('!a')).toBe('blockquote(paragraph(text"!a"))');
  });
});

describe('span-scoped inline resolve', () => {
  const rules = registry(true);
  const cases = [
    '~~a~~',
    '~~[a~~](b)',
    '[~~a~~](b)',
    '[a ~~b](c) d~~',
    'a [b c',
    'x ~~y [z](u) w~~ v',
  ];
  for (const markdown of cases) {
    it(JSON.stringify(markdown), () => {
      const expected = reference(markdown, {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown()],
      });
      const tree = parse(markdown, { gfm: true }, rules);
      const paragraph: Paragraph | undefined =
        tree.children[0]?.type === 'paragraph' ? tree.children[0] : undefined;
      expect(paragraph?.children).toEqual(
        expected.children[0]?.type === 'paragraph' ? expected.children[0].children : undefined,
      );
    });
  }
});
