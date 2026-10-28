import type { Definition } from 'mdast';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { describe, expect, it } from 'vitest';
import { blockRules, paragraphPrefixRules } from '../src/blocks';
import type { BlockState, ParagraphPrefixRule } from '../src/core/blocks';
import parse from '../src/core/parse';
import { createRegistry } from '../src/core/registry';
import type { Registry } from '../src/core/registry';
import { point } from '../src/core/source';
import { normalizeIdentifier } from '../src/core/state';
import { transforms } from '../src/core/transform';
import { inlineRules } from '../src/inline';
import { specExamples, specText } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// Inline rules compared to the reference parser, positions included.
//
// Link reference definitions belong to blocks-leaf. Until it lands, a
// test-only paragraph prefix rule takes leading paragraph lines that the
// reference parses, on their own, as one definition. It copies that node
// (moved to the line's offset) and adds its label to `definitions`.
// Multi-line definitions and definitions inside containers are not handled.

const testDefinition: ParagraphPrefixRule = {
  name: 'testDefinition',
  priority: 0,
  consume(state: BlockState, paragraph, out): void {
    const text = state.source.text;
    const lines = paragraph.lines;
    let taken = 0;
    while (taken < lines.length) {
      const start = lines[taken];
      const line = text.slice(start, lines[taken + 1]);
      const tree = reference(line);
      const node = tree.children[0];
      if (tree.children.length !== 1 || node.type !== 'definition') {
        break;
      }
      const definition: Definition = {
        ...node,
        position: {
          start: point(state.source, start + node.position!.start.offset!),
          end: point(state.source, start + node.position!.end.offset!),
        },
      };
      out.push(definition);
      state.definitions.add(node.identifier.toUpperCase());
      taken += 2;
    }
    lines.splice(0, taken);
  },
};

function registry(useGfm: boolean): Registry {
  return createRegistry(
    {
      blockRules,
      paragraphPrefixRules: [...paragraphPrefixRules, testDefinition],
      inlineRules,
      transforms,
    },
    { gfm: useGfm },
  );
}

const commonmark = registry(false);
const withGfm = registry(true);

function compare(markdown: string, useGfm = false): string | undefined {
  const expected = useGfm
    ? reference(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
    : reference(markdown);
  const actual = parse(markdown, { gfm: useGfm }, useGfm ? withGfm : commonmark);
  return describeDiff(firstDiff(expected, actual));
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

// Examples that need block constructs other nodes build.
const waiting = new Map<number, string>([
  [18, 'indented code (blocks-leaf)'],
  [19, 'fenced code (blocks-leaf)'],
  [21, 'HTML blocks (blocks-leaf)'],
  [24, 'fenced code (blocks-leaf)'],
  [31, 'HTML blocks (blocks-leaf)'],
  [34, 'fenced code (blocks-leaf)'],
  [36, 'indented code (blocks-leaf)'],
  [38, 'lists (blocks-container)'],
  [541, 'multi-line definitions (blocks-leaf)'],
]);

describe('inline spec sections', () => {
  for (const example of specExamples) {
    if (!sections.has(example.section) || waiting.has(example.number)) {
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

// References against definitions the test rule reads. Re-check these once
// blocks-leaf lands the real definition rule.
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
