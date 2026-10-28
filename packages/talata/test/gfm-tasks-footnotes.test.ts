import { describe, expect, it } from 'vitest';
import { parseReference, parseTalata } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// GFM task list items and footnotes, compared to the reference with
// positions, with and without GFM. Most cases came from fuzzing.

function check(markdown: string): void {
  for (const gfm of [false, true]) {
    const found = firstDiff(parseReference(markdown, gfm), parseTalata(markdown, gfm));
    expect(describeDiff(found), gfm ? 'with gfm' : 'without gfm').toBeUndefined();
  }
}

const groups: [string, string[]][] = [
  [
    'task list items',
    [
      '- [ ] a',
      '- [x] a',
      '- [X] a\n- [ ] b',
      '* [ ] a\n\n  b',
      '1. [x] a',
      '- [ ]',
      '- [ ] ',
      '- [ ]\n',
      '- [ ]\n  a',
      '- [ ]\r\n  a',
      '- [ ] \n  a',
      '- [ ]  \n  a',
      '- [ ]   \n  a',
      '- [ ]  \t\n  a',
      '- [ ]\t\n  a',
      '- [ ] *a*',
      '- [ ]  *a*',
      '- [ ] \\*a',
      '- [ ]\n  *a*',
      '- [ ]a',
      '- [y] a',
      '- [  ] a',
      '- [\n  ] a',
      '- [ \n  ] a',
      '- [\n  *x*',
      '* [\n  <t>',
      '- [\n  a',
      '- [\t] a',
      '-\t[\t] a',
      '1. [\t]\n===',
      '- [ ] a\n  ===',
      '- [a]: b\n  [ ] c',
      '- [a]: b\n\n  [ ] c',
      '- # h\n  [ ] a',
      '-\n  [ ] a',
      '- \n  [ ] a',
      '-\n   [ ] a',
      '- -\n  [ ] a',
      '- [ ] a\n  -\n  [ ] b',
      '- -\n  [a]: b\n  [ ] c',
      '- > [ ] a',
      '- - [x] a',
      '- [x] [a]\n\n[x]: /u',
      '- [ ] [^a]\n\n[^a]: b',
      '1) [ ] ~~[~~',
      '- [X] ~_~',
      '- [ ] ~a~ *b*',
      '- [ ] *b* ~a~',
      '- [ ] www.a.com',
      '- [ ] a@b.co x',
      'a [ ] b',
      '[ ] a',
    ],
  ],
  [
    'footnote definitions',
    [
      '[^a]: b',
      '[^a]:b',
      '[^a]:\tb',
      '[^a]:     b',
      '[^a]:',
      '[^a]:\n    b',
      '[^a]:\nb',
      '[^a]: b\nc',
      '[^a]: b\n\n    c',
      '[^a]: b\n\n  c',
      '[^a]: b\n    \nc',
      '   [^a]: b',
      '    [^a]: b',
      '[^]: b',
      '[^]:;',
      '[^a b]: c',
      '[^a\\]b]: c',
      '[^a\\\\]: c',
      '[^a&amp;b]: c',
      '[^a\nb]: c',
      'a\n[^b]: c',
      '[x]: y\n[^a]: /u',
      '> [^a]: b\n>\n> c',
      '> [^b]: <div>\n> c',
      '- [^b]: <div>\n  c',
      '[^a]: [^b]: c\n    d',
      '[^a]: [^b]: <div>\n    c',
      '[^a]: [^b]: <div>\n    [^c]: d',
      '[^a]: ```\n    b\n[^c]: d',
      '[^a]: ```\n',
      '[^a]: ```\n    ',
      '- [^a]: ```\n  > b',
      `[^${'a'.repeat(999)}]: b`,
      `[^${'a'.repeat(1000)}]: b`,
    ],
  ],
  [
    'lists in footnote definitions',
    [
      '[^1]:\n    - a\n    - b',
      '[^1]:\n    - a\n\n    - b',
      '[^1]: - a\n    - b',
      '[^1]: - a\n\n\n    - b',
      '[^1]: - a\n    > b',
      '[^1]: - a\n\n    > b',
      '[^1]: -\n\n    - b',
      '> [^1]: - a\n>     - b',
      '[^1]: > a\n    - b',
      '[^a]:> 1. b\n    >\n    c',
      '[^a]:> 1. b\n    >',
      '[^a]:> 1. b\n    >\n    >   c',
      '+ [^1]:\n      a',
      '+ [^1]:\n\n      a',
      '+ [^1]:\n+ b',
      '+ [^1]:\n      a\n+ b',
      '+ [^1]: a\n\n      b',
      '+ [^1]: a\n\n+ b',
      '+ > [^1]:\n  >     a',
      '+ [^1]: [^2]:\n          a',
      '>+ [^1]:\n>',
      '>+ [^1]:\n>\n',
      '>+ [^1]:\n>[^a]:',
    ],
  ],
  [
    'footnote calls',
    [
      'a[^1]\n\n[^1]: b',
      '[^1]\n\n[^1]: b',
      'a[^nope]',
      'a[^1](u)\n\n[^1]: b',
      'a[^2](u)\n\n[^1]: b',
      'a[^1][]\n\n[^1]: b',
      'a[^1] [^1]\n\n[^1]: b',
      'a[^A]\n\n[^a]: b',
      'a[^a b]\n\n[^a]: b',
      'a[^a\\]b]\n\n[^a\\]b]: c',
      'a[^a&amp;b]\n\n[^a&amp;b]: c',
      'a![^1]\n\n[^1]: b',
      'a![ ^1]\n\n[^1]: b',
      'a![^1](u)\n\n[^1]: b',
      'a![^1](\n\n[^1]: b',
      '[^1]:![\n^1]',
      '[^1]: b\n\na![\n^1]',
      '[^1]: b\n\n> a![\n> ^1]',
      '[^1]: b\n\na![\r\n^1]',
      '[^n]: x\n\n![\n ^n]',
      '[^n]: x\n\n![\n    ^n]',
      '[^n]: x\n\n![\n\t^n]',
      '[^n]: x\n\n> ![\n>  ^n]',
      '[^n]: x\n\n- ![\n   ^n]',
      'a![^1][x]\n\n[^1]: b\n[x]: u',
      'a![^*1*]\n\n[^*1*]: b',
      '[x [^1]](u)\n\n[^1]: b',
      '[[^1]]\n\n[^1]: b',
      'a[^1]~b~\n\n[^1]: b',
      '~a[^1]~\n\n[^1]: b',
      'www.a.com[^1]\n\n[^1]: b',
      '[^1]www.a.com\n\n[^1]: b',
      'a@b.co[^1]\n\n[^1]: b',
      '[^www.a.com]\n\n[^www.a.com]: b',
      'a[^big note]\n\n[^big note]: b',
      'a[^big note]\n\n[ ^big note]: b',
    ],
  ],
];

for (const [name, inputs] of groups) {
  describe(name, () => {
    for (const input of inputs) {
      it(JSON.stringify(input), () => {
        check(input);
      });
    }
  });
}

// Known difference: after a list item whose marker line is empty, the
// reference runs the task check on a lazy paragraph outside any list item
// and sets `checked` on its parent (the root or a block quote).
describe('task check outside list items', () => {
  for (const input of ['-\n[ ] a', '> -\n> [ ] a']) {
    it.fails(JSON.stringify(input), () => {
      check(input);
    });
  }
});
