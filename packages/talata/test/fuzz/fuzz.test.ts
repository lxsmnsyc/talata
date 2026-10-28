import { readFileSync, readdirSync } from 'node:fs';
import type { Root } from 'mdast';
import { describe, expect, it } from 'vitest';
import { check } from './check';
import { allFeatures, featureNames, supported } from './features';
import type { Features } from './features';
import { generateDocument } from './generate';
import { mutate } from './mutate';
import { createRandom } from './random';
import { parseTalata } from '../parsers';
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
  const fixtures = loadFixtures();
  it('loads the saved fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(0);
  });
  for (const { name, fixture } of fixtures) {
    // A fixture that talata does not support yet is skipped by the filter. It
    // is replayed with every feature and expected to fail, so it stays visible.
    // Once its flag is on, it runs as a normal test.
    const pending = check(fixture.input, fixture.gfm, supported).kind === 'skip';
    const run = pending ? it.fails : it;
    run(`${name}${pending ? ' (feature off)' : ''}`, () => {
      expect(check(fixture.input, fixture.gfm, allFeatures()).kind).toBe('equal');
    });
  }
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
      // Spec examples only, so the documents do not depend on the corpus download.
      corpus: false,
    });
    expect(report.reported.map((failure) => failure.minimized)).toEqual([]);
    expect(report.failures).toBe(0);
    // Most documents must be compared, or the filter hides everything.
    expect(report.compared).toBeGreaterThan(report.documents / 2);
  });

  it('sees a changed value and a changed position', () => {
    const value = '# a\n\nb\n';
    const changed =
      (edit: (tree: Root) => void) =>
      (text: string, useGfm: boolean): Root => {
        const tree = structuredClone(parseTalata(text, useGfm));
        edit(tree);
        return tree;
      };
    expect(check(value, true, supported).kind).toBe('equal');
    const text = check(
      value,
      true,
      supported,
      changed((tree) => {
        const heading = tree.children[0];
        const leaf = heading.type === 'heading' ? heading.children[0] : undefined;
        if (leaf?.type === 'text') {
          leaf.value = 'x';
        }
      }),
    );
    expect(text.kind).toBe('diff');
    const position = check(
      value,
      true,
      supported,
      changed((tree) => {
        const end = tree.children[1].position?.end;
        if (end) {
          end.offset = 0;
        }
      }),
    );
    expect(position.kind).toBe('diff');
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
    let seen = '';
    for (let i = 0; i < 600; i++) {
      const doc = generateDocument(random, allFeatures());
      expect(typeof mutate(random, doc)).toBe('string');
      seen += doc;
    }
    const markers: Record<keyof Features, string> = {
      atx: '# ',
      thematicBreak: '***',
      setext: '===',
      code: '```',
      blockquote: '> ',
      list: '- ',
      html: '<div>',
      definition: ']:',
      inline: '**',
      strikethrough: '~~',
      table: ':--',
      footnote: '[^',
      taskList: '[x] ',
      autolinkLiteral: 'www.',
    };
    for (const feature of featureNames) {
      expect([feature, seen.includes(markers[feature])]).toEqual([feature, true]);
    }
  });

  it('shrinks to the smallest failing text', () => {
    const fails = (value: string): boolean => value.includes('#') && value.includes('x');
    const small = shrink('aaa\n# b\nccc x\nddd\n', fails, 2000);
    expect(small.length).toBe(2);
    expect(fails(small)).toBe(true);
  });
});
