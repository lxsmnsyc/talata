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
import { parentQuoteLine } from '../src/blocks/blockquote';
import type { TrackedContainer } from '../src/blocks/blockquote';

// Each hook of the version 3 interface in
// `roadmaps/v2/contracts/extension.change-request.md` is tested with a small
// rule defined here. The rules are test-only: nothing registers them outside
// this file. Expected trees come from `mdast-util-from-markdown` with
// `micromark-extension-directive` 4.0.0 (devDependency of the directive
// branch), where a `:::x` line stands for a directive.

interface ContentOptions {
  /** Called with the block names above this block, outermost first, when `continue` runs. */
  onAbove?: (names: (string | undefined)[]) => void;
}

/** `:::x` with no closing fence: the content goes on as long as the containers around match. */
class OpenContent implements TrackedContainer {
  name = 'testContent';
  isContainer = true;
  acceptsLazy = false;
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
    this.start = start;
    this.end = end;
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

describe('OpenBlock.willClose', () => {
  it('runs on each block a starting container closes, innermost first', () => {
    const calls: string[] = [];
    const rule: BlockRule = {
      name: 'testOuter',
      priority: 339,
      canInterruptParagraph: true,
      triggers: ':',
      start(_state, line) {
        if (line.text.slice(line.nonBlank, line.end) !== ':::') {
          return undefined;
        }
        const start = line.nonBlank;
        advanceLine(line, line.end);
        const block = new OpenContent({}, start, line.end);
        block.willClose = (_, closing) => {
          calls.push(`content ${closing.index}`);
        };
        return block;
      },
    };
    // A list item starts on line 3, outside the quote: the content and the quote close.
    parse('> :::\n> a\n- b\n', rule);
    expect(calls).toEqual(['content 2']);
    // A lazy line or a blank line starts no container.
    calls.length = 0;
    parse('> :::\n> a\nb\n\nc\n', rule);
    expect(calls).toEqual([]);
  });
});
