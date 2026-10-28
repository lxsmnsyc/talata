/* oxlint-disable typescript/no-unsafe-type-assertion -- reads the block parser's own fields and builds mdast nodes that @types/mdast lacks */
import type { PhrasingContent, Root, RootContent } from 'mdast';
import { parseInline } from '../../core/inline';
import type { Source } from '../../core/source';
import { point } from '../../core/source';
import type { DocumentState } from '../../core/state';
import type { Transform } from '../../core/transform';
import autolinkLiteralTransform from '../../gfm/autolink-literal-transform';
import { currentDepth, viewLabel } from './scopes';

// Two things the inline parser and the list item rule cannot know about
// directives, fixed in a transform that runs after them.

interface Label {
  node: { children: PhrasingContent[] };
  /** Start of the spaces and tabs before the closing bracket, and the bracket. */
  from: number;
  to: number;
}

interface Deferred {
  node: { children: PhrasingContent[] };
  ranges: number[];
  indents: number[] | undefined;
  /** Directive containers around the leaf, and where the label starts. */
  depth: number;
  offset: number;
}

interface Pending {
  labels: Label[];
  /** Text directive labels parsed after the paragraph, see `deferLabel`. */
  deferred: Deferred[];
  /** Container directives, in document order. */
  containers: object[];
}

const MARK_OPEN = '\uE000';
const MARK_CLOSE = '\uE001';

const pending = new WeakMap<Source, Pending>();

function get(source: Source): Pending {
  let found = pending.get(source);
  if (found === undefined) {
    found = { labels: [], deferred: [], containers: [] };
    pending.set(source, found);
  }
  return found;
}

function lastOf(children: PhrasingContent[]): PhrasingContent | undefined {
  return children.length > 0 ? children[children.length - 1] : undefined;
}

/** Spaces and tabs at the end of a label are text; the inline parser drops them. */
export function restoreTrailing(
  source: Source,
  children: PhrasingContent[],
  from: number,
  to: number,
): void {
  const tail = lastOf(children);
  if (tail !== undefined && tail.position === undefined) {
    // Made by the literal autolink pass, which sets no positions.
    if (tail.type === 'text') {
      tail.value += source.text.slice(from, to);
    } else {
      children.push({ type: 'text', value: source.text.slice(from, to) });
    }
    return;
  }
  // A last node may already hold the whitespace (a directive named by a tab).
  const covered = tail?.position?.end.offset ?? -1;
  if (covered >= to) {
    return;
  }
  const text = source.text.slice(covered > from ? covered : from, to);
  if (covered > from) {
    from = covered;
  }
  if (tail?.type === 'text' && tail.position!.end.offset === from) {
    tail.value += text;
    tail.position!.end = point(source, to);
  } else {
    children.push({
      type: 'text',
      value: text,
      position: { start: point(source, from), end: point(source, to) },
    });
  }
}

/**
 * The indents of the leaf are keyed by line end. The last line of a label ends
 * at the closing bracket, so its key moves there.
 */
function labelIndents(
  text: string,
  ranges: number[],
  indents: number[] | undefined,
): number[] | undefined {
  if (indents === undefined || ranges.length < 4) {
    return indents;
  }
  const stop = ranges[ranges.length - 1];
  let lineEnd = stop;
  while (
    lineEnd < text.length &&
    text.charCodeAt(lineEnd) !== 10 &&
    text.charCodeAt(lineEnd) !== 13
  ) {
    lineEnd++;
  }
  const result = indents.slice();
  // The entry of this line: the first key from the bracket on (an outer
  // label may have moved it already).
  for (let i = 0; i < result.length; i += 3) {
    if (result[i] >= stop) {
      if (result[i] <= lineEnd) {
        result[i] = stop;
      }
      break;
    }
  }
  return result;
}

/**
 * The inline content of a text directive label. The inline parser drops
 * spaces and tabs at its end, so they are put back.
 */
export function parseLabelContent(
  state: DocumentState,
  ranges: number[],
  indents: number[] | undefined,
): PhrasingContent[] {
  const children = parseInline(state, ranges, labelIndents(state.source.text, ranges, indents));
  const last = ranges.length - 1;
  const stop = ranges[last];
  const text = state.source.text;
  let trailing = stop;
  while (trailing > ranges[last - 1]) {
    const code = text.charCodeAt(trailing - 1);
    if (code !== 32 && code !== 9) {
      break;
    }
    trailing--;
  }
  if (trailing < stop) {
    restoreTrailing(state.source, children, trailing, stop);
  }
  return children;
}

/**
 * Parses a label after the leaf it is in. The link rule keeps module state
 * for the leaf being parsed, so a label with brackets cannot be parsed in
 * the middle of it.
 */
