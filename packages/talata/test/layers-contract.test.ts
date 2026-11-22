import type { PhrasingContent, Root } from 'mdast';
import { describe, expect, test } from 'vitest';
import { blockRules, paragraphPrefixRules } from '../src/blocks';
import { createChunkQueue } from '../src/core/chunks';
import { createRegistry } from '../src/core/registry';
import { createSource } from '../src/core/source';
import { createDocumentState } from '../src/core/state';
import { transforms } from '../src/core/transform';
import { inlineRules } from '../src/inline';
import { acorn, parseReference, parseTalata } from './parsers';
import type { ExtensionName, ExtensionOptions } from './parsers';

// Contract tests for `roadmaps/v2/contracts/block-layers.md` (design D).
//
// - The chunk queue suite `describeQueue` runs on a stub written from the
//   contract and on the real `createChunkQueue` of `src/core/chunks.ts`.
// - The order-rule examples check the rule against the reference, then
//   talata against the reference. Inputs that main gets wrong are skipped
//   with the node that fixes them; that node turns them on.

// The interface of `core/chunks.ts`, as the contract writes it.
interface ChunkQueue {
  readonly pass: number;
  text(
    pass: number,
    node: { children: PhrasingContent[] },
    ranges: number[],
    indents?: number[],
  ): void;
  add(pass: number, start: number, run: () => void): void;
  run(): void;
}

function documentPass(depth: number): number {
  return 2 * depth - 1;
}

function textPass(depth: number, labels: number): number {
  return 2 * depth + 1 + labels;
}

interface Entry {
  start: number;
  order: number;
  run: () => void;
}

/** A queue written from the contract only. `parse` stands in for `parseInline`. */
function createStubQueue(
  parse: (ranges: number[], indents?: number[]) => PhrasingContent[],
): ChunkQueue {
  const passes = new Map<number, Entry[]>();
  let current = -1;
  let added = 0;

  function push(pass: number, start: number, run: () => void): void {
    if (pass <= current) {
      throw new Error(`chunk pass ${pass} is not after the running pass ${current}`);
    }
    let list = passes.get(pass);
    if (list === undefined) {
      list = [];
      passes.set(pass, list);
    }
    list.push({ start, order: added++, run });
  }

  return {
    get pass(): number {
      return current;
    },
    text(pass, node, ranges, indents): void {
      // Empty ranges (v5 scope hooks) keep their place after the chunk before them.
      const list = passes.get(pass);
      let start = -1;
      if (ranges.length > 0) {
        start = ranges[0];
      } else if (list !== undefined && list.length > 0) {
        start = list[list.length - 1].start;
      }
      push(pass, start, () => {
        node.children = parse(ranges, indents);
      });
    },
    add(pass, start, run): void {
      push(pass, start, run);
    },
    run(): void {
      for (;;) {
        // The lowest pass left runs next; chunks it adds go to later passes.
        let next = Infinity;
        for (const pass of passes.keys()) {
          if (pass < next) {
            next = pass;
          }
        }
        if (next === Infinity) {
          return;
        }
        const list = passes.get(next)!;
        passes.delete(next);
        current = next;
        list.sort((a, b) => a.start - b.start || a.order - b.order);
        for (const entry of list) {
          entry.run();
        }
      }
    },
  };
}

/** A chunk that adds `value` to `log`. */
function note(log: string[], value: string): () => void {
  return () => {
    log.push(value);
  };
}

