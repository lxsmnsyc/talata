/* oxlint-disable typescript/no-unsafe-type-assertion -- test rules build mdast nodes that @types/mdast lacks */
import type { Parent, Root, RootContent } from 'mdast';
import { describe, expect, test } from 'vitest';
import type { BlockRule, BlockState, FlowMark, OpenBlock } from '../src/core/blocks';
import type { Line } from '../src/core/line';
import { point } from '../src/core/source';
import { SPAN_SIZE } from '../src/core/spans';
import type { Extension } from '../src/ext/api';
import { fromMarkdown } from '../src/index';
import { parseReference, parseTalata } from './parsers';

// mdx-layers-core (contract block-layers v1): the flow layer's mark, commit
// and rewind, `onLazyLine`, and `BlockState.document` with the chunk queue,
// tested with rules made here. No extension uses them yet.

interface Log {
  closes: number;
  lazy: number;
}

// A probe leaf on `@N`: it marks, takes the next lines, and rewinds on the
// N-th of them. A line `ok` commits it: it takes that line and ends on the
// next one.
class Probe implements OpenBlock {
  name = 'probe';
  isContainer = false;
  acceptsLazy = false;
  mark: FlowMark;
  rule: BlockRule;
  log: Log;
  limit: number;
  seen = 0;
  done = false;
  start: number;
  end: number;
  lines: string[];

  constructor(mark: FlowMark, rule: BlockRule, log: Log, limit: number, line: Line) {
    this.mark = mark;
    this.rule = rule;
    this.log = log;
    this.limit = limit;
    this.start = line.nonBlank;
    this.end = line.end;
    this.lines = [line.text.slice(line.nonBlank, line.end)];
  }

  continue(state: BlockState, line: Line): boolean {
    if (this.done) {
      return false;
    }
    if (line.text.slice(line.nonBlank, line.end) === 'ok') {
      state.commit(this.mark);
      this.done = true;
    }
    return true;
  }

  addLine(state: BlockState, line: Line): void {
    this.lines.push(line.text.slice(line.start, line.end));
    this.end = line.end;
    if (this.done) {
      return;
    }
    this.seen++;
    if (this.seen >= this.limit) {
      state.rewind(this.mark, this.rule);
    }
  }

  onLazyLine(): void {
    this.log.lazy++;
  }

  close(state: BlockState): RootContent {
    this.log.closes++;
    return {
      type: 'code',
      lang: 'probe',
      meta: null,
      value: this.lines.join('\n'),
      position: { start: point(state.source, this.start), end: point(state.source, this.end) },
    };
  }
}

function probe(log: Log): Extension {
  const rule: BlockRule = {
    name: 'probe',
    priority: 50,
    canInterruptParagraph: true,
    triggers: '@',
    start(state, line) {
      const digits = line.text.slice(line.nonBlank + 1, line.end);
      if (!/^\d+$/.test(digits)) {
        return undefined;
      }
      return new Probe(state.mark(), rule, log, Number(digits), line);
    },
  };
  return { name: 'test:probe', blockRules: [rule] };
}

function parseProbe(value: string, gfm = false): { tree: Root; log: Log } {
  const log = { closes: 0, lazy: 0 };
  return { tree: fromMarkdown(value, { gfm, extensions: [probe(log)] }), log };
}

