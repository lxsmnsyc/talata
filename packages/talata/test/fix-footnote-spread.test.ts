import { describe, expect, it } from 'vitest';
import { parseReference, parseTalata } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// A list item whose last line carries the footnote indent: the reference
// stops its walk back from the list's end at that indent, so a blank line
// before it makes the item spread. Compared to the reference with positions.

const cases = [
  // The fuzz input.
  '[^a]:>7.\n    >\n    >',
  '[^a]:>7.\n    >\n    >\n    >',
  '[^a]:>7. b\n    >\n    >',
  '[^a]:>- a\n    >\n    >',
  '[^a]:>-\n    >\n    >',
  // Deeper nesting.
  '[^a]:>>7.\n    >>\n    >>',
  '[^a]:>>- a\n    >>\n    >>',
  '[^a]:>- a\n    >\n    >\n    >- b',
  // A list directly in the footnote.
  '[^a]:- a\n    \n    ',
  '[^a]:- a\n\n    ',
  '[^a]:7.\n    \n    ',
  // Other content after the blank lines, and a missing second blank line.
  '[^a]:>- a\n    >\n    > b\n    >',
  '[^a]:>- a\n    >\n    >a',
  '[^a]:>- a\n    >',
  '[^a]:>7.\n    >',
  // Text after the list.
  '[^a]:>- a\n    >\n    >\n',
  '[^a]:>- a\n    >\n    >\n\n',
  '[^a]:>- a\n    >\n    >\n    b',
  '[^a]:>- a\n    >\n    >\n    - b',
  '[^a]:>- a\n    >\n    >\n- b',
  // Other last children and item shapes.
  '[^a]:>- [ ] a\n    >\n    >',
  '[^a]:>- ```\n    >  a\n    >  ```\n    >\n    >',
  '[^a]:>- <div>\n    >\n    >',
  '[^a]:>- a\n    >\n    >  b\n    >\n    >',
  '[^a]:>- a\n    >\n    >  b\n    >',
  '[^a]:>- a\n    >- b\n    >\n    >',
  '[^a]:>- a\n    >\n    >- b\n    >',
  '[^a]:- a\n    - b\n    \n    ',
  '[^a]:- a\n    \n    - b\n    ',
  '[^a]:>- a\n    >\n    >\n    >- b\n    >\n    >',
  // The same shapes outside a footnote.
  '>7.\n>\n>',
  '>- a\n>\n>',
];

describe('list item spread in a footnote', () => {
  for (const markdown of cases) {
    it(JSON.stringify(markdown), () => {
      for (const gfm of [false, true]) {
        const found = firstDiff(parseReference(markdown, gfm), parseTalata(markdown, gfm));
        expect(describeDiff(found), gfm ? 'with gfm' : 'without gfm').toBeUndefined();
      }
    });
  }
});
