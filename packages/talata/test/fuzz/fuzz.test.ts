import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check } from './check';
import { allFeatures, supported } from './features';
import { generateDocument } from './generate';
import { mutate } from './mutate';
import { createRandom } from './random';
import { runFuzz } from './run';
import shrink from './shrink';

interface Fixture {
  input: string;
  gfm: boolean;
}

function isFixture(value: unknown): value is Fixture {
  return (
    typeof value === 'object' &&
    value != null &&
    'input' in value &&
    typeof value.input === 'string' &&
    'gfm' in value &&
    typeof value.gfm === 'boolean'
  );
}

// Minimized failures the fuzzer saved. Each one must pass once the bug is fixed.
function loadFixtures(): { name: string; fixture: Fixture }[] {
  const dir = new URL('./fixtures/', import.meta.url);
  const found: { name: string; fixture: Fixture }[] = [];
  for (const name of readdirSync(dir).toSorted()) {
    if (name.endsWith('.json')) {
      const parsed: unknown = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
      if (isFixture(parsed)) {
        found.push({ name, fixture: parsed });
      }
    }
  }
  return found;
}

describe('fuzz fixtures', () => {
  it('passes every saved fixture', () => {
    const failed: string[] = [];
    for (const { name, fixture } of loadFixtures()) {
      const outcome = check(fixture.input, fixture.gfm, supported);
      if (outcome.kind === 'diff' || outcome.kind === 'throw') {
        failed.push(`${name}: ${outcome.message}`);
      }
    }
    expect(failed).toEqual([]);
  });
});

describe('fuzz smoke run', () => {
  it('finds no difference in 1500 documents', () => {
    const report = runFuzz({
      count: 1500,
      seed: 1,
      start: 0,
      gfm: true,
      features: supported,
      maxFailures: 2,
      shrinkBudget: 2000,
    });
    expect(report.reported.map((failure) => failure.minimized)).toEqual([]);
    expect(report.failures).toBe(0);
    // Most documents must be compared, or the filter hides everything.
    expect(report.compared).toBeGreaterThan(report.documents / 2);
  });
});

describe('fuzz parts', () => {
  it('builds the same document from the same seed', () => {
    const a = generateDocument(createRandom(7), allFeatures());
    const b = generateDocument(createRandom(7), allFeatures());
    expect(a).toBe(b);
  });

  it('generates and mutates every feature without throwing', () => {
    const random = createRandom(3);
    for (let i = 0; i < 300; i++) {
      const doc = generateDocument(random, allFeatures());
      expect(typeof mutate(random, doc)).toBe('string');
    }
  });

  it('shrinks to the smallest failing text', () => {
    const fails = (value: string): boolean => value.includes('#') && value.includes('x');
    const small = shrink('aaa\n# b\nccc x\nddd\n', fails, 2000);
    expect(small.length).toBe(2);
    expect(fails(small)).toBe(true);
  });
});
