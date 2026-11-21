import { readFileSync } from 'node:fs';
import { unified } from 'unified';
import { describe, expect, it, test } from 'vitest';
import { fromMarkdown } from '../src';
import { MdxError, mdx } from '../src/mdx';
import talata from '../src/unified';
import { corpusFiles, parseReference, parseTalata } from './parsers';
import type { ExtensionName } from './parsers';
import { describeDiff, firstDiff } from './tree-diff';

const all: ExtensionName[] = ['frontmatter', 'math', 'directive', 'mdx'];

// Cases of our own: tags and expressions across lines, in lists, quotes,
// footnotes and tables, lazy lines, attributes, and every error message.
const ownInputs: string[] = [
  '> <a\nb>',
  '> <a\n> b>',
  '> <a\n- b>',
  '- <a\n- b>',
  '- <a\n\n  b/>',
  '> {a\n- b}',
  '> <a\n> b\n',
  '- {a\nb}',
  '> > <a\n> b>',
  '- <a b="\nc"/>',
  '> <a\n>',
  '> <a\n> ',
  '> {a\n>',
  '<a\n> b>',
  '- <a\n  b>',
  '- <a\nb>',
  '> <a\n>   ',
  '- <a\n     ',
  '<a\n  ',
  '> <a\n>   b',
  '- {a\n     ',
  '{a\n  ',
  '<a>\n- f\n</a> <g/>',
  '| a |\n| - |\n<b/>',
  '| a |\n| - |\n<b/> | c',
  '<a\n  b/>',
  '<a b="x\n  y" c={d\n   e} {...f\n g}/>',
  'a <b c="x\n  y" d={e\n   f}/> g',
  '> a <b\nc/>',
  '{a\r\n  b}',
  'a {b\nc} d',
  'a {b\n   c} d',
  '> a {b\nc} d',
  '<a>b</a>',
  '<a>{b}</a>',
  '<a> <b/> {c} </a>',
  '<a>\n{b}\n</a> c',
  '  <a/>',
  '<x.y.z:w/>',
  '<a:b.c/>',
  '<a b:c="&amp;"/>',
  'a\n<b/>',
  'a\n{x}',
  'a\n<b/> c',
  '<a\n\nb/>',
  '> a\n<b/>',
  '> a\n<b\nc/>',
  '- a\n<b/>',
  'a\n    <b/>',
  '    <a/>',
  '\t<a/>',
  '  {\n\t\ta\n\t}',
  '- {\n\ta}',
  '>\t{a\n>\t\tb}',
  '<a>\n\n# b\n\n</a>',
  '<a>\n> b\n</a>',
  '<a>\n\n- b\n\n  </a>',
  '[^1]: <a>\n    b\n    </a>',
  'a[^1]\n\n[^1]: <a>\n    </a>',
  '<a/>\n---',
  'a\n<b/>\n---',
  '<a>\n\n    b\n\n</a>',
  '<a>\n```\nb\n```\n</a>',
  '*<a/>*',
  '**a <b>c</b>**',
  '*a <b>c* d</b>',
  '<b>*a</b>*',
  '[<a/>](b)',
  '![<a/>](b)',
  '![a {b}](c)',
  'a <b>c\nd</b> e',
  'a <b>c\n\nd</b> e',
  '# a <b/> #',
  'a\n===<b/>',
  '<a/>\n===',
  'a <b/>\n===',
  'a <\nb',
  'a <',
  'a < b',
  '<',
  '< a',
  '<a',
  '{',
  'a {',
  'a }',
  '}',
  '{{}}',
  '{a{b}c}d',
  '{a}}',
  'a <b {c} d={e}/>',
  '<a {b} />',
  '</a>',
  '<a></b>',
  '<a>\n</b>',
  '<></>',
  '<>a</>',
  'a <>b</> c',
  '</a b>',
  '</a {b}>',
  '</a/>',
  '<a>\n</a b>',
  '<a></a/>',
  '<a></a {...b}>',
  '<a b c>\n</a>',
  '<a\u00a0b/>',
  '<a\u000bb/>',
  '<é/>',
  '<a-b/>',
  '<-a/>',
  '<a b-c="d"/>',
  "<a b='c'/>",
  '<a b=c/>',
  '<a b=/>',
  '<a b=<c/>/>',
  '<a!>',
  '<!-- a -->',
  'a <!-- b -->',
  '<a b="&#0;&#x110000;&#128;&ampx;&amp&#;"/>',
  '<a b="&copy;&notin;&notit;"/>',
  '<a/ >',
  '<a / >',
  '<a/b>',
  '<a//>',
  '</ a>',
  '</*a>',
  '<a@b>',
  '<a.@b>',
  '<a:+b>',
  '<a:1>',
  'a <b.c d:e="f" g:h/> i',
  '<a\n\n\nb/>',
  '<a>\n\n</a>\n\n<b>\n\n</b>',
  '<a><b></a></b>',
  '<a>\n<b>\n</a>\n</b>',
  'a <b> c </b> d <e/>',
  '{/* comment */}',
  '<a b={/* c */} />',
  '<a {/* b */}/>',
  'a\n\n<b/>\n\nc',
  '<a>\n  b\n</a>',
  '<a>\n\n  b\n\n</a>',
  '- <a>\n\n  b\n\n  </a>',
  '1. <a/>\n2. <b/>',
  '- <a/>\n  <b/>',
  '- a\n  <b/>',
  '> - <a/>\n>   b',
  '<a/> <b/>\n<c/>',
  '<a/>\t\t',
  '<a/>  b',
  '{a} <b/>',
  '{a} {b}',
  '{a}b',
  '<a/>{b}',
  'a\\<b',
  'a &lt;b/>',
  '`<a`',
  '`{a`',
  '[a](<b>)',
  '[a](b "<c>")',
  '[a]: <b>\n\n[a]',
  '<https://a.b>',
  'a <https://a.b>',
  'www.a.com<b/>',
  'a@b.c<d/>',
  '<a>\n\n| b |\n| - |\n\n</a>',
  '| <a/> | {b} |\n| - | - |',
  '| a |\n| - |\n| <b> |',
  '~~a <b/>~~',
  'a  \n<b/>',
  'a\\\n<b/>',
  '<a b="c\nd"\ne/>',
  '> <a b="c\n> d"/>',
  '- <a b={c\n  d}/>',
  '- <a b={c\nd}/>',
  '<a\r\nb/>',
  '<a\rb/>',
  '{a\r\nb}',
  'a {b\r\nc}',
  '\ufeff<a/>',
  '<a/>\u0000',
  '<a b="\u0000"/>',
  'a\n> <b/>',
  '> a\n> <b>\n> </b>',
];

