import { createRequire } from 'node:module';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';

// The spec sections core-skeleton implements, compared to the reference
// parser with positions. Runs while READY is false.

interface Example {
  markdown: string;
  section: string;
  number: number;
}

function isSpec(value: unknown): value is { tests: Example[] } {
  return (
    typeof value === 'object' && value != null && 'tests' in value && Array.isArray(value.tests)
  );
}

const spec: unknown = createRequire(import.meta.url)('commonmark-spec');
if (!isSpec(spec)) {
  throw new Error('commonmark-spec did not export a tests array');
}

const sections = new Set(['Thematic breaks', 'ATX headings', 'Paragraphs']);

// Examples that need constructs other nodes build.
const waiting = new Map<number, string>([
  [48, 'indented code (blocks-leaf)'],
  [56, 'emphasis (inline-core)'],
  [57, 'lists (blocks-container)'],
  [59, 'setext headings (blocks-leaf)'],
  [60, 'lists (blocks-container)'],
  [61, 'lists (blocks-container)'],
  [65, 'backslash escapes (inline-core)'],
  [66, 'emphasis and escapes (inline-core)'],
  [69, 'indented code (blocks-leaf)'],
  [76, 'backslash escapes (inline-core)'],
  [225, 'indented code (blocks-leaf)'],
]);

describe('spec sections built by core-skeleton', () => {
  for (const example of spec.tests) {
    if (!sections.has(example.section) || waiting.has(example.number)) {
      continue;
    }
    it(`example ${example.number} (${example.section})`, () => {
      const markdown = example.markdown.replaceAll('→', '\t');
      expect(fromMarkdown(markdown)).toEqual(reference(markdown));
    });
  }
});