function describeQueue(name: string, create: () => ChunkQueue): void {
  describe(`chunk queue: ${name}`, () => {
    test('runs passes in increasing order, by start in a pass, ties in add order', () => {
      const queue = create();
      const log: string[] = [];
      queue.add(3, 0, note(log, '3@0'));
      queue.add(1, 20, note(log, '1@20'));
      queue.add(1, 5, note(log, '1@5'));
      queue.add(2, 1, note(log, '2@1'));
      queue.add(1, 5, note(log, '1@5 second'));
      queue.run();
      expect(log).toEqual(['1@5', '1@5 second', '1@20', '2@1', '3@0']);
    });

    test('pass is -1 before the run and the running pass inside a chunk', () => {
      const queue = create();
      const seen: number[] = [queue.pass];
      queue.add(1, 0, () => {
        seen.push(queue.pass);
      });
      queue.add(4, 0, () => {
        seen.push(queue.pass);
      });
      queue.run();
      expect(seen).toEqual([-1, 1, 4]);
    });

    test('a chunk adds to later passes, which run after the current one', () => {
      const queue = create();
      const log: string[] = [];
      queue.add(1, 10, () => {
        log.push('text');
        // A text directive label: one pass later.
        queue.add(queue.pass + 1, 12, note(log, 'label'));
      });
      queue.add(1, 30, note(log, 'later text'));
      queue.add(2, 40, note(log, 'other label'));
      queue.run();
      expect(log).toEqual(['text', 'later text', 'label', 'other label']);
    });

    test('a chunk cannot add to its own pass or an earlier one', () => {
      const queue = create();
      queue.add(1, 0, () => {
        queue.add(1, 5, () => {});
      });
      expect(() => {
        queue.run();
      }).toThrow();
    });

    test('the first error thrown ends the run', () => {
      const queue = create();
      const log: string[] = [];
      queue.add(1, 0, note(log, 'a'));
      queue.add(1, 4, () => {
        throw new Error('first');
      });
      queue.add(1, 9, () => {
        throw new Error('second');
      });
      queue.add(2, 0, note(log, 'never'));
      expect(() => {
        queue.run();
      }).toThrow('first');
      expect(log).toEqual(['a']);
    });

    test('text chunks fill node.children; empty ranges keep their place', () => {
      const queue = create();
      const log: string[] = [];
      const a = { children: [] as PhrasingContent[] };
      const b = { children: [] as PhrasingContent[] };
      queue.text(1, a, [0, 3]);
      queue.text(1, { children: [] }, []);
      queue.text(1, b, [5, 8]);
      queue.add(1, 4, () => {
        log.push(`a has ${a.children.length}, b has ${b.children.length}`);
      });
      queue.run();
      expect(log).toEqual(['a has 1, b has 0']);
      expect(b.children).toHaveLength(1);
    });
  });
}

describeQueue('stub', () =>
  createStubQueue((ranges) => [
    { type: 'text', value: `${ranges[0]}-${ranges[ranges.length - 1]}` },
  ]),
);

describeQueue('core', () => {
  const options = { gfm: false };
  const rules = createRegistry(
    { blockRules, paragraphPrefixRules, inlineRules, transforms },
    options,
  );
  // Text chunks run `parseInline` on this source.
  return createChunkQueue(createDocumentState(createSource('abc def ghi'), options, rules));
});

describe('passes', () => {
  test('as order.ts numbers them', () => {
    // Text of the source and content of a depth-1 directive share pass 1.
    expect(textPass(0, 0)).toBe(1);
    expect(documentPass(1)).toBe(1);
    // A text directive label adds one pass per label around.
    expect(textPass(0, 1)).toBe(2);
    expect(textPass(0, 2)).toBe(3);
    // Text inside one directive, and the content of a directive inside it.
    expect(textPass(1, 0)).toBe(3);
    expect(documentPass(2)).toBe(3);
  });
});

// Order-rule examples. Each candidate is a chunk that holds an error:
// its pass, its start (line and column of the chunk start) and the place of
// its error. The rule picks the lowest (pass, start); the reference must
// throw at that candidate's place. Only that place is checked; the other
// candidates document which chunks hold errors.

interface Candidate {
  pass: number;
  start: [line: number, column: number];
  place: string;
}

interface Example {
  input: string;
  candidates: Candidate[];
  /** Why talata cannot pass yet, and the node that fixes it. */
  pending?: string;
  options?: ExtensionOptions;
}

const names: ExtensionName[] = ['directive', 'mdx'];