export function deferLabel(
  state: DocumentState,
  node: { children: PhrasingContent[] },
  ranges: number[],
  indents: number[] | undefined,
): void {
  const found = get(state.source);
  // Until the label is parsed, the node reads as a marker in the `alt` of an
  // image around it, which `patchAlt` fills in.
  const id = found.deferred.length;
  Object.defineProperty(node, 'value', {
    configurable: true,
    enumerable: false,
    get: () => MARK_OPEN + id + MARK_CLOSE,
  });
  found.deferred.push({
    node,
    ranges,
    indents,
    depth: currentDepth(state.source),
    offset: ranges[0],
  });
}

/** Remembers a leaf or container label that ends in spaces or tabs. */
export function labelWithTrailing(
  state: DocumentState,
  node: { children: PhrasingContent[] },
  from: number,
  to: number,
): void {
  get(state.source).labels.push({ node, from, to });
}

/** Remembers a container directive, and whether a closing fence ended it. */
export function containerDirectiveDone(state: DocumentState, node: object): void {
  get(state.source).containers.push(node);
}

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
    const childEnd = child.position!.end;
    line = childEnd.column === 1 && childEnd.line > start ? childEnd.line - 1 : childEnd.line;
    gap = 2;
    if (
      (child.type === 'containerDirective' || child.type === 'footnoteDefinition') &&
      hasBlank(child)
    ) {
      return true;
    }
  }
  return position.end.line - line >= gap;
}

function visit(node: RootContent | Root, known: Set<object>): void {
  if (!('children' in node)) {
    return;
  }
  const children = node.children as RootContent[];
  if (node.type === 'listItem' && !node.spread) {
    for (const child of children) {
      if (child.type === 'containerDirective' && known.has(child) && hasBlank(child)) {
        node.spread = true;
        break;
      }
    }
  }
  for (const child of children) {
    visit(child, known);
  }
}

/** Plain text of nodes, as mdast-util-to-string gives it. */
function plain(node: unknown): string {
  const item = node as { value?: string; alt?: string | null; children?: unknown[] };
  if (typeof item.value === 'string') {
    return item.value;
  }
  if ('alt' in item) {
    return item.alt ?? '';
  }
  let result = '';
  for (const child of item.children ?? []) {
    result += plain(child);
  }
  return result;
}

/** Puts the text of parsed labels into the `alt` that was built from their markers. */
function patchAlt(tree: Root, deferred: Deferred[]): void {
  const stack: unknown[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop() as { alt?: string | null; children?: unknown[] };
    if (typeof node.alt === 'string') {
      for (let again = node.alt.includes(MARK_OPEN); again; again = node.alt.includes(MARK_OPEN)) {
        let result = '';
        let from = 0;
        for (
          let open = node.alt.indexOf(MARK_OPEN);
          open !== -1;
          open = node.alt.indexOf(MARK_OPEN, from)
        ) {
          const close = node.alt.indexOf(MARK_CLOSE, open);
          result +=
            node.alt.slice(from, open) +
            plain(deferred[Number(node.alt.slice(open + 1, close))].node);
          from = close + 1;
        }
        node.alt = result + node.alt.slice(from);
      }
    }
    for (const child of node.children ?? []) {
      stack.push(child);
    }
  }
}

/**
 * The literal autolink pass of the core already ran, before these labels had
 * content. Runs it on them, skipping links as it does.
 */
function autolinkLabels(tree: Root, state: DocumentState, deferred: Deferred[]): void {
  const labels = new Set<object>();
  for (const item of deferred) {
    labels.add(item.node);
  }
  const stack: unknown[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop() as { type: string; children?: unknown[] };
    if (node.type === 'link' || node.type === 'linkReference') {
      continue;
    }
    if (labels.has(node)) {
      autolinkLiteralTransform.transform(
        { type: 'root', children: node.children as never[] },
        state,
      );
      continue;
    }
    for (const child of node.children ?? []) {
      stack.push(child);
    }
  }
}

export const directiveTransform: Transform = {
  name: 'directive',
  transform(tree: Root, state: DocumentState): void {
    const found = pending.get(state.source);
    if (found === undefined) {
      return;
    }
    for (let i = 0; i < found.deferred.length; i++) {
      const item = found.deferred[i];
      viewLabel(state.source, item.depth, item.offset);
      item.node.children = parseLabelContent(state, item.ranges, item.indents);
    }
    if (found.deferred.length > 0) {
      for (const item of found.deferred) {
        delete (item.node as { value?: string }).value;
      }
      patchAlt(tree, found.deferred);
      if (state.options.gfm) {
        autolinkLabels(tree, state, found.deferred);
      }
    }
    for (const label of found.labels) {
      restoreTrailing(state.source, label.node.children, label.from, label.to);
    }
    if (found.containers.length > 0) {
      visit(tree, new Set(found.containers));
    }
    pending.delete(state.source);
  },
};
