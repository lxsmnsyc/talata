import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';
import { normalizeIdentifier } from '../src/core/state';
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

// Pathological inputs must grow about linearly. Make the input 8 times larger
// and compare the best of five runs: linear work grows about 8 times,
// quadratic work 64 times. The bound sits between them, with room for noise
// from test files running in parallel.
function bestTime(markdown: string): number {
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    fromMarkdown(markdown);
    best = Math.min(best, performance.now() - start);
  }
  return best;
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
  ['unclosed comments', (size) => 'a <!--\n'.repeat(size / 7)],
  ['unclosed code spans', (size) => '`` a `b` '.repeat(size / 9)],
];

describe('growth on pathological inputs', () => {
  for (const [name, build] of growthCases) {
    it(name, () => {
      const small = build(4000);
      const large = build(32_000);
      bestTime(small);
      const ratio = bestTime(large) / Math.max(bestTime(small), 1);
      expect(ratio).toBeLessThan(24);
    });
  }
});
