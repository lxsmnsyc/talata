/* oxlint-disable typescript/no-unsafe-type-assertion -- test rules build mdast nodes that @types/mdast lacks */
import type { Root, RootContent } from 'mdast';
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src/index';
import type { Extension } from '../src/ext/api';
import { math } from '../src/math';
import type { BlockRule, BlockState, OpenBlock } from '../src/core/blocks';
import { advanceLine } from '../src/core/line';
import type { Line } from '../src/core/line';
import { point } from '../src/core/source';
import { matchedOnlyAtEnd, parentQuoteLine } from '../src/blocks/blockquote';
import type { TrackedContainer } from '../src/blocks/blockquote';

// Each hook of the version 3 interface in
// `roadmaps/v2/contracts/extension.change-request.md` is tested with a small
// rule defined here. The rules are test-only: nothing registers them outside
// this file. Expected trees come from `mdast-util-from-markdown` with
// `micromark-extension-directive` 4.0.0 (devDependency of the directive
// branch), where a `:::x` line stands for a directive.

interface ContentOptions {
  /** Calls `state.endContent` on the last line of the content. */
  endContent?: boolean;
  /** Returns the `keepsLineEnding` the content closes its blocks with, on a container start. */
  closing?: (state: BlockState) => boolean;
  /** Called with the block names above this block, outermost first, when `continue` runs. */
  onAbove?: (names: (string | undefined)[]) => void;
  /** Called when `closing` runs. */
  onClosing?: (name: string, keepsLineEnding: boolean) => void;
  startsContainer?: false;
}

/** Whether the line after `line` is missing or has no quote marker. */
function endsHere(state: BlockState, line: Line): boolean {
  const text = state.source.text;
  const starts = state.source.lineStarts;
  if (line.index + 1 >= starts.length || starts[line.index + 1] === text.length) {
    return true;
  }
  let i = starts[line.index + 1];
  while (text.charCodeAt(i) === 32) {
    i++;
  }
  return text.charCodeAt(i) !== 62;
}

/** `:::x` with no closing fence: the content goes on as long as the containers around match. */
class OpenContent implements TrackedContainer {
  name = 'testContent';
  isContainer = true;
  acceptsLazy = false;
  startsContainer: false | undefined;
  // Tracked like a block quote, so quotes inside see the quote line around.
  quoteLine = -1;
  openChild: TrackedContainer | undefined = undefined;
  closeEnd = -1;
  interruptLine = -1;
  start: number;
  end: number;
  options: ContentOptions;
  willClose: OpenBlock['willClose'];

  constructor(options: ContentOptions, start: number, end: number) {
    this.options = options;
    this.startsContainer = options.startsContainer;
    this.start = start;
    this.end = end;
    const closing = options.closing;
    const onClosing = options.onClosing;
    if (closing !== undefined || onClosing !== undefined) {
      this.willClose = (state, keepsLineEnding) => {
        onClosing?.(this.name, keepsLineEnding);
        if (closing !== undefined) {
          state.closeOpenBlocks(state.getDepth(this), { keepsLineEnding: closing(state) });
        }
      };
    }
  }

  continue(state: BlockState, line: Line): boolean {
    this.quoteLine = parentQuoteLine(state.container);
    const onAbove = this.options.onAbove;
    if (onAbove !== undefined) {
      const names: (string | undefined)[] = [];
      for (let i = 0; i < state.getDepth(this); i++) {
        names.push(state.getBlock(i)?.name);
      }
      onAbove(names);
    }
    if (this.options.endContent === true && endsHere(state, line)) {
      state.endContent(this, line);
    }
    this.end = line.end;
    return true;
  }

  close(state: BlockState, children: RootContent[]): RootContent {
    return {
      type: 'blockquote',
      data: { test: 'content' },
      children,
      position: { start: point(state.source, this.start), end: point(state.source, this.end) },
    } as unknown as RootContent;
  }
}

function contentRule(options: ContentOptions = {}): BlockRule {
  return {
    name: 'testContent',
    priority: 340,
    canInterruptParagraph: true,
    triggers: ':',
    start(_state, line) {
      const text = line.text;
      if (text.slice(line.nonBlank, line.nonBlank + 3) !== ':::') {
        return undefined;
      }
      const start = line.nonBlank;
      advanceLine(line, line.end);
      return new OpenContent(options, start, line.end);
    },
  };
}

function extension(...blockRules: BlockRule[]): Extension {
  return { name: 'test:hooks-2', blockRules };
}

function parse(input: string, rule: BlockRule): Root {
  return fromMarkdown(input, { gfm: true, extensions: [extension(rule), math()] });
}

