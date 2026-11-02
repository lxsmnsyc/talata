/* oxlint-disable typescript/no-unsafe-type-assertion -- test rules build mdast nodes that @types/mdast lacks */
import type { Root, RootContent } from 'mdast';
import { describe, expect, it } from 'vitest';
import { isClosingFence, trimLineEndings } from '../src/blocks/code-fenced';
import { fromMarkdown } from '../src/index';
import type { Extension } from '../src/ext/api';
import type { BlockRule, BlockState, OpenBlock } from '../src/core/blocks';
import { parseInline } from '../src/core/inline';
import type { InlineRule } from '../src/core/inline';
import { advanceLine, consumeColumns, createLine, measureLine } from '../src/core/line';
import type { Line } from '../src/core/line';
import { point, skipLineEnding } from '../src/core/source';
import { strip } from '../src/inline/code-span';
import { createExhausted, getFailedStart, markFailed } from '../src/inline/exhausted';
import { pushNode } from '../src/inline/text';

// Each hook of `roadmaps/v2/contracts/extension.change-request.md` is tested
// with a small rule defined here. They are test-only: nothing registers them
// outside this file.

interface FenceOptions {
  /** `closeKeepsLineEnding` while the closing line closes the blocks inside. */
  keeps?: boolean;
  /** `OpenBlock.startsContainer`. */
  startsContainer?: false;
  /** Called with the depth of the fence as `continue` sees it. */
  onDepth?: (depth: number, other: number) => void;
}

/** `:::` up to a closing `:::`; the content is a document of its own. */
class OpenFence implements OpenBlock {
  name = 'testFence';
  isContainer = true;
  acceptsLazy = false;
  startsContainer: false | undefined;
  closed = false;
  start: number;
  end: number;
  options: FenceOptions;

  constructor(options: FenceOptions, start: number, end: number) {
    this.options = options;
    this.startsContainer = options.startsContainer;
    this.start = start;
    this.end = end;
  }

  continue(state: BlockState, line: Line): boolean {
    if (this.closed) {
      return false;
    }
    if (line.text.slice(line.nonBlank, line.end) === ':::') {
      const depth = state.getDepth(this);
      this.options.onDepth?.(depth, state.getDepth({} as OpenBlock));
      this.closed = true;
      this.end = line.end;
      advanceLine(line, line.end);
      state.closeOpenBlocks(depth, { keepsLineEnding: this.options.keeps ?? false });
      return true;
    }
    this.end = line.end;
    return true;
  }

  close(state: BlockState, children: RootContent[]): RootContent {
    let end = this.end;
    if (!this.closed && state.closeKeepsLineEnding) {
      end = skipLineEnding(state.source.text, end);
    }
    return {
      type: 'blockquote',
      data: { test: 'fence' },
      children,
      position: { start: point(state.source, this.start), end: point(state.source, end) },
    } as unknown as RootContent;
  }
}

function fenceRule(options: FenceOptions = {}): BlockRule {
  return {
    name: 'testFence',
    priority: 340,
    canInterruptParagraph: true,
    triggers: ':',
    start(_state, line) {
      if (line.text.slice(line.nonBlank, line.end) !== ':::') {
        return undefined;
      }
      const start = line.nonBlank;
      advanceLine(line, line.end);
      return new OpenFence(options, start, line.end);
    },
  };
}

/** `| ` lines: like a block quote that does not take lazy lines. */
class OpenBar implements OpenBlock {
  name = 'testBar';
  isContainer = true;
  acceptsLazy = false;
  start: number;
  end: number;

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }

  continue(_state: BlockState, line: Line): boolean {
    if (line.indent >= 4 || line.text.charCodeAt(line.nonBlank) !== 124) {
      return false;
    }
    advanceLine(line, line.nonBlank + 1);
    consumeColumns(line, 1);
    this.end = line.end;
    return true;
  }

  close(state: BlockState, children: RootContent[]): RootContent {
    return {
      type: 'blockquote',
      data: { test: 'bar' },
      children,
      position: { start: point(state.source, this.start), end: point(state.source, this.end) },
    } as unknown as RootContent;
  }
}

