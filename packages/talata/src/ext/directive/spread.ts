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
    // A list or footnote definition that ends so still holds the blank lines
    // after it: the reference exits it after them.
    const childEnd = child.position!.end;
    line =
      childEnd.column === 1 &&
      childEnd.line > start &&
      child.type !== 'list' &&
      child.type !== 'footnoteDefinition'
        ? childEnd.line - 1
        : childEnd.line;
    gap = 2;
    if ((child.type === CONTAINER || child.type === 'footnoteDefinition') && hasBlank(child)) {
      return true;
    }
  }
  return position.end.line - line >= gap;
}

/** Whether `node` is a footnote definition with a directive child that holds a blank line. */
function holdsSpreadDirective(node: RootContent): boolean {
  if (node.type !== 'footnoteDefinition') {
    return false;
  }
  for (const child of node.children as RootContent[]) {
    if (child.type === CONTAINER && hasBlank(child)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a list item in a directive ends at a line start, after a blank
 * line that follows its last content. Its end then holds that blank line.
 */
function endsAfterBlank(node: RootContent): boolean {
  const end = node.position!.end;
  if (end.column !== 1) {
    return false;
  }
  const children = 'children' in node ? (node.children as RootContent[]) : [];
  let last = node.position!.start.line;
  if (children.length > 0) {
    // A child that ends at a line start (open code) took the blank lines.
    last = children[children.length - 1].position!.end.line;
  }
  return end.line - last >= 2;
}

/**
 * Whether a child of `node` ends at the start of a blank line and another
 * child follows that line. The child ended after its line ending (a quote in
 * a directive that ends on a blank line), so the blank line lies between
 * the two children, though their lines are only one apart.
 */
function hasBlankAfterLineStart(node: RootContent): boolean {
  const children = 'children' in node ? (node.children as RootContent[]) : [];
  for (let i = 1; i < children.length; i++) {
    const before = children[i - 1].position!;
    // Lists hold the blank lines after them, and code that kept its line
    // ending has no sibling after it in the item.
    if (
      children[i - 1].type === 'blockquote' &&
      before.end.column === 1 &&
      before.end.line > before.start.line &&
      children[i].position!.start.line - before.end.line >= 1
    ) {
      return true;
    }
  }
  return false;
}

function visit(node: RootContent | Root, inDirective: boolean): void {
  if (!('children' in node)) {
    return;
  }
  const children = node.children as RootContent[];
  if (node.type === 'listItem' && !node.spread && inDirective && endsAfterBlank(node)) {
    node.spread = true;
  }
  if (node.type === 'listItem' && !node.spread && hasBlankAfterLineStart(node)) {
    node.spread = true;
  }
  if (node.type === 'listItem' && !node.spread) {
    for (const child of children) {
      if (child.type === CONTAINER ? hasBlank(child) : holdsSpreadDirective(child)) {
        node.spread = true;
        break;
      }
    }
  }
  // The items of a list directly in a directive.
  const inside = node.type === CONTAINER || (inDirective && node.type === 'list');
  for (const child of children) {
    visit(child, inside);
  }
}

const directiveSpread: Transform = {
  name: 'directiveSpread',
  transform(tree: Root, state: DocumentState): void {
    if (hasContainers(state.source)) {
      visit(tree, false);
    }
  },
};

export default directiveSpread;
