import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src';
import { workSteps } from '../src/inline/lines';
import { parseReference } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

// GFM strikethrough and literal autolinks compared to the reference parser
// with GFM, positions included.

function compare(markdown: string): string | undefined {
  return describeDiff(
    firstDiff(parseReference(markdown, true), fromMarkdown(markdown, { gfm: true })),
  );
}

const strikethroughCases = [
  '~a~',
  '~~a~~',
  '~~~a~~~',
  '~~a~',
  '~a~~',
  'a~~b~~c',
  '~~ a~~',
  '~~a ~~',
  '\\~~a~',
  '\\~~~a~~',
  '~~a\nb~~',
  '> ~~a\n> b~~',
  '![~~a~~](b)',
  '~~[a~~](b)',
  '[~~a](b)~~',
  '~~a [b](c) d~~',
  '~~a ~b~ c~~',
  '~a ~~b~ c~~',
  '*~~a~~*',
  '~~*a*~~',
  '**a ~~b** c~~',
  // The resolve order follows the first `~` or `*`/`_` run of the leaf.
  '~~a *b~~ c*',
  '*a ~~b* c~~',
  'x *y* ~~a *b~~ c*',
  'x ~y~ *a ~~b* c~~',
  '[x](y) ~~a *b~~ c*',
  '[*a*](u) ~~b *c~~ d*',
  '~~~ *a ~~b* c~~',
  '_x ~a *b~ c* d_',
  // Inside links, strikethrough always resolves first.
  '[~~a *b~~ c*](u)',
  '[*a ~~b* c~~](u)',
  '~x~ [*a ~~b* c~~](u)',
  '*a ~~b~~ c*',
  '*a ~~b *c~~ d*',
  '_**a****b*_ ~~c~~',
  '~~a~~ _**a****b*_',
  '# ~~a~~',
];

const autolinkCases = [
  'www.a.b',
  'a www.a.b c',
  'www.',
  'www.\nx',
  'x www.\ny',
  '# www.',
  'WWW.a.b',
  'wwww.a.b',
  'xwww.a.b',
  'a.www.b.c',
  'a-www.b.c',
  'a*www.b.c',
  'a_www.b.c',
  '*a*www.b.c',
  '(www.a.b)',
  'x(www.a.b)',
  '"www.a.b"',
  'www.a_b.c',
  'www.a.b_c',
  'www.a_.b',
  'www.a.b.',
  'www.a.b/(c)).',
  'www.a.b/(c',
  'www.a.b/&amp;x',
  'www.a.b/&amp;',
  'www.a.b/&amp',
  'www.a.b/]',
  'www.a.b/](x',
  'www.a.b/]x',
  'www.a.b/<x',
  'www.a.b/*c*',
  'www.a.b?c=d!',
  'www.點看.com',
  '~~www.a.b~~',
  '*www.a.b*',
  'www.a.b\n',
  'www.a.b  \nc',
  'a\nwww.b.c',
  'a\n   www.b.c',
  '> a\n> www.b.c',
  '- a\n  www.b.c',
  'http://a.b',
  'https://a.b/c',
  'Http://A.b',
  'HTTPS://a.b',
  'http://localhost/x',
  'http://a.b.\nc',
  'http://',
  'http://-a.b',
  'http:// a',
  '1http://a.b',
  'xhttp://a.b',
  'h_ttp://a.b',
  'httpx://a.b',
  'a@b.c',
  'x a@b.c',
  'a@b.c\nd',
  'a@b.c1',
  'a@b.c-',
  'a@b',
  'a@b.c.',
  'a.b+c@d.e',
  '_a@b.c',
  '_a@b.c_',
  'a_b@c.d',
  '/a@b.c',
  '/a-b@c.d',
  'a@b.c+d@e.f',
  'a@b@c.d',
  '\\.a@b.c',
  '\\\\.a@b.c',
  '\\_a@b.c',
  '&amp;a@b.c',
  'www.a@b.c',
  '_www.a@b.c',
  'a.www@b.c',
  '<\\+@b.c',
  '<\\\\+@b.c',
  // An open bracket stops the tokenizer; the transform finds them, without positions.
  '[www.',
  '[www.a.b',
  '[a b@c.d',
  '[a@b.c+d@e.f',
  '[a [b](c) www.d.e',
  '[a www.b.c](u) www.d.e',
  '[x]www.a.b',
  '[a] a@b.c',
  '![a www.b.c',
  '[x]: /u\n\n[www.a.b]',
  '[x]: /u\n\n[x] www.a.b',
  '`www.a.b`',
  '<http://a.b>',
  '[a](www.b.c)',
  '[a](www.b.c d e)',
  'a 😀www.b.c',
  '😀a@b.c',
];