const examples: Example[] = [
  {
    input: ':::a\n<1\n:::\n<2',
    candidates: [
      { pass: documentPass(1), start: [2, 1], place: '2:2' },
      { pass: -1, start: [4, 1], place: '4:2' },
    ],
  },
  {
    input: 'a :b[<1] <2',
    candidates: [
      { pass: textPass(0, 0), start: [1, 1], place: '1:11' },
      { pass: textPass(0, 1), start: [1, 6], place: '1:7' },
    ],
  },
  {
    input: ':::x\nb <1\n:::\n:a[<2]',
    candidates: [
      { pass: textPass(1, 0), start: [2, 1], place: '2:4' },
      { pass: textPass(0, 1), start: [4, 4], place: '4:5' },
    ],
  },
  {
    input: ':::x\nb {\n:::\n:a[{]',
    candidates: [
      { pass: textPass(1, 0), start: [2, 1], place: '2:4' },
      { pass: textPass(0, 1), start: [4, 4], place: '4:5' },
    ],
  },
  {
    input: 'a <1\n:::x\n<2\n:::',
    candidates: [
      { pass: textPass(0, 0), start: [1, 1], place: '1:4' },
      { pass: documentPass(1), start: [3, 1], place: '3:2' },
    ],
  },
  {
    input: ':::x\n<2\n:::\na <1',
    candidates: [
      { pass: documentPass(1), start: [2, 1], place: '2:2' },
      { pass: textPass(0, 0), start: [4, 1], place: '4:4' },
    ],
  },
  {
    input: ':::x[<1]\n<2\n:::',
    candidates: [
      { pass: textPass(0, 0), start: [1, 6], place: '1:7' },
      { pass: documentPass(1), start: [2, 1], place: '2:2' },
    ],
  },
  {
    // The collector of x closes at the first `:::`, so `<2` is source flow.
    input: ':::x\n:::y[<1]\n:::\n<2\n:::',
    candidates: [
      { pass: textPass(1, 0), start: [2, 6], place: '2:7' },
      { pass: -1, start: [4, 1], place: '4:2' },
    ],
  },
  {
    input: '::::x\n:::y\n<3\n:::\nb <2\n::::\n:a[:b[<1]]',
    candidates: [
      { pass: documentPass(2), start: [3, 1], place: '3:2' },
      { pass: textPass(1, 0), start: [5, 1], place: '5:4' },
      { pass: textPass(0, 2), start: [7, 7], place: '7:8' },
    ],
  },
  {
    input: '::::x\n:::y\nc <3\n:::\nb <2\n::::\n:a[:b[<1]]',
    candidates: [
      { pass: textPass(2, 0), start: [3, 1], place: '3:4' },
      { pass: textPass(1, 0), start: [5, 1], place: '5:4' },
      { pass: textPass(0, 2), start: [7, 7], place: '7:8' },
    ],
  },
  {
    // Only the first text chunk runs: the DoS shape of the spike.
    input: '{a\n:::x\n}x\n'.repeat(3),
    candidates: [
      { pass: textPass(0, 0), start: [1, 1], place: '1:3' },
      { pass: documentPass(1), start: [3, 1], place: '4:2' },
    ],
  },
  {
    input: ':{\n>:::x\n>{\n><}x\n:',
    candidates: [
      { pass: textPass(0, 0), start: [1, 1], place: '1:3' },
      { pass: documentPass(1), start: [3, 2], place: '4:3' },
    ],
  },
  {
    // `--all --acorn` fuzz, seed 20261503, doc 344943.
    input: '<\n>:::a\n><t\n>{...d}>]\n"',
    options: { mdx: { acorn } },
    candidates: [
      { pass: textPass(0, 0), start: [1, 1], place: '1:2' },
      { pass: documentPass(1), start: [3, 2], place: '4:3' },
    ],
  },
];