describe('flow mark: rewind reads the lines again', () => {
  // Every probe here fails, and no line it took would start a container, so
  // the tree is the one without the probe rule.
  const cases = [
    '@1\nb',
    '@2\nb\nc\nd',
    'a\n@1\nb',
    'a\n@2\nb\n\nc',
    '> a\n@1\n> b',
    '- a\n  @1\n  b',
    'a\n@1\n---',
    '@3\n@1\nx\ny',
    '@2\n@1\nx\ny\nz',
    '[a]: /u\n@1\n[a]',
    'a\n@1\n    b',
    '```\nx\n```\n@1\n```\ny\n```',
    '  @1\n\tb',
  ];
  for (const value of cases) {
    test(JSON.stringify(value), () => {
      const { tree, log } = parseProbe(value);
      expect(log.closes).toBe(0);
      expect(tree).toEqual(fromMarkdown(value));
    });
  }

  test('a held table gets its body rows back', () => {
    const value = '| a |\n| - |\n| b |\n@1\nc\n| d |';
    const { tree, log } = parseProbe(value, true);
    expect(log.closes).toBe(0);
    expect(tree).toEqual(fromMarkdown(value, { gfm: true }));
  });

  test('a table on a lazy line is not held: it closes with its containers', () => {
    // micromark keeps the containers of a lazy line open for a lazy
    // paragraph only.
    for (const value of ['> | a |\n> | - |\n@1\n> x', '- | a |\n  | - |\n@1\n  x']) {
      const { tree, log } = parseProbe(value, true);
      expect(log.closes, value).toBe(0);
      expect(shape(tree.children), value).toEqual([
        { type: tree.children[0].type, children: shape((tree.children[0] as Parent).children) },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: value.endsWith('> x') ? '@1\n> x' : '@1\nx' }],
        },
      ]);
      const outer = tree.children[0] as Parent;
      const table =
        outer.type === 'list' ? (outer.children[0] as Parent).children[0] : outer.children[0];
      expect(table.type).toBe('table');
      expect(
        outer.type === 'list' ? (outer.children[0] as Parent).children : outer.children,
      ).toHaveLength(1);
    }
  });

  test('a rule that calls mark() must return its block', () => {
    const broken: Extension = {
      name: 'test:broken',
      blockRules: [
        {
          name: 'broken',
          priority: 50,
          canInterruptParagraph: true,
          triggers: '!',
          start(state) {
            state.mark();
            return undefined;
          },
        },
      ],
    };
    expect(() => fromMarkdown('!', { extensions: [broken] })).toThrow('called mark()');
  });

  test('containers do not start on lines read while the mark was open', () => {
    // micromark: the probe is concrete, so `> x` started no quote, and the
    // flow reads it again as paragraph text.
    const { tree, log } = parseProbe('@2\n> x\ny');
    expect(log.closes).toBe(0);
    expect(tree.children.map((child) => child.type)).toEqual(['paragraph']);
    expect(tree.children[0].position!.end.line).toBe(3);
  });

  test('a chain of failures stays linear', () => {
    function time(n: number): number {
      const value = '@1\nx\n'.repeat(n);
      let best = Infinity;
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        parseProbe(value);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    }
    time(500);
    // Quadratic growth would give 16.
    expect(time(16000) / time(4000)).toBeLessThan(8);
  });
});

describe('flow mark: commit and close', () => {
  test('the held paragraph closes before the marked leaf', () => {
    const { tree, log } = parseProbe('a\n@5\nok\nz');
    expect(log.closes).toBe(1);
    expect(tree.children.map((child) => child.type)).toEqual(['paragraph', 'code', 'paragraph']);
    expect(tree.children[1]).toMatchObject({ value: '@5\nok' });
  });

  test('definitions of the held paragraph come first', () => {
    const { tree } = parseProbe('[a]: /u\nb\n@5\nok\n[a]');
    expect(tree.children.map((child) => child.type)).toEqual([
      'definition',
      'paragraph',
      'code',
      'paragraph',
    ]);
    expect(tree.children[3]).toMatchObject({ children: [{ type: 'linkReference' }] });
  });

  test('the end of the document closes it as committed', () => {
    const { tree, log } = parseProbe('a\n@5\nb');
    expect(log.closes).toBe(1);
    expect(tree.children.map((child) => child.type)).toEqual(['paragraph', 'code']);
  });

  test('a lazy line calls onLazyLine, then the leaf closes', () => {
    const { tree, log } = parseProbe('> a\n@5\nb');
    expect(log).toEqual({ closes: 1, lazy: 1 });
    // The mark kept the quote open on the lazy first line.
    expect(tree.children.map((child) => child.type)).toEqual(['blockquote', 'paragraph']);
    expect((tree.children[0] as { children: RootContent[] }).children.map((c) => c.type)).toEqual([
      'paragraph',
      'code',
    ]);
  });

  test('a container that starts closes the leaf, without onLazyLine', () => {
    const { tree, log } = parseProbe('> @5\n> x\n- y');
    expect(log).toEqual({ closes: 1, lazy: 0 });
    expect(tree.children.map((child) => child.type)).toEqual(['blockquote', 'list']);
  });
});

