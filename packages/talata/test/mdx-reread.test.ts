import { writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, test } from 'vitest';
import { parseReference, parseTalata } from './parsers';
import type { ExtensionName } from './parsers';

// A flow construct that fails on a later line has its lines read again.
// When those lines hold a container directive opener, the directive and its
// content must show, closed among the lines or later.

const names: ExtensionName[] = ['directive', 'mdx'];
const all: ExtensionName[] = ['frontmatter', 'math', 'directive', 'mdx'];

const inputs = [
  '[a]:\n{a\n:::x\n}x\n',
  '[a]:\n{a\n:::x\n}x',
  '[a]:\n{a\n:::x\nb\n:::\n}x\n',
  '[a]:\n{a\n:::x\n}x\nc\n:::\nd\n',
  '[a]:\n{a\n:::x\n:::y\n}x\n:::\n:::\n',
  '[a]:\n{a\n::::x\n}x\n:::\n::::\nz',
  '[a]:\n{a\n:::x\n> q\n}x\n',
  '[a]:\n{a\n:::x\n- l\n}x\n- m\n',
  '[a]:\n{a\n:::x[l]{#i}\n}x\n',
  '[a]:\n{a\n:::x\n:::\nb\n:::y\n}x\n',
  '[a]:\n{a\n:::x\n:::\n# h\n}x\n',
  '[a]:\n{a\n:::x\n:::\n|a|\n-|-\n}x\n',
  'p\n{a\n:::x\n}x\n',
  '{a\n:::x\n}x\n',
  '{a\n:::x\n}x\n<',
  '<a b={\n:::x\n}/>x\n',
  '> [a]:\n> {a\n> :::x\n> }x\n> c\n',
  '> [a]:\n> {a\n> :::x\n> }x\nc\n',
  '> [a]:\n> {a\n> :::x\n> - b\n> }x\n> :::\n',
  '- [a]:\n  {a\n  :::x\n  }x\n  - c\n',
  '- [a]:\n  {a\n  :::x\n  }x\n- c\n',
  '1. [a]:\n   {a\n   :::x\n   }x\n\n   :::\n',
  ':::y\n[a]:\n{a\n:::x\n}x\n:::\n:::\n',
  '[a]:\n{a\n:::x\n{b\n:::y\n}x\n}x\n',
  '[a]:\n{a\n  :::x\n\t}x\n',
  // Containers in a quote around: the quote prefix matched each line read again.
  '>[a]:\n{\n>:::x\n>1.\n>x\n>}x',
  '>[a]:\n{\n>:::x\n>>\n>\n>}x',
  // Found by the generator, without a directive. Fenced code read again
  // keeps the whitespace after the containers.
  '[a]:\n{\n-|-\n~~~\n  :::x\n}}\n}x\n',
  '- [a]:\n  {a\n  ```\n    :::x\n  {c}\n  }/>x\n',
  // A setext heading starts where its paragraph did, before definitions.
  '[a]:\n{\n|\n-\n}x',
  '[a]:\n{\n|\n=\n}}',
  '>[a]:\n{\n>c\n>=\n>}x',
  // A list item is spread by the nodes a failed construct puts in or drops.
  '- [a]:\n{\n\n  }}',
  '1. [a]:\n{\n\n   }x',
  '- [a]:\n{\n  # y\n  }>\n  -',
  '>- [a]:\n{\n>   ::y\n>   }>\n>   -',
  // Definitions take the paragraph after a failed construct: the nodes before stay.
  '[a]:\n{\n<>\n[b]:}x',
  '[a]:\n{\n<b/>\n[b]:}<\n:',
  // A construct read again runs past the failed lines (plain mdx too).
  '<a b="\n{a">x\n>}x',
  '<a b="\n{a">x\n>}',
  '<a b="\n{a">x\n\n}x',
  '<a b="\n{a">x\nb\nc\n}x\nd',
  '> <a b="\n> {a">x\n> >}x',
  '- <a b="\n  {a">x\n>}x',
  '- <a b="\n  {a">x\n}x',
  '- <a b="\n  {a">x\n- }x',
  '> - <a b="\n>   {a">x\n> }x',
  '<a b="\n<c d="">x\n">x',
  '<a b="\n{a">x\n:::y\n}x',
  '[a]:\n<a b="\n{a">x\n>}',
  // A flow error at the end of the text is inside a directive that runs to it.
  '<a b="\n:::y\n>{">x\n>',
  'a <\n\n:::y\n>{\n>',
  // A table delimiter row after a line read again: the header row is text.
  '<a b="\n{">x\n-|\n\n}x',
  '<a b="\n{">x\n|-\n\n}x',
  '<a\n{\n-|\n\n}>x',
  '<a\n{\n-|\n# }>x',
  '><a b="\n>{">x\n>-|\n>\n>}x',
  // A setext underline after text, then a delimiter row: a heading.
  '<a b="\n{">x\n-\n-|\n}x',
  // A line that ends a span gives no table header; an underline with no
  // text before it (only definitions) is text and does.
  '{\n{\n}\n-|\n}x',
  '<a b="\n{"/>x\n<>\n-|\n}x',
  '><a b="\n>{"/>x\n><>\n>-|\n>}x',
  '[a]:\n{\n-\n-|\n}x',
  '[a]:\n{\n=\n-|\n}x',
  '[a]:\n{\n<>\n-|\n}x',
  // Whitespace kept in an expression of a setext heading in a list item.
  '- {\n   }x\n  -',
  '- {\n   }x\n  =',
  '- {\n\t }x\n  -',
  '> - {\n>    }x\n>   -',
  '[^z]:{\n    }x\n    -',
  // A lazy line in a directive that ends after a quote marker and its space.
  '>:::z\n>>{\n> ',
  '>:::z\n>>{\n> \n',
  '> :::z\n> > {\n> ',
  '>:::z\n>>{\n>\t',
  '>:::z\n>>{\n>  ',
  // A GFM table in the lines read again, after definitions only.
  '[a]:\n{\n-|-\n-|-\n}x',
  '[a]:\n{\na|b\n-|-\n}x\nc',
  '>[a]:\n{\n>-|-\n>-|-\n>}}',
  '1. [a]:\n{\n   -|-\n   -|-\n   }}',
  '[a]:\n{\n-|-\n-|-\n> q\n}x\n> r',
  'p\n{\n-|-\n-|-\n}x',
  '[a]:\n{\nb\n-|-\n-|-\n}x',
  '1. [a]:\n{\n   $\n   -|-\n   -|-\n   }x',
  '1. [a]:\n{\n   -|-\n   -|-\n   =\n   }x',
  '[a]:\n{\n-|-\n-|-\n-\n}x',
  '[a]:\n{\n-|-\n-|-\n---\n}x',
  '>- [a]:\n{\n>   :::x\n>\n>   :::\n>   #\n>   }}\n>   -',
];

