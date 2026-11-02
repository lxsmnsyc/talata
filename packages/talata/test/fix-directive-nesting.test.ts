import { describe, expect, it } from 'vitest';
import generateInputs from './fix-directive-nesting-inputs';
import { parseReference, parseTalata } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// Container directives nested in quotes, list items, footnote definitions
// and other directives, up to 4 deep. Compared to the reference with
// positions, with and without GFM.

const cases = [
  // A quote in a footnote definition in an item ends at the start of a blank
  // line, and the definition goes on: the item is spread (review of f5ea091).
  '> :::b\n> + [^1]: >\n> \n>  ',
  '> :::b\n> + [^1]: >\n> \n> ',
  '> :::b\n> + [^1]: >\n> \n>   c',
  '> :::b\n> + [^1]: >\n> \n>      c',
  '> :::b\n> + [^1]: > a\n> \n>  ',
  '> :::b\n> + [^1]: >\n> \n> :::',
  '> :::b\n> + [^1]: >\n> \n>  \n> :::',
  '> :::b\n> + >\n> \n>  ',
  '[^1]: :::b\n    >+ >\n    >\n    >   ',
  '[^1]: >:::b\n    >+ > a\n    > \n    >   ',
  '[^1]: :::b\n    > 1. >\n    >    \n    >     ',
  '[^1]: :::b\n    :::c\n    + >\n      c\n    c',
  // Directives in nested footnote definitions in an item.
  '1. [^1]: [^1]: :::b\n           >>\n           c\n\n',
  '+ [^1]: [^1]: :::b\n          \n      ',
  '1. [^1]: [^1]: :::b\n           a\n            \n',
  '+ [^1]: [^1]: :::b\n          >\n       \n          \n',
  // A quote in a directive in an item in a quoted directive, before the
  // outer closing fence (review of f5ea091).
  '> :::b\n> + :::c\n>   >\n> \n> :::',
  '> :::b\n> + :::c\n>   > a\n> \n> :::',
  '> :::b\n> + :::c\n>   >\n>\n> :::',
  '> :::b\n> + :::c\n>   >\n>   \n> :::',
  '> :::b\n> + :::c\n>   + >\n> \n> :::',
  '> :::b\n> + [^1]: :::c\n>       >\n> \n> :::',
  '> :::b\n> + :::c\n>   >\n> \n> x',
  '> :::b\n> + :::c\n>   >\n> \n',
  '> :::b\n> + :::c\n>   >\n> \n>   x',
  '> :::b\n> - :::c\n>   >\n> \n>   :::',
  '> :::b\n> :::c\n> >\n> \n> :::',
  '> :::b\n> > :::c\n> > >\n> >\n> :::',
  ':::b\n+ :::c\n  >\n\n:::',
  ':::b\n+ :::c\n  :::d\n  \n\n:::',
  // An empty item in a directive, after a footnote indent further out.
  '[^1]: :::b\n    :::c\n    1. \n    c',
  '[^1]: :::b\n    :::c\n    1. \n    c\n\n',
  '[^1]: 1. :::b\n       1. \n       c',
  '[^1]: + :::b\n      + \n      c\n ',
  '[^1]: :::b\n    :::c\n    1. a\n    \n    c',
  '[^1]: > :::b\n    > >\n    > >+ c\n    >   ',
  '[^1]: > :::b\n    > >\n    > >+ c\n    >\n    > >:::',
  // Nested quotes in a directive in a footnote definition, before a final
  // line ending.
  '[^1]: :::b\n    > >\n    >\n',
  '[^1]: :::b\n    > >>\n    >\n',
  '[^1]: :::b\n    > :::c\n    > \n    >\n',
  ':::b\n[^1]: :::c\n    >>>\n    >\n',
  '> [^1]: :::b\n>     > >\n>     >\n',
  // A line blank only inside a quote in the directive.
  '> :::b\n> >+ >\n> >\n> >c\n',
  '> :::b\n> >+ >>\n> >\n> >c\n',
  '> :::b\n> >+ > a\n> > \n> >   \n',
  '> :::b\n> + > + >\n>   >\n> c\n>   >>\n',
  '> :::b\n>[^1]: > + >\n>    >  \n>  \n>      ',
  // A container that starts outside the outer directive.
  '1. :::b\n   > :::c\n   > + >\n   >\n+ c\n',
  '1. :::b\n   > :::c\n   > + >\n   >\n> c',
  '1. :::b\n   > :::c\n   > + >\n   >\n1. c',
  '1. :::b\n   > :::c\n   > + a\n   >\n+ c\n',
  '1. :::b\n   > :::c\n   > >\n   >\n+ c\n',
  '> :::b\n> > :::c\n> > + >\n> >\n- c',
  '1. :::b\n   > :::c\n   > + >\n   >\n   + c',
  '1. :::b\n   > :::c\n   > + >\n   >\nc\n',
  ':::b\n> :::c\n> + >\n>\n+ c\n',
  '>:::b\n>:::c\n>+ >\n>\n>\n+ c',
  // Tabs in the prefixes inside the directive (review of 61682e5).
  '> :::b\n> -\t>1) >\n> \t>\n>c',
  '> :::b\n> - >1) >\n>  \t>\n>c',
  '> :::b\n> - >1) >\n>   >\n>c',
  // An item in a quote in a footnote definition, whose directive keeps its
  // final line ending before a container that starts (review of 61682e5).
  '[^1]: > :::b\n    > * :::c\n    > \n> lazy',
  '[^1]: > :::b\n    > * :::c\n    > \n- x',
  '[^1]: > :::b\n    > * :::c\n    > \n[^2]: x',
  '[^1]: > :::b\n    > * :::c\n    > \n',
  '[^1]: > :::b\n    > - :::c\n    > \n> lazy',
  '- > :::b\n  > * :::c\n  > \n> lazy',
  // Footnote definitions that follow the indent of the one around.
  '[^1]: [^1]: [^1]: :::b\n            - a\n\n    c\n',
  '[^1]: [^1]: [^1]: :::b\n    \t    - :x[a] b\n\n    c\n',
  '[^1]: [^1]: [^1]: :::b\n            :::c\n            ```\n            b\n\n    ```\n            ```\n',
  // Open fenced code in a footnote definition holds the blank lines after it.
  '[^1]: - :::b\n      [^1]: ```\n\n      c',
  '[^1]: - :::b\n      :::c\n      [^1]: ```\n\n      c',
  '[^1]: -   :::b\n         :::c\n        [^1]: ```\n\n        | b |',
  '- :::b\n  [^1]: ```\n\n  c',
  '- :::b\n  ```\n\n  :::',
  // A directive in a footnote definition holds the blank lines after it.
  '+ [^1]: :::b\n      [^1]: :::c\n          + >\n\n      x',
  '+ [^1]: :::b\n      [^1]: :::c\n          a\n\n      x',
  '+ [^1]: :::b\n    \t[^1]: :::c\n    \t    + >\n\n    \t```',
  // A blank line inside a quote that continues does not end the items in it.
  '> :::b\n> [^1]: > - + >\n>       >\n> \n>       > x',
  '> :::b\n> [^1]: > - + a\n>       >\n> \n>       > x',
  ' > ::::b\n > [^1]:  > -  + >\n >      >    \t\n >     \t\n >      > ```',
];

