import type {
  BlockContent,
  Blockquote,
  DefinitionContent,
  List,
  ListItem,
  Root,
  RootContent,
} from 'mdast';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';
import { blockRules, paragraphPrefixRules } from '../src/blocks';
import decodeString from '../src/blocks/decode';
import type { BlockRule, BlockState, OpenBlock } from '../src/core/blocks';
import { advanceLine, consumeColumns } from '../src/core/line';
import type { Line } from '../src/core/line';
import parse from '../src/core/parse';
import { createRegistry } from '../src/core/registry';
import { point } from '../src/core/source';
import { inlineRules } from '../src/inline';
import { specExamples, specText } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

function difference(expected: Root, actual: Root): string | undefined {
  const diff = firstDiff(expected, actual);
  return diff === undefined ? undefined : describeDiff(diff);
}

function check(markdown: string): void {
  expect(difference(reference(markdown), fromMarkdown(markdown))).toBeUndefined();
}

// The spec sections blocks-leaf implements, compared to the reference parser
// with positions.
const sections = new Set([
  'Setext headings',
  'Indented code blocks',
  'Fenced code blocks',
  'HTML blocks',
  'Link reference definitions',
]);

// Examples that need constructs other nodes build. Each node removes its own.
const waiting = new Map<number, string>([
  [80, 'emphasis (inline-core)'],
  [81, 'emphasis (inline-core)'],
  [82, 'emphasis (inline-core)'],
  [102, 'backslash escapes (inline-core)'],
  [106, 'backslash escapes (inline-core)'],
  [121, 'code spans (inline-core)'],
  [138, 'code spans (inline-core)'],
  [145, 'code spans (inline-core)'],
  [148, 'emphasis (inline-core)'],
  [152, 'emphasis (inline-core)'],
  [155, 'emphasis (inline-core)'],
  [167, 'emphasis (inline-core)'],
  [168, 'raw HTML (inline-core)'],
  [176, 'emphasis (inline-core)'],
  [177, 'emphasis (inline-core)'],
  [187, 'raw HTML (inline-core)'],
  [188, 'emphasis (inline-core)'],
  [192, 'reference links (inline-core)'],
  [193, 'reference links (inline-core)'],
  [194, 'reference links (inline-core)'],
  [195, 'reference links (inline-core)'],
  [196, 'reference links (inline-core)'],
  [198, 'reference links (inline-core)'],
  [200, 'reference links (inline-core)'],
  [201, 'raw HTML (inline-core)'],
  [202, 'reference links (inline-core)'],
  [203, 'reference links (inline-core)'],
  [204, 'reference links (inline-core)'],
  [205, 'reference links (inline-core)'],
  [206, 'reference links (inline-core)'],
  [214, 'reference links (inline-core)'],
  [215, 'reference links (inline-core)'],
  [216, 'reference links (inline-core)'],
  [217, 'reference links (inline-core)'],
  [218, 'reference links (inline-core)'],
]);

describe('spec sections built by blocks-leaf', () => {
  for (const example of specExamples) {
    if (!sections.has(example.section) || waiting.has(example.number)) {
      continue;
    }
    it(`example ${example.number} (${example.section})`, () => {
      check(specText(example.markdown));
    });
  }
});

// Removes the inline content of paragraphs and headings, so examples that
// wait for inline-core still check the block structure and positions.
function blocksOnly(node: Root | RootContent): void {
  if (node.type === 'paragraph' || node.type === 'heading') {
    node.children = [];
  } else if ('children' in node) {
    for (const child of node.children) {
      blocksOnly(child);
    }
  }
}

// Named character references need inline-core's entity table.
const blockWaiting = new Map<number, string>([
  [33, 'named character references (inline-core)'],
  [34, 'named character references (inline-core)'],
]);

describe('block structure of every spec example', () => {
  for (const example of specExamples) {
    const markdown = specText(example.markdown);
    const expected = reference(markdown);
    if (blockWaiting.has(example.number)) {
      continue;
    }
    it(`example ${example.number} (${example.section})`, () => {
      const actual = fromMarkdown(markdown);
      blocksOnly(expected);
      blocksOnly(actual);
      expect(difference(expected, actual)).toBeUndefined();
    });
  }
});

