import type { PhrasingContent, RootContent } from 'mdast';
import type { Position, Source } from '../../core/source';
import { span } from './error';
import type { Item, Tag } from './scanner';

// Tags are not nodes yet when the parsers find them. A text tag is a marker
// node in the phrasing content, a line of flow tags and expressions is one
// marker node in the flow content. The transform in `build.ts` turns the
// markers into elements, as `mdast-util-mdx-jsx` does while it builds the
// tree, and throws its errors.

export const TEXT_MARKER = 'talataMdxTextTag';
export const FLOW_MARKER = 'talataMdxFlowTags';
export const NODES_MARKER = 'talataMdxNodes';

export interface TextMarker {
  type: typeof TEXT_MARKER;
  tag: Tag;
  position: Position;
}

/** Positioned from the first item to the last, as block rules read child positions. */
export interface FlowMarker {
  type: typeof FLOW_MARKER;
  items: Item[];
  position: Position;
}

/**
 * Nodes that take the place of one block: the paragraphs a flow construct
 * that failed on a later line makes. Its children are visible to transforms.
 */
export function nodesMarker(source: Source, nodes: RootContent[]): RootContent {
  const marker = {
    type: NODES_MARKER,
    children: nodes,
    position: span(
      source,
      nodes[0].position?.start.offset ?? 0,
      nodes[nodes.length - 1].position?.end.offset ?? 0,
    ),
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- replaced by build.ts
  return marker as unknown as RootContent;
}

/**
 * Ranges of image labels parsed again (`build.ts`). They resolve as inside
 * a link: strikethrough before emphasis (`mdxLabel`).
 */
export const reparsed: WeakSet<number[]> = new WeakSet();

// Sources of the parses that made a marker, so the transform skips the rest.
// Each holds the text tags in the order they were found: an image keeps only
// its `alt`, so the transform finds the tags in its label here.
const marked = new WeakMap<Source, Tag[]>();

export function markSource(source: Source): void {
  if (!marked.has(source)) {
    marked.set(source, []);
  }
}

// Paragraph nodes to drop, as `start:end` offsets, per parse (see `dropParagraph`).
const dropped = new WeakMap<Source, Set<string>>();

/**
 * Drops the paragraph node from `start` to `end`. A flow construct that
 * fails on a later line goes on as the paragraph it interrupted, whose node
 * the block parser made already; the transform removes that node.
 */
export function dropParagraph(source: Source, start: number, end: number): void {
  markSource(source);
  let set = dropped.get(source);
  if (set === undefined) {
    set = new Set();
    dropped.set(source, set);
  }
  set.add(start + ':' + end);
}

// Nodes to drop, by identity (see `dropNode`).
const droppedNodes = new WeakSet<object>();

/** Drops `node` from the tree: the transform leaves it out. */
export function dropNode(node: object): void {
  droppedNodes.add(node);
}

/** Whether `node` is to be dropped (`dropNode`). */
export function isDropped(node: object): boolean {
  return droppedNodes.has(node);
}

/** The paragraphs to drop for the parse of `source`, or undefined. */
export function droppedParagraphs(source: Source): Set<string> | undefined {
  return dropped.get(source);
}

/** Records a text tag of the parse of `source`. */
export function recordTextTag(source: Source, tag: Tag): void {
  let tags = marked.get(source);
  if (tags === undefined) {
    tags = [];
    marked.set(source, tags);
  }
  tags.push(tag);
}

/** The text tags of the parse, or undefined when it made no marker. */
export function markedTags(source: Source): Tag[] | undefined {
  return marked.get(source);
}

export function textMarker(source: Source, tag: Tag): PhrasingContent {
  const marker: TextMarker = { type: TEXT_MARKER, tag, position: span(source, tag.start, tag.end) };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- replaced by build.ts
  return marker as unknown as PhrasingContent;
}

export function flowMarker(source: Source, items: Item[], end: number): RootContent {
  const marker: FlowMarker = {
    type: FLOW_MARKER,
    items,
    position: span(source, items[0].start, end),
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- replaced by build.ts
  return marker as unknown as RootContent;
}
