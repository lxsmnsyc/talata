import { expect, test } from 'vitest';
import { createRandom, documentSeed } from './fuzz/random';
import shrink from './fuzz/shrink';
import type { Random } from './fuzz/random';
import { acorn, parseReference, parseTalata } from './parsers';
import type { ExtensionName } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// Generators for shapes the `--all --acorn` fuzz rarely makes: ESM across
// blank lines, in container directives and under table delimiter rows,
// names imported twice and at different depths; `}` inside strings,
// templates, comments and regexes; code acorn rejects inside quotes, lists
// and footnotes, with tabs in the line prefixes, so error places map across
// them; spreads on a line of their own in a tag that fails later.
// `MDX_ACORN_TARGETED=1000000 pnpm vitest run test/mdx-acorn-targeted`
// runs more documents.

const count = Number(process.env.MDX_ACORN_TARGETED ?? 4000);
// `MDX_ACORN_START` runs documents from that index on, to split a large count.
const first = Number(process.env.MDX_ACORN_START ?? 0);
const names: ExtensionName[] = ['frontmatter', 'math', 'directive', 'mdx'];
const options = { mdx: { acorn } };

const esmLines = [
  'import a from "b"',
  'import {a} from "b"',
  'import c from "d"',
  'export {a}',
  'export {c}',
  'export const a = 1',
  'export default 1',
  'export {',
  '  a',
  '}',
  '} from "b"',
  'export var a = `',
  '`',
  'export var a = /* x',
  '*/ 1',
  'export var a = "',
  'var b',
  'a()',
  'import a',
  'export |b',
  '-|-',
];

const codes = [
  'a',
  '"}"',
  "'}'",
  '`}`',
  '`\n}\n`',
  '/}/',
  '/* } */ a',
  'a // }\n',
  '{a: "}"}',
  '...a',
  '...{a}',
  'a b',
  '"a',
  '`a',
  '/* a',
  '<b>}</b>',
  'a}',
  '',
  ' ',
  '(a, b)',
  'a\n\tb',
  '\t',
];

const prefixes = ['', '', '> ', '>\t', '- ', '-\t', '1. ', '  ', '\t', '> - ', '[^1]: '];

function code(random: Random): string {
  let value = random.pick(codes);
  if (random.chance(0.3)) {
    value += random.pick([' ', '\n', '\n  ', '\n\t', '}', ' + ']) + random.pick(codes);
  }
  return value;
}

// Leaf blocks after which flow starts again inside lines read again.
const leaves = [
  '# h',
  '***',
  '```\nc\n```',
  'p\n===',
  '---',
  '[a]: b',
  '::x',
  '$$\nm\n$$',
  '<b/>',
  '',
  // Tables, whose header or body rows may hold ESM.
  '-|',
  'a|b\n-|-',
  'export |b\n-|-',
];

function construct(random: Random): string {
  const kind = random.int(8);
  if (kind === 7) {
    // A construct that fails later, with a leaf and ESM in its lines.
    const [open, close] = random.pick([
      ['<a b="\n', '\n"/>x'],
      ['{`\n', '\n`}x'],
      ['{`\n', '\n// `}x'],
    ]);
    return open + random.pick(leaves) + '\n' + random.pick(esmLines) + close;
  }
  if (kind === 0) {
    return '{' + code(random) + '}';
  }
  if (kind === 1) {
    return '<a b={' + code(random) + '} />';
  }
  if (kind === 2) {
    return '<a {' + code(random) + '} />';
  }
  if (kind === 3) {
    return 'x {' + code(random) + '} y';
  }
  if (kind === 4) {
    return '<a\n{' + code(random) + '}>' + random.pick(['', 'x', ' ']);
  }
  if (kind === 5) {
    return '<a b="\n{' + code(random) + '\n"/>' + random.pick(['', 'x']);
  }
  return 'x <a {...b}\n' + random.pick(['{...c}', '{c}', '{...{c: "}"}}']) + '/> y';
}

function esmBlock(random: Random): string {
  const lines: string[] = [];
  const size = 1 + random.int(4);
  for (let i = 0; i < size; i++) {
    lines.push(random.chance(0.15) ? '' : random.pick(esmLines));
  }
  return lines.join('\n');
}

function block(random: Random, depth: number): string {
  const kind = random.int(depth > 1 ? 5 : 6);
  if (kind <= 1) {
    return esmBlock(random);
  }
  if (kind === 2) {
    return construct(random);
  }
  if (kind === 3) {
    return random.pick(['a', 'b c', '# d', '***', '| a |', '-|-', 'e\n-|-']);
  }
  if (kind === 4) {
    // With line prefixes: each line of the construct gets them.
    const prefix = random.pick(prefixes);
    const indent = prefix.startsWith('>') ? prefix : ' '.repeat(prefix.length);
    const lines = construct(random).split('\n');
    let out = prefix + lines[0];
    for (let i = 1; i < lines.length; i++) {
      out += '\n' + (random.chance(0.8) ? indent : random.pick(['', '- ', '> '])) + lines[i];
    }
    return out;
  }
  const inner: string[] = [];
  const size = 1 + random.int(3);
  for (let i = 0; i < size; i++) {
    inner.push(block(random, depth + 1));
  }
  const fence = ':'.repeat(3 + (2 - depth > 0 ? 1 : 0));
  return (
    fence +
    'x\n' +
    inner.join(random.pick(['\n', '\n\n'])) +
    (random.chance(0.8) ? '\n' + fence : '')
  );
}

function document(random: Random): string {
  const blocks: string[] = [];
  const size = 1 + random.int(5);
  for (let i = 0; i < size; i++) {
    blocks.push(block(random, 0));
  }
  return blocks.join(random.pick(['\n', '\n\n', '\n\n'])) + random.pick(['', '\n', '\n\n']);
}

function differs(value: string, gfm: boolean): string | undefined {
  return describeDiff(
    firstDiff(parseReference(value, gfm, names, options), parseTalata(value, gfm, names, options)),
  );
}

test(
  `targeted documents with acorn (${count})`,
  () => {
    const failures: string[] = [];
    for (let i = first; i < first + count && failures.length < 5; i++) {
      const value = document(createRandom(documentSeed(20261121, i)));
      for (const gfm of [true, false]) {
        if (differs(value, gfm) !== undefined) {
          const small = shrink(value, (candidate) => differs(candidate, gfm) !== undefined, 3000);
          failures.push(`${i} ${JSON.stringify(small)} gfm ${gfm}\n${differs(small, gfm)}`);
          break;
        }
      }
    }
    expect(failures.join('\n\n')).toBe('');
    // A large count runs for minutes.
  },
  Math.max(30_000, count * 5),
);
