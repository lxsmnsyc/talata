import type { ListItem, Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../core/blocks';
import { CR, LF, TAB, isSpaceOrTab } from '../core/chars';
import type { InlineRule, InlineState } from '../core/inline';
import type { Line } from '../core/line';
import type { Source } from '../core/source';
import type { DocumentState } from '../core/state';
import type { Transform } from '../core/transform';
import { reach } from '../inline/lines';

// GFM task list items (`- [ ] a`, `- [x] a`), as
// micromark-extension-gfm-task-list-item and mdast-util-gfm-task-list-item
// build them. The check is a text construct that only runs at the start of
// the first content of the flow that begins after a list item's marker, so
// list items register their candidate paragraphs when they close, and the
// inline rule below reads them.

const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;
const LOWER_X = 120;
const UPPER_X = 88;

interface Candidate {
  item: ListItem;
  paragraph: Paragraph;
  /** The paragraph is the item's first paragraph: its first character goes. */
  slice: boolean;
}

// Candidate paragraphs per document, by the offset of their first `[`.
const candidates = new WeakMap<Source, Map<number, Candidate>>();

// Lazy first content outside any list item, by offset. Read by the
// `outsideChecks` transform. Only paragraphs get the check (not setext
// headings or table headers), so a start waits for its paragraph to close.
const REGISTERED = 0;
const PARAGRAPH = 1;
const UNCHECKED = 2;
const CHECKED = 3;
const outside = new WeakMap<Source, Map<number, number>>();

/**
 * Called when a paragraph closes, with the start of its first line as opened
 * and of its content after definitions. The check runs on that content.
 */
export function paragraphClosed(state: BlockState, opened: number, content: number): void {
  const map = outside.get(state.source);
  if (map?.get(opened) === REGISTERED) {
    map.delete(opened);
    map.set(content, PARAGRAPH);
  }
}

/**
 * A list item that may hold paragraphs where the check runs. The flow after
 * a marker starts on the marker line, or on the next line when the marker
 * line has nothing after the marker. On that next line the flow may already
 * be outside the item (a lazy line); its paragraph then goes to the item's
 * parent, which gets the check when it is a list item too.
 */
export interface TaskTarget extends OpenBlock {
  /** Where the item's own first content starts, or -1. */
  contentStart: number;
  /** Where first content of inner items' flows starts in this item. */
  lazyStarts: number[] | undefined;
}

function isTarget(block: OpenBlock): block is TaskTarget {
  return 'lazyStarts' in block;
}

// The item whose marker line was empty, and the line after it.
// Per document, so a finished parse is not kept alive.
const pending = new WeakMap<BlockState, { item: TaskTarget; line: number }>();

/** Called by a list item whose marker line ends right after the marker. */
export function flowAfterMarker(state: BlockState, item: TaskTarget, line: number): void {
  if (state.options.gfm) {
    pending.set(state, { item, line });
  }
}

/**
 * Runs on lines that start with `[` where no other block starts, before a
 * paragraph opens there. It never starts a block: it records where the flow
 * after an empty marker line has its first content.
 */
export const taskListStart: BlockRule = {
  name: 'taskListStart',
  priority: 900,
  canInterruptParagraph: false,
  triggers: '[',
  gfm: true,
  start(state: BlockState, line: Line): OpenBlock | undefined {
    const entry = pending.get(state);
    if (entry === undefined || entry.line !== line.index) {
      return undefined;
    }
    pending.delete(state);
    const item = entry.item;
    // Whitespace first is a line prefix, not content.
    if (line.nonBlank !== line.start || line.partialTab !== 0) {
      return undefined;
    }
    const container = state.container;
    if (container === item) {
      item.contentStart = line.start;
    } else if (state.unmatched) {
      // No container started on the line, so the same flow goes on.
      if (isTarget(container)) {
        container.lazyStarts ??= [];
        container.lazyStarts.push(line.start);
      } else {
        // Outside any list item: the check still runs, and
        // mdast-util-gfm-task-list-item sets `checked` on whatever node holds
        // the paragraph (the root, a block quote). See `outsideChecks`.
        let map = outside.get(state.source);
        if (map === undefined) {
          map = new Map();
          outside.set(state.source, map);
        }
        map.set(line.start, REGISTERED);
      }
    }
    return undefined;
  },
};

function addCandidate(
  state: BlockState,
  item: ListItem,
  children: RootContent[],
  start: number,
): void {
  let slice = true;
  let i = 0;
  while (i < children.length && children[i].position!.start.offset! < start) {
    if (children[i].type === 'paragraph') {
      slice = false;
    }
    i++;
  }
  // Definitions taken from the start of the content come first; the
  // paragraph left after them is the candidate.
  let line = -1;
  for (; i < children.length; i++) {
    const child = children[i];
    const position = child.position!;
    if (line === -1 ? position.start.offset !== start : position.start.line !== line) {
      return;
    }
    if (child.type === 'paragraph') {
      const offset = position.start.offset!;
      if (state.source.text.charCodeAt(offset) !== LEFT_BRACKET) {
        return;
      }
      let map = candidates.get(state.source);
      if (map === undefined) {
        map = new Map();
        candidates.set(state.source, map);
      }
      map.set(offset, { item, paragraph: child, slice });
      return;
    }
    if (child.type !== 'definition') {
      return;
    }
    line = position.end.line + 1;
  }
}

/** Called by a list item when it closes, with its node and flow children. */
export function taskCandidates(
  state: BlockState,
  item: ListItem,
  children: RootContent[],
  target: TaskTarget,
): void {
  if (!state.options.gfm) {
    return;
  }
  if (target.contentStart !== -1) {
    addCandidate(state, item, children, target.contentStart);
  }
  if (target.lazyStarts !== undefined) {
    for (const start of target.lazyStarts) {
      addCandidate(state, item, children, start);
    }
  }
}

// The leaf whose check matched, until its final resolve.
let taskState: InlineState | undefined;
let taskCandidate: Candidate | undefined;
let taskNodes: PhrasingContent[] | undefined;

/** True when the paragraph line ending at `end` had whitespace after its container prefixes. */
function keptWhitespace(indents: number[] | undefined, end: number): boolean {
  if (indents !== undefined) {
    for (let i = 0; i < indents.length; i += 3) {
      if (indents[i] === end) {
        return true;
      }
    }
  }
  return false;
}

function isCheckValue(code: number): boolean {
  return isSpaceOrTab(code) || code === LOWER_X || code === UPPER_X;
}

/**
 * True when the tab at `offset` is one column wide. micromark expands a tab
 * into virtual spaces up to the next tab stop, and `]` must follow the tab
 * itself.
 */
function isNarrowTab(text: string, offset: number): boolean {
  let start = offset;
  while (start > 0 && text.charCodeAt(start - 1) !== LF && text.charCodeAt(start - 1) !== CR) {
    start--;
  }
  let column = 0;
  for (let i = start; i < offset; i++) {
    column = text.charCodeAt(i) === TAB ? column + 4 - (column % 4) : column + 1;
  }
  return column % 4 === 3;
}

/** `[ ]`, `[x]` or `[X]` followed by whitespace, at the start of a candidate paragraph. */
function parse(state: InlineState): boolean {
  const pos = state.pos;
  const ranges = state.ranges;
  if (pos !== ranges[0]) {
    return false;
  }
  const map = candidates.get(state.source);
  const candidate = map?.get(pos);
  const others = candidate === undefined ? outside.get(state.source) : undefined;
  if (candidate === undefined && others?.get(pos) !== PARAGRAPH) {
    return false;
  }
  const text = state.source.text;
  let range = 0;
  let close = pos + 2;
  let checked = false;
  if (pos + 1 < state.end) {
    const value = text.charCodeAt(pos + 1);
    if (!isCheckValue(value) || (value === TAB && !isNarrowTab(text, pos + 1))) {
      return false;
    }
    checked = value === LOWER_X || value === UPPER_X;
  } else {
    // The value is the line ending; `]` starts the next line.
    if (ranges.length <= 2) {
      return false;
    }
    range = 2;
    close = ranges[2];
    // The check read into the next line, even when it fails.
    reach(state, 2);
    // micromark sees the whitespace a paragraph strips from that line, so `]`
    // must come right after the container prefixes (`- [\n ] a` is no task).
    if (keptWhitespace(state.indents, ranges[3])) {
      return false;
    }
  }
  const rangeEnd = ranges[range + 1];
  if (close >= rangeEnd || text.charCodeAt(close) !== RIGHT_BRACKET) {
    return false;
  }
  // Then a line ending, or spaces and tabs and then anything but the end.
  let after = close + 1;
  while (after < rangeEnd && isSpaceOrTab(text.charCodeAt(after))) {
    after++;
  }
  if (after === rangeEnd ? range + 2 >= ranges.length : after === close + 1) {
    return false;
  }
  if (candidate === undefined) {
    // No first character to drop: the leaf's parent is not a list item.
    others!.set(pos, checked ? CHECKED : UNCHECKED);
    state.range = range;
    state.pos = close + 1;
    return true;
  }
  map!.delete(pos);
  candidate.item.checked = checked;
  taskState = state;
  taskCandidate = candidate;
  taskNodes = state.nodes;
  state.range = range;
  state.pos = close + 1;
  return true;
}

/**
 * After the leaf is parsed: mdast-util-gfm-task-list-item drops the first
 * character of the first text node of the item's first paragraph and moves
 * the paragraph start to it. This runs before text nodes merge, so a head
 * that empties hands its start to the text node it would have merged with.
 */
function resolve(state: InlineState, bottom: number): void {
  // Strikethrough resolves the inside of its pairs with bottom 0 on other
  // node lists; only the leaf's own list counts.
  if (state !== taskState || bottom !== 0 || state.nodes !== taskNodes) {
    return;
  }
  const candidate = taskCandidate!;
  taskState = undefined;
  taskCandidate = undefined;
  taskNodes = undefined;
  const nodes = state.nodes;
  if (!candidate.slice || nodes.length === 0) {
    return;
  }
  let head = nodes[0];
  if (head.type !== 'text') {
    return;
  }
  const start = head.position!.start;
  const moved = { line: start.line, column: start.column + 1, offset: start.offset! + 1 };
  if (head.value.length > 1) {
    head.value = head.value.slice(1);
  } else {
    nodes.shift();
    if (nodes.length === 0) {
      return;
    }
    const next = nodes[0];
    if (next.type !== 'text') {
      return;
    }
    head = next;
  }
  head.position!.start = moved;
  candidate.paragraph.position!.start = {
    line: moved.line,
    column: moved.column,
    offset: moved.offset,
  };
}

const taskListCheck: InlineRule = {
  name: 'taskListCheck',
  priority: 400,
  triggers: '[',
  gfm: true,
  parse,
  resolve,
};

export default taskListCheck;

interface Holder {
  type: string;
  checked?: boolean | null;
  children?: Holder[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

/**
 * Sets `checked` on the parent of the paragraph whose content starts at
 * `offset`. mdast-util-gfm-task-list-item sets it on the node under the
 * innermost open one when the check exits, whatever its type.
 */
function setOnParent(tree: Root, offset: number, checked: boolean): void {
  let parent: Holder = tree;
  for (;;) {
    const children = parent.children;
    if (children === undefined) {
      return;
    }
    let next: Holder | undefined;
    for (const child of children) {
      const position = child.position;
      if (
        position !== undefined &&
        position.start.offset! <= offset &&
        offset < position.end.offset!
      ) {
        next = child;
        break;
      }
    }
    if (next === undefined) {
      return;
    }
    const type = next.type;
    if (type === 'paragraph') {
      parent.checked = checked;
      return;
    }
    parent = next;
  }
}

/** Applies the checks `taskListStart` found outside list items. */
export const outsideChecks: Transform = {
  name: 'taskListOutside',
  gfm: true,
  transform(tree: Root, state: DocumentState): void {
    const map = outside.get(state.source);
    if (map === undefined) {
      return;
    }
    outside.delete(state.source);
    for (const [offset, value] of map) {
      if (value === CHECKED || value === UNCHECKED) {
        setOnParent(tree, offset, value === CHECKED);
      }
    }
  },
};
