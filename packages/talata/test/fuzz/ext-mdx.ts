import type { ExtensionFuzz } from './ext';
import type { Random } from './random';

// Mostly valid MDX: matched elements, self-closing tags, fragments and
// expressions, with attributes of every kind. Now and then a tag that does
// not match, a broken attribute or an open brace, so the error messages are
// compared too. For `mdx({ acorn })` (`pnpm fuzz --acorn`): braces in
// strings, comments, templates and regexes, code acorn rejects, and ESM.
// Without acorn the ESM lines are paragraphs.

const names = ['a', 'b', 'B', 'Card', 'x.y', 'a.b.c', 'svg:rect', 'a-b', 'é', '$', '_'];
const spaces = ['', '', ' ', '  ', '\t'];
const attributeParts = [
  'b',
  'b="c"',
  "b='c d'",
  'b="&amp; &copy; &#35; &ampx; &x;"',
  'b={c}',
  'b={{a: 1}}',
  '{...c}',
  '{c}',
  'b:c="d"',
  'b-c',
  'b={}',
  'b = "c"',
  'b="c\nd"',
  'b={c\n  d}',
  'b={"}"}',
  '{...{a: "}"}}',
  'b={/* } */ 1}',
];
// Attributes acorn rejects.
const badAttributes = ['{...a, b}', '{a}', 'b={a b}'];
const expressions = [
  'a',
  '',
  ' a ',
  '1 + 1',
  '{a}',
  '/* c */',
  'a\n  b',
  '"}"',
  '`a`',
  '...b',
  "'}'",
  '`}\n`',
  '/}/',
  '/* } */',
  'a // }\n',
  '// c\n',
  'a b',
  '<b />',
  '(a)',
  'a}',
  '`a\n\tb`',
];
// Expressions acorn rejects.
const badExpressions = ['a b', '"a', '?', 'a =>'];

// ESM: one statement or a few, some across lines or blank lines, some that
// acorn rejects, and names imported twice.
const esm = [
  ['import a from "b"'],
  ['import {a, b} from "c"'],
  ['import * as b from "c"'],
  ['import "a"'],
  ['export const a = 1'],
  ['export default function () {}'],
  ['export {a}'],
  ['export {', '  a', '} from "b"'],
  ['export {', '', '  a', '', '} from "b"'],
  ['export var a = `', '', '`'],
  ['export var a = /* }', '', '*/ 1'],
  ['import a from "b"', 'export {a}'],
  ['export var a = <b />'],
];
// ESM acorn rejects.
const badEsm = [
  ['export var a = 1', 'var b'],
  ['export {'],
  ['import a'],
  ['import a from "b";', 'a()'],
  ['export var a = "'],
];

function pickEsm(random: Random): string[] {
  return [...random.pick(random.chance(0.15) ? badEsm : esm)];
}
const broken = [
  '<3',
  '< a',
  '<a b=>',
  '<a!>',
  '<a/ b>',
  '</>',
  '<a',
  '{a',
  '</a b>',
  '<a b="c>',
  '<!-- a -->',
];

function pickName(random: Random): string {
  return random.chance(0.15) ? '' : random.pick(names);
}

function attributes(random: Random): string {
  let out = '';
  const count = random.chance(0.5) ? 0 : 1 + random.int(3);
  for (let i = 0; i < count; i++) {
    out +=
      random.pick([' ', ' ', '  ', '\n  ']) +
      random.pick(random.chance(0.05) ? badAttributes : attributeParts);
  }
  return out;
}

function open(random: Random, name: string): string {
  return '<' + name + (name === '' ? '' : attributes(random)) + random.pick(spaces) + '>';
}

function close(name: string): string {
  return '</' + name + '>';
}

function selfClosing(random: Random): string {
  const name = random.pick(names);
  return '<' + name + attributes(random) + random.pick([' ', '', '  ']) + '/>';
}

function expression(random: Random): string {
  return '{' + random.pick(random.chance(0.05) ? badExpressions : expressions) + '}';
}

function inline(random: Random, text: () => string): string {
  const kind = random.int(10);
  if (kind < 3) {
    const name = pickName(random);
    return open(random, name) + text() + (random.chance(0.95) ? close(name) : '');
  }
  if (kind < 5) {
    return selfClosing(random);
  }
  if (kind < 8) {
    return expression(random);
  }
  if (kind === 8) {
    return random.pick(['\\<', '\\{', '&lt;', ' < ', 'a<b', '`<a`', '`{a`']);
  }
  return random.pick(broken);
}

function block(random: Random, text: () => string): string[] {
  if (random.chance(0.1)) {
    return pickEsm(random);
  }
  const kind = random.int(10);
  if (kind < 4) {
    const name = pickName(random);
    const lines = [random.pick(spaces) + open(random, name)];
    const count = random.int(4);
    for (let i = 0; i < count; i++) {
      const part = random.int(9);
      if (part === 0) {
        lines.push('');
      } else if (part === 1) {
        lines.push(selfClosing(random));
      } else if (part === 2) {
        lines.push(expression(random));
      } else if (part === 3) {
        lines.push('- ' + text());
      } else if (part === 4) {
        lines.push('> ' + text());
      } else if (part === 5) {
        lines.push(...block(random, text));
      } else {
        lines.push(random.pick(spaces) + text());
      }
    }
    if (random.chance(0.95)) {
      lines.push(random.pick(spaces) + close(name));
    }
    return lines;
  }
  if (kind < 6) {
    return [
      selfClosing(random) +
        random.pick(['', '', ' ' + expression(random), ' ' + selfClosing(random)]),
    ];
  }
  if (kind < 8) {
    return [expression(random) + random.pick(['', '', ' ' + selfClosing(random), '  '])];
  }
  if (kind === 8) {
    // A tag across lines.
    return [
      '<' + random.pick(names),
      '  b="c"',
      random.pick(['  {...d}', '  e={f}', '']),
      random.pick(['/>', '>', '/> ' + text()]),
    ];
  }
  return [random.pick(broken) + random.pick(['', ' ' + text()])];
}

/** Fuzz hook for `talata/mdx`. */
const fuzz: ExtensionFuzz = {
  name: 'mdx',
  ready: true,
  nodeTypes: [
    'mdxJsxFlowElement',
    'mdxJsxTextElement',
    'mdxFlowExpression',
    'mdxTextExpression',
    'mdxjsEsm',
  ],
  start: (random: Random) => [...pickEsm(random), ''],
  block,
  inline,
};

export default fuzz;
