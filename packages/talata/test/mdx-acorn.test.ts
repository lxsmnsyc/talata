import { Parser } from 'acorn';
import { describe, expect, test } from 'vitest';
import { fromMarkdown } from '../src';
import { MdxError, mdx } from '../src/mdx';
import { acorn, corpusFiles, parseReference, parseTalata } from './parsers';
import type { ExtensionName } from './parsers';
import { readFileSync } from 'node:fs';

// `mdx({ acorn })` against `micromark-extension-mdxjs` with
// `mdast-util-mdx`, without `data.estree` (the reference runs with
// `addResult: false`).

const options = { mdx: { acorn } };
const all: ExtensionName[] = ['frontmatter', 'math', 'directive', 'mdx'];

// Inputs copied from the tests of micromark-extension-mdxjs,
// micromark-extension-mdxjs-esm and micromark-extension-mdx-expression (test
// files in their repositories, MIT license, Copyright (c) Titus Wormer).
// Only the inputs are used; the expected trees and errors come from the
// reference parser.
const referenceInputs: string[] = [
  '<div>\n{asd}\n</div>',
  '<x {...{"{": 1}} />\n{1 + /*}*/ + 2}',
  'import a from "b"\n\nc',
  'export default a\n\nb',
  'impossible',
  'exporting',
  'import.',
  'import("a")',
  '  import a from "b"\n  export default c',
  '- import a from "b"\n> export default c',
  'import a from "b"\nexport default c',
  'import a from "b"\n\nexport default c',
  'a\n\nimport a from "b"\n\nb\n\nexport default c',
  'a\nimport a from "b"\n\nb\nexport default c',
  'import a',
  'import 1/1',
  'export {\n  a\n} from "b"\n\nc',
  'export {\n\n  a\n\n} from "b"\n\nc',
  'import a from "b"\n*md*?',
  'export var a = 1\n// b\n/* c */\n\nd',
  'export var a = 1\nvar b\n\nc',
  'import ("a")\n\nb',
  'import a from "b"\nexport {a}\n\nc',
  'import a from "b";\nexport {a};\n\nc',
  'import a from "b"\nexport {a as default}\n\nc',
  'export var a = () => <b />\n\nc',
  'export {a}\n',
  'export var a = () => {}\n\nb',
  'import a from "b"\n\nexport {a}\n\nc',
  'import a from "b"\n\nexport {a}\n\n# c',
  'import a from "b"',
  'import * as a from "b"',
  'import {a} from "b"',
  'import {a as b} from "c"',
  'import a, {b as c} from "d"',
  'import a, * as b from "c"',
  'import "a"',
  'export var a = ""',
  'export const a = ""',
  'export let a = ""',
  'export var a, b',
  'export var a = "a", b = "b"',
  'export function a() {}',
  'export class a {}',
  'export var {a} = {}',
  'export var {a: b} = {}',
  'export var [a] = []',
  'export default a = 1',
  'export default function a() {}',
  'export default class a {}',
  'export * from "a"',
  'export * as a from "b"',
  'export {a} from "b"',
  'export {a as b} from "c"',
  'export {default} from "b"',
  'export {default as a, b} from "c"',
  'a {<b />} c',
  'a {(() => {})()} c',
  'a {(function () {})()} c',
  'a {b} c',
  'a {} c',
  'a {/*b*/ // c\n} d',
  'a {b.c} d',
  'a {} b',
  'a { \t\r\n} b',
  'a {/**/} b',
  'a {  /*\n*/\t} b',
  'a {/*b*//*c*/} d',
  'a {b/*c*/} d',
  'a {/*b*/c} d',
  'a {//} b',
  'a { // b } c',
  'a {//\n} b',
  'a {// b\nc} d',
  'a {b// c\n} d',
  'a {1 + 1} b',
  'a {function () {}} b',
  'a {var b = "c"} d',
  '> a {\n> b} c',
  '> a {\n> b<} c',
  '> a {\n> b\n> c} d',
  'a {b c',
  'a {b { c } d',
  'a {\n} b',
  'a } b',
  '{ a } b',
  'a {??} b',
  'a { /* { */ } b',
  'a { /* } */ } b',
  '> alpha {`\n> bravo\n>  charlie\n>   delta\n>    echo\n> `} foxtrot.',
  '{a}',
  '{}',
  '    {}',
  '   {}',
  '{a',
  '{b { c }',
  '{\n}\na',
  '{ a } \t\nb',
  '  { a }\nb',
  'a\n\n* b',
  '> {a\nb}',
  '> a\n{b}',
  '> {a}\nb',
  '> {\n> a\nb}',
  '  {`\n    a\n  `}',
  'a{(b)}c',
  'a{/* b */ ( (c) /* d */ + (e) )}f',
  '>  aaa <b c={`\n>      d\n>  `} /> eee',
  '> {`\n> alpha\n>  bravo\n>   charlie\n>    delta\n> `}',
  '{`a\u0000b\rc\nd\r\ne`}',
  'a {...b} c',
  'a {...?} c',
  'a {b=c}={} d',
  'a {...b,c} d',
  'a {b=c} d',
  'a {/* b */} c',
  '{a=b}',
  'alp {...b}',
  'ab {`\n\t`}',
  'ab {`\nalpha\t`}',
  '> ab {`\n>\t`}',
];