// A collector leaf on `%%%`: it takes raw lines up to a `%%%` fence and
// queues them as a nested document.
class Collector implements OpenBlock {
  name = 'collector';
  isContainer = false;
  acceptsLazy = false;
  data: number[] = [];
  fenced = false;
  done = false;
  node: { type: string; depth: number; children: RootContent[] };

  constructor(depth: number) {
    this.node = { type: 'collector', depth, children: [] };
  }

  continue(_state: BlockState, line: Line): boolean {
    if (this.done) {
      return false;
    }
    if (line.text.slice(line.nonBlank, line.end) === '%%%') {
      this.done = true;
      this.fenced = true;
    }
    return true;
  }

  addLine(_state: BlockState, line: Line): void {
    if (!this.fenced) {
      this.data.push(line.index, line.start, line.end, line.visualColumn, line.partialTab);
    }
  }

  close(state: BlockState): RootContent {
    state.document(this.node, {
      data: this.data,
      from: 0,
      to: this.data.length / SPAN_SIZE,
      finalLineEnding: this.fenced || state.closeKeepsLineEnding,
    });
    return this.node as unknown as RootContent;
  }
}

const collector: Extension = {
  name: 'test:collector',
  blockRules: [
    {
      name: 'collector',
      priority: 50,
      canInterruptParagraph: true,
      triggers: '%',
      start(state, line) {
        if (line.text.slice(line.nonBlank, line.end) !== '%%%') {
          return undefined;
        }
        return new Collector(state.depth);
      },
    },
    {
      // `?` on a line of its own: a node with what the rule saw there.
      name: 'info',
      priority: 50,
      canInterruptParagraph: true,
      triggers: '?',
      start(state, line) {
        if (line.text.slice(line.nonBlank, line.end) !== '?') {
          return undefined;
        }
        const node = { type: 'info', depth: state.depth, end: state.end, last: line.last };
        return {
          name: 'info',
          isContainer: false,
          acceptsLazy: false,
          continue: () => false,
          close: () => node as unknown as RootContent,
        };
      },
    },
  ],
};

/** Node types and values, without positions. */
function shape(nodes: RootContent[]): unknown[] {
  const out: unknown[] = [];
  for (const node of nodes) {
    const item: Record<string, unknown> = { type: node.type };
    if ('value' in node) {
      item.value = node.value;
    }
    if ('children' in node) {
      item.children = shape(node.children);
    }
    out.push(item);
  }
  return out;
}

function parseCollector(value: string): Root {
  return fromMarkdown(value, { extensions: [collector] });
}