// Fuzz failures fixed while building the extension (seeds 1 to 114, all
// features): which error comes first, flow constructs that fail on a later
// line, image labels, container directives around.
const fuzzInputs: string[] = [
  ':c[<]{',
  ':9[<]<',
  '![_<>_]()',
  ':::b\r<\n:::\r]<',
  '><B\r>\r>>_',
  ':::c[[<]]\n<',
  '<\n:::é\n<',
  '    ::x[]',
  '\t::9',
  ':c[<]\n\n<',
  '::c[<]\n\n<',
  ':::c[<]\n:::\n\n<',
  '| <a |\n| - |\n\n<',
  '<\n\n| <a |\n| - |',
  '> <\n\n<',
  '> a\n> <b\n\n<',
  ':::a\n<\n:::\n\n:::b[<]\n:::',
  ':::a\n:::b\n<x\n:::\n:::\n\n<',
  ':::a\n<1\n:::\n<2',
  ':::a\nb <1\n:::\nc <2',
  '# <1\n\n:::a\nb <2\n:::',
  ':::a\n<b>\n:::\n<1',
  ':a[<1]\n\n:::b\nc <2\n:::',
  ':::b\nc <2\n:::\n\n:a[<1]',
  ':a[<1]\n\n:::b\n<2\n:::',
  ':::b\nc :d[<1]\n:::\n:a[<2]',
  ':::b\n:::c\nd <1\n:::\n:::\n:a[:b[<2]]',
  ':::b\n:::c\nd <1\n:::\n:::\n:a[:b[:c[<2]]]',
  ':::b\nd <1\n:::\n:a[:b[<2]]',
  ':::b\n# <1\n:::\n\n:a[<2]',
  ':::b\n::x[<1]\n:::\n\n:a[<2]',
  ':::b\n:::c[<1]\n:::\n:::\n\n:a[<2]',
  ':::b\nx\n\n# <1\n:::\n\n:a[<2]',
  '# :a[<1]\n\nb <2',
  '::x[:a[<1]]\n\nb <2',
  ':::b\n# <1\n:::\n\nx :a[:b[<2]]',
  ':::b\n:a[<1]\n:::\n\nx :a[:b[<2]]',
  ':::b\n<1\n:::\n\nc <2',
  ':::a\n:::b\n<1\n:::\n:::\n\n:c[<2]',
  ':::a\n:::b\n<1\n:::\n:::\n\n:c[:d[<2]]',
  ':::a\nx <2\n:::\n:::b\n:::c\n<1\n:::\n:::',
  ':::\t\n<\n:::\n:a[<]',
  '<a\n\n> b',
  '<a\n\n- b',
  '<a\n> b',
  '<a\n- b',
  '<a\n\n\n> b',
  '<a\n  \n> b',
  '{a\n\n> b',
  '- <a\n\n- b',
  '<a b\n\n> c',
  '<a\n\n# b',
  '<d\n{}\n>e',
  '<a\n# x\n>b',
  '<a\n---\n>b',
  '<a\nb\n---\n>b c',
  ':b[<]\n# <',
  ':b[<]\n\n# <',
  ':b[<]\n\nc <',
  'a :b[<]\n\nc <',
  ':::é[[<>]]',
  ':::x[<>[]]',
  '5. [x] ;<>',
  ':b[<]\n1) a<',
  '<$\n\n>-',
  '{\n}a\n-',
  '![[<>]()]()',
  '![~[]<>~]()',
  '+ :::a[[]]\n<!\n<',
  '![:c[<>]]()',
  '<a\nb="">\\\n=',
  '{\n}[\n-',
  ')\n<f\n>)',
  '[\n<_\n>-',
  '+ <b\n<',
  '|\n<a\n>`',
  'a\n<b\nc/>',
  'a\n<b\nc/> d',
  '[x]: y\n<b\nc/> d',
  'a\n<b\n\nc/> d',
  'a\n{b\n} d\n---',
  '![:a[<]]()\n# <',
  '![:a[:b[<]]]():b[<]',
  '![$$$]$$$<>]()',
  '><é\r>\r>>]\r<x\r',
  'www.\n<a\r/>',
  '![[:b[[<]]]]()\n[^a]:&<',
  '![:b[<]]()\r>l<',
  '![$$]$$<>]()',
  ':::b\n<@\n<é\n',
  '>>{\n>',
  '# ![:b[[<]]]()\n$<',
  '![:a[[]<]]()\n\nb{',
  ':b[<]\n<d\n>\n]<',
  '{|||\n-|-|-\n}*',
  ':::n\n<//\n{\n',
  ':::e\r<!\r{\n',
  ':::x\n<a\n:::',
  ':::x\n<a\n:::\nb',
  '> :::x\n> <a\n> :::',
  '> > a\n<x\n',
  '> > a\n<x',
  '>a\n>\n>>]\n<x\n',
  '>>]\n<x\n',
  '>a\n>\n>>b\n<x\n',
  '>a\n>>b\n<x\n',
  '>a\r>\r>>b\r<x\r',
  '> b\r\n<x\r\n',
  '![**<>*]()',
  '<_\n$$ $>>',
  'n\r-|\r<x\r>:',
  '_\n|-\n{\n}\\',
  '>><a\n>\r',
  '1. >{\n \n',
  '{\n<}}',
  '![www.)_[]<>_]()',
  '<div d="\n\n"></div>',
  '<script e="\n\n"></script>',
  '![~~<a f="">http://a[$~~ $]]()',
  '![~~<a>[$~~ $]]()',
  '![~~<a>$~~ $]()',
  '😀|o\r-|-\r<$\n>\\',
  '_\n-:\n<c\n>_',
  ')||]\r-|-|-\r<é\r>b',
  '![_<>__]()',
  '&||\n-|-\n{\n}!',
  ':::é\r>{\r><',
  ':::x\n{\n<',
  '+\n  <> ',
  '![ **<>*]()',
  '- {\n  } ',
  '- <b\n  > ',
  '-\n  <> ',
  '<a b="\r<a b=">q\r',
  '![**o[]<>*]()',
  '![ **[]<>*]()',
  '![[]()<x{{}}>](<>)',
  '>~\n>-|\r><a\n>b=""\r>\n>>b',
  '- <a/> \n\n  b',
  '> {a} \nb',
  '![<b>]\n\n[<b>]: d',
  '![a <b/>][c]\n\n[c]: d',
  '[f]:"\r<b\nb="">`\n=',
  '[f]: x\n<b\nc/> d\n=',
  '- x\r<$\n  >-',
  '- x\n<$\n  b="">_',
  '{\n   },\n{\n },',
  '[a]:>\r{\n}_\r=',
  '- [\n{\n  }>',
  '{\n```}b\r<',
  ')\n<a\n{}\n>~\n2. <',
  '$\n<$\n\n>😀',
  '<a b="\n::">^',
  '<B b="\r::"b="">x',
  ',\n,\n{\n}{\n   }',
  '`\n:\n{\n}w\n `',
  '_\n_\n<_ b="\n"/>`\n `',
  '`\n]\n<B b="\n"b="">&\n `',
  '- x\n{\n  }-\r{\n  }<y/>',
  '1) [ ] `\r   <$\r   />',
  '> - x\n{\n>   } y',
  ':::b\n>{\n:::',
  '[\n{\n},\n{\n},',
  ',\n{\n},\n{\n},',
  '![*~~<>[]()*~~]()',
  '![_[]~~<a f="">[[[]]()]*~~*]()',
  ' :::a\n>{\n  ',
  '![*<>~~*[]()~~]()',
  '{{}\r:::é\n}[',
  ':::b\n>a\n<a\n:::',
  '><a b="\r><a b=">t\r',
  '$\n<$\n\nx\n\n>😀',
  '{\n-|\n<}"',
  '{\r:::c}(',
  '$\n<$\n{}\n>|',
  '>- ><a\n>    ',
  'x\n{\n-|\n<}"',
  '![[[]]()*[*[]]<>]()',
  '![_<>[]()](_)',
  '{\n:::a }b',
  '{\n:-\n}}',
  '---\n![<a\n>]()',
  ' :::e[]{}\n><a\n ',
  '{\n:::a{}}B',
  '{\n:::9[[]]{""}\n}1',
  ' 2) >{\r\t',
  '[^a]:m\n{\n    }1',
  ' :::c\n><a\n :::',
  ' :::\t\n>{\n :::',
  '- [X]\n*<a h="">',
  '*\t><h\n\t ',
  '>:::\t\n>><a\n>',
  '>>:::\t\n>>><a\n>>',
  '>:::\t\n>><a\n>:::',
  '{{}\n:::b\n<}`',
  'a\n<div>||\r-|-',
  '[a]:\n{\n\n}}',
  '[a]:\n{\n\n}x',
  '[a]:\n{b\n\n}}',
  '[a]:\n{{\n\n}}}',
  '[a]:\n{\n\n\n}}',
  '> [a]:\n> {\n>\n> }}',
  '[a]:\n  {\n\n}}',
  '[b]:\n{\n# >[a]: }/>',
  '{a\n:::x\n}x\n<',
  '{\n:::x\n}x\n<',
  '[^1]:><a\n \n',
  '[^1]: > <a\n  \nx',
  '[^1]: \n{a\n\n\n    \n}  x    \n> \n<a>}',
  '[a]:\n{\n===\n \n}}',
  '[a]:\n{a\n~~~\n$$\n}}\n[a]: b\n{',
  '[a]:\n{a\n$$\n}}\n# a\n# a\n',
  '[a]:\r\n{\r\n~~~\r\n}}\n',
  '[a]:\n{\n\t\n<\n}x\n---\n',
  '[a]:\n{a\n::x\n}}\n-|-\n',
  '{\n# x\n}x',
  '{\n***\n}x',
  '- - x\n{\n    } y',
];