/** A small seeded generator (mulberry32). */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const openers = ['', '[a]:', '[a]: b', 'p', '# h', '[a]:\n[b]:', '[^1]: f', '***'];
const starts = ['{a', '{', '{a\n{', '<a b={', '<a\nb={', '{`', '{a}\n{'];
const directiveOpeners = [':::x', '::::x', ':::x[l]{#i}', '  :::x', ':::x{a="b"}', '::::::y'];
const middles = [
  ':::x',
  ':::x',
  '::::x',
  ':::x[l]{#i}',
  ':::y',
  ':::',
  '::::',
  'b',
  '',
  '> q',
  '- l',
  '1. n',
  '```',
  '~~~',
  '$$',
  '# h',
  '---',
  '===',
  '{c}',
  '<b/>',
  '::y',
  '|a|',
  '-|-',
  '  :::x',
  '\t:::x',
  '    c',
  '[b]: c',
];
const closers = ['}x', '}}', '} x', '}', '}/>x', '}/>', '}x<', '} {d}', '}}\n}x', ' }x', '\t}x'];
const trailing = [
  'c',
  ':::',
  ':::',
  '::::',
  '',
  '> c',
  '- c',
  '{d}',
  '<e/>',
  '<',
  '```',
  '$$',
  ':::z',
  '---',
  '-|-',
  '-|',
  '|-',
  '-',
  '=',
];

const pastClosers = ['{a">x', '{">x', '<c d=">x', '{a" />x', '{a">x {', '<c d="{">x', '{">x\n{'];
const pastTrailing = [
  '}',
  '}x',
  '>}x',
  '- }x',
  '  }x',
  '">',
  '">x',
  '"/>',
  '}/>',
  '',
  ':::x',
  '> }',
  '-|',
  '|-',
  '-',
  '# }>x',
  '}>x',
];

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)];
}