describe('BlockState.document', () => {
  test('content parses as a document of its own, at depth 1', () => {
    const tree = parseCollector('%%%\n# a\nb *c*\n%%%\nd');
    const node = tree.children[0] as unknown as { depth: number; children: RootContent[] };
    expect(shape(tree.children)).toEqual([
      { type: 'collector', children: shape(fromMarkdown('# a\nb *c*').children) },
      { type: 'paragraph', children: [{ type: 'text', value: 'd' }] },
    ]);
    expect(node.children[0].position!.start).toEqual({ line: 2, column: 1, offset: 4 });
    expect(node.children[1].position!.end).toEqual({ line: 3, column: 6, offset: 13 });
  });

  test('spans start after the container prefixes', () => {
    const tree = parseCollector('> %%%\n> - a\n>   b\n> %%%');
    const quote = tree.children[0] as { children: RootContent[] };
    expect(shape(quote.children)).toEqual([
      { type: 'collector', children: shape(fromMarkdown('- a\n  b').children) },
    ]);
  });

  test('empty content queues nothing', () => {
    const tree = parseCollector('%%%\n%%%');
    expect(shape(tree.children)).toEqual([{ type: 'collector', children: [] }]);
  });

  test('a nested document has its own depth, end and last line', () => {
    // Source: depth 0, ends at the text's end.
    const source = parseCollector('?\n%%%\n?\n?\n%%%\n?');
    expect(source.children[0]).toMatchObject({ type: 'info', depth: 0, end: 15, last: false });
    expect(source.children[2]).toMatchObject({ type: 'info', depth: 0, end: 15, last: true });
    // Content: depth 1, ends at the end of its last span (offset 9). The
    // fence keeps the last line ending, so no span is a last line.
    const inner = (source.children[1] as { children: RootContent[] }).children;
    expect(inner).toMatchObject([
      { type: 'info', depth: 1, end: 9, last: false },
      { type: 'info', depth: 1, end: 9, last: false },
    ]);
    // Without a fence or final line ending, the last span is a last line.
    const open = parseCollector('%%%\n?\n?');
    expect((open.children[0] as { children: RootContent[] }).children).toMatchObject([
      { type: 'info', depth: 1, end: 7, last: false },
      { type: 'info', depth: 1, end: 7, last: true },
    ]);
  });

  test('the last line keeps its line ending when the fence closes it', () => {
    const fence = '`'.repeat(3);
    function value(text: string): string {
      return (fromMarkdown(text).children[0] as { value: string }).value;
    }
    // Closed by its fence: the content is `fence\nx\n\n` with its final line ending.
    const fenced = parseCollector(`%%%\n${fence}\nx\n\n%%%`);
    expect((fenced.children[0] as { children: RootContent[] }).children[0]).toMatchObject({
      type: 'code',
      value: value(`${fence}\nx\n\n`),
    });
    // Closed by a lazy line: no final line ending.
    const lazy = parseCollector(`> %%%\n> ${fence}\n> x\n>\nb`);
    const quote = lazy.children[0] as { children: RootContent[] };
    expect((quote.children[0] as { children: RootContent[] }).children[0]).toMatchObject({
      type: 'code',
      value: value(`${fence}\nx\n`),
    });
    expect(value(`${fence}\nx\n\n`)).not.toBe(value(`${fence}\nx\n`));
  });

  test('text in the source after the content sees its definitions', () => {
    // Content of depth 1 runs in pass 1 before source text that starts later.
    const after = parseCollector('%%%\n[a]: /u\n%%%\n[a]');
    expect(after.children[1]).toMatchObject({ children: [{ type: 'linkReference' }] });
    const before = parseCollector('[a]\n%%%\n[a]: /u\n%%%');
    expect(before.children[0]).toMatchObject({ children: [{ type: 'text', value: '[a]' }] });
  });
});

describe('chunk queue order with v5 scope hooks', () => {
  // A container directive queues its label from `start`, before the
  // paragraph it interrupts closes. Sorting the pass puts the label after
  // the paragraph; the scope hook queued after both must stay after the
  // label, or the label sees the definitions of the directive's content.
  // Shrunk from `[directive]` fuzz seed 20261123, document 3882.
  for (const value of ['1\n:::a[[foo]]\n[foo]:x']) {
    for (const gfm of [false, true]) {
      test(`${JSON.stringify(value)}, gfm ${gfm}`, () => {
        expect(parseTalata(value, gfm, ['directive'])).toEqual(
          parseReference(value, gfm, ['directive']),
        );
      });
    }
  }
});
