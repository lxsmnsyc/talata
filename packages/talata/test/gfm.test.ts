import { describe, expect, it } from 'vitest';
import {
  type GfmFeature,
  footnoteInputs,
  gfmExamples,
  parseReference,
  parseTalata,
  ready,
  specText,
} from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

const features: GfmFeature[] = ['table', 'strikethrough', 'autolinkLiteral', 'taskList'];

// The examples are cmark-gfm's. The tree to match is the reference parser's,
// so the first block only checks that the reference accepts every example.
describe('GFM spec examples through the reference parser', () => {
  it('has examples for every spec-backed feature', () => {
    for (const feature of features) {
      let count = 0;
      for (const example of gfmExamples) {
        if (example.feature === feature) {
          count++;
        }
      }
      expect(count, feature).toBeGreaterThan(0);
    }
  });

  it('parses every example into a root with positions', () => {
    for (const example of gfmExamples) {
      const tree = parseReference(specText(example.markdown), true);
      expect(tree.type, `example ${example.number}`).toBe('root');
      expect(tree.position, `example ${example.number}`).toBeDefined();
    }
  });

  it('parses the footnote inputs into footnote nodes', () => {
    // Input 3 uses an undefined label and input 7 a label with a space. Both
    // stay plain text, which makes them negative cases.
    const plainText = [2, 6];
    for (let i = 0; i < footnoteInputs.length; i++) {
      const json = JSON.stringify(parseReference(footnoteInputs[i], true));
      expect(json.includes('footnoteReference'), `input ${i + 1}`).toBe(!plainText.includes(i));
    }
  });
});

for (const feature of features) {
  describe.skipIf(!ready.gfm[feature])(`GFM ${feature} through talata`, () => {
    for (const example of gfmExamples) {
      if (example.feature !== feature) {
        continue;
      }
      it(`example ${example.number} (${example.section})`, () => {
        const markdown = specText(example.markdown);
        const found = firstDiff(parseReference(markdown, true), parseTalata(markdown, true));
        expect(describeDiff(found)).toBeUndefined();
      });
    }
  });
}

describe.skipIf(!ready.commonmark)('GFM disallowed raw HTML through talata', () => {
  for (const example of gfmExamples) {
    if (example.feature !== 'tagfilter') {
      continue;
    }
    it(`example ${example.number}`, () => {
      const markdown = specText(example.markdown);
      const found = firstDiff(parseReference(markdown, true), parseTalata(markdown, true));
      expect(describeDiff(found)).toBeUndefined();
    });
  }
});

describe.skipIf(!ready.gfm.footnote)('GFM footnotes through talata', () => {
  for (let i = 0; i < footnoteInputs.length; i++) {
    it(`input ${i + 1}`, () => {
      const markdown = footnoteInputs[i];
      const found = firstDiff(parseReference(markdown, true), parseTalata(markdown, true));
      expect(describeDiff(found)).toBeUndefined();
    });
  }
});