const barRule: BlockRule = {
  name: 'testBar',
  priority: 341,
  canInterruptParagraph: true,
  triggers: '|',
  start(_state, line) {
    const start = line.nonBlank;
    advanceLine(line, start + 1);
    consumeColumns(line, 1);
    return new OpenBar(start, line.end);
  },
};

function extension(...blockRules: BlockRule[]): Extension {
  return { name: 'test:hooks', blockRules };
}

/** The type and a few fields of each node, to keep expectations short. */
function shape(node: unknown): unknown {
  const value = node as {
    type: string;
    value?: string;
    name?: string;
    data?: { test?: string };
    children?: unknown[];
    position?: { start: { column: number }; end: { column: number } };
  };
  const result: Record<string, unknown> = { type: value.data?.test ?? value.type };
  if (value.value !== undefined) {
    result.value = value.value;
  }
  if (value.name !== undefined) {
    result.name = value.name;
  }
  if (value.children !== undefined) {
    result.children = value.children.map(shape);
  }
  return result;
}

function parse(input: string, ...rules: BlockRule[]): Root {
  return fromMarkdown(input, { extensions: [extension(...rules)] });
}

function endOf(node: unknown): { line: number; column: number } {
  const position = (node as RootContent).position!;
  return { line: position.end.line, column: position.end.column };
}

describe('closeOpenBlocks and getDepth', () => {
  const input = ':::\n```\na\n:::\nb\n';

  it('closes the blocks inside from continue', () => {
    const tree = parse(input, fenceRule());
    expect(tree.children.map(shape)).toEqual([
      { type: 'fence', children: [{ type: 'code', value: 'a' }] },
      { type: 'paragraph', children: [{ type: 'text', value: 'b' }] },
    ]);
  });

  it('can make the closed blocks drop their line ending', () => {
    const dropped = parse(input, fenceRule({ keeps: false }));
    const kept = parse(input, fenceRule({ keeps: true }));
    function code(tree: Root): RootContent {
      return (tree.children[0] as unknown as { children: RootContent[] }).children[0];
    }
    expect(endOf(code(dropped))).toEqual({ line: 3, column: 2 });
    expect(endOf(code(kept))).toEqual({ line: 4, column: 1 });
  });

  it('gives the stack depth of an open block, or -1', () => {
    const depths: number[][] = [];
    const rule = fenceRule({
      onDepth(depth, other) {
        depths.push([depth, other]);
      },
    });
    parse(':::\n:::\n', rule);
    parse('> :::\n> :::\n', rule);
    parse('- a\n  :::\n  :::\n', rule);
    expect(depths).toEqual([
      [1, -1],
      [2, -1],
      [3, -1],
    ]);
  });
});

describe('OpenBlock.startsContainer', () => {
  // The quote does not match the last line, so it closes with the code inside
  // as the fence starts.
  const input = '> ```\n> a\n:::\n';
  function code(tree: Root): RootContent {
    return (tree.children[0] as unknown as { children: RootContent[] }).children[0];
  }

  it('keeps the line ending of the blocks a container closes by default', () => {
    expect(endOf(code(parse(input, fenceRule())))).toEqual({ line: 3, column: 1 });
  });

  it('drops it for a container that says it starts none', () => {
    const tree = parse(input, fenceRule({ startsContainer: false }));
    expect(endOf(code(tree))).toEqual({ line: 2, column: 4 });
    expect(tree.children.map(shape)).toEqual([
      { type: 'blockquote', children: [{ type: 'code', value: 'a' }] },
      { type: 'fence', children: [] },
    ]);
  });
});

