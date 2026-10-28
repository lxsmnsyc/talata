import { afterAll, describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';
import { strikethroughPaths } from '../src/gfm/strikethrough';
import { workSteps } from '../src/inline/lines';
import { allFeatures } from './fuzz/features';
import { createTimedCheck } from './fuzz/timed-check';
import { parseReference, parseTalata } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// Interactions between GFM rules and with CommonMark rules, compared to the
// reference with positions, with and without GFM. Most cases came from
// fuzzing.

function check(markdown: string): void {
  for (const gfm of [false, true]) {
    const found = firstDiff(parseReference(markdown, gfm), parseTalata(markdown, gfm));
    expect(describeDiff(found), gfm ? 'with gfm' : 'without gfm').toBeUndefined();
  }
}

// Vitest loads the reference's development build, whose assertions throw on
// a task check outside a list item. The published build sets `checked` on the
// paragraph's parent. These cases compare in a worker thread, which loads
// packages the way plain Node does, as the fuzzer runs them.
const worker = createTimedCheck(60_000);
afterAll(() => {
  worker.close();
});

function checkPublished(markdown: string): void {
  for (const gfm of [false, true]) {
    expect(worker.check(markdown, gfm, allFeatures()), gfm ? 'with gfm' : 'without gfm').toEqual({
      kind: 'equal',
    });
  }
}

const published: [string, string[]][] = [
  [
    // The check runs on the first content after an empty marker line even
    // when that content is a lazy paragraph outside the item. `checked` then
    // goes on the paragraph's parent, and nothing is sliced.
    'task check outside list items',
    [
      '-\n[ ] a',
      '-\n[x] a',
      '> -\n> [ ] a',
      '> -\n[ ] a',
      '> -\n[ ] a\n> [x] b',
      '-\n[x]\n-|-',
      '9.\r[ ] #',
      '-\n[ ]',
      '-\n[ ] ',
      '-\n[ ]\nb',
      '-\n[ ]  \nb',
      '-\n[ ] a\n===',
      '-\n[ ] a|b\n-|-',
      '-\n[a]: b\n[ ] c',
      '-\n[a]: b\n\n[ ] c',
      '-\n[a]: b\n[x] c\n===',
      '[^1]:\n    -\n    [ ] a',
      '[^1]: x\n\n    -\n    [x] a\n\n[^1]',
      '- a\n\n  -\n  [ ] b',
      '-\n> [ ] a',
      '-\n\n[ ] a',
      '-\n [ ] a',
      '1.\n[x] a\n2.\n[ ] b',
    ],
  ],
];

const groups: [string, string[]][] = [
  [
    // A `*` or `_` run before the first `~`: attention resolves first over
    // the leaf, strikethrough first inside each emphasis pair.
    'emphasis before strikethrough',
    [
      '*x* ~a~ a* ~b~ b*',
      '*a ~b *c~ d*',
      '*x* ~~a *b~~ c* d~~',
      '*a ~b~ c* ~d~',
      '**a ~*b*~ c**',
      '*x* ~a **b ~c~ d** e~',
      '_x_ ~a _b ~~c~~ d_ ~e~ f~',
      '***a ~b~ c* d ~e~**',
      '*a ~b ~~c~~ d~ e*',
      '*a [~b~](u) c*',
      '*a ~b [c~](u) d*',
      '*x* ~a\n~ b*',
      '*a ~b *c* d~ e*',
      '_a ~*b_ c*~',
    ],
  ],
];

for (const [name, inputs] of groups) {
  describe(name, () => {
    for (const input of inputs) {
      it(JSON.stringify(input), () => {
        check(input);
      });
    }
  });
}

for (const [name, inputs] of published) {
  describe(name, () => {
    for (const input of inputs) {
      it(JSON.stringify(input), () => {
        checkPublished(input);
      });
    }
  });
}

// Leaves where emphasis comes first used a general path that paired one pair
// at a time, quadratic on long leaves. `strikethroughPaths.mixed` brings it
// back to compare both paths.
describe('emphasis-first paths agree', () => {
  it('gives the same tree as the general path', () => {
    const atoms = [
      '*',
      '**',
      '***',
      '_',
      '__',
      '~',
      '~~',
      '~~~',
      'a',
      ' ',
      ' ',
      '[',
      '](u)',
      'x*',
      '*x',
      '~x',
      'x~',
    ];
    let seed = 5;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    let compared = 0;
    for (let i = 0; i < 3000; i++) {
      let markdown = next() % 2 === 0 ? '*' : '_';
      const length = 3 + (next() % 12);
      for (let j = 0; j < length; j++) {
        markdown += atoms[next() % atoms.length];
      }
      const linear = fromMarkdown(markdown, { gfm: true });
      strikethroughPaths.mixed = true;
      let general;
      try {
        general = fromMarkdown(markdown, { gfm: true });
      } finally {
        strikethroughPaths.mixed = false;
      }
      expect(describeDiff(firstDiff(general, linear)), JSON.stringify(markdown)).toBeUndefined();
      compared++;
    }
    expect(compared).toBe(3000);
  });
});

// Work must grow about linearly, as in gfm-inline.test.ts: 8 times the input
// may not take more than 12 times the steps.
function steps(markdown: string): number {
  workSteps.count = 0;
  fromMarkdown(markdown, { gfm: true });
  return workSteps.count;
}

const growthCases: [string, (size: number) => string][] = [
  ['`~a~ a* ` after `*x* `', (size) => '*x* ' + '~a~ a* '.repeat(size / 7)],
  ['`*b* ` after `*x* ~a~ `', (size) => '*x* ~a~ ' + '*b* '.repeat(size / 4)],
  ['`*b ~c~ d* ` after `*x* ~a~ `', (size) => '*x* ~a~ ' + '*b ~c~ d* '.repeat(size / 10)],
];

describe('work growth with emphasis first', () => {
  for (const [name, build] of growthCases) {
    it(name, () => {
      const small = steps(build(4800));
      const large = steps(build(38_400));
      expect(large).toBeLessThan(12 * Math.max(small, 100));
    });
    it(`${name} matches the reference`, () => {
      check(build(480));
    });
  }
});
