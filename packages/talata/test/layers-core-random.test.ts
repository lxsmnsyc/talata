import type { Root } from 'mdast';
import { expect, test } from 'vitest';
import type { BlockRule, BlockState, FlowMark, OpenBlock } from '../src/core/blocks';
import type { Line } from '../src/core/line';
import type { Extension } from '../src/ext/api';
import { fromMarkdown } from '../src/index';
import { allFeatures } from './fuzz/features';
import { generateDocument } from './fuzz/generate';
import { createRandom, documentSeed } from './fuzz/random';

// A probe on `@N` that always fails: it marks and rewinds on the N-th line
// after it. Where no line it took could start a container, the tree is the
// tree without the probe. Lines that might start a container are left out
// when probes are inserted.

const log = { closes: 0, rewinds: 0 };

function keepGoing(): boolean {
  return true;
}

class Failing implements OpenBlock {
  name = 'failing';
  isContainer = false;
  acceptsLazy = false;
  seen = 0;
  mark: FlowMark;
  rule: BlockRule;
  limit: number;
  log = log;

  constructor(mark: FlowMark, rule: BlockRule, limit: number) {
    this.mark = mark;
    this.rule = rule;
    this.limit = limit;
  }

  continue: () => boolean = keepGoing;

  addLine(state: BlockState): void {
    this.seen++;
    if (this.seen >= this.limit) {
      this.log.rewinds++;
      state.rewind(this.mark, this.rule);
    }
  }

  close(): undefined {
    this.log.closes++;
    return undefined;
  }
}

const rule: BlockRule = {
  name: 'failing',
  priority: 50,
  canInterruptParagraph: true,
  triggers: '@',
  start(state: BlockState, line: Line) {
    const digits = line.text.slice(line.nonBlank + 1, line.end);
    if (!/^[1-4]$/.test(digits)) {
      return undefined;
    }
    return new Failing(state.mark(), rule, Number(digits));
  },
};

const failing: Extension = { name: 'test:failing', blockRules: [rule] };

/** Whether a line could start a container (its prefix characters), or is indented code. */
function risky(line: string): boolean {
  return /^\s*([>*+\-:]|\d|\[\^)/.test(line) || /^\s{4}/.test(line);
}

function strip(tree: Root): string {
  return JSON.stringify(tree);
}

test('a failing probe leaves the tree as without it', () => {
  const features = allFeatures();
  features.extensions = [];
  let compared = 0;
  for (let index = 0; index < 20000; index++) {
    const random = createRandom(documentSeed(20261123, index));
    const lines = generateDocument(random, features).split(/\r\n|\r|\n/);
    if (lines.some((line) => line.includes('@'))) {
      continue;
    }
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const limit = 1 + random.int(4);
      const indent = /^ */.exec(lines[i])![0];
      if (
        random.chance(0.3) &&
        !risky(lines[i]) &&
        i + limit < lines.length &&
        !lines.slice(i, i + limit + 1).some(risky)
      ) {
        out.push(`${indent}@${limit}`);
      }
      out.push(lines[i]);
    }
    const value = out.join('\n');
    for (const gfm of [false, true]) {
      log.closes = 0;
      const tree = fromMarkdown(value, { gfm, extensions: [failing] });
      if (log.closes > 0) {
        continue;
      }
      compared++;
      expect(strip(tree), JSON.stringify(value)).toBe(strip(fromMarkdown(value, { gfm })));
    }
  }
  expect(compared).toBeGreaterThan(10000);
  expect(log.rewinds).toBeGreaterThan(5000);
});
