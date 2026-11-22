import type { Root } from 'mdast';
import type { Point, Position, Source } from '../../core/source';
import { parseInline } from '../../core/inline';
import { point } from '../../core/source';
import type { DocumentState } from '../../core/state';
import type { Transform } from '../../core/transform';
import { MdxError, span, stringifyPlace } from './error';
import { reparse } from './esm';
import { throwWaiting } from './order';
import type { Item, Tag } from './scanner';
import {
  FLOW_MARKER,
  NODES_MARKER,
  TEXT_MARKER,
  droppedParagraphs,
  isDropped,
  markedTags,
  reparsed,
} from './tags';

// Turns tag markers into elements, as `mdast-util-mdx-jsx` 3.2.1 does while
// `mdast-util-from-markdown` walks micromark's events. The walk visits the
// tree in document order and keeps the same two stacks: open nodes (each
// with the micromark token type that opened it) and open tags. Nodes after
// an open tag go into its element until the closing tag. An element still
// open when the node around it ends, and a closing tag that does not match,
// throw the reference's errors.

/** A node as the walk reads it: mdast nodes, markers and elements. */
interface Node {
  type: string;
  children?: Node[];
  position?: Position;
  ordered?: boolean | null;
  checked?: boolean | null;
  data?: unknown;
  /** Text marker. */
  tag?: Tag;
  /** Flow marker. */
  items?: Item[];
  /** Element. */
  name?: string | null;
  attributes?: Tag['attributes'];
  value?: string;
  spread?: boolean | null;
}

/** The next child of `frame` to visit, or undefined. */
function takeChild(frame: Frame): Node | undefined {
  let child: Node | undefined;
  const queue = frame.queue;
  if (queue !== undefined && frame.queueAt < queue.length) {
    child = queue[frame.queueAt++];
  } else if (frame.at < frame.input.length) {
    child = frame.input[frame.at++];
  }
  if (child !== undefined) {
    frame.index++;
  }
  return child;
}

/** Visits `nodes` next, before the rest (splicing them into `input` would be quadratic). */
function putBack(frame: Frame, nodes: Node[]): void {
  const queue = frame.queue;
  if (queue !== undefined && frame.queueAt < queue.length) {
    const rest = queue.slice(frame.queueAt);
    frame.queue = [...nodes, ...rest];
  } else {
    frame.queue = nodes;
  }
  frame.queueAt = 0;
}

/** Whether a line lies between two of `nodes` that follow each other (a blank line). */
function hasGap(nodes: Node[]): boolean {
  for (let i = 1; i < nodes.length; i++) {
    const before = nodes[i - 1].position;
    const after = nodes[i].position;
    if (before !== undefined && after !== undefined && after.start.line - before.end.line >= 2) {
      return true;
    }
  }
  return false;
}

/** The nodes of an mdast tree, read loosely. */
function asNodes(value: unknown): Node[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mdast nodes and markers
  return value as Node[];
}

interface Frame {
  /** The node, or the element of an open tag. */
  node: Node;
  /** Children built so far. */
  out: Node[];
  /** micromark token type: the reference names it in errors. */
  token: string;
  start: Point | undefined;
  end: Point | undefined;
  /** The open tag of an element frame. */
  tag: Tag | undefined;
  /** Node frames: the children to visit. */
  input: Node[];
  /** Children visited so far, nodes put in included. */
  index: number;
  /** Position in `input`. */
  at: number;
  /** Nodes put in to visit before the rest of `input`, from `queueAt`. */
  queue: Node[] | undefined;
  queueAt: number;
  /** A table row frame: the header row. */
  header: boolean;
  /** An image: its label is gone, the children built are dropped. */
  drop: boolean;
  /** Children were dropped or put in by a failed flow construct. */
  changed?: boolean;
}

function isAtx(text: string, offset: number): boolean {
  let i = offset;
  let marks = 0;
  while (text.charCodeAt(i) === 35) {
    i++;
    marks++;
  }
  if (marks === 0 || marks > 6) {
    return false;
  }
  const code = text.charCodeAt(i);
  return Number.isNaN(code) || code === 32 || code === 9 || code === 10 || code === 13;
}

