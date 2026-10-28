import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { corpusFiles, parseReference, parseTalata, ready } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// The files come from `pnpm --filter benchmark corpus`. Both suites skip when
// the corpus has not been downloaded.
const files = corpusFiles();

describe.skipIf(files.length === 0)('benchmark corpus through the reference parser', () => {
  it('parses every file into a root with positions', () => {
    for (const file of files) {
      const tree = parseReference(readFileSync(file.path, 'utf8'), true);
      expect(tree.type, file.name).toBe('root');
      expect(tree.position, file.name).toBeDefined();
    }
  });
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