describe('container directives in deep nesting', () => {
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

// Generated inputs (`fix-directive-nesting-inputs.ts`): every shape of 1 to
// 5 containers with a directive, 6 inputs each. Larger runs:
// `node test/fix-directive-nesting-run.ts --seed N`.
const generated = generateInputs(1, 5, 6);
const PARTS = 4;

describe('generated deep nesting', () => {
  it('has at least 5,000 inputs', () => {
    expect(generated.length).toBeGreaterThanOrEqual(5000);
  });
  // In parts, so a loaded machine stays under the test timeout.
  const size = Math.ceil(generated.length / PARTS);
  for (const gfm of [false, true]) {
    for (let part = 0; part < PARTS; part++) {
      addPartTest(gfm, part, generated.slice(part * size, (part + 1) * size));
    }
  }
});

function addPartTest(gfm: boolean, part: number, inputs: string[]): void {
  it(`matches the reference, part ${part + 1} of ${PARTS}, gfm ${gfm}`, () => {
    const failures: string[] = [];
    for (const value of inputs) {
      const found = describeDiff(
        firstDiff(
          parseReference(value, gfm, ['directive']),
          parseTalata(value, gfm, ['directive']),
        ),
      );
      // Inputs that differ without the extension too are core bugs.
      if (
        found !== undefined &&
        describeDiff(firstDiff(parseReference(value, gfm), parseTalata(value, gfm))) === undefined
      ) {
        failures.push(`${JSON.stringify(value)}: ${found}`);
      }
    }
    expect(failures).toEqual([]);
  });
}