describe('continuesOverEnd for every tip', () => {
  it('runs for a paragraph at the tip', () => {
    const tree = parse(':::\nabc\n', fenceRule());
    expect(endOf(tree.children[0])).toEqual({ line: 3, column: 1 });
  });

  it('runs for a container at the tip', () => {
    const tree = parse(':::\n', fenceRule());
    expect(endOf(tree.children[0])).toEqual({ line: 2, column: 1 });
  });

  it('does not run without a final line ending', () => {
    const tree = parse(':::\nabc', fenceRule());
    expect(endOf(tree.children[0])).toEqual({ line: 2, column: 4 });
  });
});

describe('lazy lines of a container that refuses them', () => {
  it('shows rules no paragraph, so indented code starts', () => {
    const tree = parse('| a\n    b\n', barRule);
    expect(tree.children.map(shape)).toEqual([
      { type: 'bar', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'a' }] }] },
      { type: 'code', value: 'b' },
    ]);
  });

  it('lets HTML of kind 7 start', () => {
    const tree = parse('| a\n<x>\n', barRule);
    expect(tree.children.map(shape)).toEqual([
      { type: 'bar', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'a' }] }] },
      { type: 'html', value: '<x>' },
    ]);
  });

  it('leaves lazy lines of quotes alone', () => {
    const tree = parse('> a\n    b\n', barRule);
    expect(tree.children.map(shape)).toEqual([
      {
        type: 'blockquote',
        children: [{ type: 'paragraph', children: [{ type: 'text', value: 'a\nb' }] }],
      },
    ]);
  });

  it('sets state.paragraph to undefined on such a line', () => {
    const seen: (boolean | undefined)[] = [];
    const watch: BlockRule = {
      name: 'testWatch',
      priority: 900,
      canInterruptParagraph: true,
      triggers: 'x',
      start(state) {
        seen.push(state.paragraph === undefined);
        return undefined;
      },
    };
    parse('| a\nx\n', barRule, watch);
    parse('> a\nx\n', barRule, watch);
    expect(seen).toEqual([true, false]);
  });
});

describe('containerStartsOff', () => {
  const off: BlockRule = {
    name: 'testOff',
    priority: 10,
    canInterruptParagraph: false,
    triggers: '!',
    start(state) {
      state.containerStartsOff = true;
      return undefined;
    },
  };

  it('stops quotes, lists and footnote definitions for the rest of the document', () => {
    const input = '!\n> a\n\n- b\n\n[^c]: d\n';
    const plain = fromMarkdown(input, { gfm: true });
    const stopped = fromMarkdown(input, { gfm: true, extensions: [extension(off)] });
    expect(plain.children.map((node) => node.type)).toEqual([
      'paragraph',
      'blockquote',
      'list',
      'footnoteDefinition',
    ]);
    expect(stopped.children.map((node) => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'definition',
    ]);
  });

  it('keeps rules without opensContainer starting', () => {
    const tree = parse('!\n| a\n', off, barRule);
    expect(tree.children.map((node) => node.type)).toEqual(['paragraph', 'blockquote']);
  });

  it('is per document', () => {
    const rules = extension(off);
    fromMarkdown('!\n', { extensions: [rules] });
    expect(fromMarkdown('> a\n', { extensions: [rules] }).children[0].type).toBe('blockquote');
  });
});

