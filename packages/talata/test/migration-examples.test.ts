/* oxlint-disable typescript/no-unsafe-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, func-names, prefer-arrow-callback -- the test compiles the guide code blocks with an async function constructor */
import { readFileSync } from 'node:fs';
import type { Root } from 'mdast';
import { describe, expect, it } from 'vitest';
import * as talataIndex from '../src/index';
import * as talataFrontmatter from '../src/frontmatter';
import * as talataMath from '../src/math';
import * as talataUnified from '../src/unified';

// Runs the code blocks of docs/migration.md. A `js before` block is followed
// by its `js after` block, and both must give the same result. A `js check`
// block must run without throwing. Imports of `talata` resolve to the source.

const guide = readFileSync(new URL('../../../docs/migration.md', import.meta.url), 'utf8');

const value = [
  '---',
  'title: Hello',
  '---',
  '',
  '# Hello, ~~world~~',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '- [x] done',
  '- [ ] todo',
  '',
  'Math $a + b$ and www.example.com.',
  '',
  '$$',
  'c = d',
  '$$',
  '',
  'A note[^1].',
  '',
  '[^1]: The note.',
  '',
].join('\n');

const local: Record<string, unknown> = {
  talata: talataIndex,
  'talata/frontmatter': talataFrontmatter,
  'talata/math': talataMath,
  'talata/unified': talataUnified,
};

type Kind = 'before' | 'after' | 'check';

interface Block {
  kind: Kind;
  code: string;
  line: number;
}

function readBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  let kind: Kind | undefined;
  let start = 0;
  let body: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (kind === undefined) {
      if (line === '```js before') {
        kind = 'before';
      } else if (line === '```js after') {
        kind = 'after';
      } else if (line === '```js check') {
        kind = 'check';
      }
      if (kind !== undefined) {
        start = i + 1;
        body = [];
      }
    } else if (line === '```') {
      blocks.push({ kind, code: body.join('\n'), line: start });
      kind = undefined;
    } else {
      body.push(line);
    }
  }
  return blocks;
}

async function loadModule(name: string): Promise<unknown> {
  if (name in local) {
    return local[name];
  }
  return import(name);
}

// Turns each `import` of a block into a destructuring of the loaded module.
function rewriteImports(code: string): { names: string[]; body: string } {
  const names: string[] = [];
  const body = code.replace(
    /^import ([^;]+?) from '([^']+)';$/gm,
    (_match, clause: string, name: string) => {
      const index = names.length;
      names.push(name);
      const loaded = `modules[${index}]`;
      if (clause.startsWith('{')) {
        return `const ${clause.replace(/ as /g, ': ')} = ${loaded};`;
      }
      return `const ${clause} = ${loaded}.default;`;
    },
  );
  return { names, body };
}

async function run(block: Block): Promise<unknown> {
  const { names, body } = rewriteImports(block.code);
  const modules: unknown[] = [];
  for (const name of names) {
    modules.push(await loadModule(name));
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const result =
    block.kind === 'check'
      ? ''
      : '\nreturn typeof tree === "undefined" ? (typeof html === "undefined" ? markdown : html) : tree;';
  const fn = new AsyncFunction('modules', 'value', body + result);
  return fn(modules, value);
}

const blocks = readBlocks(guide);

describe('migration guide examples', () => {
  it('has the examples the guide promises', () => {
    let before = 0;
    let after = 0;
    let check = 0;
    for (const block of blocks) {
      if (block.kind === 'before') {
        before++;
      } else if (block.kind === 'after') {
        after++;
      } else {
        check++;
      }
    }
    expect(before).toBe(after);
    expect(before).toBeGreaterThanOrEqual(6);
    expect(check).toBe(1);
  });

  it('pairs every before block with an after block', () => {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].kind === 'before') {
        expect(blocks[i + 1]?.kind).toBe('after');
      }
    }
  });

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind === 'before') {
      const next = blocks[i + 1];
      it(`before and after give the same result (guide line ${block.line})`, async () => {
        const expected = await run(block);
        const actual = await run(next);
        expect(typeof expected).not.toBe('undefined');
        expect(actual).toEqual(expected);
      });
    } else if (block.kind === 'check') {
      it(`check block runs (guide line ${block.line})`, async () => {
        await run(block);
      });
    }
  }

  it('uses a sample that has every feature the examples turn on', () => {
    const tree = talataIndex.fromMarkdown(value, {
      gfm: true,
      extensions: [talataFrontmatter.frontmatter(), talataMath.math()],
    });
    const types = new Set<string>();
    const stack: { type: string; children?: unknown[] }[] = [tree];
    while (stack.length > 0) {
      const node = stack.pop()!;
      types.add(node.type);
      for (const child of (node.children ?? []) as typeof stack) {
        stack.push(child);
      }
    }
    for (const type of ['yaml', 'table', 'delete', 'inlineMath', 'math', 'footnoteReference']) {
      expect(types.has(type)).toBe(true);
    }
  });

  it('shows the claims about options that talata ignores', async () => {
    const table = '| a |\n| - |\n| 1 |\n';
    const { unified } = await import('unified');
    const { default: remarkGfm } = await import('remark-gfm');
    const withoutGfm = unified().use(talataUnified.talata).use(remarkGfm).parse(table) as Root;
    expect(withoutGfm.children[0].type).toBe('paragraph');
    const withEncoding = (talataIndex.fromMarkdown as (...args: unknown[]) => unknown)(
      table,
      'utf8',
      { gfm: true },
    ) as { children: { type: string }[] };
    expect(withEncoding.children[0].type).toBe('paragraph');
    const unknownKey = talataIndex.fromMarkdown(table, { gfm: true, other: 1 } as never);
    expect(unknownKey.children[0].type).toBe('table');
    const tree = talataIndex.fromMarkdown('---\na: 1\n---\n', {
      extensions: [talataFrontmatter.frontmatter()],
    });
    expect(tree.children[0].type).toBe('yaml');
  });
});
