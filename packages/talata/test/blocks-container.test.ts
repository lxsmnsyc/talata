import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';
import { specExamples, specText } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// The spec sections blocks-container implements, compared to the reference
// parser with positions.

const sections = new Set(['Block quotes', 'List items', 'Lists']);

// Examples that need constructs other nodes build. Each node removes its own.
const waiting = new Map<number, string>([
  [231, 'indented code (blocks-leaf)'],
  [236, 'indented code (blocks-leaf)'],
  [237, 'fenced code (blocks-leaf)'],
  [252, 'indented code (blocks-leaf)'],
  [253, 'indented code (blocks-leaf)'],
  [254, 'indented code (blocks-leaf)'],
  [257, 'indented code (blocks-leaf)'],
  [263, 'fenced code (blocks-leaf)'],
  [264, 'indented code (blocks-leaf)'],
  [270, 'indented code (blocks-leaf)'],
  [271, 'indented code (blocks-leaf)'],
  [272, 'indented code (blocks-leaf)'],
  [273, 'indented code (blocks-leaf)'],
  [274, 'indented code (blocks-leaf)'],
  [278, 'fenced and indented code (blocks-leaf)'],
  [286, 'indented code (blocks-leaf)'],
  [287, 'indented code (blocks-leaf)'],
  [288, 'indented code (blocks-leaf)'],
  [289, 'indented code (blocks-leaf)'],
  [290, 'indented code (blocks-leaf)'],
  [300, 'setext headings (blocks-leaf)'],
  [308, 'HTML blocks (blocks-leaf)'],
  [309, 'HTML blocks and indented code (blocks-leaf)'],
  [313, 'indented code (blocks-leaf)'],
  [317, 'definitions (blocks-leaf)'],
  [318, 'fenced code (blocks-leaf)'],
  [321, 'fenced code (blocks-leaf)'],
  [324, 'fenced code (blocks-leaf)'],
]);

function check(markdown: string): void {
  expect(describeDiff(firstDiff(reference(markdown), fromMarkdown(markdown)))).toBeUndefined();
}

describe('spec sections built by blocks-container', () => {
  for (const example of specExamples) {
    if (!sections.has(example.section) || waiting.has(example.number)) {
      continue;
    }
    it(`example ${example.number} (${example.section})`, () => {
      check(specText(example.markdown));
    });
  }
});

// Examples from other sections that waited on lists (see core-sections.test.ts).
describe('examples from other sections that need lists', () => {
  for (const example of specExamples) {
    if (example.number === 57 || example.number === 60 || example.number === 61) {
      it(`example ${example.number} (${example.section})`, () => {
        check(specText(example.markdown));
      });
    }
  }
});

// Positions and spread found by reading micromark and by fuzzing against the
// reference: container exits stop at quote prefixes, items skip them, and a
// new container closes open ones after the matched prefixes.
const cases = [
  '-',
  '-   ',
  '-\n',
  '- \n  ',
  '-\n- a',
  '- a\n\nb',
  '- a\n\n\n',
  '- a\n  \n  ',
  '- a\n     \n- b',
  '- a\n- b\n\n- c',
  '- a\n\n  b\n- c',
  '- a\n\n\n- b',
  '-\n\n  a',
  '- a\n -\n',
  '- a\n  >',
  '- a\nb',
  '- a\n> b',
  '- a\n* b',
  '- a\n- - -',
  '- a\n2. b',
  '1. a\n1. b',
  '003) a',
  '1234567890. a',
  '>\t- a\n>\t  b',
  '- - a\n\n- b',
  '- - a\n\n  b',
  '- > a\n\n- b',
  '- a\n  - b\n\n- c',
  '> - a\n>\n> b',
  '> - a\n>\n>\n> b',
  '> - a\n>\n',
  '> - a\n>',
  '> - a\n> \n> b',
  '> - a\n>   \n> b',
  '> - a\n>\nb',
  '> - a\n\nb',
  '> - a\n> > b',
  '> - a\n> # b',
  '> - a\n> * b',
  '> > a\n> - b',
  '> - a\n>\n> > b',
  '> - - a\n>\n>   b',
  '> - - a\n>\n>\n>   b',
  '> - > a\n>\n>   b',
  '> - > a\n>',
  '> - > a\n> ',
  '> - > a\n>   ',
  '- - > \n ',
  '> a\n2. b',
  '> a\n-\n',
  '- a\n  b\n2. c',
  '> a\n> 2. b',
  'a\n- - \n',
  'a\n> 2. b',
  'b \n - - \n-\t',
];

describe('containers against the reference', () => {
  for (const markdown of cases) {
    it(JSON.stringify(markdown), () => {
      check(markdown);
    });
  }
});
