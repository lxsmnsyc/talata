import { appendFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseReference, parseTalata } from './parsers';

// Growth of nested container directives, as the time ratio at 4 times the
// size. `DIRECTIVE_GROWTH_N` scales the sizes, `DIRECTIVE_GROWTH_OUT` names a
// file that gets the times, `DIRECTIVE_GROWTH_REFERENCE` times the reference
// too.

type Names = Parameters<typeof parseTalata>[2];
type Case = [name: string, make: (n: number) => string, names: Names];

const directive: Names = ['directive'];
const withMdx: Names = ['directive', 'mdx'];

// One chain `n` deep. Every line continues each open directive, in micromark
// too, so the parse is quadratic in the depth (16 at 4 times the depth). What
// a directive does on a line must not grow with the depth: that was cubic.
const deep: Case[] = [
  ['root, closed', (n) => ':::x\n'.repeat(n) + 'a\n' + ':::\n'.repeat(n), directive],
  ['root, unclosed', (n) => ':::x\n'.repeat(n) + 'a\n', directive],
  ['quote, closed', (n) => '> :::x\n'.repeat(n) + '> a\n' + '> :::\n'.repeat(n), directive],
  ['quote, unclosed', (n) => '> :::x\n'.repeat(n) + '> a\n', directive],
  [
    'list, closed',
    (n) => '- :::x\n' + '  :::x\n'.repeat(n - 1) + '  a\n' + '  :::\n'.repeat(n),
    directive,
  ],
  ['list, unclosed', (n) => '- :::x\n' + '  :::x\n'.repeat(n - 1) + '  a\n', directive],
  ['mdx re-read', (n) => '{a\n:::x\n}x\n'.repeat(n), withMdx],
];

// `n` chains of a few levels: linear. At the root only a fence or the end of
// the document closes a directive, so unclosed chains there are one deep chain.
const chain = '::::::a\n:::::b\n::::c\n:::d\ne\n';
const closers = ':::\n::::\n:::::\n::::::\n';
const many: Case[] = [
  ['root, closed inside first', (n) => (chain + closers).repeat(n), directive],
  ['root, closed outside first', (n) => ':::x\n:::y\n:::z\na\n:::\n\n'.repeat(n), directive],
  ['quote, closed', (n) => '> ::::a\n> :::b\n> c\n> :::\n> ::::\n'.repeat(n), directive],
  ['quote, unclosed', (n) => '> :::a\n> :::b\n> c\n\n'.repeat(n), directive],
  ['list, closed', (n) => '- ::::a\n  :::b\n  c\n  :::\n  ::::\n'.repeat(n), directive],
  ['list, unclosed', (n) => '- :::a\n  :::b\n  c\n\n'.repeat(n), directive],
];

function measure(parse: () => void): number {
  let fastest = Infinity;
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    parse();
    fastest = Math.min(fastest, performance.now() - start);
  }
  return fastest;
}

/** The time ratio of talata at `4 * n` over `n`; logs the reference's too when asked. */
function growth(name: string, make: (n: number) => string, names: Names, n: number): number {
  const small = make(5);
  expect(parseTalata(small, false, names)).toEqual(parseReference(small, false, names));
  const parsers = [parseTalata];
  if (process.env.DIRECTIVE_GROWTH_REFERENCE !== undefined) {
    parsers.push(parseReference);
  }
  let ratio = 0;
  for (const parse of parsers) {
    parse(make(n / 4), false, names);
    const base = measure(() => {
      parse(make(n), false, names);
    });
    const large = measure(() => {
      parse(make(n * 4), false, names);
    });
    const out = process.env.DIRECTIVE_GROWTH_OUT;
    if (out !== undefined) {
      const which = parse === parseTalata ? 'talata' : 'reference';
      const row = [
        which,
        name,
        n,
        base.toFixed(1),
        n * 4,
        large.toFixed(1),
        (large / base).toFixed(1),
      ];
      appendFileSync(out, row.join(' | ') + '\n');
    }
    if (parse === parseTalata) {
      ratio = large / base;
    }
  }
  return ratio;
}

const scale = Number(process.env.DIRECTIVE_GROWTH_N ?? 1);

describe('one deep directive chain', () => {
  for (const [name, make, names] of deep) {
    test(name, { timeout: 300_000 }, () => {
      // Cubic was 64; quadratic, as the reference, is 16.
      expect(growth(name, make, names, 400 * scale)).toBeLessThan(24);
    });
  }
});

describe('many directive chains', () => {
  for (const [name, make, names] of many) {
    test(name, { timeout: 300_000 }, () => {
      expect(growth(name, make, names, 2000 * scale)).toBeLessThan(6);
    });
  }
});
