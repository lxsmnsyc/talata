/* oxlint-disable typescript/no-unsafe-type-assertion -- bad options on purpose */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fromMarkdown } from '../src';
import { frontmatter } from '../src/frontmatter';
import type { Options } from '../src/frontmatter';
import { corpusFiles, parseReference, parseTalata } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// The inputs of REFERENCE come from the tests of micromark-extension-frontmatter
// 2.0.0 (test/index.js), https://github.com/micromark/micromark-extension-frontmatter
// Copyright (c) Titus Wormer, MIT license. The expected trees come from
// parseReference, not from the HTML the original tests assert.
const REFERENCE: string[] = [
  '---',
  '---\n---',
  '---\na\n\nb\n---',
  '---\na\n\nb\n---\n# Heading\n***\n    code',
  '+++\na\n\nb\n+++\na\n=',
  ' ---\n---',
  '---\n ---',
  '---  \n---\t ',
  '--- --\n---',
  '---\n--- x',
  '----\n---',
  '---\n----',
  '--\n---',
  '---\n--',
  '---\na\nb\n---',
  '<<<\na\n\nb\n>>>',
  '{\na\n\nb\n}',
  '# Hello\n---\na\n\nb\n---\n+++',
  'a\n---\nb\n---',
  '---\nasd\n...',
  '---\nasd',
  '* ---\n  asd\n  ---',
  '> ---\n  asd\n  ---',
];

// Cases of our own: containers, line endings, GFM neighbours, the BOM.
const OWN: string[] = [
  '---\ntitle: a\n---\n\n# Heading\n',
  '---\ntitle: a\n---\nparagraph',
  '---\r\na: b\r\n---\r\nx',
  '---\ra: b\r---\rx',
  '---\n\n\n---',
  '---\n\na\n\n---\n',
  '---\n---\n---\n---',
  '---\na\n---\n---\nb\n---',
  '---\na\n---   \n',
  '---\n\ta\n  b  \n---',
  '﻿---\na: b\n---\nx',
  '\n---\na\n---',
  ' ---\na\n---',
  '+++\na = 1\n+++\n',
  '+++\n---\n+++',
  '---\n+++\n---',
  '---\n+++\n+++',
  '---\n> q\n- x\n```\n---\nafter',
  '---\na\n---\n| a | b |\n| - | - |\n| 1 | 2 |',
  '---\n[^1]: note\n---\n[^1]: note\n\nx[^1]',
  '---\n---\n- [ ] task\n~~gone~~ https://example.com',
  '---\na\n---\n> ---\n> b\n> ---',
  '- ---\n  a\n  ---',
  'x\n---\na\n---',
  '> x\n>\n> ---\n> a\n> ---',
  '---\na',
  '---\na\n',
  '---\na\n--',
  '---\na\n---x',
  '---yaml\na\n---',
  '---\n\n---',
  '---\n---\n',
  '---\na\n---\n---',
  // An unclosed fence stops containers from starting on the lines after it.
  '---\n> b\n\n- c\n\nd',
  '---\n> b\n- c\n1. d\n* e',
  '---\n\n> b',
  '---\n- a\n  - b\n\n  c',
  '---\n[^a]: x\n\n[^a]',
  '---\n# a\n> b\n- c\n***\n> d',
  '---\n> a\n---x\n> c',
];

function check(input: string, useGfm: boolean, options?: Options): void {
  const expected = parseReference(input, useGfm, ['frontmatter'], { frontmatter: options });
  const actual = parseTalata(input, useGfm, ['frontmatter'], { frontmatter: options });
  expect(describeDiff(firstDiff(expected, actual))).toBeUndefined();
}

describe('frontmatter reference inputs', () => {
  for (const gfm of [false, true]) {
    for (const input of [...REFERENCE, ...OWN]) {
      test(`${gfm ? 'gfm' : 'plain'} ${JSON.stringify(input)}`, () => {
        check(input, gfm);
      });
    }
  }
});

