// oxlint-disable no-template-curly-in-string -- JS template literals are MDX input here
import { expect, test } from 'vitest';
import { createRandom, documentSeed } from './fuzz/random';
import shrink from './fuzz/shrink';
import type { Random } from './fuzz/random';
import { acorn, acornCallbacks, parseReference, parseTalata } from './parsers';
import type { ExtensionName } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';
import { isDeepStrictEqual } from 'node:util';

// A generator for `data.estree`: code with comments, parentheses (nested
// ones stay in the reference), templates, regexes, JSX and shared
// specifier nodes, across lines under quote, list, footnote and directive
// prefixes with tabs, with LF, CRLF and CR line endings; ESM with comments,
// specifiers and names imported before. Trees compare with every place of
// every program, and what acorn's \`onComment\` and \`onToken\` get, as
// functions and as arrays. \`MDX_ESTREE_TARGETED=1000000 pnpm vitest run
// test/mdx-estree-targeted` runs more documents; `MDX_ESTREE_START` splits
// a large count.

const count = Number(process.env.MDX_ESTREE_TARGETED ?? 4000);
const first = Number(process.env.MDX_ESTREE_START ?? 0);
const options = { mdx: { acorn } };
const configs: ExtensionName[][] = [['mdx'], ['frontmatter', 'math', 'directive', 'mdx']];

const atoms = [
  'a',
  '(a)',
  '((a))',
  '1n',
  '0x1f',
  '"b"',
  "'}'",
  '`c`',
  '`a${b}c`',
  '`a${`b${c}`}`',
  '/d+/g',
  '[a, (b)]',
  '{a: (b), c}',
  'a?.b',
  'a ?? b',
  'f((a), b)',
  '(() => (a))',
  '(() => { return a })',
  '<b c={d} />',
  '<b>{(c)}</b>',
  'new A()',
  'a[(b)]',
  'class { #a = 1 }',
  '"😀"',
];
const comments = ['/* a */', '/*\n*/', '// b\n', '/** c */'];
const joins = [' + ', ', ', ' && ', ' ? a : ', '\n+ ', '\n  + ', '\n\t+ ', ' +\n', ' ||\n\t'];

function code(random: Random): string {
  let value = '';
  const size = 1 + random.int(3);
  for (let i = 0; i < size; i++) {
    if (random.chance(0.3)) {
      value += random.pick(comments) + random.pick(['', ' ', '\n']);
    }
    value += random.pick(atoms);
    if (i + 1 < size) {
      value += random.pick(joins);
    }
  }
  if (random.chance(0.2)) {
    value += random.pick([' ', '\n']) + random.pick(comments);
  }
  return random.chance(0.15) ? '(' + value + ')' : value;
}

// Names are fresh in each document, so no import or export declares one twice.
let serial = 0;
let hasDefault = false;

function fresh(): string {
  return 'n' + serial++;
}

function specifier(random: Random): string {
  const kind = random.int(6);
  if (kind === 0) {
    return fresh();
  }
  if (kind === 1) {
    return '{' + fresh() + '}';
  }
  if (kind === 2) {
    return '{a as ' + fresh() + ', ' + fresh() + '}';
  }
  if (kind === 3) {
    return '* as ' + fresh();
  }
  if (kind === 4) {
    return fresh() + ', {' + fresh() + '}';
  }
  return '{default as ' + fresh() + '}';
}

function esm(random: Random): string {
  const lines: string[] = [];
  const size = 1 + random.int(3);
  for (let i = 0; i < size; i++) {
    const kind = random.int(6);
    if (kind === 0) {
      lines.push('import ' + specifier(random) + ' from "m"' + random.pick(['', ' // c', ';']));
    } else if (kind === 1) {
      lines.push('export const ' + fresh() + ' = ' + code(random));
    } else if (kind === 2) {
      lines.push('export {' + random.pick(['a as ', 'default as ']) + fresh() + '} from "m"');
    } else if (kind === 3 && !hasDefault) {
      hasDefault = true;
      lines.push('export default ' + code(random));
    } else if (kind === 4) {
      lines.push('export * as ' + fresh() + ' from "m"' + random.pick(['', ' /* d */']));
    } else {
      lines.push('export function ' + fresh() + '() {\n  return ' + code(random) + '\n}');
    }
  }
  return lines.join('\n');
}

