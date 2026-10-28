import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import talata from '../src/unified';

// Inputs the parser supports so far: paragraphs, ATX headings, thematic breaks.
const inputs = [
  '',
  'hello',
  'a\nb\n\nc',
  '# Title\n\ntext',
  '## a\n### b ###\n#### c',
  '***\n\ntext\n\n---',
  'text\n# heading\nmore\n***\nend',
  '  # indented\n\n   text',
  'a  \nb',
  '#\n# \n#hashtag',
  'tab\there\r\nnext\r\n\r\nlast',
];

function viaRemark(input: string, gfm: boolean): string {
  const processor = unified().use(remarkParse);
  if (gfm) {
    processor.use(remarkGfm);
  }
  return String(processor.use(remarkRehype).use(rehypeStringify).processSync(input));
}

function viaTalata(input: string, gfm: boolean): string {
  return String(
    unified().use(talata, { gfm }).use(remarkRehype).use(rehypeStringify).processSync(input),
  );
}

describe('unified plugin', () => {
  for (const gfm of [false, true]) {
    describe(gfm ? 'with gfm' : 'commonmark', () => {
      for (const input of inputs) {
        it(JSON.stringify(input), () => {
          expect(viaTalata(input, gfm)).toBe(viaRemark(input, gfm));
        });
      }
    });
  }

  it('gives the same mdast as remark-parse', () => {
    for (const input of inputs) {
      expect(unified().use(talata).parse(input)).toEqual(unified().use(remarkParse).parse(input));
    }
  });

  it('reads a file-like value through String()', () => {
    const file = { toString: () => '# a' };
    const tree = unified().use(talata).parse(file);
    expect(tree.type).toBe('root');
    expect(tree.position?.end.offset).toBe(3);
  });

  it('works without options', () => {
    const html = String(
      unified().use(talata).use(remarkRehype).use(rehypeStringify).processSync('# a'),
    );
    expect(html).toBe('<h1>a</h1>');
  });
});