describe('frontmatter options', () => {
  const toml: Options = 'toml';
  const both: Options = ['yaml', 'toml'];
  const marker: Options = { type: 'custom', marker: { open: '<', close: '>' } };
  const fence: Options = { type: 'json', fence: { open: '{', close: '}' } };
  const same: Options = [{ type: 'custom', marker: { open: '-', close: '.' } }, 'yaml'];
  const anywhere: Options = { type: 'yaml', marker: '-', anywhere: true };
  const wide: Options = { type: 'x', fence: '~~~~' };
  const other: Options = { type: 'x', fence: 'éé' };
  const cases: [string, Options, string[]][] = [
    ['toml', toml, ['+++\na = 1\n+++\nx', '---\na\n---', '+++\na\n---']],
    ['yaml and toml', both, ['---\na\n---\nx', '+++\na\n+++\nx', '---\na\n+++', '+++\na\n---']],
    ['marker', marker, ['<<<\na\n\nb\n>>>', '<<<\na\n>>>\n---\nb\n---']],
    ['fence', fence, ['{\na\n\nb\n}', '{\n}', '{ \n}\t']],
    ['same start', same, ['---\nasd\n...', '---\nasd\n---', '---\nasd\n...\nx']],
    [
      'anywhere',
      anywhere,
      [
        '# Hello\n---\na\n\nb\n---\n+++',
        'a\n---\nb\n---',
        'a\n\n---\nb\n---\nc',
        '> ---\n> a\n> ---',
        '- ---\n  a\n  ---',
        '---\na\n---\n---\nb\n---',
        'x\n  ---\nb\n---',
        '---\na',
        'a\n---\nb',
      ],
    ],
    ['wide fence', wide, ['~~~~\na\n~~~~', '~~~\na\n~~~', '~~~~~\na\n~~~~']],
    ['non-ASCII fence', other, ['éé\na\néé\nx']],
  ];
  for (const [name, options, inputs] of cases) {
    for (const gfm of [false, true]) {
      for (const input of inputs) {
        test(`${name} ${gfm ? 'gfm' : 'plain'} ${JSON.stringify(input)}`, () => {
          check(input, gfm, options);
        });
      }
    }
  }
});

// Known gap: with `anywhere`, a matter that interrupts a lazy paragraph of a
// quote or list (`> a\n---\nb\n---`) stays inside that container in the
// reference. The rule here only starts in the root, so the contract's root
// condition holds and this case differs. Not covered by the default options.
test('anywhere inside a lazy container is a known gap', () => {
  const input = '> a\n---\nb\n---';
  const options: Options = { type: 'yaml', marker: '-', anywhere: true };
  const expected = parseReference(input, false, ['frontmatter'], { frontmatter: options });
  const actual = parseTalata(input, false, ['frontmatter'], { frontmatter: options });
  expect(describeDiff(firstDiff(expected, actual))).toBeDefined();
});

test('open fences without a closing fence stay linear with anywhere', () => {
  const options: Options = { type: 'f', fence: { open: '<<', close: '>>' }, anywhere: true };
  const small = '<<\n'.repeat(300);
  const large = '<<\n'.repeat(33_000);
  expect(
    describeDiff(
      firstDiff(
        parseReference(small, false, ['frontmatter'], { frontmatter: options }),
        parseTalata(small, false, ['frontmatter'], { frontmatter: options }),
      ),
    ),
  ).toBeUndefined();
  const start = performance.now();
  parseTalata(large, false, ['frontmatter'], { frontmatter: options });
  expect(performance.now() - start).toBeLessThan(1500);
});

describe('frontmatter factory', () => {
  test('equal options give the same object', () => {
    expect(frontmatter()).toBe(frontmatter(null));
    expect(frontmatter('toml')).toBe(frontmatter('toml'));
    expect(frontmatter('toml')).not.toBe(frontmatter('yaml'));
    expect(frontmatter().name).toBe('talata:frontmatter');
  });

  test('rejects bad matters', () => {
    expect(() => frontmatter('jsonml' as 'yaml')).toThrow();
    expect(() => frontmatter({ marker: '*' } as unknown as Options)).toThrow();
    expect(() => frontmatter({ type: 'jsonml' } as unknown as Options)).toThrow();
  });

  test('yaml is off without the extension', () => {
    const tree = fromMarkdown('---\na\n---');
    expect(tree.children[0].type).toBe('thematicBreak');
  });
});

// Every corpus file with the extension on: as is, with a matter in front, and
// behind an unclosed fence.
const corpus = corpusFiles();
describe.skipIf(corpus.length === 0)('frontmatter on the benchmark corpus', () => {
  for (const file of corpus) {
    if (file.name.startsWith('large/')) {
      continue;
    }
    for (const gfm of [false, true]) {
      test(`${gfm ? 'gfm' : 'plain'} ${file.name}`, () => {
        const value = readFileSync(file.path, 'utf8');
        check(value, gfm);
        check(`---\ntitle: a\n---\n${value}`, gfm);
        check(`---\n${value}`, gfm);
      }, 30_000);
    }
  }
});
