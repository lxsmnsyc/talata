import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';
import { specExamples, specText } from './parsers';

// The spec sections core-skeleton implements, compared to the reference
// parser with positions. Runs whatever the readiness flag says.

const sections = new Set(['Thematic breaks', 'ATX headings', 'Paragraphs']);

// Examples that need constructs other nodes build. Each node removes its own.
const waiting = new Map<number, string>([
  [56, 'emphasis (inline-core)'],
  [57, 'lists (blocks-container)'],
  [60, 'lists (blocks-container)'],
  [61, 'lists (blocks-container)'],
  [65, 'backslash escapes (inline-core)'],
  [66, 'emphasis and escapes (inline-core)'],
  [76, 'backslash escapes (inline-core)'],
]);

describe('spec sections built by core-skeleton', () => {
  for (const example of specExamples) {
    if (!sections.has(example.section) || waiting.has(example.number)) {
      continue;
    }
    it(`example ${example.number} (${example.section})`, () => {
      const markdown = specText(example.markdown);
      expect(fromMarkdown(markdown)).toEqual(reference(markdown));
    });
  }
});