function construct(random: Random): string {
  const kind = random.int(7);
  if (kind === 0) {
    return '{' + code(random) + '}';
  }
  if (kind === 1) {
    return 'x {' + code(random) + '} y';
  }
  if (kind === 2) {
    return '<a b={' + code(random) + '} />';
  }
  if (kind === 3) {
    const [spread, close] = random.pick([
      ['...', ''],
      ['/* c */...', ''],
      ['...(', ')'],
      ['...((', '))'],
    ]);
    const comment = random.chance(0.3) ? ' /* d */' : '';
    return '<a {' + spread + random.pick(atoms) + close + comment + '} />';
  }
  if (kind === 4) {
    return 'x <a\n  b={' + code(random) + '}\n  {...c}>' + random.pick(['', 'y</a>']);
  }
  if (kind === 5) {
    return random.pick(['{/* a */}', '{}', '{ }', '{// a\n}', '{\n}']);
  }
  return '{\n' + code(random) + '\n}';
}

const prefixes = ['> ', '>', '>\t', '- ', '-\t', '1. ', '> - ', '- > ', '[^1]: ', '  ', '\t'];

function block(random: Random, depth: number): string {
  const kind = random.int(depth > 0 ? 4 : 5);
  if (kind === 0) {
    return esm(random);
  }
  if (kind === 1) {
    return construct(random);
  }
  if (kind === 2) {
    // Each line of the construct gets the prefixes, or now and then not.
    const prefix = random.pick(prefixes);
    const indent = prefix.startsWith('>') ? prefix : ' '.repeat(prefix.length);
    const lines = construct(random).split('\n');
    let out = prefix + lines[0];
    for (let i = 1; i < lines.length; i++) {
      out += '\n' + (random.chance(0.97) ? indent : random.pick(['', '\t'])) + lines[i];
    }
    return out;
  }
  if (kind === 3) {
    return random.pick(['a', '# b', '***', '| a |\n| - |\n| {b} |', '*{a}* [{b}](c)']);
  }
  return (
    ':::x\n' + block(random, depth + 1) + random.pick(['\n', '\n\n']) + block(random, 1) + '\n:::'
  );
}

function document(random: Random): string {
  serial = 0;
  hasDefault = false;
  const blocks: string[] = [];
  const size = 1 + random.int(4);
  for (let i = 0; i < size; i++) {
    blocks.push(block(random, 0));
  }
  const value = blocks.join(random.pick(['\n\n', '\n\n', '\n'])) + random.pick(['', '\n']);
  const ending = random.pick(['\n', '\n', '\r\n', '\r']);
  return ending === '\n' ? value : value.replaceAll('\n', ending);
}

function differs(value: string, gfm: boolean, names: ExtensionName[]): string | undefined {
  return describeDiff(
    firstDiff(parseReference(value, gfm, names, options), parseTalata(value, gfm, names, options)),
  );
}

/** Whether `onComment` and `onToken` get something else than with the reference. */
function callbacksDiffer(value: string, names: ExtensionName[]): boolean {
  return !isDeepStrictEqual(
    acornCallbacks(value, true, names, false),
    acornCallbacks(value, true, names, true),
  );
}

test(
  `targeted estree documents (${count})`,
  () => {
    const failures: string[] = [];
    let parsed = 0;
    for (let i = first; i < first + count && failures.length < 5; i++) {
      const random = createRandom(documentSeed(20261123, i));
      const value = document(random);
      const names = configs[i % 2];
      if (parseTalata(value, true, names, options).data === undefined) {
        parsed++;
      }
      for (const gfm of [true, false]) {
        if (differs(value, gfm, names) !== undefined) {
          const small = shrink(
            value,
            (candidate) => differs(candidate, gfm, names) !== undefined,
            3000,
          );
          failures.push(
            `${i} ${JSON.stringify(small)} gfm ${gfm} ${names.join(',')}\n${differs(small, gfm, names)}`,
          );
          break;
        }
      }
      if (failures.length === 0 && callbacksDiffer(value, names)) {
        const small = shrink(value, (candidate) => callbacksDiffer(candidate, names), 3000);
        failures.push(`${i} ${JSON.stringify(small)} ${names.join(',')}: callbacks differ`);
      }
    }
    expect(failures.join('\n\n')).toBe('');
    // Most documents parse, so their programs are compared, not only errors.
    expect(parsed / count).toBeGreaterThan(0.5);
  },
  Math.max(30_000, count * 10),
);
