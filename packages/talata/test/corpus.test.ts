import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusFiles, gfmReady, parseReference, parseTalata, ready } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// The files come from `pnpm --filter benchmark corpus`. Both suites skip when
// the corpus has not been downloaded.
const files = corpusFiles();
// Large corpus files take seconds in the reference parser on a loaded machine.
const timeout = 30_000;

describe.skipIf(files.length === 0)('benchmark corpus through the reference parser', () => {
  // One test per file, so a slow machine cannot push the total past a timeout.
  // The large files only check the reference itself and take most of the
  // fast check's time, so this sanity suite covers the readmes only.
  for (const file of files) {
    if (file.name.startsWith('large/')) {
      continue;
    }
    it(
      `parses ${file.name} into a root with positions`,
      () => {
        const tree = parseReference(readFileSync(file.path, 'utf8'), true);
        expect(tree.type).toBe('root');
        expect(tree.position).toBeDefined();
      },
      timeout,
    );
  }
});

describe.skipIf(files.length === 0 || !ready.corpus)(
  'benchmark corpus through talata without gfm',
  () => {
    for (const file of files) {
      it(
        file.name,
        () => {
          const value = readFileSync(file.path, 'utf8');
          const found = firstDiff(parseReference(value, false), parseTalata(value, false));
          expect(describeDiff(found)).toBeUndefined();
        },
        timeout,
      );
    }
  },
);

// Most corpus files use tables or literal autolinks, so this waits for every GFM feature.
describe.skipIf(files.length === 0 || !ready.corpus || !gfmReady())(
  'benchmark corpus through talata',
  () => {
    for (const file of files) {
      it(
        file.name,
        () => {
          const value = readFileSync(file.path, 'utf8');
          const found = firstDiff(parseReference(value, true), parseTalata(value, true));
          expect(describeDiff(found)).toBeUndefined();
        },
        timeout,
      );
    }
  },
);