const cases: Record<string, string[]> = {
  setext: [
    'a\n===  ',
    'a  \n---',
    'a\n  ---',
    'a\n    ---',
    'a\n= =',
    'a\n-- -',
    'a\r\n===\r\nb',
    'a\nb\n  ==\nc',
    '===',
    '---',
    '# a\n===',
    '[a]: /u\nb\n===',
    '[a]: /u\n===',
    '[a]: /u\n---',
    '[a]: /u "t"\n===',
    '[a]: /u\n[b]: /v\nc\n---',
    '    a\n---',
    'a\n\n===',
  ],
  indented: [
    '    a\r\n      \r\n    b',
    '    a\n      \nb',
    '    a\n     \nb',
    '    a\n    \nb',
    '    a\n    \n    b',
    '    a\n  \n      \n\nb',
    '    a\n\n\n    b\n\n  ',
    '\t\tfoo',
    '  \tfoo',
    ' \t foo\n\t\tbar',
    'a\n    b',
    '# a\n    b',
    '    a\n',
    '    a\nb',
    '    a\n# b',
    '    a\n    ',
  ],
  fenced: [
    '```\na\n\n\n',
    '```\na\n',
    '```\na',
    '```js  x y \\\\& \na\n  ```  \nb',
    '```js   \na\n```',
    '  ```\n   a\n b\nc',
    '  ```\n\ta\n  ```',
    ' ```\n \tx\n ```',
    '```\n```',
    '```\n\n```',
    '```\n\n\n```\n',
    '``` a`b\nc',
    '~~~ a`b\nc\n~~~~~',
    '````\n```\n````',
    '~~~\n```\n~~~',
    '```\n    ```\n```',
    '```\n   ```\nb',
    '```\n```  x',
    '```\r\na\r\n```\r\n',
    '```\ra\r```',
    '```a&#33;b c&#x22;d\n```',
    '``` &#0; &#xD800; &#1114112;\n```',
    '```\\*a \\b\n```',
    'a\n```\nb\n```',
    '```\n# a\n```\n# b',
    '> ```\n> a\n>\nb',
    '- ```\n  a\n\nb',
    '> ```\n> a\n>\n> \nb',
    '* ```a[a]:\n    \n  \n?>',
    '> ```\n> a\n>\n>',
    '> ```\n>\nb',
    '- ```\n  a\n',
    '- [a]: /u\n\n  b',
  ],
  html: [
    '<div>\na\n',
    '<div>\na\n\nb',
    '  <div>\n  x\n\nb',
    '<!--\na\n\n',
    '<!--\na\n',
    '<!-- a\nb -->c\nd',
    '<!-->\nb',
    '<!--->\nb',
    '<!-- a --\n>\nb\n-->',
    '<?>\nb',
    '<??>\nb',
    '<?a?\n>\n?>',
    '<!DOCTYPE html>\nb',
    '<!a\nb>c\nd',
    '<![CDATA[x]]]>\nb\n]]>',
    '<![CDATA[x]]>\nb',
    '<![CDATA[\nx\n]]>\nb',
    '<![cdata[x]]>',
    '<script>a</style>\nb',
    '<script>\n</scriptx>\n</script>\nb',
    '<textarea>\n\nx</TEXTAREA>\ny',
    '<pre\na</pre>b\nc',
    '<STYLE>\n</textareax></style>\nz',
    '<script/>\nb',
    '<pre/>\nb',
    '</pre>\nb',
    '<a href="x"/>  \nb',
    '<div/>x\n\nb',
    '<div/ >',
    '<div/',
    '<div\n',
    '<div',
    '<divx>',
    '</div>',
    '</div x>\ny',
    '<h7>\nb',
    'a\n<!--b',
    'a\n<div>',
    'a\n<span>',
    'a\n</span>',
    '<a b=c =d>\nx',
    '<a b=c=d>\nx',
    '<a b="c"d>',
    "<a b='c' e>\nf",
    '<a\tb>',
    '<a/b>',
    '<a/>',
    '</a >',
    '</a b>',
    '</a/>',
    '<x-y>\nz',
    '<x_y>',
    '<1a>',
    '<a b c=d>\nz',
    '<A:B>',
    '<a :b _c d.e-f=g>\nh',
    '<a b= "c">\nd',
    '<a b=>',
    '<a b=`c`>',
    '<a b="c\nd">',
    '<a> x',
    '<a>  \n\nb',
    '<del>*foo*</del>',
    '<div>\r\na\r\n\r\nb',
    '    <div>',
    '<\n',
    '<!',
    '<!-',
    '<!-x',
    '<?',
  ],
  definition: [
    '[a]: /u  \nb',
    '[a]: <b c>',
    '[a]: <b\nc>',
    '[a]: b (c (d) e)',
    '[a]: b (c \\(d\\) e)',
    '[a]: b (c (d)',
    '[a]: (b)c)',
    '[a]: a(b(c))',
    '[a]: a(b',
    '[a]: \\(',
    '[ ]: /u',
    '[\n]: /u',
    '[a]: \n\nb',
    '[a]:',
    '[a]: /u "t" x\nb',
    '[a]: /u\n"t" x',
    '[a]:\n/u\n"t"  \nx',
    '[a]: /u "t"d"',
    '[a]: /u "a\nb\nc"',
    '[a]: /u (a\nb)',
    "[a]: /u 'x\r\ny'",
    '[a]: /u "x\n\ny"',
    '[a\\]b &#38; c]: <x&#38;\\*y> "t\\"&#38;"',
    '[a\n   b]: /u "x\n   y"',
    '[a\n \t b]: /u',
    '[a]: /u\n[b]: /v\nc',
    '[a]: /u\n\n[a]: /v',
    '[a]:/u',
    '[a]: <>',
    '[a]: <a\\>b>',
    '[a]: <a<b>',
    '[a]: /u"t"',
    '[a]: /u\t"t"',
    '[a]:\t/u',
    '[a]: /u\n  "t"\n  x',
    '[a\\[b]: /u',
    '[a[b]: /u',
    '[a\\\\]: /u',
    '[^a]: /u',
    'a\n[b]: /u',
    '   [a]: /u',
    '    [a]: /u',
    '[a]: /u\n# b',
    '[a]: /u\n```\nb\n```',
    '[a]: &#x41;&#65;&#0;',
    '[&#x41;]: /u',
    `[${'a'.repeat(999)}]: /u`,
    `[${'a'.repeat(1000)}]: /u`,
    `[a]: ${'('.repeat(40)}b${')'.repeat(40)}`,
  ],
};

