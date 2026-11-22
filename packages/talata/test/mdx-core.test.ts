import { gfmFromMarkdown } from 'mdast-util-gfm';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { describe, expect, it } from 'vitest';
import type { Extension } from '../src/ext/api';
import { fromMarkdown } from '../src/index';
import { describeDiff, firstDiff } from './tree-diff';

// Extension contract v4: `Extension.disable` turns off core rules by name, as
// micromark's `disable.null` does. The reference is `mdast-util-from-markdown`
// with a syntax extension that has the same `disable` list.

type Disabled = 'codeIndented' | 'htmlFlow' | 'htmlText' | 'autolink';

const toTalata: Record<Disabled, { block?: string[]; inline?: string[] }> = {
  codeIndented: { block: ['codeIndented'] },
  htmlFlow: { block: ['html'] },
  htmlText: { inline: ['html'] },
  autolink: { inline: ['autolink'] },
};

function talataExtension(list: Disabled[]): Extension {
  const block: string[] = [];
  const inline: string[] = [];
  for (const name of list) {
    block.push(...(toTalata[name].block ?? []));
    inline.push(...(toTalata[name].inline ?? []));
  }
  return { name: 'talata:test-disable', disable: { block, inline } };
}

function compare(input: string, list: Disabled[], useGfm: boolean): string | undefined {
  const actual = fromMarkdown(input, { gfm: useGfm, extensions: [talataExtension(list)] });
  const expected = reference(input, {
    extensions: [...(useGfm ? [gfm()] : []), { disable: { null: list } }],
    mdastExtensions: useGfm ? [gfmFromMarkdown()] : [],
  });
  const diff = firstDiff(actual, expected);
  return diff === undefined ? undefined : describeDiff(diff);
}

const inputs = [
  // Indented lines after a paragraph, and on their own.
  'a\n    b',
  'a\n\n    b',
  '    a',
  '    a\n    b\n\n    c',
  '  a\n    b\n      c',
  'a\n    # b',
  'a\n    ---',
  'a\n    ===',
  'a\n    - b',
  'a\n    1. b',
  'a\n    > b',
  'a\n    ```\n    b',
  '    ```\n    a\n    ```',
  '\ta\n\tb',
  'a\n\tb',
  'a\n\n\tb',
  '    [a]: b\n\n[a]',
  'a\n    [b]: c',
  '[a]: b\n    "c"',
  '    | a |\n    | - |',
  '| a |\n| - |\n    b',
  // Lists and quotes.
  '- a\n    b',
  '- a\n\n    b',
  '- a\n      b',
  '- a\n\n      b',
  '1. a\n    b',
  '1. a\n\n    b',
  '-\n    a',
  '-     a',
  '-     a\n      b',
  '- a\n  - b\n      c',
  '> a\n    b',
  '> a\n>     b',
  '>     a',
  '>     a\n>     b',
  '> a\n\n    b',
  '> - a\n>     b',
  '- > a\n      b',
  '- > a\n  >     b',
  '- a\n    - b',
  '- a\n     - b',
  '    - a',
  '    > a',
  '* a\n\n    * b\n\n        c',
  // HTML.
  '<div>\n',
  '<div>a</div>',
  '<div>\na\n</div>\n\nb',
  '<div>\n\nb',
  'a\n<div>\nb',
  'a\n<a>\nb',
  '<a>b</a>',
  '<a href="b">c</a>',
  '<a>\nb',
  '    <div>',
  'a\n    <div>',
  '> <div>\n> a',
  '- <div>\n  a',
  '<!-- a -->',
  'a <!-- b --> c',
  'a <b> c </b> d',
  'a <b\nc> d',
  '<?a?>\n',
  'a <?b?> c',
  '<![CDATA[a]]>\n',
  'a <![CDATA[b]]> c',
  '<!a>\n',
  'a <!b> c',
  '<pre>\na\n</pre>',
  '<script>\na\n</script>',
  '<br/>\nb',
  // Autolinks.
  '<https://x>',
  'a <https://x> b',
  '<a@b.c>',
  'a <a@b.c> b',
  '<https://x>\n<a>',
  '[a](<b>)',
  '[<https://x>](y)',
  '<https://x>y',
  '*<https://x>*',
  '`<https://x>`',
  '[a]: <https://x>',
  'https://x',
  'www.x.com a@b.c',
  '<div>\n<https://x>',
  // Other constructs that no longer stop at 4 columns.
  '```\na\n    ```\nb',
  '```\na\n    ```',
  '~~~\na\n     ~~~\n',
  '    ***\n    ---',
  'a\n\n       - b\n       - c',
  '- a\n\n        - b',
  '1. a\n        2. b',
  '> a\n>\n>     # b',
  '          # a #',
  'a\n       b\n--',
  '| a |\n    | - |\n    | b |',
  '| a |\n| - |\n    | b |',
  'a\n    | - |',
  '[^a]: b\n\n        c\n\n[^a]',
  '[^a]:\n        b',
  '        [^a]: b',
  '<div>\n    a\n</div>',
  '- a\n     - b\n          - c',
  '1.      a\n        b',
  // Whitespace after a list marker and after a line ending in an inline tag.
  '-      a\n\n    b',
  '-      a\n\n  b',
  '1.      a\n\n    b',
  '-\t\ta\n\n    b',
  '-     a\n\n    b',
  'a <b\n    c> d',
  'a <b\n        c> d',
  'a <b\n   c> d',
  '<a\n     href="x">',
  '- a <b\n      c> d',
  // Mixes.
  '    <div>\n<a>b</a>\n\n    <https://x>',
  'a\n    <div>\n    <https://x>\n    b',
  '- <a>\n      b\n  <https://x>',
  '> <a>\n>     b\n> <https://x>',
];

const lists: Disabled[][] = [
  ['codeIndented'],
  ['htmlFlow'],
  ['htmlText'],
  ['autolink'],
  ['htmlFlow', 'htmlText'],
  ['codeIndented', 'htmlFlow'],
  ['codeIndented', 'autolink'],
  ['autolink', 'codeIndented', 'htmlFlow', 'htmlText'],
];

describe('extension disable (contract v4)', () => {
  for (const useGfm of [false, true]) {
    for (const list of lists) {
      it(`${list.join('+')} matches the reference, gfm ${useGfm}`, () => {
        const failures: string[] = [];
        for (const input of inputs) {
          const diff = compare(input, list, useGfm);
          if (diff !== undefined) {
            failures.push(`${JSON.stringify(input)}: ${diff}`);
          }
        }
        expect(failures).toEqual([]);
      });
    }
  }

  it('changes nothing without a disable list', () => {
    for (const input of inputs) {
      const plain = fromMarkdown(input);
      const empty = fromMarkdown(input, {
        extensions: [{ name: 'talata:test-empty', disable: {} }],
      });
      expect(empty).toEqual(plain);
    }
  });

  it('ignores names that match no rule', () => {
    const extension: Extension = {
      name: 'talata:test-unknown',
      disable: { block: ['nothing'], inline: ['codeIndented'] },
    };
    expect(fromMarkdown('    a\n', { extensions: [extension] })).toEqual(fromMarkdown('    a\n'));
  });

  it('applies a disable list to the rules of other extensions', () => {
    const rule: Extension = {
      name: 'talata:test-rule',
      blockRules: [
        {
          name: 'testRule',
          priority: 10,
          canInterruptParagraph: false,
          start: () => undefined,
        },
      ],
    };
    const off: Extension = { name: 'talata:test-off', disable: { block: ['testRule'] } };
    expect(fromMarkdown('a\n', { extensions: [rule, off] }).children).toHaveLength(1);
  });
});