/** The micromark token type that `mdast-util-from-markdown` opened `node` with. */
function tokenOf(node: Node, parent: Frame, source: Source): string {
  switch (node.type) {
    case 'blockquote':
      return 'blockQuote';
    case 'list':
      return node.ordered === true ? 'listOrdered' : 'listUnordered';
    case 'heading':
      return isAtx(source.text, node.position?.start.offset ?? 0) ? 'atxHeading' : 'setextHeading';
    case 'delete':
      return 'strikethrough';
    case 'linkReference':
      return 'link';
    case 'imageReference':
      return 'image';
    case 'footnoteDefinition':
      return 'gfmFootnoteDefinition';
    case 'tableCell':
      return parent.header ? 'tableHeader' : 'tableData';
    case 'containerDirective':
      return 'directiveContainer';
    case 'leafDirective':
      return 'directiveLeaf';
    case 'textDirective':
      return 'directiveText';
    case 'paragraph':
      return typeof node.data === 'object' &&
        node.data !== null &&
        'directiveLabel' in node.data &&
        node.data.directiveLabel === true
        ? 'directiveContainerLabel'
        : 'paragraph';
    default:
      return node.type;
  }
}

/**
 * Where the token of `node` starts. The first paragraph of a task list item
 * starts at the `[` of its check: `mdast-util-gfm-task-list-item` moves the
 * node's start after it, not the token's.
 */
function tokenStart(node: Node, parent: Frame, source: Source): Point | undefined {
  const start = node.position?.start;
  const item = parent.node;
  if (
    start === undefined ||
    node.type !== 'paragraph' ||
    item.type !== 'listItem' ||
    typeof item.checked !== 'boolean' ||
    parent.index !== 1
  ) {
    return start;
  }
  const text = source.text;
  let i = start.offset! - 1;
  while (
    i > 0 &&
    (text.charCodeAt(i) === 32 ||
      text.charCodeAt(i) === 9 ||
      text.charCodeAt(i) === 10 ||
      text.charCodeAt(i) === 13)
  ) {
    i--;
  }
  return text.charCodeAt(i) === 93 && text.charCodeAt(i - 2) === 91 ? point(source, i - 2) : start;
}

/**
 * Ranges of the source from `start` to `end`, split at line endings. Lines
 * after the first start after `quotes` quote markers and whitespace.
 */
function labelRanges(text: string, start: number, end: number, quotes: number): number[] {
  const ranges = [start];
  let i = start;
  while (i < end) {
    const code = text.charCodeAt(i);
    if (code === 10 || code === 13) {
      ranges.push(i);
      i += code === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
      // A `>` for each block quote around, and whitespace.
      let markers = quotes;
      while (i < end) {
        const next = text.charCodeAt(i);
        if (next === 62 && markers > 0) {
          markers--;
        } else if (next !== 32 && next !== 9) {
          break;
        }
        i++;
      }
      ranges.push(i);
      continue;
    }
    i++;
  }
  ranges.push(end);
  reparsed.add(ranges);
  return ranges;
}

/**
 * Source ranges of the constructs in `nodes` that may hold brackets as
 * text, as flat pairs in order: all but text and the attention around it.
 */
function collectSkips(nodes: Node[], skips: number[]): void {
  for (const node of nodes) {
    const type = node.type;
    if (type === 'text') {
      continue;
    }
    if (
      (type === 'emphasis' || type === 'strong' || type === 'delete') &&
      node.children !== undefined
    ) {
      collectSkips(node.children, skips);
      continue;
    }
    const position = node.position;
    if (position !== undefined) {
      skips.push(position.start.offset!, position.end.offset!);
    }
  }
}

/** The children of the link in `nodes` from `start` to `end`, if there is one. */
function covering(nodes: Node[], start: number, end: number): Node[] | undefined {
  for (const child of nodes) {
    if (
      (child.type === 'link' || child.type === 'linkReference') &&
      child.position?.start.offset === start &&
      child.position.end.offset === end
    ) {
      return child.children;
    }
  }
  return undefined;
}

function abbreviate(tag: Tag): string {
  return '<' + (tag.close ? '/' : '') + (tag.name ?? '') + '>';
}

class Builder {
  source: Source;
  targets: Frame[] = [];
  tags: Tag[] = [];
  state: DocumentState;
  /** Every text tag of the parse, sorted by offset on first use. */
  textTags: Tag[];
  sorted = false;

  /** Paragraph nodes to drop (`dropParagraph`). */
  dropped: Set<string> | undefined;

  constructor(state: DocumentState, textTags: Tag[]) {
    this.state = state;
    this.source = state.source;
    this.dropped = droppedParagraphs(state.source);
    // A copy: parsing a label again records its tags once more.
    this.textTags = [...textTags];
  }

