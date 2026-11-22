import type { Root } from 'mdast';
import { BlockParser } from './blocks';
import type { Registry } from './registry';
import { createSource, point } from './source';
import { createDocumentState } from './state';
import type { ParseOptions } from './state';

/**
 * Parses `value` in three phases: blocks of the source (which fill
 * `definitions` and `footnotes` and queue text), the chunk queue (inline
 * content, labels and nested documents, pass by pass), then transforms.
 */
export default function parse(value: string, options: ParseOptions, rules: Registry): Root {
  const source = createSource(value);
  const state = createDocumentState(source, options, rules);
  const children = new BlockParser(state).run();
  state.queue.run();
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
