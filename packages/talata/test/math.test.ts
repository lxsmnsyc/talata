import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { math } from '../src/math';
import { corpusFiles, parseReference, parseTalata } from './parsers';
import type { ExtensionOptions } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// Inputs adapted from the tests of micromark-extension-math 3.1.0
// (test/index.js) and mdast-util-math 3.0.0 (test.js), both MIT licensed,
// Copyright (c) Titus Wormer and the micromark and syntax-tree authors.
// The expected trees come from the reference parser, not from those tests.
const referenceInputs = [
  // micromark-extension-math
  '$a$, $$b$$, $$$c$$$',
  'a \\$b$',
  'a $b\\$',
  'a \\$$b$',
  'a $$ $ $$',
  'a $$\\raisebox{0.25em}{$\\frac a b$}$$ b',
  'a $$ \\$ $$ b',
  'a $$\na\\$ $$ b',
  'a $b$',
  'a $$b$$',
  'a $$$b$$$',
  'a $b\nc\rd\r\ne$ f',
  '$\na\n$',
  '$$\na\n$$',
  '$$$\na\n$$$',
  '$$\n$$',
  '$$\na',
  '$$\na\n',
  '$$asd &amp; \\& asd\na\n$$',
  '$$asd$asd\na\n$$',
  '$$\na\n$$ b',
  '$$\na\n$$  ',
  '  $$\n\ta\n  b\n c\nd\n$$',
  '      $$\n      a\n          $$',
  '> $$\n> a\n> $$\n> b',
  '* $$\n  a\n  $$\n  b',
  'a $\\sum_{\\substack{0<i<m\\\\0<j<n}}$ b',
  'a $\\text{a \\"{a} c}$ b',
  '> $$\na\n$$',
  '> $$\n> a\n$$',
  'a\n> $$',
  // mdast-util-math
  'a $b$ c',
  '$$a&amp;b\\&c\n',
  '$a\nb\nb$',
  '$a$',
];

// More cases: padding, runs of dollars, unclosed input, fences with indent,
// CRLF, tabs, and interaction with other syntax and with containers.
const moreInputs = [
  '$ a $',
  '$  a  $',
  '$ $',
  '$   $',
  '$\n$',
  '$ a$',
  '$a $',
  '$ \n a \n $',
  '$$ a $$ and $ b $',
  '$a',
  '$$a$',
  '$a$$',
  '$a$$b$',
  '$$a$b$$',
  '$$$a$$',
  '$$a$$$',
  '\\$$a$ and \\\\$b$',
  '$a$$b$$c$',
  '$a\\$b$',
  '$\ta\t$',
  '$a\tb$',
  '$a *b$ c*',
  '*a $b* c$',
  '[a $b](c) d$',
  '$[a](b)$',
  '$`a$`',
  '`a $b` c$',
  '<a href="$">$</a>$',
  '<a $b$>',
  '$<a>$',
  '$&amp;$',
  '$\\*$',
  'a$b$c',
  'a $$ b\n\nc $$',
  'a $b\n> c$',
  '> a $b\n> c$ d',
  '- a $b\n  c$ d',
  '1. a $b\n   c$ d',
  '> $$\n> a\n>   b\n> $$',
  '$$\r\na\r\nb\r\n$$\r\n',
  '$$\ra\r$$\r',
  '$$\n\n\n$$',
  '$$\n a\n\n  b\n$$',
  '$$$\na\n$$\nb\n$$$',
  '$$$\na\n$$$$',
  '$$$$\na\n$$$',
  '$$ meta  \na\n$$',
  '$$ \tmeta\t\na\n$$',
  '$$meta \\$\na\n$$',
  '$$&#36;\na\n$$',
  'a\n$$\nb\n$$\nc',
  'a\n$$ b\nc',
  'a\n    $$\nb',
  '    $$\na\n    $$',
  '   $$\n   a\n  b\n$$',
  '$$\na\n    $$\nb\n   $$',
  '$$\na\n$$ \t\nb',
  '# a\n$$\nb\n$$\n---\nc',
  '$$\na\n---\n$$',
  '- $$\n  a\n- b\n  $$',
  '- $$\n  a\n\n  b\n  $$\n- c',
  '- a\n\n  $$\n  b\n  $$\n\n- c',
  '> - $$\n>   a\n>   $$',
  '> $$\n> a\n\nb\n$$',
  '> a\n$$\nb\n$$',
  '> a\n> $$\n> b',
  '- a\n$$\nb',
  '[^1]: $$\n    a\n    $$\n\n[^1]\n',
  '[^1]: $a\n    b$\n\n[^1]\n',
  '[^1]: a\n\n    $$\n    b\n    $$\n',
  '[a]: <b> "$$\n$"\n',
  '| a | b |\n| - | - |\n| $x$ | $y\\|z$ |\n',
  '| a | b |\n| - | - |\n| $x | y$ |\n',
  '| a | $b |\n| - | - |\n| c | d$ |\n',
  '| a |\n| - |\n| $$\\|$$ |\n',
  '| a |\n| - |\n| $$ |\n$$\n',
  '$a$ ~~b $c~~ d$',
  'www.a.com/$b$ $c$',
  '<https://a.com/$b$> $c$',
  '$a$\n***\n$$\nb\n$$\n***',
  '* $a$\n* $$b$$',
  'Hello $x^2$ and\n$$\nx^2\n$$\nbye $y$.\n',
  '$$\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}$$\n',
  'a  \n$b$  \\\n$c$',
  '$a  \nb$',
  '$a\\\nb$',
  '$a\n\n$b$',
  '  $a\n  b$',
  '- a\n  $b\n  c$',
  '> $\n> a\n> $',
  '\t$$\n\ta\n$$',
  '> \t$$\n> \ta\n> $$',
  '>\t$a\n>\tb$',
  '-\t$a\n\tb$',
];

