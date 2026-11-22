// oxlint-disable no-template-curly-in-string -- JS template literals are MDX input here
import { describe, expect, test } from 'vitest';
import { fromMarkdown } from '../src';
import { mdx } from '../src/mdx';
import { acorn, acornCallbacks, parseReference, parseTalata } from './parsers';
import type { ExtensionName } from './parsers';

// `data.estree` of `mdx({ acorn })` against `micromark-extension-mdxjs`
// with `mdast-util-mdx` (`micromark-util-events-to-acorn` 2.0.3): places
// mapped through line prefixes, `loc`, `range`, comments, and the
// `ParenthesizedExpression` handling.

const options = { mdx: { acorn } };
const all: ExtensionName[] = ['frontmatter', 'math', 'directive', 'mdx'];

const inputs: string[] = [
  // Expressions in flow and text.
  '{a}',
  '{}',
  '{ }',
  '{/* a */}',
  '{// a\n}',
  '{a /* b */}',
  '{/* a */ b // c\n}',
  '{(a)}',
  '{((a))}',
  '{(((a)))}',
  '{[(a), ((b))]}',
  '{f((a), ((b)))}',
  '{a ? (b) : ((c))}',
  'a {b} c',
  'a {(b)} c {d}',
  '{1n + 0x10 + 1e3}',
  '{/a+/g}',
  '{`a${b}c${`d${e}`}`}',
  '{<a b="c">{d}</a>}',
  '{<a {...b} c={(d)} />}',
  '{() => { return 1 }}',
  '{async function a() { await b }}',
  '{class A { #a = 1; static { this } }}',
  '{a?.b ?? c}',
  '{"\\u{1F600}"}',
  '{"😀" + a}',
  '{a +\nb}',
  '{a +\r\nb}',
  '{a +\rb}',
  '{\n  a\n}',
  '{\n\n  a\n\n}',
  'a {b +\nc} d',
  // Line prefixes.
  '> {a +\n> b}',
  '> a {b +\n> c} d',
  '>{a +\n>b}',
  '> {a +\nb}',
  '- {a +\n  b}',
  '- a {b +\n  c}',
  '1. {a +\n   b}',
  '> - {a\n>   + b}',
  '>\t{a\n>\t+ b}',
  '-\t{a\n\t+ b}',
  '- >\t{a\n  >\t+ b}',
  '[^a]: {b\n    + c}',
  '[^a]: x {b\n    + c}',
  ':::x\n{a +\nb}\n:::',
  ':::x\n> {a +\n> b}\n:::',
  '> :::x\n> {a +\n> b}\n> :::',
  '# {a}',
  'a\n=\n{b}',
  '| a |\n| - |\n| {b} |',
  '*{a}* **{b}** [{c}](d)',
  '![{a /* b */}](c)',
  '[{a /* b */}][c]\n\n[c]: d',
  '[a {b /* c */}]: d',
  '{a /* b */} c',
  '{a /* b */\n} c',
  '<x y={1 /* c */}>\nd\n</x>',
  '<x y={1 /* c */}\n  z="\n"/>a',
  '- {a /* b */}\n- c',
  '| {a /* b */} |\n| - |',
  // Flow that interrupts a paragraph: line endings end after the prefixes.
  '>y\n{\n>}',
  '> y\n> {a\n> }',
  '> y\n> {a\n> } b',
  '- y\n{\n  }',
  '> y\n> <a b={1\n> }/>',
  '> y\n> {\n>\n> }',
  '>\ty\n>\t{\n>\t}',
  '> [a]: b\n> {\n> }',
  'para\n{/* c */}',
  'a\n<A b={/* c */ 1} />',
  'a\r\n{/*c*/ a +\r\nb}',
  '- y\n{/*c*/\n  a}',
  'a\n{/* b */} c',
  'a\n<A b={/* c */ 1}>\n{/* d */}\n</A>',
  '{/* a */} b\n{/* c */}',
  ':::x\n{a /* c */ +\nb}\n:::',
  '::::x\n:::y\n{/*c*/ a}\n:::\n::::',
  ':::x\na\n{/* c */}\n:::',
  // Attributes.
  '<x {...a} />',
  '<x {...(a)} />',
  '<x {...((a))} />',
  '<x {/* a */...b} />',
  '<x {...a /* b */} />',
  '<x {...{a: 1}} />',
  '<x y={1} />',
  '<x y={(1)} />',
  '<x y={/* a */ 1} />',
  '<x y={1 // a\n} />',
  '<x y={<z />} />',
  'a <x y={1} {...z}>b</x> c',
  '<x\n  y={1 +\n  2}\n  {...z}\n/>',
  '> <x\n>   y={1 +\n>   2}\n> />',
  '- <x y={1 +\n  2} />',
  '> a <x y={1 +\n> 2} /> b',
  '<x y="a" z={b} />\n{c}',
  // ESM.
  'import a from "b"',
  'import {a} from "b"',
  'import {a, b as c} from "d"',
  'import * as a from "b"',
  'import {a} from "b"\n\nexport {a}',
  'import a from "b"\nexport {a as c}',
  'export {a} from "b"',
  'export * as a from "b"',
  'import {a} from "b"\nexport {a}',
  'export default (a)',
  'export default ((a))',
  'export const a = (1)',
  'export const a = 1 // b\n/* c */',
  'import /* a */ b from "c" // d',
  'import a from "b"\n\nimport {c} from "d"',
  'import a from "b"\n\nimport {c} from "d"\n\nexport {a, c}',
  'import a from "b"\r\nexport {a}',
  'import a from "b"\n\n{a}',
  'export const a = {\n\n  b: 1\n\n}',
  'export function a() {\n  return <b c={1} />\n}',
  ':::x\nimport a from "b"\n:::',
  'import a from "b"\n\n:::x\nimport {c} from "d"\n:::',
  ':::x\n::::y\nexport const a = 1\n::::\n:::',
  'a\n\nexport const b = 1\n\nc {b}',
];