/** The type of each node with the end of every node, to keep expectations short. */
function shape(node: unknown): unknown {
  const value = node as RootContent & { data?: { test?: string }; value?: string };
  const result: Record<string, unknown> = { type: value.data?.test ?? value.type };
  if (
    value.type === 'text' ||
    value.type === 'math' ||
    value.type === 'html' ||
    value.type === 'code'
  ) {
    result.value = value.value;
  }
  const end = value.position!.end;
  result.end = `${end.line}:${end.column}`;
  const children = (value as { children?: unknown[] }).children;
  if (children !== undefined) {
    result.children = children.map(shape);
  }
  return result;
}

/** The node at a path of child indexes. */
function at(tree: Root, ...path: number[]): unknown {
  let node: unknown = tree;
  for (const index of path) {
    node = (node as { children: unknown[] }).children[index];
  }
  return node;
}

function shapes(tree: Root): unknown[] {
  return tree.children.map(shape);
}

describe('OpenBlock.willClose', () => {
  // The quote in the item does not match line 4, and a quote starts outside
  // it. The reference closes the code of the content as the end of a
  // document: before the last line ending.
  const input = '- :::a\n  > ```\n  > b\n> c\n';

  function code(tree: Root): unknown {
    return shape(at(tree, 0, 0, 0, 0, 0));
  }

  it('keeps the line ending of the blocks it closes without the hook', () => {
    expect(code(parse(input, contentRule()))).toEqual({ type: 'code', value: 'b', end: '4:1' });
  });

  it('lets the container close its blocks with its own answer', () => {
    const tree = parse(input, contentRule({ closing: () => false }));
    expect(code(tree)).toEqual({ type: 'code', value: 'b', end: '3:6' });
    expect(tree.children.map((node) => node.type)).toEqual(['list', 'blockquote']);
  });

  it('lets the container keep the line ending', () => {
    const tree = parse(input, contentRule({ closing: () => true }));
    expect(code(tree)).toEqual({ type: 'code', value: 'b', end: '4:1' });
  });

  it('runs on each open block, innermost first, only when a container starts', () => {
    const calls: string[] = [];
    const outer: BlockRule = {
      name: 'testOuter',
      priority: 339,
      canInterruptParagraph: true,
      triggers: ';',
      start(_state, line) {
        if (line.text.slice(line.nonBlank, line.end) !== ';;;') {
          return undefined;
        }
        const start = line.nonBlank;
        advanceLine(line, line.end);
        const block = new OpenContent({}, start, line.end);
        block.name = 'testOuter';
        block.willClose = (_s, keeps) => {
          calls.push(`outer ${keeps}`);
        };
        return block;
      },
    };
    const options = { onClosing: (name: string, keeps: boolean) => calls.push(`${name} ${keeps}`) };
    const both = { name: 'test:both', blockRules: [outer, contentRule(options)] };
    // A list item starts on line 3, outside the quote: the content closes first.
    fromMarkdown('> ;;;\n> :::\n- a\n', { extensions: [both] });
    expect(calls).toEqual(['testContent true', 'outer true']);
    // A lazy line starts no container.
    calls.length = 0;
    fromMarkdown('> ;;;\n> :::\n> a\nb\n', { extensions: [both] });
    expect(calls).toEqual([]);
    // A blank line closes nothing by itself either.
    fromMarkdown('> :::\n> a\n\nb\n', { extensions: [both] });
    expect(calls).toEqual([]);
  });

  it('does not run for a container that says it starts none', () => {
    const calls: string[] = [];
    const flow: BlockRule = {
      name: 'testFlow',
      priority: 341,
      canInterruptParagraph: true,
      triggers: '%',
      start(_state, line) {
        if (line.text.slice(line.nonBlank, line.end) !== '%%%') {
          return undefined;
        }
        const start = line.nonBlank;
        advanceLine(line, line.end);
        return new OpenContent({ startsContainer: false }, start, line.end);
      },
    };
    const both = {
      name: 'test:flow',
      blockRules: [
        contentRule({
          onClosing: (name) => {
            calls.push(name);
          },
        }),
        flow,
      ],
    };
    fromMarkdown('> :::\n%%%\n', { extensions: [both] });
    expect(calls).toEqual([]);
    fromMarkdown('> :::\n- a\n', { extensions: [both] });
    expect(calls).toEqual(['testContent']);
  });
});

describe('BlockState.getBlock', () => {
  it('returns the open block at a depth', () => {
    const seen: (string | undefined)[][] = [];
    const rule = contentRule({
      onAbove: (names) => {
        seen.push(names);
      },
    });
    parse(':::\n:::', rule);
    parse('> :::\n> :::', rule);
    parse('- > :::\n  > :::', rule);
    expect(seen).toEqual([
      ['root'],
      ['root', 'blockquote'],
      ['root', 'list', 'listItem', 'blockquote'],
    ]);
  });

  it('is the counterpart of getDepth and gives undefined out of range', () => {
    let result: unknown[] = [];
    const rule: BlockRule = {
      name: 'testRead',
      priority: 5,
      canInterruptParagraph: true,
      triggers: ':',
      start(state) {
        const block = state.getBlock(1);
        result = [
          state.getBlock(0)?.name,
          block === undefined ? undefined : state.getDepth(block),
          state.getBlock(9),
          state.getBlock(-1),
        ];
        return undefined;
      },
    };
    fromMarkdown('> a\n> :\n', { extensions: [extension(rule)] });
    expect(result).toEqual(['root', 1, undefined, undefined]);
  });
});

