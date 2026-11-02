import { describe, expect, it } from 'vitest';
import { parseReference, parseTalata } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// Container directives in block quotes, where the content of a directive ends
// before a lazy or last line, and fuzz finds near them. Compared to the
// reference with positions.

const cases = [
  // A list item whose quote closed on a blank line, then a last line with
  // whitespace after the quote prefix (fuzz seed 20261301, start 900612).
  '>:::b\n>+ >\n>\n>  ',
  '>:::b\n>+ >\n>\n> ',
  '>:::b\n>+ >\n>\n>   ',
  '>:::b\n>+ >\n>\n>  \n',
  '>:::b\n>+ >\n>\n>  \n>',
  '>:::b\n>+ >\n>\n>\n>  ',
  '>:::b\n>+ >\n>\n>  a',
  '>:::b\n>+ >\n>\n>  \n>:::',
  '>:::b\n>+ >\n>\n>  \n>+ c',
  '>:::b\n>+ >\n>  ',
  '>:::b\n>+ a\n>\n>  ',
  '>:::b\n>- >>\n>\n>  ',
  '>:::b\n>1. >\n>\n>   ',
  '>:::b\n>+ > a\n>\n>  ',
  '>:::b\n>+ >\n>  >\n>\n>  ',
  '>>:::b\n>>+ >\n>>\n>>  ',
  '>>>:::b\n>>>+ >\n>>>\n>>>  ',
  '>:::b\n>+ - >\n>\n>    ',
  '>:::b\n>+ :::c\n>  >\n>\n>  ',
  '>:::b\n>:::c\n>+ >\n>\n>  ',
  ':::b\n+ >\n\n  ',
  // The quote in the item ends at the blank line's start, and content in the
  // item follows: the item is spread (the replay of the first fuzz input).
  '>:::b\n>+ >\n>\n>   c',
  '>:::b\n>+ >\n>\n>\n>   c',
  '>:::b\n>+ >\n>\n>   - c',
  '>:::b\n>+ >\n>\n>   > c',
  '>>:::b\n>>+ >\n>>\n>>   c',
  '>:::b\n>>+ >\n>>\n>>   c',
  '>:::b\n>- >>\n>\n>   c',
  '>:::b\n>+ - >\n>\n>     c',
  '- >:::b\n  >+ >\n  >\n  >   c',
  // Other children that end at a line start do not make the item spread
  // (fuzz seed 20261302, before the rule was limited to quotes).
  '* - :::b\n\n  ]',
  '-\n  - ```\n\n  :::a',
  ':::a\n - - <!A\n\n\t**',
  '-\n  >:::c[]\n  - ~~~\n\n  ?',
  '+ :::a\r  :::\n  + ~~~\n\r  a',
  '2) 1. :::x[[]]\n\r   [',
  // A text directive label whose last line is a footnote definition's
  // indent, a whole tab (fuzz seed 20261302, start 360344).
  '[^1]::x[[[`]]\n\t]',
  '[^1]::x[`\n\t]',
  '[^1]::x[a`\n\t]',
  '[^1]::x[`\n\t\t]',
  '[^1]::x[`\n\t\n\t]',
  '[^1]:> :x[`\n\t>\t]',
  '> [^1]::x[`\n>\t]',
  '> :x[`\n>\t]',
  '> :x[a`\n>\t]',
  '>> :x[`\n>>\t]',
  // A directive in quotes inside a directive, on the empty last line of the
  // outer content (fuzz seed 20261301, start 295834).
  '>:::9\n>>>:::a{}\n>>>\n',
  '>:::9\n>>>:::a{}\n>>>',
  '>:::9\n>>:::a\n>>\n',
  '>:::9\n>>:::a\n>>',
  '>:::9\n>>:::a\n>> \n',
  '>:::9\n>>:::a\n>>  \n',
  '>:::9\n>>:::a\n>>\n>>\n',
  '>:::9\n>>:::a\n>>\n>\n',
  '>:::9\n>>:::a\n>>\nb',
  '>:::9\n>>:::a\n>> b\n>>\n',
  '>:::9\n>>:::a\n>>:::\n>>\n',
  '>:::9\n>:::a\n>\n',
  '>:::9\n>>>>:::a\n>>>>\n',
  '>>:::9\n>>>:::a\n>>>\n',
  '>:::9\n>>:::a\n>>>:::c\n>>>\n',
  '>:::9\n>>- :::a\n>>\n',
  '>:::9\n>- >:::a\n>  >\n',
  '>:::9\n>>:::a\n>>- b\n>>\n',
  '>>>:::a{}\n>>>\n',
  ':::9\n>>:::a\n>>\n',
];

describe('container directive ends in block quotes', () => {
  for (const gfm of [false, true]) {
    for (const value of cases) {
      it(`${JSON.stringify(value)}, gfm ${gfm}`, () => {
        const ref = parseReference(value, gfm, ['directive']);
        const talata = parseTalata(value, gfm, ['directive']);
        expect(describeDiff(firstDiff(ref, talata))).toBeUndefined();
      });
    }
  }
});
