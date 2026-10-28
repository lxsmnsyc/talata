import { describe, expect, it } from 'vitest';
import { parseReference, parseTalata } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// GFM tables compared to the reference with positions, with GFM on. Without
// GFM the same inputs must stay paragraphs, so they are checked both ways.

function check(markdown: string): void {
  for (const gfm of [true, false]) {
    const found = firstDiff(parseReference(markdown, gfm), parseTalata(markdown, gfm));
    expect(describeDiff(found), gfm ? 'with gfm' : 'without gfm').toBeUndefined();
  }
}

const groups: [string, string[]][] = [
  [
    'header and delimiter rows',
    [
      '| a | b |\n| - | - |',
      'a | b\n- | -',
      'a|b\n-|-',
      '| a |\n|---|',
      '|a|\n|-|',
      'a\n:-',
      'a\n-:',
      'a\n|-',
      'a\n-|',
      '|\n|-|',
      '||\n|-|',
      '| |\n|-|',
      '|||\n|-|-|',
      'a||b\n-|-|-',
      '\\|\n|-|',
      'a\\|b\n-|-',
      'a\\\\|b\n-|-',
      'a | b\n---',
      'a | b\n- - -',
      'a | b\n-|-|-',
      'a\n:',
      'a\n|:|',
      'a\n| - |  |',
      'a\n|- -|',
      'a\n| :-: |',
      'a | b | c\n:- | :-: | -:',
      'a | b\n:--|--:   ',
      'a\n   |-|',
      'a\n    |-|',
      'a\n\t|-|',
      '   a|b\n-|-',
      'a\n  b|c\n -|-',
      'a\n    b|c\n-|-',
      'a\n   b|c\n-|-',
      'a\n \tb|c\n-|-',
      'a\n\tb|c\n-|-',
      'x\na|b\n-|-\nc',
      '| a |  b  |\n|:-|-:|\n|  c | d \\\\| e |  \n f\n\nx',
    ],
  ],
  [
    'body rows',
    [
      'a|b\n-|-\nc|d|e|f\n|',
      'a|b\n-|-\nc',
      'a|b\n-|-\n|c',
      'a|b\n-|-\nc|',
      'a|b\n-|-\n| |',
      'a|b\n-|-\n|||',
      'a|b\n-|-\n| c | | d |',
      'a|b\n-|-\n  c  |  d  ',
      'a|b\n-|-\n\nc|d',
      'a|b\n-|-\n   \nc',
      'a|b\n-|-\n# c',
      'a|b\n-|-\n> c',
      'a|b\n-|-\n- c',
      'a|b\n-|-\n2. c',
      'a|b\n-|-\n-',
      'a|b\n-|-\n***',
      'a|b\n-|-\n---',
      'a|b\n-|-\n===',
      'a|b\n-|-\n```\nc',
      'a|b\n-|-\n    c',
      'a|b\n-|-\n<div>',
      'a|b\n-|-\n<x>',
      'a|b\n-|-\n[a]: /u',
      'a|b\n-|-\nc|d\n-|-',
      'a|b\n-|-\nc\nd|e\n-|-',
      'a|b\n-|-\r\nc|d\r\n',
      'a|b\r-|-\rc\r',
    ],
  ],
  [
    'cell content',
    [
      'a|b\n-|-\n*c|d*',
      'a|b\n-|-\n`c|d`',
      'a|b\n-|-\n`c\\|d`',
      'a|b\n-|-\n`c\\\\|d`',
      'a|b\n-|-\n`c\\\\\\|d`',
      '`a\\|b` | *`\\|`*\n-|-',
      '[`\\|`](u) | b\n-|-',
      'a|b\n-|-\n\\| \\\\ \\a',
      'a|b\n-|-\n[c](d) | ![e](f)',
      'a|b\n-|-\n[c\n',
      'a|b\n-|-\nc  |  d\\',
      'a|b\n-|-\n<b>c</b> | &amp;',
      'a|b\n-|-\nc\t|\td',
      '[x]: /u\n\na|[x]\n-|-\n[x]|b',
    ],
  ],
  [
    'paragraphs and definitions before the header',
    [
      '[a]: /u\na|b\n-|-',
      '[a]: /u\n:-',
      '[a]: /u\n"t"\na|b\n-|-',
      'a\nb\nc|d\n-|-',
      'a\n<n>\n|-',
      'a\n<n> \n|-|\nb',
      'a\n</n>\n|-',
      '[a]: /u\n<n>\n|-',
      '> a\n> <n>\n> |-',
      '>a\n>\t<n>\n>|-',
      '>a\n>\t <n>\n>|-',
      '- a\n \t<n>\n  |-',
      'a\n<div>\n|-',
    ],
  ],
  [
    'containers',
    [
      '> a|b\n> -|-\n> c',
      '> a|b\n> -|-\nc',
      '> a|b\n-|-',
      '> a\nb|c\n> -|-',
      '>a\n>\tb|c\n>-|-',
      '>F\n>\t日\n>-|',
      '>]\n>\t[|&\n>-|-',
      '- a|b\n  -|-\n  c',
      '- a|b\n  -|-\nc',
      '- a|b\n-|-',
      '- a|b\n  -|-\n- c|d\n  -|-',
      '1. a|b\n   -|-\n\n   c',
      '- a\n  b|c\n  -|-\n',
      'a|b\n- | -',
      'a|b\n> -|-',
      '> > a|b\n> > -|-\n> c',
      '>>;||\n>>-|-\n>o|||\n>-|-|-',
      '>r\n>-|\na||\n-|-',
      '>r\n>-|\na\nb|\n-|',
      '> a|b\n> -|-\n> c\n>',
      '> a|b\n> -|-\n>',
      '- a|b\n  -|-\n\n  c',
      '* a|b\n -|-',
      '-\ta|b\n \t-|-',
      '> | a |\n> |---|\n> | b |\n\nc',
    ],
  ],
];

describe('gfm tables: node types', () => {
  it('builds a table only with GFM', () => {
    expect(parseTalata('a|b\n-|-\nc', true).children[0].type).toBe('table');
    expect(parseTalata('a|b\n-|-\nc', false).children[0].type).toBe('paragraph');
  });
});

describe.each(groups)('gfm tables: %s', (_name, inputs) => {
  for (const input of inputs) {
    it(JSON.stringify(input), () => {
      check(input);
    });
  }
});
