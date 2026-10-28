import { describe, expect, it } from 'vitest';
import { parseReference, parseTalata, ready, specExamples, specText } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// The mdast tree, positions included, must equal mdast-util-from-markdown's.
describe.skipIf(!ready.commonmark)('mdast equivalence with mdast-util-from-markdown', () => {
  for (const useGfm of [false, true]) {
    describe(useGfm ? 'with GFM' : 'CommonMark only', () => {
      for (const example of specExamples) {
        it(`spec example ${example.number}`, () => {
          const markdown = specText(example.markdown);
          const found = firstDiff(parseReference(markdown, useGfm), parseTalata(markdown, useGfm));
          expect(describeDiff(found)).toBeUndefined();
        });
      }
    });
  }
});
