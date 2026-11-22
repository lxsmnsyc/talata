import { isDeepStrictEqual } from 'node:util';
import { describe, expect, test } from 'vitest';
import { createRandom, documentSeed } from './fuzz/random';
import type { Random } from './fuzz/random';
import { acorn, parseReference, parseTalata } from './parsers';
import type { ExtensionName, ExtensionOptions } from './parsers';

// Where a lazy line starts when it ends an open MDX construct in a quote
// inside a container directive: the error points there. With a container
// outside the directive and nothing left of the line in the directive's
// content, the reference points at the start of the line. Tabs that a quote
// or an indent split leave columns, which count as content. A few inputs
// check which error comes first when a directive runs to the end of a quote.
// `MDX_LAZY_COUNT`, `MDX_LAZY_SEED` and `MDX_LAZY_LIMIT` set the generator.

const names: ExtensionName[] = ['directive', 'mdx'];
const all: ExtensionName[] = ['frontmatter', 'math', 'directive', 'mdx'];
const withAcorn: ExtensionOptions = { mdx: { acorn } };

const inputs = [
  // Found by the `--all --acorn` fuzz, seed 20261401, document 125133.
  '>:::b[[[]]]\n>>{\n>\n',
  '>:::b\n>>{\n>\n',
  '>:::b[x]\n>>{\n>\n',
  '> :::b\n> >{\n> \n',
  '> :::b\n> >{\n>\n',
  '>:::b\n>> {\n>\n',
  '>:::b\n>>\t{\n>\n',
  '>:::b\n>>>{\n>\n',
  '>>:::b\n>>>{\n>>\n',
  '> > :::b\n> > >{\n> >\n',
  '> >:::b\n> >>{\n> >\t',
  ' >:::b\n >>{\n >\n',
  '>:::b\n>><a b="\n>\n',
  '>:::b\n>><a\n>\n',
  '>:::b\n>>{a\n>',
  // Tabs: the quote takes one column, the directive's indent the others.
  '>\t:::b\n>\t>{\n>\t\n',
  '>\t:::b\n>\t>{\n>\t',
  '>\t:::b\n>\t>{\n>\t \n',
  '>\t:::b\n>\t>{\n>\t\t\n',
  '>\t :::b\n>\t >{\n>\t \n',
  '>\t :::b\n>\t >{\n>\t  \n',
  '>\t :::b\n>\t >{\n>\t  ',
  '>  :::b\n>  >{\n>  \n',
  '>  :::b\n>  >{\n>   \n',
  // Lists: no quote outside, the place is after the prefixes.
  '- :::b\n  >{\n  \n',
  '1. :::b\n   >{\n   \n',
  ' :::b\n>{\n \n',
  '  :::b\n>{\n  \n',
  ':::c\n  :::b\n>{\n  \n',
  '> - :::b\n>   >{\n>   \n',
  '> - :::b\n>   >{\n>   ',
  '> - :::b\n>   >{\n>  ',
  '- > :::b\n  > >{\n  >\n',
  // Quotes inside the directive only.
  ':::a\n>>{\n> \n',
  ':::a\n>>{\n> ',
  ':::a\n>>{\n>\n',
  '>:::z\n>>{\n> ',
  '>:::z\n>>{\n> \n',
  // Error order: a directive that runs to the end of a quote ends before the
  // last line ending; an end of file error at its end is inside it.
  '>{\n>:::x\n>}{\n><a b="\n>{">x\n',
  '>{\n>:::x\n>}{\n>{">x\n>\n',
  '> {\n> :::x\n> }{\n> <a b="\n> {">x\n>\n',
  '- {\n  :::x\n  }{\n  {">x\n',
  // A lazy line after the last construct: the content of the directive matters.
  '>{\n>:::x\n>}x\n>{\n>:::x\n><d\n>}x\ny\n',
  '- {\n  :::x\n  }x\n  {\n  :::x\n  <d\n  }x\n:\n',
];

describe('lazy line places in directives', () => {
  for (const gfm of [false, true]) {
    test(`inputs, gfm ${gfm}`, () => {
      for (const input of inputs) {
        for (const list of [names, all]) {
          for (const options of [{}, withAcorn]) {
            expect(parseTalata(input, gfm, list, options), JSON.stringify(input)).toEqual(
              parseReference(input, gfm, list, options),
            );
          }
        }
      }
    });
  }

  // Containers outside the directive: first line, then later lines. Quotes,
  // list items and footnote definitions.
  const outers: [string, string][] = [
    ['>', '>'],
    ['> ', '> '],
    ['>\t', '>\t'],
    [' >', ' >'],
    ['- ', '  '],
    ['1. ', '   '],
    ['-\t', '\t'],
    [' * ', '   '],
    ['[^a]: ', '    '],
    ['[^a]:\t', '\t'],
  ];
  const indents = ['', ' ', '  ', '\t'];
  const inners = ['>', '> ', '>\t', ' >', '- '];
  const opens = ['{', '{a', '<a b="', '<a', '{`', '<a b={'];
  const tails = ['', '', ' ', '  ', '\t', '>', '> ', '>\t', ' >', 'x'];

  function generate(random: Random): string {
    let first = '';
    let rest = '';
    for (let i = random.int(4); i > 0; i--) {
      const [a, b] = random.pick(outers);
      first += a;
      rest += b;
    }
    const lines: string[] = [];
    let prefix = first;
    if (random.chance(0.2)) {
      // A directive around.
      lines.push(prefix + ':::c');
      prefix = rest;
    }
    lines.push(prefix + random.pick(indents) + ':::b' + random.pick(['', '', '[x]', '[[[]]]']));
    let inner = '';
    for (let i = 1 + random.int(3); i > 0; i--) {
      inner += random.pick(inners);
    }
    lines.push(rest + inner + random.pick(opens));
    if (random.chance(0.3)) {
      lines.push(rest + inner + random.pick(['a', '', 'b="']));
    }
    // The lazy line: the prefixes outside, cut or changed, then a tail.
    let lazy = rest;
    if (random.chance(0.3)) {
      lazy = lazy.slice(0, random.int(lazy.length + 1));
    }
    lines.push(lazy + random.pick(tails));
    if (random.chance(0.2)) {
      lines.push(rest + random.pick(tails));
    }
    return lines.join('\n') + (random.chance(0.6) ? '\n' : '');
  }

  const count = Number(process.env.MDX_LAZY_COUNT ?? 3000);
  const seed = Number(process.env.MDX_LAZY_SEED ?? 20261122);
  const limit = Number(process.env.MDX_LAZY_LIMIT ?? 20);

  test(`generated documents (${count}, seed ${seed})`, { timeout: 0 }, () => {
    const failures: string[] = [];
    for (let i = 0; i < count && failures.length < limit; i++) {
      const random = createRandom(documentSeed(seed, i));
      const input = generate(random);
      const gfm = random.chance(0.5);
      const options = random.chance(0.5) ? withAcorn : {};
      if (
        !isDeepStrictEqual(
          parseTalata(input, gfm, names, options),
          parseReference(input, gfm, names, options),
        )
      ) {
        failures.push(
          `${i} ${JSON.stringify(input)}${gfm ? ' gfm' : ''}${options === withAcorn ? ' acorn' : ''}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