// The expression tests' hidden `spread` and `allowEmpty` options are what
// attribute expressions use: the same code in `<x {…} />` and `<x y={…} />`.
const spreadCodes = ['...b', 'b', '...?', 'b=c}={', '...b,c', 'b=c', '', '/* b */', 'a=b'];

// Cases of our own, most of them found by the fuzzer.
const ownInputs: string[] = [
  '{"}"}',
  "{'}'}",
  '{`}`}',
  '{/}/}',
  '{/* } */}',
  '{a // }\n}',
  '{a}}',
  'a {b c} d',
  '> {a\n> b c}',
  '<a {...b, c} />',
  '<a {} />',
  '<a b={} />',
  '<a {b} />',
  '<a {...b} {...c}/>',
  '<a {...{a: "}"}} b={"}"} />',
  "<a{''\n\t}",
  '>- <a{""\n>   \t}',
  'a {`\n\tb\n  \t c`} d',
  '> a {`\n>\tb`}',
  // ESM.
  'import a from "b"\n',
  'export {\n\na}\n',
  'export {\n',
  'export {',
  'export {\n\n\n',
  'export {\n  \n',
  'export var a = {\n\n}',
  'import a from "b"\n\nimport a from "c"',
  'export const a = 1\nfoo()\n',
  '  :::x\n  export {\n  a}\n  :::',
  '--\nexport \n|-',
  'a\nimport |o\n-|-',
  'a\nexport {a} |\n-|-\n\nb',
  'a\nexport | a\n-|-',
  '> a\n> export |b\n> -|-',
  'a\n export |b\n-|-',
  ':::x\na\nexport |b\n-|-\n:::',
  'a\nexport |b\n-|-|-',
  // ESM in container directives: parsed after the flow outside them.
  ':::x\nimport a from "b"\n:::',
  ':::x\nexport {\n:::',
  ':::x\nexport {\n',
  ':::x\nexport {',
  ':::x\nimport a from "b"\n:::\n\nimport a from "c"',
  ':::x\nexport {a}\n:::\n\nimport a from "b"',
  ':::x\nexport {a}\n:::\n\nimport b from "c"',
  '::::x\n:::y\nimport a from "b"\n:::\n::::\n\n:::z\nimport a from "c"\n:::',
  '::::x\n:::y\nexport {a}\n:::\n::::\n\n:::z\nimport a from "c"\n:::',
  ':::x\nimport a from "b"\n:::\n\n:::y\nimport a from "c"\n:::',
  // ESM in the lines of a flow construct that failed later.
  '<a b="\n\nexport ">c',
  '<a b="\n\nexport {a} from \'b\' ">c',
  '<a b="\n\nexport const a = 1\n"/>c\nd',
  '<a b="\nx\n\nimport a from \'b\'\n"/>c\n\nd',
  '<a b="\n\nexport {}\n// "/>c',
  '<a b="\n\nexport {}\n\nc\n"/>x',
  '<a b="\n\nexport {\n\n}\n"/>x',
  '<a b="\n\nexport {}\n\n"/>x\ny\n\nz',
  '<a b="\n\nexport {\n\na}\n\n"/>x',
  // A re-read construct open past the failed lines: a container that
  // starts on the next line ends the content; a line no container takes is
  // lazy (also without acorn, see below).
  '><d\n>{...d}>x\n[^1]:',
  '><d\n>{...d}>x\n- a',
  '><d\n>{...d}>x\nb',
  '- <b b={""}\n  {...{a:""}}>`\rh',
  ':::x\n- {\n*\n<a\n{...{}}>x',
  // ESM after a container directive opener in failed lines is its content,
  // parsed later than the text of the line before.
  '{`\n:::x\n\nexport `}>',
  '{/*\n:::x\n\nexport */}>',
  '{a\n:::x\n\nexport a}>',
  '{`\n:::x\n:::\n\nexport `}>',
];