describe('BlockState.endContent', () => {
  const plain = contentRule();
  const ends = contentRule({ endContent: true });

  it('ends math at the line start on a last line', () => {
    // The content ends on the line before the final line ending.
    const input = '>:::9\n>>$$\n>>\n';
    const control = shapes(parse(input, plain));
    const tree = shapes(parse(input, ends));
    expect(control[0]).toMatchObject({
      children: [{ children: [{ children: [{ type: 'math', end: '3:3' }] }] }],
    });
    expect(tree).toEqual([
      {
        type: 'blockquote',
        end: '3:3',
        children: [
          {
            type: 'content',
            end: '3:3',
            children: [
              {
                type: 'blockquote',
                end: '3:3',
                children: [{ type: 'math', value: '', end: '3:1' }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('does not keep a lazy list item open for HTML of kind 7', () => {
    const input = '>:::\t\n>- ;\n><a f="">\n';
    const control = shapes(parse(input, plain));
    const tree = shapes(parse(input, ends));
    // Without the hook the HTML goes in the list item.
    expect(JSON.stringify(control)).toContain('"type":"listItem","end":"3:10"');
    expect(tree).toEqual([
      {
        type: 'blockquote',
        end: '3:10',
        children: [
          {
            type: 'content',
            end: '3:10',
            children: [
              {
                type: 'list',
                end: '2:5',
                children: [
                  {
                    type: 'listItem',
                    end: '2:5',
                    children: [
                      {
                        type: 'paragraph',
                        end: '2:5',
                        children: [{ type: 'text', value: ';', end: '2:5' }],
                      },
                    ],
                  },
                ],
              },
              { type: 'html', value: '<a f="">', end: '3:10' },
            ],
          },
        ],
      },
    ]);
  });

  it('does not make the line after the content lazy for a table inside', () => {
    // The content ends before `b`: `b` and the next row start a table of their own.
    const input = '> :::x\n> | a |\n> | - |\nb\n| - |\n';
    const control = tablesOf(parse(input, plain));
    const tree = tablesOf(parse(input, ends));
    expect(control).toEqual(['paragraph']);
    expect(tree).toEqual(['table']);
  });

  it('leaves the next line alone when the block that ended the content still matches it', () => {
    const input = '> :::x\n> | a |\n> | - |\n> b\n';
    expect(shapes(parse(input, ends))).toEqual(shapes(parse(input, plain)));
  });

  it('lets the block quote match a last line by its end-only rule', () => {
    // The leaf asks on the last line, `>` with nothing left for the inner quote.
    const seen: boolean[] = [];
    const leaf: BlockRule = {
      name: 'testLeaf',
      priority: 341,
      canInterruptParagraph: true,
      triggers: '%',
      start(_state, line) {
        if (line.text.slice(line.nonBlank, line.end) !== '%%%') {
          return undefined;
        }
        const start = line.nonBlank;
        advanceLine(line, line.end);
        return {
          name: 'testLeaf',
          isContainer: false,
          acceptsLazy: false,
          continue(state, next) {
            seen.push(matchedOnlyAtEnd(state, next));
            return false;
          },
          close(state) {
            return {
              type: 'code',
              value: '',
              position: { start: point(state.source, start), end: point(state.source, line.end) },
            };
          },
        };
      },
    };
    const input = '>:::x\n>>%%%\n>\n';
    parse2(input, ends, leaf);
    expect(seen).toEqual([true]);
    seen.length = 0;
    parse2(input, plain, leaf);
    expect(seen).toEqual([]);
  });

  it('ends a list item at the last line, with the code at the line start', () => {
    const input = '>:::x\n> - ```\n>   a\n>   \n';
    function item(tree: Root): unknown {
      return shape(at(tree, 0, 0, 0, 0));
    }
    // The reference: the item ends at 4:5, the code before the last line ending.
    expect(item(parse(input, ends))).toEqual({
      type: 'listItem',
      end: '4:5',
      children: [{ type: 'code', value: 'a', end: '4:1' }],
    });
    expect(item(parse(input, plain))).toEqual({
      type: 'listItem',
      end: '4:5',
      children: [{ type: 'code', value: 'a', end: '4:5' }],
    });
  });
});

function parse2(input: string, ...rules: BlockRule[]): Root {
  return fromMarkdown(input, { gfm: true, extensions: [extension(...rules)] });
}

/** The type of each root child that follows the first quote. */
function tablesOf(tree: Root): string[] {
  return tree.children.slice(1).map((node) => node.type);
}
