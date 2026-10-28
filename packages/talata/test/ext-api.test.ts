import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src/index';
import { directive } from '../src/directive';
import type { Extension } from '../src/ext/api';
import { frontmatter } from '../src/frontmatter';
import { math } from '../src/math';
import talata from '../src/unified';
import { parseReference, parseTalata, specExamples, specText } from './parsers';

const inputs = [
  '# a\n\ntext *b* **c** `d`\n',
  '> quote\n\n- item\n- [ ] task\n\n| a | b |\n| - | - |\n| 1 | 2 |\n',
  'www.example.com and [^1]\n\n[^1]: note\n',
  '---\ntitle: x\n---\n\n$$\nx\n$$\n\n:::note\ntext\n:::\n\n:name[label]\n\n$a$\n',
];

describe('extensions option', () => {
  it('gives the same tree for an empty list as for no option', () => {
    for (const gfm of [false, true]) {
      for (const input of inputs) {
        expect(fromMarkdown(input, { gfm, extensions: [] })).toEqual(fromMarkdown(input, { gfm }));
      }
      for (const example of specExamples.slice(0, 200)) {
        const input = specText(example.markdown);
        expect(fromMarkdown(input, { gfm, extensions: [] })).toEqual(fromMarkdown(input, { gfm }));
      }
    }
  });

  it('gives the same tree for the stub extensions as for none', () => {
    const extensions = [frontmatter(), math(), directive()];
    for (const gfm of [false, true]) {
      for (const input of inputs) {
        expect(fromMarkdown(input, { gfm, extensions })).toEqual(fromMarkdown(input, { gfm }));
      }
    }
  });

  it('still matches the reference without extensions', () => {
    for (const input of inputs.slice(0, 3)) {
      expect(parseTalata(input, true)).toEqual(parseReference(input, true));
    }
  });

  it('takes the option in the unified plugin', () => {
    const marker: Extension = {
      name: 'test:marker',
      inlineRules: [
        {
          name: 'marker',
          priority: 100,
          triggers: '%',
          parse(state) {
            const node = { type: 'inlineCode' as const, value: 'marked' };
            state.nodes.push(node);
            state.pos += 1;
            state.run = state.pos;
            return true;
          },
        },
      ],
    };
    const tree = unified()
      .use(talata, { extensions: [marker] })
      .parse('a%b');
    expect(JSON.stringify(tree)).toContain('"marked"');
  });
});

describe('extension rules reach the parse', () => {
  const calls = { count: 0 };
  function counted(): Extension {
    return {
      name: 'test:counted',
      get inlineRules() {
        calls.count++;
        return [];
      },
    };
  }

  it('builds the registry once per list of extension objects', () => {
    const first = counted();
    const second = counted();
    calls.count = 0;
    fromMarkdown('a', { extensions: [first] });
    fromMarkdown('b', { extensions: [first] });
    fromMarkdown('c', { gfm: true, extensions: [first] });
    expect(calls.count).toBe(2);
    fromMarkdown('d', { extensions: [second] });
    expect(calls.count).toBe(3);
    fromMarkdown('e', { extensions: [first] });
    expect(calls.count).toBe(3);
  });

  it('keys on the order of the list', () => {
    const a = counted();
    const b = counted();
    calls.count = 0;
    fromMarkdown('x', { extensions: [a, b] });
    fromMarkdown('x', { extensions: [b, a] });
    fromMarkdown('x', { extensions: [a, b] });
    expect(calls.count).toBe(4);
  });

  it('evicts the least recently used registry, not the plain ones', () => {
    const extensions: Extension[] = [];
    for (let i = 0; i < 9; i++) {
      extensions.push(counted());
    }
    for (const extension of extensions) {
      fromMarkdown('a', { extensions: [extension] });
      // The plain registries are used between builds, so they stay.
      fromMarkdown('a');
      fromMarkdown('a', { gfm: true });
    }
    calls.count = 0;
    fromMarkdown('a', { extensions: [extensions[8]] });
    expect(calls.count).toBe(0);
    fromMarkdown('a', { extensions: [extensions[0]] });
    expect(calls.count).toBe(1);
  });

  it('does not see a list that the caller changes afterwards', () => {
    const a = counted();
    const list = [a];
    fromMarkdown('x', { extensions: list });
    list.length = 0;
    calls.count = 0;
    fromMarkdown('x', { extensions: [a] });
    expect(calls.count).toBe(0);
  });
});

describe('subpath factories', () => {
  it('return the same object for equal options', () => {
    expect(frontmatter()).toBe(frontmatter('yaml'));
    expect(frontmatter(['yaml', 'toml'])).toBe(frontmatter(['yaml', 'toml']));
    expect(frontmatter('toml')).not.toBe(frontmatter('yaml'));
    expect(math()).toBe(math({}));
    expect(math()).toBe(math({ singleDollarTextMath: true }));
    expect(math({ singleDollarTextMath: false })).not.toBe(math());
    expect(directive()).toBe(directive());
  });

  it('name themselves after the subpath', () => {
    expect(frontmatter().name).toBe('talata:frontmatter');
    expect(math().name).toBe('talata:math');
    expect(directive().name).toBe('talata:directive');
  });
});