describe('mdx extension', () => {
  for (const gfm of [false, true]) {
    test(`own cases, gfm ${gfm}`, () => {
      for (const input of ownInputs) {
        for (const names of [['mdx'], all] as ExtensionName[][]) {
          expect(parseTalata(input, gfm, names), JSON.stringify(input)).toEqual(
            parseReference(input, gfm, names),
          );
        }
      }
    });
    test(`fuzz failures, gfm ${gfm}`, () => {
      for (const input of fuzzInputs) {
        for (const names of [['mdx'], all] as ExtensionName[][]) {
          expect(parseTalata(input, gfm, names), JSON.stringify(input)).toEqual(
            parseReference(input, gfm, names),
          );
        }
      }
    });
  }

  test('flow constructs that fail on a later line stay linear', () => {
    // Each one interrupts the paragraph the one before became, and joins it.
    for (const unit of ['{\n}x\n', '<a\n/>x\n', 'p\n{\n}x\n', '> {\n> }x\n']) {
      const small = unit.repeat(50);
      expect(parseTalata(small, false, ['mdx']), JSON.stringify(small)).toEqual(
        parseReference(small, false, ['mdx']),
      );
      // Growth, not wall time: four times the input must stay well under the 16x of quadratic.
      const best = (count: number): number => {
        const text = unit.repeat(count);
        let fastest = Infinity;
        for (let run = 0; run < 5; run++) {
          const start = performance.now();
          parseTalata(text, false, ['mdx']);
          fastest = Math.min(fastest, performance.now() - start);
        }
        return fastest;
      };
      best(2000);
      expect(best(32_000) / best(8000), unit).toBeLessThan(10);
    }
  });

  test('the extension is the same object for every call', () => {
    expect(mdx()).toBe(mdx());
    expect(mdx().name).toBe('talata:mdx');
  });

  test('turns off indented code, HTML and autolinks', () => {
    const tree = fromMarkdown('    a\n\n<b/>', { extensions: [mdx()] });
    expect(tree.children.map((node) => node.type)).toEqual(['paragraph', 'mdxJsxFlowElement']);
    expect(fromMarkdown('<div>').children[0].type).toBe('html');
  });

  test('throws an MdxError with the reason and the place', () => {
    let error: unknown;
    try {
      fromMarkdown('a <3', { extensions: [mdx()] });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(MdxError);
    if (!(error instanceof MdxError)) {
      throw new TypeError('expected an MdxError');
    }
    expect(error.reason).toBe(
      'Unexpected character `3` (U+0033) before name, expected a character that can start a name, such as a letter, `$`, or `_`',
    );
    expect(error.place).toEqual({ line: 1, column: 4, offset: 3 });
    expect(error.message).toBe(error.reason + ' at 1:4');
    expect(() => fromMarkdown('<a>', { extensions: [mdx()] })).toThrow(
      new MdxError('Expected a closing tag for `<a>` (1:1-1:4)', undefined),
    );
  });

  test('a parse after an error starts clean', () => {
    expect(() => fromMarkdown(':::a\n<1\n:::\nb <2', { extensions: [mdx()] })).toThrow(MdxError);
    expect(fromMarkdown('<a>b</a>', { extensions: [mdx()] }).children[0].type).toBe('paragraph');
  });

  test('the unified plugin takes mdx() in extensions', () => {
    const tree = unified()
      .use(talata, { extensions: [mdx()] })
      .parse('<A b="c">{d}</A>');
    expect(tree).toEqual(parseReference('<A b="c">{d}</A>', false, ['mdx']));
  });
});

// The benchmark corpus with the extension on, alone and with the other
// extensions. Most READMEs hold HTML, which is an error in MDX: the error
// messages are compared then. The suite skips when the corpus has not been
// downloaded.
const files = corpusFiles();
const timeout = 30_000;

describe.skipIf(files.length === 0)('benchmark corpus with mdx', () => {
  for (const gfm of [false, true]) {
    for (const file of files) {
      it(
        `${file.name} ${gfm ? 'with' : 'without'} gfm`,
        () => {
          const value = readFileSync(file.path, 'utf8');
          for (const names of [['mdx'], all] as ExtensionName[][]) {
            const found = firstDiff(
              parseReference(value, gfm, names),
              parseTalata(value, gfm, names),
            );
            expect(describeDiff(found), names.join(' ')).toBeUndefined();
          }
        },
        timeout,
      );
    }
  }
});
