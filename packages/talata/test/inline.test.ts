import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';
import { normalizeIdentifier } from '../src/core/state';
import { emphasisPaths } from '../src/inline/emphasis';
import { workSteps } from '../src/inline/lines';
import { specExamples, specText } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// Inline rules compared to the reference parser, positions included.

function compare(markdown: string, useGfm = false): string | undefined {
  const expected = useGfm
    ? reference(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
    : reference(markdown);
  return describeDiff(firstDiff(expected, fromMarkdown(markdown, { gfm: useGfm })));
}

const sections = new Set([
  'Backslash escapes',
  'Entity and numeric character references',
  'Inlines',
  'Code spans',
  'Emphasis and strong emphasis',
  'Links',
  'Images',
  'Autolinks',
  'Raw HTML',
  'Hard line breaks',
  'Soft line breaks',
  'Textual content',
]);

describe('inline spec sections', () => {
  for (const example of specExamples) {
    if (!sections.has(example.section)) {
      continue;
    }
    it(`example ${example.number} (${example.section})`, () => {
      expect(compare(specText(example.markdown))).toBeUndefined();
    });
  }
});

// Edge cases found while comparing with micromark: flanking at range edges,
// line prefixes kept in code and HTML, destination limits, autolink forms,
// HTML states across lines, and numeric references that decode to U+FFFD.
const cases = [
  'x <!-- a\n  -- b -->',
  'x </a\n  b>',
  'x </a\n\t>',
  'x <?a\n?>',
  'x <!A\nb>',
  'x <![CDATA[a\n]]>',
  'x <a b\n  c = \n "d"\n e=f/>',
  'x <a b=c\nd>',
  'x <!-->',
  'x <!--->',
  'x <!---->',
  'x <!-- a--b -->',
  'x <a/ >',
  'x <a\n/>',
  '`a\n   b`',
  'x <a\n      b>',
  'x <a\n\t\tb>',
  'x <a\n \tb>',
  '[a](<b\n c>)',
  '![a *b* `c` ![d](e)\nf](g)',
  'a\\\nb',
  'a \\\nb',
  'a\\',
  '`a\r\nb`',
  '` \r\na\r\n `',
  '&#0; &#xD800; &#1234567; &#12345678; &#xFFFFFF; &#X41;',
  '*a _b* c_',
  '***a***',
  '*a**b*',
  '__a__b',
  'a**"b"**',
  '*«a»*',
  'a*"b"*c',
  '* a*',
  '[a](/u "t")',
  "[a](/u 't')",
  '[a](/u (t))',
  '[a]( /u\n"t"\n)',
  '[a](/u"t")',
  '[a](<b>c)',
  '[a](b(c)d)',
  '[a](\\(b)',
  '[a](' + '('.repeat(32) + ')'.repeat(32) + ')',
  '[a](' + '('.repeat(33) + ')'.repeat(33) + ')',
  '<http://a b>',
  '<a+b:c>',
  '<x@y-.z>',
  '<x@y-z.w>',
  ' *a\n *b*',
  '*a  \nb*',
  '# [a](b) #',
  '# *a* #',
  '#  *a*\t#',
  'a *b\n*c',
  '*a\n*',
  '[a\n](b)',
  '[a](b "c\n\td")',
  '`` a ` b ``',
  '```a``',
  'a `b\n c\n` d',
  '<a b=\n"c">',
  '<a\nb>',
  'a&nbsp;b &copy &AMP; &amp',
  '[a][b]',
  '![a](b "t") ![c]',
  '*[a*](b)',
  '[*a](b)*',
  '**a [b** c](d)',
  '[a [b](c) d](e)',
  '![a [b](c) d](e)',
  '[![a](b)](c)',
  '\\*a*',
  '*a\\*',
  'a\u{1F600}*b*',
  '*a*\u{1F600}',
  'a  \n  b',
  'a\t\nb',
  '*a* \t',
  '`a`  \nb',
];

describe('inline edge cases', () => {
  for (const markdown of cases) {
    it(JSON.stringify(markdown), () => {
      expect(compare(markdown)).toBeUndefined();
    });
  }
});

// With GFM, a `~` next to a `*` or `_` run counts like a letter.
const gfmCases = ['_a_~b', '~_a_', '*a ~~b* c~~', 'a~*b*~'];

describe('inline edge cases with gfm', () => {
  for (const markdown of gfmCases) {
    it(JSON.stringify(markdown), () => {
      expect(compare(markdown, true)).toBeUndefined();
    });
  }
});

// References against definitions, including ones in other blocks.
const definitions = '[a]: /u\n[b c]: /v "t"\n[*]: /w\n[&amp;]: /x\n[\\]]: /y\n\n';
const referenceCases = [
  '[a]',
  '[a][]',
  '[x][a]',
  '[A]',
  '[b\nc]',
  '[b  c][]',
  '[x][b\n  c]',
  '![a]',
  '![x *y*][b c]',
  '[*]',
  '[&amp;]',
  '[\\]]',
  '[a][b',
  '[a][x]',
  '[a](',
  '[a] (b)',
  '[[a]]',
  '[[a](b)][a]',
  '[x [a] y](z)',
  '*[a]*',
  '[a]\n[b c]',
  '[a][]x',
  '[*a*][a]',
];

describe('reference links with test definitions', () => {
  for (const markdown of referenceCases) {
    it(JSON.stringify(markdown), () => {
      expect(compare(definitions + markdown)).toBeUndefined();
    });
  }
});

describe('normalizeIdentifier and the test definitions agree', () => {
  it('uses the same normalized label', () => {
    expect(normalizeIdentifier('Foo  Bar')).toBe('foo bar'.toUpperCase());
  });
});

// Review cases: a run that shrinks after failing the rule of three pairs
// again inside the outer emphasis (micromark resolves a pair's inside
// again), and line endings after a lookahead into the next line end after
// that line's container prefixes.
const reviewCases = [
  '_**a****b*_',
  '*__a____b_*',
  '>`\n>*a*',
  '- `\n  *a*',
  '>`\\\n>]',
  '><a\n>*a*',
  '>`\n>   *a*',
  '>`\n>\t\t*a*',
  '>`\n>a\n>*b*',
  '> a\n> *b*',
  '- a `b\n     c`',
  '- x <a\n         b>',
  '- [a\n     b]\n\n[a b]: /u',
  '> - `a\n>   b`',
];

describe('review cases', () => {
  for (const markdown of reviewCases) {
    it(JSON.stringify(markdown), () => {
      expect(compare(markdown)).toBeUndefined();
    });
  }
});

// xorshift32: a 32-bit generator that stays in integers.
function generator(seed: number): () => number {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

// Emphasis resolves on a linear path unless other rules' delimiters share
// the span. Both paths must build the same trees.
describe('linear and general emphasis paths agree', () => {
  it('on generated emphasis-heavy inputs', () => {
    // Runs of `*` or `_` (1 to 4 long) between letters, spaces or punctuation.
    const between = ['a', 'b', 'a', 'b', ' ', '.', '[', '](u)'];
    const next = generator(20_261_028);
    const seen = new Set<string>();
    let compared = 0;
    for (let i = 0; i < 8000; i++) {
      let markdown = '';
      const runs = 3 + (next() % 5);
      for (let j = 0; j < runs; j++) {
        markdown += (next() % 2 === 0 ? '*' : '_').repeat(1 + (next() % 4));
        if (j + 1 < runs) {
          markdown += between[next() % between.length];
        }
      }
      if (seen.has(markdown)) {
        continue;
      }
      seen.add(markdown);
      const linear = fromMarkdown(markdown);
      emphasisPaths.mixedOnly = true;
      let general;
      try {
        general = fromMarkdown(markdown);
      } finally {
        emphasisPaths.mixedOnly = false;
      }
      expect(describeDiff(firstDiff(general, linear)), JSON.stringify(markdown)).toBeUndefined();
      compared++;
    }
    expect(compared).toBeGreaterThan(6000);
  });
});

// Pathological inputs must need about linear work. `workSteps` counts the
// inner steps of the rules that scan ahead or back. Making the input 8 times
// larger must not make the count grow more than 12 times (quadratic work
// grows 64 times).
function steps(markdown: string): number {
  workSteps.count = 0;
  fromMarkdown(markdown);
  return workSteps.count;
}

const growthCases: [string, (size: number) => string][] = [
  ['nested brackets', (size) => '['.repeat(size / 2) + ']'.repeat(size / 2)],
  [
    'nested brackets with a definition',
    (size) => '[x]: /u\n\n' + '['.repeat(size / 2) + ']'.repeat(size / 2),
  ],
  ['`* a`', (size) => '* a'.repeat(size / 3)],
  ['`_a*b `', (size) => '_a*b '.repeat(size / 5)],
  ['`**_ a`', (size) => '**_ a'.repeat(size / 5)],
  ['`a**b`', (size) => 'a**b'.repeat(size / 4)],
  ['nested emphasis', (size) => '*a '.repeat(size / 6) + ' a*'.repeat(size / 6)],
  ['`*a* `', (size) => '*a* '.repeat(size / 4)],
  ['`_**a****b*_`', (size) => '_**a****b*_ '.repeat(size / 12)],
  ['unclosed comments', (size) => 'a <!--\n'.repeat(size / 7)],
  ['unclosed code spans', (size) => '`` a `b` '.repeat(size / 9)],
  [
    'failed brackets under delimiters',
    (size) => '[*a '.repeat(size / 8) + ' a*]'.repeat(size / 8),
  ],
  ['unclosed resources', (size) => '[a](b '.repeat(size / 6)],
];

describe('work growth on pathological inputs', () => {
  for (const [name, build] of growthCases) {
    it(name, () => {
      const small = steps(build(4800));
      const large = steps(build(38_400));
      expect(large).toBeLessThan(12 * Math.max(small, 100));
    });
  }
});