  /**
   * The label of `node`, an image that kept only its `alt`, parsed again
   * when a text tag is in it, so the walk sees the nodes around the tags.
   * Empty when it holds no tag.
   */
  labelNodes(node: Node, sources: Frame[]): Node[] {
    let quotes = 0;
    for (const frame of sources) {
      if (frame.token === 'blockQuote') {
        quotes++;
      }
    }
    const tags = this.textTags;
    if (!this.sorted) {
      tags.sort((a, b) => a.start - b.start);
      this.sorted = true;
    }
    const start = node.position?.start.offset ?? 0;
    const end = node.position?.end.offset ?? 0;
    let low = 0;
    let high = tags.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (tags[middle].start < start) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    if (low === tags.length || tags[low].start >= end) {
      return [];
    }
    // Without the `!` the image is a link, which keeps its children. The
    // characters around the label stay the same, so delimiters flank the same.
    const text = this.source.text;
    const nodes = asNodes(parseInline(this.state, labelRanges(text, start + 1, end, quotes)));
    const link = covering(nodes, start + 1, end);
    if (link !== undefined) {
      return link;
    }
    // A link in the label keeps the outer brackets from being one. Its `]`
    // is the first one at depth zero after the `[` outside the constructs
    // found (code, links, tags): then `[label]` alone is the label between
    // brackets that are text.
    const skips: number[] = [];
    collectSkips(nodes, skips);
    let depth = 0;
    let close = -1;
    let skip = 0;
    for (let i = start + 2; i < end; i++) {
      while (skip < skips.length && skips[skip + 1] <= i) {
        skip += 2;
      }
      if (skip < skips.length && skips[skip] <= i) {
        i = skips[skip + 1] - 1;
        continue;
      }
      const code = text.charCodeAt(i);
      if (code === 92) {
        i++;
      } else if (code === 91) {
        depth++;
      } else if (code === 93) {
        if (depth === 0) {
          close = i;
          break;
        }
        depth--;
      }
    }
    if (close === -1) {
      return nodes;
    }
    const label = asNodes(parseInline(this.state, labelRanges(text, start + 1, close + 1, quotes)));
    return covering(label, start + 1, close + 1) ?? label;
  }

  get top(): Frame {
    return this.targets[this.targets.length - 1];
  }

  /** An open tag's element is still open when `closing` ends (`undefined`: the document). */
  unclosed(closing: Frame | undefined): never {
    const tag = this.tags[this.tags.length - 1];
    const open = stringifyPlace(span(this.source, tag.start, tag.end));
    if (closing === undefined) {
      throw new MdxError(
        'Expected a closing tag for `' + abbreviate(tag) + '` (' + open + ')',
        undefined,
      );
    }
    throw new MdxError(
      'Expected a closing tag for `' +
        abbreviate(tag) +
        '` (' +
        open +
        ') before the end of `' +
        closing.token +
        '`',
      { start: closing.start!, end: closing.end! },
    );
  }

  tag(tag: Tag, token: string): void {
    const source = this.source;
    const tags = this.tags;
    if (tag.close) {
      if (tags.length === 0) {
        throw new MdxError(
          'Unexpected closing slash `/` in tag, expected an open tag first',
          span(source, tag.closeSlash, tag.closeSlash + 1),
        );
      }
      if (tag.firstAttributeStart !== -1) {
        throw new MdxError(
          'Unexpected attribute in closing tag, expected the end of the tag',
          span(source, tag.firstAttributeStart, tag.firstAttributeEnd),
        );
      }
      if (tag.selfClosing) {
        throw new MdxError(
          'Unexpected self-closing slash `/` in closing tag, expected the end of the tag',
          span(source, tag.selfSlash, tag.selfSlash + 1),
        );
      }
      const tail = tags[tags.length - 1];
      if (tail.name !== tag.name) {
        throw new MdxError(
          'Unexpected closing tag `' +
            abbreviate(tag) +
            '`, expected corresponding closing tag for `' +
            abbreviate(tail) +
            '` (' +
            stringifyPlace(span(source, tail.start, tail.end)) +
            ')',
          span(source, tag.start, tag.end),
        );
      }
      tags.pop();
      const top = this.top;
      if (top.tag === undefined || top.token !== token) {
        throw new MdxError(
          'Expected the closing tag `' +
            abbreviate(tag) +
            '` either after the end of `' +
            top.token +
            '` (' +
            stringifyPlace(top.end!) +
            ') or another opening tag after the start of `' +
            top.token +
            '` (' +
            stringifyPlace(top.start!) +
            ')',
          span(source, tag.start, tag.end),
        );
      }
      this.targets.pop();
      const element = top.node;
      element.children = top.out;
      element.position!.end = point(source, tag.end);
      this.top.out.push(element);
      return;
    }
    const element: Node = {
      type: token === 'mdxJsxTextTag' ? 'mdxJsxTextElement' : 'mdxJsxFlowElement',
      name: tag.name ?? null,
      attributes: tag.attributes,
      children: [],
      position: span(source, tag.start, tag.end),
    };
    if (tag.selfClosing) {
      this.top.out.push(element);
      return;
    }
    tags.push(tag);
    this.targets.push({
      node: element,
      out: [],
      token,
      start: point(source, tag.start),
      end: point(source, tag.end),
      tag,
      input: [],
      index: 0,
      at: 0,
      queue: undefined,
      queueAt: 0,
      header: false,
      drop: false,
    });
  }