// Cases whose paragraphs hold raw HTML: until inline-core lands, only the
// block structure is compared.
const inlineWaiting = new Set([
  'a\n<span>',
  'a\n</span>',
  '<a b=`c`>',
  '<a b="c\nd">',
  '<a> x',
  '<del>*foo*</del>',
  '[a]: <b\nc>',
  '[a]: <a<b>',
  '> a\n> <span>',
]);

function checkBlocks(markdown: string, actual: Root): void {
  const expected = reference(markdown);
  if (inlineWaiting.has(markdown)) {
    blocksOnly(expected);
    blocksOnly(actual);
  }
  expect(difference(expected, actual)).toBeUndefined();
}

for (const [name, inputs] of Object.entries(cases)) {
  describe(`hand-written ${name} cases`, () => {
    for (const markdown of inputs) {
      it(JSON.stringify(markdown), () => {
        checkBlocks(markdown, fromMarkdown(markdown));
      });
    }
  });
}

it('decodes escapes and numeric references', () => {
  expect(decodeString('a\\*b\\c&#65;&#x42;&#X43;&#;&#x;&#12345678;&amp;')).toBe(
    'a*b\\cABC&#;&#x;&#12345678;&amp;',
  );
  expect(decodeString('&#0;&#xFFFE;&#127;')).toBe('\uFFFD\uFFFD\uFFFD');
});

// Definition labels that span lines look up each line's indentation. The
// lookup must stay linear: 4 times the input should take about 4 times as
// long, far from the 16 times a quadratic lookup takes.
it('parses many multi-line definition labels in linear time', () => {
  const time = (count: number): number => {
    const markdown = '[a\n b]: /u\n'.repeat(count);
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      fromMarkdown(markdown);
      best = Math.min(best, performance.now() - start);
    }
    return best;
  };
  time(2000);
  const small = time(4000);
  const large = time(16_000);
  expect(large / Math.max(small, 0.5)).toBeLessThan(10);
});

// Named references (`&ouml;`) in info strings and definitions need the entity
// table inline-core adds. Until then they stay raw; this documents the gap.
it.fails('decodes named character references (waits for inline-core)', () => {
  check('``` f&ouml;\n```');
});