/** Opener lines, the start of a construct, middle lines, a closer and trailing lines, in a container or not. */
function generate(random: () => number): string {
  const lines: string[] = [];
  const opener = pick(random, openers);
  if (opener !== '') {
    lines.push(...opener.split('\n'));
  }
  const middleCount = Math.floor(random() * 4);
  const trailingCount = Math.floor(random() * 4);
  if (random() < 0.35) {
    // A quoted value across lines, closed by a line that starts a
    // construct when read again, which runs past the failed lines.
    lines.push('<a b="');
    for (let i = 0; i < middleCount; i++) {
      const middle = pick(random, middles);
      lines.push(middle.includes('"') ? 'b' : middle);
    }
    lines.push(...pick(random, pastClosers).split('\n'));
    for (let i = 0; i < trailingCount; i++) {
      lines.push(pick(random, random() < 0.6 ? pastTrailing : trailing));
    }
  } else {
    lines.push(...pick(random, starts).split('\n'));
    // One container directive opener among 0 to 3 other middle lines.
    const openerAt = Math.floor(random() * (middleCount + 1));
    for (let i = 0; i <= middleCount; i++) {
      lines.push(i === openerAt ? pick(random, directiveOpeners) : pick(random, middles));
    }
    lines.push(...pick(random, closers).split('\n'));
    for (let i = 0; i < trailingCount; i++) {
      lines.push(pick(random, trailing));
    }
  }
  const container = Math.floor(random() * 6);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Sometimes a line leaves the container (lazy or not).
    const outside = i > 0 && random() < 0.08;
    if (container === 0 || outside) {
      out.push(line);
    } else if (container === 1) {
      out.push(line === '' && random() < 0.5 ? '>' : '> ' + line);
    } else if (container === 2) {
      out.push((i === 0 ? '- ' : '  ') + line);
    } else if (container === 3) {
      out.push((i === 0 ? '1. ' : '   ') + line);
    } else if (container === 4) {
      out.push((i === 0 ? '> - ' : '>   ') + line);
    } else {
      // Inside a container directive.
      if (i === 0) {
        out.push(':::w');
      }
      out.push(line);
    }
  }
  return out.join('\n') + (random() < 0.7 ? '\n' : '');
}

function sameTree(input: string, gfm: boolean, list: ExtensionName[]): boolean {
  return isDeepStrictEqual(parseTalata(input, gfm, list), parseReference(input, gfm, list));
}

const count = Number(process.env.MDX_REREAD_COUNT ?? 3000);
const seed = Number(process.env.MDX_REREAD_SEED ?? 20261121);
const limit = Number(process.env.MDX_REREAD_LIMIT ?? 20);

describe('container directives in re-read MDX lines', () => {
  for (const gfm of [false, true]) {
    test(`inputs, gfm ${gfm}`, () => {
      for (const input of inputs) {
        for (const list of [['mdx'] as ExtensionName[], names, all]) {
          expect(parseTalata(input, gfm, list), JSON.stringify(input)).toEqual(
            parseReference(input, gfm, list),
          );
        }
      }
    });
  }

  test(`generated documents (${count}, seed ${seed})`, { timeout: 0 }, () => {
    const random = createRandom(seed);
    const failures: string[] = [];
    for (let i = 0; i < count; i++) {
      const input = generate(random);
      const gfm = random() < 0.5;
      if (!sameTree(input, gfm, names)) {
        failures.push(JSON.stringify(input) + (gfm ? ' gfm' : ''));
        if (failures.length >= limit) {
          break;
        }
      }
    }
    if (process.env.MDX_REREAD_OUT !== undefined) {
      writeFileSync(process.env.MDX_REREAD_OUT, JSON.stringify(failures, null, 1));
    }
    expect(failures).toEqual([]);
  });

  test('re-read directives stay linear', { timeout: 60_000 }, () => {
    // Each unit holds a directive in the failed lines, closed among them.
    // Most hold a text error, which waits: the transform finds the first
    // across the container directives once.
    for (const unit of [
      '[a]:\n{a\n:::x\nb\n:::\n}x\n',
      '[a]:\n{a\n:::x\nb\n:::\n}x\n\n',
      '{a\n:::x\n:::\n:::y\n:::\n}x\n',
      ':::x\nb\n:::\na {\n\n',
      '[a]: b\n{a}\n{\n:::x\nc\n:::\n}x\n\n',
      '[a]:\n{\n-|-\n-|-\n}x\n\n',
      // Nodes put before definitions, one per unit, at the root.
      '[a]:\n{\n<b/>\n[b]:}<\n:\n\n',
      // A construct read again runs past the failed lines.
      '<a b="\n{a">x\n>}x\n\n',
    ]) {
      const small = unit.repeat(50);
      expect(parseTalata(small, false, names), JSON.stringify(small)).toEqual(
        parseReference(small, false, names),
      );
      const best = (repeat: number): number => {
        const text = unit.repeat(repeat);
        let fastest = Infinity;
        for (let run = 0; run < 3; run++) {
          const start = performance.now();
          parseTalata(text, false, names);
          fastest = Math.min(fastest, performance.now() - start);
        }
        return fastest;
      };
      best(500);
      expect(best(8000) / best(2000), unit).toBeLessThan(10);
    }
    // Many directives in one construct: the lines after each fence are read once.
    const many = '{a\n' + ':::x\nb\n:::\n'.repeat(4000) + '}x\n';
    const best = (text: string): number => {
      let fastest = Infinity;
      for (let run = 0; run < 3; run++) {
        const start = performance.now();
        parseTalata(text, false, names);
        fastest = Math.min(fastest, performance.now() - start);
      }
      return fastest;
    };
    const quarter = '{a\n' + ':::x\nb\n:::\n'.repeat(1000) + '}x\n';
    best(quarter);
    expect(best(many) / best(quarter)).toBeLessThan(10);
  });
});
