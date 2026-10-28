import type { Root } from 'mdast';
import { BlockParser } from './blocks';
import { parseInline } from './inline';
import type { Registry } from './registry';
import { createSource, point } from './source';
import { createDocumentState } from './state';
import type { ParseOptions } from './state';

/**
 * Parses `value` in three phases: blocks (which fill `definitions` and
 * `footnotes`), inline content of every leaf, then transforms.
 */
export default function parse(value: string, options: ParseOptions, rules: Registry): Root {
  const source = createSource(value);
  const state = createDocumentState(source, options, rules);
  const blocks = new BlockParser(state);
  const children = blocks.run();
  const nodes = blocks.inlineNodes;
  const ranges = blocks.inlineRanges;
  const indents = blocks.inlineIndents;
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].children = parseInline(state, ranges[i], indents[i]);
  }
  const tree: Root = {
    type: 'root',
    children,
    position: {
      start: { line: 1, column: 1, offset: 0 },
      end: point(source, source.text.length),
    },
  };
  for (const transform of rules.transforms) {
    transform.transform(tree, state);
  }
  return tree;
}