describe('nested parseInline from an inline rule', () => {
  // `:name[label]`: the label is parsed in place with parseInline.
  const textDirective: InlineRule = {
    name: 'testTextDirective',
    priority: 80,
    triggers: ':',
    parse(state) {
      const text = state.source.text;
      let pos = state.pos + 1;
      const nameStart = pos;
      while (pos < state.end && /[a-z]/.test(text[pos])) {
        pos++;
      }
      if (pos === nameStart || text[pos] !== '[') {
        return false;
      }
      const labelStart = pos + 1;
      let depth = 1;
      pos = labelStart;
      while (pos < state.end && depth > 0) {
        if (text[pos] === '[') {
          depth++;
        } else if (text[pos] === ']') {
          depth--;
        }
        pos++;
      }
      if (depth > 0) {
        return false;
      }
      const children = parseInline(state, [labelStart, pos - 1]);
      pushNode(state, {
        type: 'textDirective',
        name: text.slice(nameStart, labelStart - 1),
        attributes: {},
        children,
        position: { start: point(state.source, state.pos), end: point(state.source, pos) },
      } as never);
      state.pos = pos;
      return true;
    },
  };
  const extensions: Extension[] = [{ name: 'test:text', inlineRules: [textDirective] }];

  function paragraph(input: string): unknown {
    const tree = fromMarkdown(input, { gfm: true, extensions });
    return (shape(tree.children[0]) as { children: unknown[] }).children;
  }

  // Expected trees from micromark-extension-directive 4.0.0 and
  // mdast-util-directive 3.1.1 with GFM.
  it('keeps strikethrough order: ~~:a[b]*~~*', () => {
    expect(paragraph('~~:a[b]*~~*')).toEqual([
      {
        type: 'delete',
        children: [
          { type: 'textDirective', name: 'a', children: [{ type: 'text', value: 'b' }] },
          { type: 'text', value: '*' },
        ],
      },
      { type: 'text', value: '*' },
    ]);
  });

  it('keeps the bracket stack of a link: [:a[[]]]()', () => {
    expect(paragraph('[:a[[]]]()')).toEqual([
      {
        type: 'link',
        children: [{ type: 'textDirective', name: 'a', children: [{ type: 'text', value: '[]' }] }],
      },
    ]);
  });

  it('keeps the bracket stack when the link does not close: [:a[[]]]', () => {
    expect(paragraph('[:a[[]]]')).toEqual([
      { type: 'text', value: '[' },
      { type: 'textDirective', name: 'a', children: [{ type: 'text', value: '[]' }] },
      { type: 'text', value: ']' },
    ]);
  });

  it('keeps positions of the text after a nested leaf', () => {
    const tree = fromMarkdown('`a`:b[c `d`]\n`e`', { extensions });
    const children = (tree.children[0] as unknown as { children: RootContent[] }).children;
    expect(children.map((node) => node.type)).toEqual([
      'inlineCode',
      'textDirective',
      'text',
      'inlineCode',
    ]);
    expect(children[3].position!.start).toEqual({ line: 2, column: 1, offset: 13 });
  });
});

describe('helpers shared with extensions', () => {
  it('strips one space of padding when both ends have one', () => {
    expect(strip(' a ', false, false)).toBe('a');
    expect(strip('  ', false, false)).toBe('  ');
    expect(strip(' a', false, false)).toBe(' a');
  });

  it('tests a closing fence for any marker', () => {
    const line = createLine('$$$  ');
    line.end = 5;
    measureLine(line);
    expect(isClosingFence(line, 36, 2)).toBe(true);
    expect(isClosingFence(line, 36, 4)).toBe(false);
    expect(isClosingFence(line, 96, 2)).toBe(false);
  });

  it('drops one line ending from each end', () => {
    expect(trimLineEndings('\na\nb\n')).toBe('a\nb');
  });

  it('remembers the earliest failed start per leaf', () => {
    const cache = createExhausted();
    const leaf = { ranges: [0, 1] } as never;
    const other = { ranges: [0, 2] } as never;
    let known = getFailedStart(cache, leaf, 2);
    expect(known).toBeUndefined();
    markFailed(cache, 2, 10, known);
    known = getFailedStart(cache, leaf, 2);
    expect(known).toBe(10);
    markFailed(cache, 2, 4, known);
    expect(getFailedStart(cache, leaf, 2)).toBe(4);
    expect(getFailedStart(cache, leaf, 3)).toBeUndefined();
    expect(getFailedStart(cache, other, 2)).toBeUndefined();
  });
});