  flow(items: Item[]): void {
    for (const item of items) {
      if (item.kind === 'tag') {
        this.tag(item, 'mdxJsxFlowTag');
      } else {
        this.top.out.push({
          type: 'mdxFlowExpression',
          value: item.value,
          position: span(this.source, item.start, item.end),
        });
      }
    }
  }

  run(tree: Root): void {
    const root: Frame = {
      node: asNodes([tree])[0],
      out: [],
      token: 'root',
      start: undefined,
      end: undefined,
      tag: undefined,
      input: asNodes(tree.children),
      index: 0,
      at: 0,
      queue: undefined,
      queueAt: 0,
      header: false,
      drop: false,
    };
    const sources: Frame[] = [root];
    this.targets.push(root);
    while (sources.length > 0) {
      const frame = sources[sources.length - 1];
      const child = takeChild(frame);
      if (child !== undefined) {
        if (child.type === TEXT_MARKER && child.tag !== undefined) {
          this.tag(child.tag, 'mdxJsxTextTag');
        } else if (child.type === FLOW_MARKER && child.items !== undefined) {
          this.flow(child.items);
        } else if (child.type === NODES_MARKER) {
          // Its nodes take its place.
          frame.changed = true;
          putBack(frame, child.children ?? []);
        } else if (
          child.children === undefined &&
          (this.textTags.length === 0 ||
            (child.type !== 'image' && child.type !== 'imageReference'))
        ) {
          this.top.out.push(child);
        } else {
          if (isDropped(child)) {
            frame.changed = true;
            continue;
          }
          if (
            this.dropped !== undefined &&
            child.type === 'paragraph' &&
            child.position !== undefined &&
            this.dropped.has(child.position.start.offset! + ':' + child.position.end.offset!)
          ) {
            frame.changed = true;
            continue;
          }
          const drop = child.children === undefined;
          const next: Frame = {
            node: child,
            out: [],
            token: tokenOf(child, frame, this.source),
            start: tokenStart(child, frame, this.source),
            end: child.position?.end,
            tag: undefined,
            input: drop ? this.labelNodes(child, sources) : child.children!,
            index: 0,
            at: 0,
            queue: undefined,
            queueAt: 0,
            header: child.type === 'tableRow' && frame.token === 'table' && frame.index === 1,
            drop,
          };
          sources.push(next);
          this.targets.push(next);
        }
        continue;
      }
      if (this.top !== frame) {
        this.unclosed(frame === root ? undefined : frame);
      }
      sources.pop();
      this.targets.pop();
      if (!frame.drop) {
        frame.node.children = frame.out;
      }
      if (frame.changed === true && frame.node.type === 'listItem' && hasGap(frame.out)) {
        // The nodes of a failed flow construct came in with a blank line
        // between two of them: the item is spread (its list keeps its own
        // answer).
        frame.node.spread = true;
      }
      if (frame !== root) {
        this.top.out.push(frame.node);
      }
    }
  }
}

function buildJsx(tree: Root, state: DocumentState): void {
  if (reparse(tree, state)) {
    return;
  }
  throwWaiting(tree, state.source);
  const tags = markedTags(state.source);
  if (tags !== undefined) {
    new Builder(state, tags).run(tree);
  }
}

/** Builds JSX elements from tag markers. */
const mdxJsxBuild: Transform = {
  name: 'mdxJsxBuild',
  transform: buildJsx,
};

export default mdxJsxBuild;
