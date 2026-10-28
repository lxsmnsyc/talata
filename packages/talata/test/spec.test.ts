import { describe, expect, it } from 'vitest';
import {
  normalizeHtml,
  parseReference,
  parseTalata,
  ready,
  specExamples,
  specText,
  toHtmlString,
} from './parsers';

// Rendering mdast back to HTML loses details the spec's HTML keeps, so the
// reference parser matches 541 of 652 examples this way (measured 2026-10-28).
// Talata's bar is the reference parser's output, not the spec's HTML.
describe('CommonMark spec through the reference parser', () => {
  it('matches the spec HTML on at least the measured number of examples', () => {
    let matching = 0;
    for (const example of specExamples) {
      const html = toHtmlString(parseReference(specText(example.markdown), false));
      if (normalizeHtml(html) === normalizeHtml(specText(example.html))) {
        matching++;
      }
    }
    expect(matching).toBeGreaterThanOrEqual(541);
  });
});

describe.skipIf(!ready.commonmark)('CommonMark spec through talata', () => {
  for (const example of specExamples) {
    it(`example ${example.number} (${example.section})`, () => {
      const markdown = specText(example.markdown);
      const expected = toHtmlString(parseReference(markdown, false));
      expect(toHtmlString(parseTalata(markdown, false))).toBe(expected);
    });
  }
});
