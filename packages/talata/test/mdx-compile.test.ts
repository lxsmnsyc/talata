import { compileSync } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import { describe, expect, test } from 'vitest';
import { MdxError, mdx } from '../src/mdx';
import { talata } from '../src/unified';
import { allFeatures } from './fuzz/features';
import { documentAt, loadSeeds } from './fuzz/run';
import { acorn, corpusFiles } from './parsers';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// `@mdx-js/mdx` 3.1.1 with talata as its parser: `talata/unified` in
// `remarkPlugins` replaces the parser of `remark-parse` (a plugin's parser
// set later wins), and `remark-mdx` then only adds micromark extensions,
// which talata does not read. Every document compiles to the same JS as
// with the default parser, or fails with the same reason and place.

// `@types/mdx`, a type dependency of `@mdx-js/mdx`, names the global JSX
// namespace of a JSX runtime; this project has none.
declare global {
  // oxlint-disable-next-line typescript/no-namespace
  namespace JSX {
    type Element = unknown;
    type ElementClass = unknown;
    type IntrinsicElements = Record<string, unknown>;
  }
}

const extensions = [mdx({ acorn })];

/** The place of a `VFileMessage` as `1:2` or `1:2-3:4`, or '' when it has none. */
function stringifyPlace(place: unknown): string {
  if (typeof place !== 'object' || place === null) {
    return '';
  }
  if ('start' in place && 'end' in place) {
    return stringifyPlace(place.start) + '-' + stringifyPlace(place.end);
  }
  if ('line' in place && 'column' in place) {
    return `${String(place.line)}:${String(place.column)}`;
  }
  return '';
}

function pluginsOf(gfm: boolean, withTalata: boolean): unknown[] {
  if (withTalata) {
    return [[talata, { gfm, extensions }]];
  }
  return gfm ? [remarkGfm] : [];
}

/** The JS, or the error as talata's `MdxError` words it. */
function compileWith(value: string, gfm: boolean, withTalata: boolean): string {
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- unified's plugin tuples
    const remarkPlugins = pluginsOf(gfm, withTalata) as never;
    return String(compileSync(value, { remarkPlugins }));
  } catch (error) {
    if (error instanceof MdxError) {
      return 'error: ' + error.message;
    }
    if (error instanceof Error && 'reason' in error && typeof error.reason === 'string') {
      const place = stringifyPlace('place' in error ? error.place : undefined);
      return 'error: ' + error.reason + (place === '' ? '' : ' at ' + place);
    }
    // `@mdx-js/mdx` itself can fail on a tree from either parser: a
    // `ParenthesizedExpression` that `eventsToAcorn` leaves in `{((a))}`.
    return 'throw: ' + String(error);
  }
}

/** The string array `name` in the test file `file`, so the input lists stay in one place. */
function inputsOf(file: string, name: string): string[] {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8');
  const head = `const ${name}: string[] = [`;
  const start = text.indexOf(head);
  const end = text.indexOf('\n];\n', start);
  if (start === -1 || end === -1) {
    throw new Error(`no ${name} in ${file}`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an array of string literals
  return runInNewContext(text.slice(start + head.length - 1, end + 2)) as string[];
}

function expectSame(value: string, label: string): void {
  for (const gfm of [false, true]) {
    expect(compileWith(value, gfm, true), `${label}, gfm ${gfm}`).toBe(
      compileWith(value, gfm, false),
    );
  }
}

const count = Number(process.env.MDX_COMPILE_COUNT ?? '300');
const seed = Number(process.env.MDX_COMPILE_SEED ?? '20261123');

describe('compile with @mdx-js/mdx', () => {
  test('the reference test inputs and the estree inputs', () => {
    const lists = [
      inputsOf('./mdx-acorn.test.ts', 'referenceInputs'),
      inputsOf('./mdx-acorn.test.ts', 'ownInputs'),
      inputsOf('./mdx-reference.test.ts', 'referenceInputs'),
      inputsOf('./mdx-estree.test.ts', 'inputs'),
    ];
    let compiled = 0;
    for (const list of lists) {
      expect(list.length).toBeGreaterThan(10);
      for (const input of list) {
        expectSame(input, JSON.stringify(input));
        if (!compileWith(input, false, false).startsWith('error: ')) {
          compiled++;
        }
      }
    }
    expect(compiled).toBeGreaterThan(200);
  });

  test('the corpus', () => {
    for (const file of corpusFiles()) {
      expectSame(readFileSync(file.path, 'utf8'), file.name);
    }
  });

  test(
    `${count} fuzz documents`,
    () => {
      const features = { ...allFeatures(), extensions: ['mdx' as const] };
      const seeds = loadSeeds(false);
      for (let index = 0; index < count; index++) {
        const value = documentAt(seed, index, features, seeds, false);
        expectSame(value, `document ${index} of seed ${seed}: ${JSON.stringify(value)}`);
      }
    },
    Math.max(30_000, count * 20),
  );
});