const allInputs = [...referenceInputs, ...moreInputs];

function compare(input: string, gfm: boolean, options?: ExtensionOptions): void {
  const found = firstDiff(
    parseReference(input, gfm, ['math'], options),
    parseTalata(input, gfm, ['math'], options),
  );
  expect(describeDiff(found), JSON.stringify(input)).toBeUndefined();
}

describe('talata/math against the reference', () => {
  for (const gfm of [false, true]) {
    it(`matches the reference inputs ${gfm ? 'with' : 'without'} gfm`, () => {
      for (const input of allInputs) {
        compare(input, gfm);
      }
    });
  }

  it('builds the nodes with the data fields of mdast-util-math', () => {
    const tree = parseTalata('$$ tex\nx\n$$\n\na $b$', false, ['math']);
    expect(tree.children[0]).toMatchObject({
      type: 'math',
      meta: 'tex',
      value: 'x',
      data: {
        hName: 'pre',
        hChildren: [
          {
            type: 'element',
            tagName: 'code',
            properties: { className: ['language-math', 'math-display'] },
            children: [{ type: 'text', value: 'x' }],
          },
        ],
      },
    });
    const paragraph = tree.children[1];
    expect(paragraph.type === 'paragraph' && paragraph.children[1]).toMatchObject({
      type: 'inlineMath',
      value: 'b',
      data: {
        hName: 'code',
        hProperties: { className: ['language-math', 'math-inline'] },
        hChildren: [{ type: 'text', value: 'b' }],
      },
    });
  });

  it('leaves dollars alone without the extension', () => {
    const tree = parseTalata('$a$\n\n$$\nb\n$$', false);
    expect(JSON.stringify(tree)).not.toContain('"math"');
    expect(JSON.stringify(tree)).not.toContain('inlineMath');
  });
});

describe('singleDollarTextMath', () => {
  const options: ExtensionOptions = { math: { singleDollarTextMath: false } };
  const inputs = [
    '$a$, $$b$$, $$$c$$$',
    '$a$',
    '$$a$$',
    '$ $',
    '$$ $ $$',
    '$a$$b$$',
    '\\$$a$ $$b$$',
    '$a\nb$ $$c\nd$$',
    '$$\na\n$$',
    '$\na\n$',
    '| a |\n| - |\n| $x$ | $$y$$ |\n',
    '> $a$ $$b$$',
    '- $$a\n  b$$',
  ];

  for (const gfm of [false, true]) {
    it(`matches the reference ${gfm ? 'with' : 'without'} gfm`, () => {
      for (const input of inputs) {
        compare(input, gfm, options);
      }
    });
  }

  it('leaves a single dollar as text', () => {
    const tree = parseTalata('$a$ $$b$$', false, ['math'], options);
    const paragraph = tree.children[0];
    expect(paragraph.type === 'paragraph' && paragraph.children.map((node) => node.type)).toEqual([
      'text',
      'inlineMath',
    ]);
  });

  it('returns one object per option set', () => {
    expect(math()).toBe(math({ singleDollarTextMath: true }));
    expect(math()).toBe(math({ singleDollarTextMath: null }));
    expect(math({ singleDollarTextMath: false })).toBe(math({ singleDollarTextMath: false }));
    expect(math({ singleDollarTextMath: false })).not.toBe(math());
  });
});

// The benchmark corpus with the extension on. The suite skips when the corpus
// has not been downloaded.
const files = corpusFiles();
const timeout = 30_000;

describe.skipIf(files.length === 0)('benchmark corpus with math', () => {
  for (const gfm of [false, true]) {
    for (const file of files) {
      it(
        `${file.name} ${gfm ? 'with' : 'without'} gfm`,
        () => {
          const value = readFileSync(file.path, 'utf8');
          const found = firstDiff(
            parseReference(value, gfm, ['math']),
            parseTalata(value, gfm, ['math']),
          );
          expect(describeDiff(found)).toBeUndefined();
        },
        timeout,
      );
    }
  }
});
