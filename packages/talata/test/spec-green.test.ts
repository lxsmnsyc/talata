import { describe, expect, it } from 'vitest';
import { parseReference, parseTalata } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// Differences between finished rules found by spec-green, mostly by the
// differential fuzzer. Each input is compared to the reference with
// positions, with and without GFM.

function check(markdown: string): void {
  for (const gfm of [false, true]) {
    const found = firstDiff(parseReference(markdown, gfm), parseTalata(markdown, gfm));
    expect(describeDiff(found), gfm ? 'with gfm' : 'without gfm').toBeUndefined();
  }
}

const groups: [string, string[]][] = [
  [
    // micromark sets its interrupt flag while indented code is open, so list
    // starts are restricted as after a paragraph (BlockState.tip).
    'list starts after indented code',
    [
      '    a\n2. b',
      '    a\n\n2. b',
      '    a\n\n\n2. b',
      '    a\n  \n2. b',
      '    a\n-\n',
      '    a\n- -\n',
      '    a\n> 2. b',
      '    a\n> -\n',
      '    (\n3.',
      '\ta\r*',
      '    a\n1. b',
      '    a\n<x>\n',
      '    a\n# b\n2. c',
      '>     a\n> 2. c',
      '>     a\n2. c',
      '- a\n\n      b\n  2. c',
    ],
  ],
  [
    // Indented code that starts on a line an open container did not match
    // ends with that line.
    'indented code on a lazy line',
    [
      '>\n    a\n    b',
      '>\n    a\n    \n    b',
      '>\n    a\n    \n',
      '>\n    a\n     ',
      '>\n    a\n\n    b\n    ',
      ' 1)  ___\n    o\n    ',
      '-\n\n    -\n    ',
      '> >\n>     a\n>     b',
      '> - a\n\n      b\n>     c',
      '- a\n\n    a\n    ',
      '>\n    a\n3.',
      '>\n    a\n3. b',
      '>\n    a\n- b',
      '  2.\n    -\n3.',
    ],
  ],
  [
    // Kind 7 HTML that interrupts a lazy paragraph stays in the containers,
    // which continue on later lines.
    'kind 7 HTML on a lazy line',
    [
      '> a\n<x>\n',
      '- a\n<x>\n',
      '> a\n<x>\n> c\n',
      '> a\n<x>\n- c\n',
      '- a\n<x>\n  c\nd',
      '> a\n<x>\n\n> c\n',
      '> - a\n<x>\n> b',
      '> a\n</x>\n> c',
      '> a\n<x>\n>\n> c',
      '> a\n<x>',
      '> a\n<x>\r\n> c',
      '> > a\n> <x>\n> > c\n> d',
      '> > a\n<x>\n> > c\n> d',
      '> a\n  <x>\n> c',
      '>;\n<e>\r',
      '* )\r<a f="">\n',
      '> a\n<x>\n>',
      '> a\n<x>\n> ',
      '- a\n<x>\n  - b',
      '> a\n<div>\n> c',
    ],
  ],
  [
    // An item or quote whose last child kept its line ending ends at the
    // event that closes it.
    'container end after a kept line ending',
    [
      '- ```\n  a\n- b',
      '- ```\n- b',
      '- - ```\n    a\n  - b',
      '- - ```\n    a\n- b',
      '- ```\n ',
      '- ```\n  ',
      '- <!A\n ',
      '- <?\n ',
      '- ```\n  a\n> b',
      '- - ```\n      a\n  > b',
      '> - ```\n>   a\n> > b',
      '> - ```\n>   a\n> - b',
      '> - - ```\n>     a\n> - b',
      '- ```\n  a\n\n- b',
      '- ```\n  a\n-   b',
      '- ```\n  a\n-\tb',
      '- ```\n  a\n-',
      '- ```\n- ```\n- b',
      '1. ```\n2. b',
      '- ```\r\n  a\r\n- b',
      '> - ```\n> ',
      '- > ```\n- b',
      '-\t```\r\t',
      '* ><pre\n  -',
      '+ ><!A\n  *',
      '+ + >~~~\r  >',
    ],
  ],
  [
    // A quote that matched the last line only through the end-of-file rule:
    // leaves inside end before that line.
    'leaf before a last line matched at the end of file',
    [
      '> > ```\n> > a\n>',
      '> > <!--\n> > a\n>',
      '> - ```\n>   a\n>',
      '> > > ```\n> > > a\n> >',
      '> > > ```\n> > > a\n>',
      '> > - ```\n> >   a\n>',
      '> ```\n> a\n>',
      '> > ```\n> > a\n> ',
      '> > ```\n>',
    ],
  ],
  [
    // The reference strips one line ending from each end of the buffered
    // value, so a CR and an LF from two lines go together.
    'fenced code line endings',
    [
      ' ~~~\r \n_',
      ' ~~~\n \n_',
      ' ~~~\r \r_',
      '~~~\r\r\n_',
      ' ~~~\r\r\n_',
      '~~~\n\r_',
      ' ~~~\na\r \n ~~~',
      ' ~~~\na\r \n',
      '```\na\n\n',
      '```\r\n\r\n',
      '```\r\r\n```',
      '```\na\r\r',
    ],
  ],
  [
    // A run that ended before a NUL and lost markers from its end keeps the
    // whole run as its value in the reference.
    'emphasis next to NUL',
    [
      '**\u0000*',
      '***\u0000*',
      '**\u0000a*',
      'x **\u0000*',
      '__\u0000_',
      '***\u0000**',
      '**\u0000\u0000*',
      '**�*',
      '*\u0000**',
      '**\u0000**',
    ],
  ],
  [
    // Split-tab columns after a container prefix are micromark's virtual
    // spaces: data, not padding, in a code span.
    'code span padding with split tabs',
    [
      '>` ````\n>\t  ````',
      '>` \n>\t`',
      '>` \n>\t `',
      '>`` \n>\t``',
      '- ` \n \t `',
      '-\t` \n \t `',
      '>` \n>\t\t `',
      '>`\n>\t`',
      '>`\n>\t `',
    ],
  ],
  [
    'empty titles',
    [
      '[](i "")',
      '[a](i "")',
      '![](i "")',
      "[a](i '')",
      '[a](i ())',
      '[a]\n\n[a]: i ""',
      '[x](<> "")',
      '[a](i "t")[](j "")',
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
