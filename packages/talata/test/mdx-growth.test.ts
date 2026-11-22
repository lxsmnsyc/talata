import { isDeepStrictEqual } from 'node:util';
import { describe, expect, test } from 'vitest';
import { createRandom, documentSeed } from './fuzz/random';
import type { Random } from './fuzz/random';
import { acorn, parseReference, parseTalata } from './parsers';
import type { ExtensionName, ExtensionOptions } from './parsers';

// A flow construct that fails on a later line rewinds its flow layer and
// reads only its own lines again. Container directives in those lines are
// collected raw and parsed in a later pass, which never runs once the text
// before them throws. So failed constructs over directives grow linearly,
// as in the reference (`{a\n:::x\n}x\n` repeated grew about 15x per 4x size
// with the old re-read). The generator mixes such units with heads, quotes,
// lists, footnote definitions and lazy lines. `MDX_GROWTH_COUNT`,
// `MDX_GROWTH_SEED` and `MDX_GROWTH_LIMIT` set it.

const names: ExtensionName[] = ['directive', 'mdx'];
const all: ExtensionName[] = ['frontmatter', 'math', 'directive', 'mdx'];
const withAcorn: ExtensionOptions = { mdx: { acorn } };

/** Best of `runs` parses of `text`, in milliseconds. */
function best(text: string, options: ExtensionOptions, runs: number): number {
  let fastest = Infinity;
  for (let run = 0; run < runs; run++) {
    const start = performance.now();
    parseTalata(text, false, names, options);
    fastest = Math.min(fastest, performance.now() - start);
  }
  return fastest;
}

const heads = ['', 'a. ', '*a* ', '&amp; ', '[a] '];
const shapes: [first: string, rest: string][] = [
  ['', ''],
  ['> ', '> '],
  ['- ', '  '],
];

describe('failed constructs over directives', () => {
  // Timing: loose bounds, best of several runs. The full suite runs files in
  // parallel, so a run under load can still be slow.
  for (const [first, rest] of shapes) {
    for (const head of heads) {
      const unit = first + head + '{a\n' + rest + ':::x\n' + rest + '}x\n';
      test(`grow linearly: ${JSON.stringify(unit)}`, { timeout: 60_000 }, () => {
        best(unit.repeat(500), {}, 2);
        // The lowest of three ratios: one slow sample under load does not fail it.
        let ratio = Infinity;
        // Linear is 4, quadratic 16: a bound of 8 leaves room for load.
        for (let attempt = 0; attempt < 3 && ratio >= 8; attempt++) {
          ratio = Math.min(ratio, best(unit.repeat(8000), {}, 5) / best(unit.repeat(2000), {}, 5));
        }
        expect(ratio, unit).toBeLessThan(8);
      });
    }
  }

  test('with acorn, grow linearly and stay below the reference', { timeout: 120_000 }, () => {
    // acorn stops at the first error, near the start of the code, so each `}`
    // costs little. The reference builds the code from its events at each
    // `}` and is quadratic here.
    const unit = '{a\n:::x\n}x\n';
    const medium = unit.repeat(500);
    expect(parseTalata(medium, false, names, withAcorn)).toEqual(
      parseReference(medium, false, names, withAcorn),
    );
    best(medium, withAcorn, 2);
    let ratio = Infinity;
    for (let attempt = 0; attempt < 3 && ratio >= 8; attempt++) {
      ratio = Math.min(
        ratio,
        best(unit.repeat(8000), withAcorn, 3) / best(unit.repeat(2000), withAcorn, 3),
      );
    }
    expect(ratio).toBeLessThan(8);
    let reference = Infinity;
    for (let run = 0; run < 2; run++) {
      const start = performance.now();
      parseReference(medium, false, names, withAcorn);
      reference = Math.min(reference, performance.now() - start);
    }
    expect(best(medium, withAcorn, 3)).toBeLessThan(reference);
  });

  test('match the reference at small sizes', () => {
    for (const [first, rest] of shapes) {
      for (const head of heads) {
        const input = (first + head + '{a\n' + rest + ':::x\n' + rest + '}x\n').repeat(3);
        for (const options of [{}, withAcorn]) {
          for (const gfm of [false, true]) {
            expect(parseTalata(input, gfm, names, options), JSON.stringify(input)).toEqual(
              parseReference(input, gfm, names, options),
            );
          }
        }
      }
    }
  });
});

describe('generated documents with failed constructs', () => {
  const prefixes: [string, string][] = [
    ['', ''],
    ['', ''],
    ['> ', '> '],
    ['>', '>'],
    ['- ', '  '],
    ['1. ', '   '],
    ['> - ', '>   '],
    ['- > ', '  > '],
    ['[^a]: ', '    '],
  ];
  const unitHeads = [
    '',
    '',
    '',
    'a. ',
    '*a* ',
    '&amp; ',
    '[a] ',
    '`a` ',
    '\\* ',
    '[a](b) ',
    'a-b ',
  ];
  const opens = ['{a', '{', '<a', '<a b="', '<a b={', '{`', '<a>{'];
  const middles = [
    ':::x',
    ':::x',
    ':::y[<]',
    ':::',
    '<d',
    '{',
    '}',
    'b',
    '',
    '[a]: b',
    '|a|',
    '-|-',
    '# h',
    '```',
    '$$',
    '- c',
    '> d',
  ];
  const closes = ['}x', '}x', '/>x', '"/>x', '}>x', '}', '/>', 'x', '}{', '} '];
  const tails = ['', 'y', ':', '>', '  ', '\t', '}x', ':::'];

  function generate(random: Random): string {
    const lines: string[] = [];
    if (random.chance(0.2)) {
      lines.push(random.pick(['[a]:', 'p', '[a]: b', '<b/>', '{c}']));
    }
    for (let unit = 1 + random.int(4); unit > 0; unit--) {
      const [first, rest] = random.pick(prefixes);
      lines.push(first + random.pick(unitHeads) + random.pick(opens));
      for (let i = random.int(4); i > 0; i--) {
        // Now and then a lazy line: the prefix cut.
        const prefix = random.chance(0.1) ? rest.slice(0, random.int(rest.length + 1)) : rest;
        lines.push(prefix + random.pick(middles));
      }
      lines.push(rest + random.pick(closes));
      if (random.chance(0.2)) {
        lines.push('');
      }
    }
    if (random.chance(0.5)) {
      lines.push(random.pick(tails));
    }
    return lines.join('\n') + (random.chance(0.6) ? '\n' : '');
  }

  const count = Number(process.env.MDX_GROWTH_COUNT ?? 3000);
  const seed = Number(process.env.MDX_GROWTH_SEED ?? 20261124);
  const limit = Number(process.env.MDX_GROWTH_LIMIT ?? 20);

  test(`match the reference (${count}, seed ${seed})`, { timeout: 0 }, () => {
    const failures: string[] = [];
    for (let i = 0; i < count && failures.length < limit; i++) {
      const random = createRandom(documentSeed(seed, i));
      const input = generate(random);
      const gfm = random.chance(0.5);
      const options = random.chance(0.5) ? withAcorn : {};
      const list = random.chance(0.8) ? names : all;
      if (
        !isDeepStrictEqual(
          parseTalata(input, gfm, list, options),
          parseReference(input, gfm, list, options),
        )
      ) {
        failures.push(
          `${i} ${JSON.stringify(input)}${gfm ? ' gfm' : ''}${options === withAcorn ? ' acorn' : ''}${list === all ? ' all' : ''}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
