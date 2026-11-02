import type { Root, RootContent } from 'mdast';
import type { DocumentState } from '../../core/state';
import type { Transform } from '../../core/transform';
import { hasContainers } from './container';

// The list item rule finds a blank line only between its direct children.
// mdast-util-from-markdown also counts blank lines inside a container
// directive in the item, so items with one become spread.

const CONTAINER = 'containerDirective' as string;

/** Whether a blank line sits between the children of `node`, or inside a directive or footnote among them. */
function hasBlank(node: RootContent): boolean {
  const position = node.position!;
  const children = 'children' in node ? (node.children as RootContent[]) : [];
  let line = position.start.line;
  let gap = node.type === 'footnoteDefinition' ? 1 : 2;
  for (const child of children) {
    const start = child.position!.start.line;
    if (start - line >= gap) {
      return true;
    }
    // A child that ends after its line ending holds only the lines before.
    // A list that ends so still holds the blank lines after it: the
    // reference exits it after them.
    const childEnd = child.position!.end;
    line =
      childEnd.column === 1 && childEnd.line > start && child.type !== 'list'
        ? childEnd.line - 1
        : childEnd.line;
    gap = 2;
    if ((child.type === CONTAINER || child.type === 'footnoteDefinition') && hasBlank(child)) {
      return true;
    }
  }
  return position.end.line - line >= gap;
}

function visit(node: RootContent | Root): void {
  if (!('children' in node)) {
    return;
  }
  const children = node.children as RootContent[];
  if (node.type === 'listItem' && !node.spread) {
    for (const child of children) {
      if (child.type === CONTAINER && hasBlank(child)) {
        node.spread = true;
        break;
      }
    }
  }
  for (const child of children) {
    visit(child);
  }
}

const directiveSpread: Transform = {
  name: 'directiveSpread',
  transform(tree: Root, state: DocumentState): void {
    if (hasContainers(state.source)) {
      visit(tree);
    }
  },
};

export default directiveSpread;
