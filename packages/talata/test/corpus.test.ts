import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusFiles, parseReference, parseTalata, ready } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// The files come from `pnpm --filter benchmark corpus`. Both suites skip when
// the corpus has not been downloaded.
const files = corpusFiles();

describe.skipIf(files.length === 0)('benchmark corpus through the reference parser', () => {
  // One test per file, so a slow machine cannot push the total past a timeout.
  for (const file of files) {
    it(`parses ${file.name} into a root with positions`, () => {
      const tree = parseReference(readFileSync(file.path, 'utf8'), true);
      expect(tree.type).toBe('root');
      expect(tree.position).toBeDefined();
    });
  }
});

describe.skipIf(files.length === 0 || !ready.corpus)('benchmark corpus through talata', () => {
  for (const file of files) {
    it(file.name, () => {
      const value = readFileSync(file.path, 'utf8');
      const found = firstDiff(parseReference(value, true), parseTalata(value, true));
      expect(describeDiff(found)).toBeUndefined();
    });
  }
});