/** Every `data.estree` in `tree`, so a test can check there are some. */
function countPrograms(tree: unknown): number {
  let count = 0;
  const stack: unknown[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (typeof node !== 'object' || node === null) {
      continue;
    }
    if ('data' in node && typeof node.data === 'object' && node.data !== null) {
      if ('estree' in node.data) {
        count++;
      }
    }
    for (const value of Object.values(node)) {
      if (typeof value === 'object' && value !== null && !('estree' in value)) {
        stack.push(value);
      }
    }
  }
  return count;
}

describe('mdx estree', () => {
  for (const gfm of [false, true]) {
    test(`equals the reference, gfm ${gfm}`, () => {
      for (const input of inputs) {
        const expected = parseReference(input, gfm, ['mdx'], options);
        expect(parseTalata(input, gfm, ['mdx'], options), JSON.stringify(input)).toStrictEqual(
          expected,
        );
        expect(parseTalata(input, gfm, all, options), JSON.stringify(input)).toStrictEqual(
          parseReference(input, gfm, all, options),
        );
      }
    });
  }

  test('the inputs make programs', () => {
    // A lazy line in an expression is an error, and so is an expression in
    // a footnote definition's label line that goes on in its content.
    const errors = new Set(['> {a +\nb}', '[^a]: x {b\n    + c}']);
    const labels = new Set(['![{a /* b */}](c)', '[a {b /* c */}]: d']);
    for (const input of inputs) {
      const tree = parseTalata(input, true, all, options);
      if (errors.has(input)) {
        expect(tree.data, JSON.stringify(input)).toHaveProperty('mdxError');
        continue;
      }
      expect(tree.data, JSON.stringify(input)).toBeUndefined();
      // An expression in an image or definition label is only text there.
      const expected = labels.has(input) ? 0 : 1;
      expect(Math.min(countPrograms(tree), 1), JSON.stringify(input)).toBe(expected);
    }
  });

  test('keeps acorn fields and maps places', () => {
    const tree = fromMarkdown('> a {(b) /* c */}', { extensions: [mdx({ acorn })] });
    const quote = tree.children[0];
    expect(quote.type).toBe('blockquote');
    const paragraph = 'children' in quote ? quote.children[0] : undefined;
    const node = paragraph && 'children' in paragraph ? paragraph.children[1] : undefined;
    expect(node).toMatchObject({
      type: 'mdxTextExpression',
      data: {
        estree: {
          type: 'Program',
          start: 5,
          end: 16,
          range: [5, 16],
          loc: {
            start: { line: 1, column: 5, offset: 5 },
            end: { line: 1, column: 16, offset: 16 },
          },
          body: [{ type: 'ExpressionStatement', expression: { type: 'Identifier', name: 'b' } }],
          comments: [{ type: 'Block', value: ' c ', start: 9, end: 16 }],
        },
      },
    });
  });

  test('no estree without acorn', () => {
    for (const input of inputs) {
      let tree;
      try {
        tree = fromMarkdown(input, { extensions: [mdx()] });
      } catch {
        continue;
      }
      expect(countPrograms(tree), JSON.stringify(input)).toBe(0);
    }
  });

  test('onComment and onToken get what the reference gives them', () => {
    // micromark parses flow that interrupts a paragraph twice, its
    // interrupt check first, so the callbacks get each program twice there.
    for (const input of inputs) {
      for (const names of [['mdx'], all] as ExtensionName[][]) {
        expect(acornCallbacks(input, true, names, false), JSON.stringify(input)).toStrictEqual(
          acornCallbacks(input, true, names, true),
        );
      }
    }
  });

  test('stays linear', () => {
    // Programs with many nodes, comments and lines under prefixes: each
    // place maps through a search of the stops, so the walk stays linear.
    const shapes: ((size: number) => string)[] = [
      // Flat lists: a long chain of `+` is as deep as it is long.
      (size) => '{[' + 'a, '.repeat(size) + 'a]}',
      (size) => '> {[\n' + '> /* b */ (c),\n'.repeat(size) + '> ]}',
      (size) => '- <x y={[\n' + '  1, // b\n'.repeat(size) + '  ]} />',
      (size) => 'export const a = [\n' + '\t(1), /* b */\n'.repeat(size) + ']',
      // Many imported names are quadratic in acorn itself (its scope
      // checks), in the reference too; an object has many nodes without.
      (size) => 'export const a = {' + 'b: (1), '.repeat(size) + '}',
      (size) => '{a /* b */} '.repeat(size),
    ];
    const extensions = [mdx({ acorn })];
    for (const shape of shapes) {
      const best = (size: number): number => {
        const text = shape(size);
        let fastest = Infinity;
        for (let run = 0; run < 5; run++) {
          const start = performance.now();
          fromMarkdown(text, { extensions });
          fastest = Math.min(fastest, performance.now() - start);
        }
        return fastest;
      };
      best(500);
      // The lowest of three ratios: one slow sample under load does not
      // fail it. Linear is 4, quadratic 16.
      let ratio = Infinity;
      for (let attempt = 0; attempt < 3 && ratio >= 8; attempt++) {
        ratio = Math.min(ratio, best(8000) / best(2000));
      }
      expect(ratio, shape(1)).toBeLessThan(8);
    }
  });
});