function getError(tree: Root): string | undefined {
  const data: unknown = tree.data;
  if (typeof data === 'object' && data !== null && 'mdxError' in data) {
    const message = data.mdxError;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

function pickFirst(candidates: Candidate[]): Candidate {
  let best = candidates[0];
  for (const candidate of candidates) {
    const [line, column] = candidate.start;
    const [bestLine, bestColumn] = best.start;
    if (
      candidate.pass < best.pass ||
      (candidate.pass === best.pass &&
        (line < bestLine || (line === bestLine && column < bestColumn)))
    ) {
      best = candidate;
    }
  }
  return best;
}

describe('order rule against the reference', () => {
  for (const example of examples) {
    const options = example.options ?? {};
    test(`rule: ${JSON.stringify(example.input)}`, () => {
      const error = getError(parseReference(example.input, false, names, options));
      expect(error).toMatch(new RegExp(` at ${pickFirst(example.candidates).place}$`));
    });
    for (const gfm of [false, true]) {
      const title = `talata, gfm ${gfm}: ${JSON.stringify(example.input)}`;
      const run = (): void => {
        expect(parseTalata(example.input, gfm, names, options)).toEqual(
          parseReference(example.input, gfm, names, options),
        );
      };
      if (example.pending === undefined) {
        test(title, run);
      } else {
        test.skip(`${title} (${example.pending})`, run);
      }
    }
  }
});

// The collector's node end comes from its raw lines (contract: Container
// directive collector). These already match on main and must keep matching.
const collectorEnds = [
  ':::x\n',
  ':::x',
  ':::x\n\n',
  ':::x\n:::',
  ':::x\na\n',
  ':::x\na\n\n\n',
  ':::x\na\n\n:::',
  '> :::x\n>',
  '> :::x\n> a\n',
  '> :::x\n> a\nb',
  '> :::x\n> > a\n> b\nc',
  '- :::x\n  a\n- b',
  '- :::x\n  a\n\n- b',
  '- :::x\n  a\n\n  b\n- c',
  '  :::x\n   a\n  :::',
  ':::x\n:::y\nb\n:::\nc\n:::',
  '::::x\n:::y\n::::',
];

// Definitions are known to text in queue order (contract: Chunk queue).
const definitionOrder = [
  ':::x\n[a]: b\n:::\n[a]',
  '[a]\n:::x\n[a]: b\n:::',
  ':::x\n:::y\n[a]: b\n:::\n:::\n[a]',
  '::::x\n:::y\n[a]: b\n:::\n::::\n[a]',
  '::::x\n:::y\n[a]: b\n:::\n::::\n:z[[a]]',
  '::::x\n:::y\n[a]: b\n:::\n::::\n:z[:w[[a]]]',
  ':::x\n[^a]: b\n:::\n[^a]',
];

describe('directive collector and definitions', () => {
  for (const input of [...collectorEnds, ...definitionOrder]) {
    for (const gfm of [false, true]) {
      test(`gfm ${gfm}: ${JSON.stringify(input)}`, () => {
        expect(parseTalata(input, gfm, ['directive'])).toEqual(
          parseReference(input, gfm, ['directive']),
        );
      });
    }
  }
});

type Case = [
  input: string,
  names: ExtensionName[],
  gfm: boolean,
  options: ExtensionOptions,
  reason: string,
];

// Cases the nested documents of mdx-layers-directive fixed.
const fixed: Case[] = [
  [
    ':::x\n---\na: b\n---\n:::',
    ['frontmatter', 'directive'],
    false,
    { frontmatter: [{ type: 'yaml', marker: '-', anywhere: true }] },
    'frontmatter anywhere in a nested document root',
  ],
  [
    '- 1. :::b[x]\n      >{\n    >\n',
    names,
    false,
    {},
    'lazy line at the end of directive content is placed at the line start',
  ],
  [
    '>1. :::b\n>    >>\t<a b="\n>    >>\tb="\n>   > \n',
    names,
    false,
    {},
    'lazy line at the end of directive content is placed at the line start',
  ],
];

describe('fixed cases', () => {
  for (const [input, list, gfm, options, reason] of fixed) {
    test(`${JSON.stringify(input)} (${reason})`, () => {
      expect(parseTalata(input, gfm, list, options)).toEqual(
        parseReference(input, gfm, list, options),
      );
    });
  }
});

// Errors throw where met, except in the tree build of talata/mdx, which
// parses image labels again without the `!`: what it meets there is not an
// error of the reference.
const buildRereads: [input: string, options: ExtensionOptions][] = [
  ['![[]()<b></b>](i<)', {}],
  ['![[]()<>](i<)', {}],
  ['![[<>]()]([<)', {}],
  ['![[<>]()]([<)', { mdx: { acorn } }],
];

describe('image labels read again in the tree build', () => {
  for (const [input, options] of buildRereads) {
    for (const list of [
      ['mdx'],
      ['frontmatter', 'math', 'directive', 'mdx'],
    ] as ExtensionName[][]) {
      for (const gfm of [false, true]) {
        const title = `${list.join(',')}, gfm ${gfm}, acorn ${options.mdx !== undefined}`;
        test(`${title}: ${JSON.stringify(input)}`, () => {
          expect(parseTalata(input, gfm, list, options)).toEqual(
            parseReference(input, gfm, list, options),
          );
        });
      }
    }
  }
});

// Cases mdx-layers-flow fixed.
const flowFixed: Case[] = [
  [
    '>:c[{{\n>}',
    names,
    false,
    { mdx: { acorn } },
    'acorn error place in a text directive label across quote lines',
  ],
  [
    '* [X]  <><a-b></a-b></>\n{\n\t}t',
    ['mdx'],
    true,
    {},
    'task list item with JSX text keeps its space',
  ],
  [
    '[F]:x\n"\n<s\r>"',
    ['frontmatter', 'math', 'directive', 'mdx'],
    true,
    { mdx: { acorn } },
    '`--all --acorn` fuzz, seed 20261201, document 587638',
  ],
];

describe('cases fixed by mdx-layers-flow', () => {
  for (const [input, list, gfm, options, reason] of flowFixed) {
    test(`${JSON.stringify(input)} (${reason})`, () => {
      expect(parseTalata(input, gfm, list, options)).toEqual(
        parseReference(input, gfm, list, options),
      );
    });
  }
});

test("'{a\\n:::x\\n}x\\n'.repeat(n) with [directive, mdx] grows under 5x per 4x size", () => {
  // Only the first text chunk runs; the nested document is never parsed.
  // More shapes and the acorn case are in `mdx-growth.test.ts`.
  const best = (count: number): number => {
    const text = '{a\n:::x\n}x\n'.repeat(count);
    let fastest = Infinity;
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      parseTalata(text, false, names);
      fastest = Math.min(fastest, performance.now() - start);
    }
    return fastest;
  };
  best(250);
  expect(best(4000) / best(1000)).toBeLessThan(5);
});