// Found with acorn, wrong in `mdx()` too on batch/v2: the same re-read paths.
const withoutAcorn: string[] = [
  '> <d b="\n> {a\n> "/>x\n- y',
  '> <d b="\n> {a\n> "/>x\ny',
  '> <d b="\n> {a\n> "/>x\n[^1]: y',
  '> <d b="\n> {a\n> "/>x\n- - -',
  '- <d b="\n  {a\n  "/>x\n- y',
  '- <d b="\n  {a\n  "/>x\ny',
  '- <d b="\n  {a\n  "/>x\n  y',
  '[^1]: <d b="\n    {a\n    "/>x\ny',
  '[^1]: <d b="\n    {a\n    "/>x\n    y',
  '::::x\n<a b="\n{a\n> "/>x\n::::\n\n',
  ':::x\n><a b="\n>{a">x\n:::',
  '1. <a b="\n   {a\n   \tb\n   "/>x\n\n>\tx',
  // A construct that fails in a table body: its lines are rows, which fail
  // as text after the first one (also on batch/v2).
  '|a|\n|-|\n<a\n>{b\n}>',
  "-|-\n-|-\n<a\n>{''\n}>",
  '> |a|\n> |-|\n> <a\n> >{b\n> }>',
  '|a|\n|-|\n<a\n>{b\n}>\n\n<3',
  '|a|\n|-|\n<a\n>{b\n}>\n<3',
  '|a|\n|-|\n{a\n>b}x',
  // A flow construct on such a row still starts and fails: only errors in
  // containers that the block parser opened there are dropped.
  // A construct of the re-read that runs past the failed lines (fixed by
  // fix-mdx-reread-container), in shapes only acorn makes.
  '<a b="\n{`">x\n{`}',
  '<a b="\n{/">/\n}\nimport ',
  '<a b="\n{/*">x\n*/}\nexport ',
  '<a b="\n{`">x\n>`}`',
  // ESM in lines read again: the block parser reads it, then the lines
  // after it are read again as flow.
  '<a b="\n{/*">x\n\nexport */}>',
  '{/*\n:::\n\nexport */}/',
  '{`\n\nexport var a=/**/1\n\nexport `}>',
  '{`\n\nexport var a=/**/1\n\nb `}>',
  '{`\n:::x\n:::\nexport `}r',
  // ESM right after a leaf block in lines read again.
  '<a b="\n# h\nexport {}\n"/>x',
  '{`\n# h\nimport a from "b"\n`}x',
  '{`\n***\nexport {}\n// `}x',
  '<a b="\n```\nc\n```\nexport {}\n"/>x',
  '{`\np\n===\nexport {}\n`}x',
  '{`\n::x\nexport const a = 1\n// c\n`}x',
  '{`\n$$\nm\n$$\nexport {}\n`}x',
  '{`\n<b/>\nexport {}\n// `}x',
  '{`\n[a]: b\nexport {}\n// `}x',
  '> <a b="\n> # h\n> export {}\n> "/>x',
  '- {`\n  ***\n  export {}\n  // `}x',
  // A construct in ESM data that would throw as flow is never probed.
  '{/*\n\nexport \n<*/}/',
  '{/*\n# h\nexport \n<*/}/',
  '<a b="\n{/*">x\n\nexport \n<*/}>',
  // A construct read again, open at the end of a directive's content in a
  // quote: the content ends on its last line (also without acorn).
  '>:::b[]\n><$\n>{...d}f="">[\n',
  '>:::a\r><_\r>{...d}>)\r',
  '>:::a\n><_ b="\n>{c">)\n',
  '>:::a\n><_ b="\n>{c">)\n\n',
  // ESM on a table row in lines read again: on the header row once the
  // table check passed, and on a body row, where it ends the table.
  '{/*\nexport |b\n-|-\n<*/}y',
  '{`\n-|\nexport `}`',
  '{`\n-|\nexport `}x',
  '{`\n-|\nc\nexport `}x',
  '<a b="\n-|\nexport "/>x',
  'p\n<a b="\na|b\n-|-\nexport |c\n"/>x',
  '> {`\n> export |b\n> -|-\n> `}x',
  // The table body takes the lines after the construct; ESM starts on a row.
  '{`\n-|\n`}x\na\nimport ',
  '<a b="\n-|\n">x\ne\nexport ',
  '{`\n-|\n`}x\n}\nexport ',
  '> {`\n> -|\n> `}x\n> a\n> import ',
  // A lazy line after a quote inside a directive: lazy after the quote
  // prefixes the line has, unless it ends the text.
  ':::a\n>>{\n> \n',
  ':::a\n>>{\n> \nb',
  ':::a\n>><o\n> \n',
  ':::a\n> > {\n> \n',
  ':::a\n>>{\n> ',
  '>:::z\n>>{\n> \n',
  '\t|a|\n  a}\n    :::a\n> > - {\n  > \n',
  // A tab that a directive's indent splits on the last line leaves its
  // columns: the lazy line starts after it.
  ' :::9[]\r>=\n{\r\t',
  ' :::a\n>=\n{\n\t',
  '  :::a\n>=\n{\n\t',
  ' :::a\n>=\n{\n ',
  // Expressions read again keep the whitespace after a line ending.
  '><a b="\n>{`"/>x\n><a b={\n>\t\t`}`}/>',
  '`\n{`\n<a b={//\n\t`}`}/>',
  // A re-read paragraph in an indented directive (wrong on batch/v2 before
  // fix-mdx-reread-container).
  " :::a\r`\r <a b=''\nb={{}}b={{}}/>$\r=",
  'b\n-|\n<$\n{...d}>b',
  '$\n|-\n<_\r{...d}>@',
  ';||~\n-|-|-\n<d\n{...d}>^',
];

