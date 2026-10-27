import { describe, expect, it } from 'vitest';
import { READY, parseReference, parseTalata, specExamples, specText } from './parsers';

// The mdast tree, positions included, must equal mdast-util-from-markdown's.
describe.skipIf(!READY)('mdast equivalence with mdast-util-from-markdown', () => {
  for (const useGfm of [false, true]) {
    describe(useGfm ? 'with GFM' : 'CommonMark only', () => {
      for (const example of specExamples) {
        it(`spec example ${example.number}`, () => {
          const markdown = specText(example.markdown);
          expect(parseTalata(markdown, useGfm)).toEqual(parseReference(markdown, useGfm));
        });
      }
    });
  }
});