// Test-only containers, copied from test/core.test.ts, for the cross cases
// with block quotes and lists. blocks-container builds the real ones.
function isFlow(node: RootContent): node is BlockContent | DefinitionContent {
  return node.type !== 'text' && node.type !== 'break';
}

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
      if (
        line.start === line.end &&
        line.partialTab === 0 &&
        line.end === line.text.length &&
        line.start > state.source.lineStarts[line.index]
      ) {
        this.end = line.end;
        return true;
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

class TestList implements OpenBlock {
  name = 'testList';
  isContainer = true;
  acceptsLazy = true;
  start: number;
  childName = 'testItem';

  constructor(start: number) {
    this.start = start;
  }

  canContain(block: OpenBlock): boolean {
    return block.name === this.childName;
  }

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

// Cross cases with the test-only containers. Cases that need the real list
// rule (blank lines in items) are in the hand-written fenced cases above.
// Known gap: `> > ```\n> > a\n>` gives a code block that ends after the line
// ending, where the reference ends it before (see outcome.md).
const crossCases = [
  '> > ```\n> > a\n> >',
  '> ```\n> a\n>',
  '> ```\n> a\n>\n> b',
  '> <!--\n> a\n>',
  '> <div>\n> a\n>',
  '>     a\n>',
  '> a\n===',
  '> a\n> ===',
  '> a\nb\n> ===',
  '> a\nb\n===',
  '> [a]: /u\n> b\n> ===',
  '> [a]: /u\n> ===',
  '> [a]:\n> /u',
  '> [a]:\n/u',
  '> [a\n> b]: /u "x\n>  y"',
  '> [a\n>\t b]: /u',
  '> [a\n>  b]: /u',
  '> ```\n> a\nb',
  '> ```\n> a\n',
  '> ```\n> a\n> ',
  '> ```\n> a\n\nb',
  '> ```\n> a\n# b',
  '> ```\n> a\n```',
  '> ```\n> a\n> ```\nb',
  '>  ```\n> a',
  '>  ```\n>  a\n>   b\n> c',
  '>\t```\n>\t\ta',
  '> <!--\n> a\nb',
  '> <!--\n> a\n> > b',
  '> <div>\n> a\nb',
  '> a\n<span>',
  '> a\n> <span>',
  '> a\n<div>',
  '>\t\tfoo',
  '>\t<div>',
  '> a\n    b',
  '>     a\n    b',
  '>     a\n>\n>     b',
  '>     a\n> b',
  '+ <div>\n  a\n+ b',
  '+ ```\n  a\nb',
  '> ```\n> a\n+ b',
  '+ ```\n  a\n> b',
  '> + ```\n>   a\n> b',
  '+ a\n  ===',
  '+ a\n===',
  '+ [a]: /u\n+ b',
  '+ [a\n  b]: /u',
  '+     a\n  b',
  '+ a\n<span>',
];

describe('cross cases with test-only containers', () => {
  const rules = createRegistry(
    {
      blockRules: [...blockRules, testQuote, testItem],
      paragraphPrefixRules,
      inlineRules,
      transforms: [],
    },
    { gfm: false },
  );
  for (const markdown of crossCases) {
    it(JSON.stringify(markdown), () => {
      checkBlocks(markdown, parse(markdown, { gfm: false }, rules));
    });
  }

  // The reference ends these items after the next item's marker, which the
  // test-only item does not do. Only the leaf in the first item is compared.
  for (const markdown of ['+ ```\n  a\n+ b', '+ ```\n+ b', '+ <!--\n  a\n+ b']) {
    it(JSON.stringify(markdown), () => {
      const expected = reference(markdown).children[0];
      const actual = parse(markdown, { gfm: false }, rules).children[0];
      expect(expected.type === 'list' && actual.type === 'list').toBe(true);
      if (expected.type === 'list' && actual.type === 'list') {
        expect(actual.children[0].children[0]).toEqual(expected.children[0].children[0]);
      }
    });
  }
});

// With the real list rule: the leaf matches, but the reference ends the first
// item after the next item's marker (3:3) and talata ends it at the leaf
// (3:1). That is the list item's end rule, listed for spec-green.
describe('leaf blocks in real list items followed by a new item', () => {
  for (const markdown of ['- ```\n  a\n- b', '- ```\n- b', '- <!--\n  a\n- b']) {
    it(JSON.stringify(markdown), () => {
      const expected = reference(markdown).children[0];
      const actual = fromMarkdown(markdown).children[0];
      expect(expected.type === 'list' && actual.type === 'list').toBe(true);
      if (expected.type === 'list' && actual.type === 'list') {
        expect(actual.children[0].children[0]).toEqual(expected.children[0].children[0]);
      }
    });
  }
});