describe('GFM strikethrough', () => {
  for (const markdown of strikethroughCases) {
    it(JSON.stringify(markdown), () => {
      expect(compare(markdown)).toBeUndefined();
    });
  }
});

describe('GFM literal autolinks', () => {
  for (const markdown of autolinkCases) {
    it(JSON.stringify(markdown), () => {
      expect(compare(markdown)).toBeUndefined();
    });
  }
});

// Pathological inputs must need about linear work, as in inline.test.ts.
function steps(markdown: string): number {
  workSteps.count = 0;
  fromMarkdown(markdown, { gfm: true });
  return workSteps.count;
}

const growthCases: [string, (size: number) => string][] = [
  ['`~a~ `', (size) => '~a~ '.repeat(size / 4)],
  ['`a~ `', (size) => 'a~ '.repeat(size / 3)],
  ['`~a `', (size) => '~a '.repeat(size / 3)],
  ['`~~a ~b `', (size) => '~~a ~b '.repeat(size / 7)],
  ['`~~a *b~~ c* `', (size) => '~~a *b~~ c* '.repeat(size / 12)],
  ['`* a ~` after `~`', (size) => '~ ' + '* a ~'.repeat(size / 5)],
  ['dots after `www.a`', (size) => 'www.a' + '.'.repeat(size) + 'x'],
  ['`)` after a path', (size) => 'www.a.b/' + ')'.repeat(size) + 'x'],
  ['`www._`', (size) => 'www._'.repeat(size / 5)],
  ['`www._` after `[`', (size) => '[' + 'www._'.repeat(size / 5)],
  ['`www.` then `a_` after `[`', (size) => '[' + 'www.'.repeat(size / 8) + 'a_'.repeat(size / 4)],
  [
    '`-www.` then `a_` after `[`',
    (size) => '[' + '-www.'.repeat(size / 10) + 'a_'.repeat(size / 4),
  ],
  ['atext with `_`', (size) => 'a_'.repeat(size / 2)],
  ['`a.` runs', (size) => 'a.'.repeat(size / 2)],
  ['`a@`', (size) => 'a@'.repeat(size / 2)],
  ['`[` then emails', (size) => '[' + '*a a@b.c '.repeat(size / 10)],
];

describe('work growth on pathological inputs', () => {
  for (const [name, build] of growthCases) {
    it(name, () => {
      const small = steps(build(4800));
      const large = steps(build(38_400));
      expect(large).toBeLessThan(12 * Math.max(small, 100));
    });
  }
  for (const [name, build] of growthCases) {
    it(`${name} matches the reference`, () => {
      expect(compare(build(480))).toBeUndefined();
    });
  }
});

describe('large transform replacements', () => {
  // The transform once spread every new node into one `splice` call, which
  // overflows the stack on large paragraphs.
  it('replaces 80,000 emails in one text node', () => {
    const tree = fromMarkdown('[' + '-a@b.c '.repeat(80_000), { gfm: true });
    const paragraph = tree.children[0];
    expect(paragraph.type === 'paragraph' && paragraph.children.length).toBe(160_000);
  });

  it('matches the reference on many replacements', () => {
    expect(compare('[' + '-a@b.c www.d.e '.repeat(500))).toBeUndefined();
  });
});