function inputsWithSpreads(): string[] {
  const result = [...referenceInputs, ...ownInputs];
  for (const code of spreadCodes) {
    result.push('<x {' + code + '} />', 'a <x y={' + code + '} /> b');
  }
  return result;
}

describe('mdx with acorn', () => {
  for (const gfm of [false, true]) {
    test(`reference test inputs and own cases, gfm ${gfm}`, () => {
      for (const input of inputsWithSpreads()) {
        expect(parseTalata(input, gfm, ['mdx'], options), JSON.stringify(input)).toEqual(
          parseReference(input, gfm, ['mdx'], options),
        );
        expect(parseTalata(input, gfm, all, options), JSON.stringify(input)).toEqual(
          parseReference(input, gfm, all, options),
        );
      }
    });
  }

  test('re-read constructs without acorn', () => {
    for (const input of [...withoutAcorn, ...ownInputs]) {
      for (const gfm of [false, true]) {
        expect(parseTalata(input, gfm, all), JSON.stringify(input)).toEqual(
          parseReference(input, gfm, all),
        );
      }
    }
  });

  test('a parse again for ESM in directives, with mdx before directive', () => {
    // The transforms after mdx run once more on the new tree.
    for (const input of [
      ':::x\nexport {a}\n:::\n\nimport a from "b"\n\n- a\n\n- b',
      '- a\n\n- b\n\n:::x\n- c\n\n- d\n\nexport {a}\n:::\n\nimport a from "b"',
    ]) {
      expect(parseTalata(input, true, ['mdx', 'directive'], options), input).toEqual(
        parseReference(input, true, ['mdx', 'directive'], options),
      );
    }
  });

  test('acorn options', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['a {(() => {})()} c', { ecmaVersion: 5 }],
      ['a {(function () {})()} c', { ecmaVersion: 6 }],
      ['export var a = () => {}\n\nb', { ecmaVersion: 5 }],
      ['export var a = () => {}\n\nb', { ecmaVersion: 6 }],
      ['import a from "b"', { sourceType: 'script' }],
    ];
    for (const [input, acornOptions] of cases) {
      const settings = { mdx: { acorn, acornOptions } };
      expect(parseTalata(input, false, ['mdx'], settings), input).toEqual(
        parseReference(input, false, ['mdx'], settings),
      );
    }
  });

  test('acorn without JSX', () => {
    const settings = { mdx: { acorn: Parser } };
    for (const input of ['a {<b />} c', 'a {b} c', '<x y={<z />} />']) {
      expect(parseTalata(input, false, ['mdx'], settings), input).toEqual(
        parseReference(input, false, ['mdx'], settings),
      );
    }
  });

  test('throws an MdxError with the reason and place', () => {
    let error: unknown;
    try {
      fromMarkdown('a {b c} d', { extensions: [mdx({ acorn })] });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MdxError);
    expect(error).toMatchObject({
      reason: 'Could not parse expression with acorn',
      message: 'Could not parse expression with acorn at 1:5',
    });
    expect(() =>
      fromMarkdown('export const a = 1\nfoo()\n', { extensions: [mdx({ acorn })] }),
    ).toThrow(
      'Unexpected `ExpressionStatement` in code: only import/exports are supported at 2:1-2:6',
    );
  });

  test('checks its options as the reference', () => {
    expect(() => mdx({ acornOptions: {} })).toThrow(
      'Expected an `acorn` instance passed in as `options.acorn`',
    );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a broken acorn on purpose
    expect(() => mdx({ acorn: {} as typeof acorn })).toThrow(
      'Expected a proper `acorn` instance passed in as `options.acorn`',
    );
  });

  test('the extension is the same object for equal options', () => {
    expect(mdx({ acorn })).toBe(mdx({ acorn }));
    expect(mdx({ acorn, acornOptions: { ecmaVersion: 6 } })).toBe(
      mdx({ acorn, acornOptions: { ecmaVersion: 6 } }),
    );
    expect(mdx({ acorn })).not.toBe(mdx());
    expect(mdx({ acorn })).not.toBe(mdx({ acorn: Parser }));
    expect(mdx({ acorn }).name).toBe('talata:mdx');
    expect(mdx({ acorn: null })).toBe(mdx());
    // `undefined` is an option value of its own.
    expect(mdx({ acorn, acornOptions: {} })).not.toBe(
      mdx({ acorn, acornOptions: { ecmaVersion: undefined } }),
    );
    const input = 'a {b ||= c} d';
    for (const acornOptions of [{}, { ecmaVersion: undefined }]) {
      const settings = { mdx: { acorn, acornOptions } };
      expect(parseTalata(input, false, ['mdx'], settings)).toEqual(
        parseReference(input, false, ['mdx'], settings),
      );
    }
  });

  test('mdx() without acorn keeps counting braces and reads no ESM', () => {
    const tree = fromMarkdown('import a from "b"\n\n{"}"}', { extensions: [mdx()] });
    expect(tree.children.map((node) => node.type)).toEqual(['paragraph', 'paragraph']);
  });

  test('talata has no runtime dependency but @types/mdast', () => {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    expect(manifest).toHaveProperty('dependencies', { '@types/mdast': '^4.0.4' });
  });

  test('the corpus with acorn', () => {
    for (const file of corpusFiles()) {
      const value = readFileSync(file.path, 'utf8');
      for (const gfm of [false, true]) {
        expect(parseTalata(value, gfm, ['mdx'], options), file.name).toEqual(
          parseReference(value, gfm, ['mdx'], options),
        );
        expect(parseTalata(value, gfm, all, options), file.name).toEqual(
          parseReference(value, gfm, all, options),
        );
      }
    }
  });

  test('stays linear', () => {
    // Shapes where talata, not acorn, could add work: acorn is called at the
    // same places as in the reference, so a shape that is quadratic there
    // (many `}` after an open string, many blank lines in failing ESM, many
    // imported names) is quadratic here too.
    const units = [
      '{a}\n\n',
      'a {b} <c d={e} {...f}>g</c>\n',
      '{\na\n}x\n',
      '> {\n> }x\n',
      '<a\n/>x\n',
      'export const a = 1\n',
      '{"}"} {`}`}\n\n',
    ];
    for (const unit of units) {
      const best = (count: number): number => {
        const text = unit.repeat(count);
        let fastest = Infinity;
        for (let run = 0; run < 3; run++) {
          const start = performance.now();
          try {
            fromMarkdown(text, { extensions: [mdx({ acorn })] });
          } catch {
            // Errors are fine here; the time is what counts.
          }
          fastest = Math.min(fastest, performance.now() - start);
        }
        return fastest;
      };
      best(500);
      expect(best(8000) / best(2000), JSON.stringify(unit)).toBeLessThan(10);
    }
  });
});
