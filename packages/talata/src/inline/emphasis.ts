import type { Emphasis, PhrasingContent, Strong, Text } from 'mdast';
import { ASTERISK, UNDERSCORE } from '../core/chars';
import type { InlineRule, InlineState } from '../core/inline';
import { nodeIndex, resolveSpan } from '../core/inline';
import { point } from '../core/source';
import { OTHER, PUNCTUATION, WHITESPACE, classifyCharacter } from './classify';
import { workSteps } from './lines';
import { appendText, mergeText, pushNode } from './text';

// Emphasis and strong emphasis with `*` and `_`, following micromark's
// attention construct: each run is a delimiter, and `resolve` pairs closers
// with the nearest matching opener.

const TILDE = 126;

/** For tests: `mixedOnly` sends every span to the general path, to compare both. */
export const emphasisPaths: { mixedOnly: boolean } = { mixedOnly: false };
const EXCLAMATION = 33;
const LEFT_BRACKET = 91;

function parseRun(state: InlineState): boolean {
  const text = state.source.text;
  const start = state.pos;
  const end = state.end;
  const marker = text.charCodeAt(start);
  let pos = start + 1;
  while (pos < end && text.charCodeAt(pos) === marker) {
    pos++;
  }
  // The edges of a range count as whitespace, as micromark's line endings do.
  const previous = start === state.ranges[state.range] ? -1 : text.charCodeAt(start - 1);
  const next = pos === end ? -1 : text.charCodeAt(pos);
  const before = previous === -1 ? WHITESPACE : classifyCharacter(previous);
  const after = next === -1 ? WHITESPACE : classifyCharacter(next);
  // With GFM, a `~` next to the run counts like a letter (micromark's
  // attention markers).
  const gfm = state.options.gfm;
  const open =
    after === OTHER || (after === PUNCTUATION && before !== OTHER) || (gfm && next === TILDE);
  const close =
    before === OTHER || (before === PUNCTUATION && after !== OTHER) || (gfm && previous === TILDE);
  const canOpen = marker === ASTERISK ? open : open && (before !== OTHER || !close);
  const canClose = marker === ASTERISK ? close : close && (after !== OTHER || !open);
  state.pos = pos;
  if (!canOpen && !canClose) {
    appendText(state, text.slice(start, pos), start, pos);
    return true;
  }
  const node: Text = {
    type: 'text',
    value: text.slice(start, pos),
    position: { start: point(state.source, start), end: point(state.source, pos) },
  };
  pushNode(state, node);
  state.delimiters.push({ marker, node, start, end: pos, canOpen, canClose, active: true });
  return true;
}

/**
 * Wraps the nodes between the opener at `open` and the closer at `close` in
 * emphasis or strong, using one or two markers from each. Returns the stack
 * index to continue from.
 */
function pair(state: InlineState, open: number, close: number): number {
  const delimiters = state.delimiters;
  const opener = delimiters[open];
  const closer = delimiters[close];
  if (close > open + 1) {
    // Resolve the delimiters in between on their own, as micromark does, so
    // nothing in there pairs across this emphasis.
    const rest = delimiters.splice(close);
    resolveSpan(state, open + 1);
    for (const delimiter of rest) {
      delimiters.push(delimiter);
    }
    close = open + 1;
  }
  const use = opener.end - opener.start > 1 && closer.end - closer.start > 1 ? 2 : 1;
  const source = state.source;
  const text = source.text;
  const nodes = state.nodes;
  const from = nodeIndex(state, opener.node);
  const to = nodeIndex(state, closer.node);
  const children = nodes.slice(from + 1, to);
  mergeText(children);
  opener.end -= use;
  closer.start += use;
  const node: Emphasis | Strong = {
    type: use === 2 ? 'strong' : 'emphasis',
    children,
    position: { start: point(source, opener.end), end: point(source, closer.start) },
  };
  const replacement: PhrasingContent[] = [];
  let next = close;
  if (opener.end > opener.start) {
    opener.node.value = text.slice(opener.start, opener.end);
    opener.node.position!.end = point(source, opener.end);
    replacement.push(opener.node);
  } else {
    delimiters.splice(open, 1);
    next--;
  }
  replacement.push(node);
  if (closer.end > closer.start) {
    closer.node.value = text.slice(closer.start, closer.end);
    closer.node.position!.start = point(source, closer.start);
    replacement.push(closer.node);
  } else {
    delimiters.splice(next, 1);
  }
  nodes.splice(from, to - from + 1, ...replacement);
  return next;
}

/**
 * The general path, for spans that also hold delimiters of other rules (GFM
 * `~`): each pair first resolves what is between it with every rule, as
 * micromark does. Quadratic on adversarial input.
 */
function resolveMixed(state: InlineState, bottom: number): void {
  const delimiters = state.delimiters;
  let index = bottom;
  while (index < delimiters.length) {
    const closer = delimiters[index];
    const marker = closer.marker;
    if (!closer.canClose || (marker !== ASTERISK && marker !== UNDERSCORE)) {
      index++;
      continue;
    }
    const closeSize = closer.end - closer.start;
    let open = index - 1;
    for (; open >= bottom; open--) {
      workSteps.count++;
      const opener = delimiters[open];
      if (opener.marker !== marker || !opener.canOpen) {
        continue;
      }
      // The rule of three: when either side could do both, sizes that sum
      // to a multiple of 3 do not pair unless both are multiples of 3.
      const openSize = opener.end - opener.start;
      if (
        (opener.canClose || closer.canOpen) &&
        closeSize % 3 !== 0 &&
        (openSize + closeSize) % 3 === 0
      ) {
        continue;
      }
      break;
    }
    if (open < bottom) {
      index++;
      continue;
    }
    index = pair(state, open, index);
  }
}

/** Whether every delimiter from `bottom` up is a `*`/`_` run or a bracket left over from a failed link. */
function onlyEmphasis(state: InlineState, bottom: number): boolean {
  const delimiters = state.delimiters;
  for (let i = bottom; i < delimiters.length; i++) {
    const marker = delimiters[i].marker;
    if (
      marker !== ASTERISK &&
      marker !== UNDERSCORE &&
      marker !== LEFT_BRACKET &&
      marker !== EXCLAMATION
    ) {
      return false;
    }
  }
  return true;
}

// Fields of one entry in the flat pair list.
const PAIR_OPENER = 0;
const PAIR_CLOSER = 1;
const PAIR_USE = 2;
const PAIR_START = 3;
const PAIR_END = 4;
const PAIR_SIZE = 5;

/**
 * The linear path. Pairs on the delimiters alone, then rebuilds the nodes in
 * one pass. Delimiters between a pair drop out of a linked list instead of
 * the stack, and `bottoms` (cmark's openers_bottom, per marker, closer size
 * mod 3 and closer canOpen) keeps closers with no opener from searching
 * again. micromark compares current run sizes, so an opener that shrinks
 * lowers every bottom above it.
 */
function resolveLinear(state: InlineState, bottom: number): void {
  const delimiters = state.delimiters;
  const count = delimiters.length - bottom;
  const all = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    all[i] = i;
  }
  const pairs: number[] = [];
  // Lists of delimiters to pair, as indices from `bottom`. A pair's inside
  // is paired again on its own; that never touches the outer list again, so
  // the order lists run in does not matter.
  const queue: Int32Array[] = [all];
  while (queue.length > 0) {
    pairList(state, bottom, queue.pop()!, pairs, queue);
  }
  if (pairs.length > 0) {
    rebuild(state, bottom, count, pairs);
  }
  delimiters.length = bottom;
}

/**
 * Pairs the delimiters `ids` (indices from `bottom`, in order) as
 * micromark's attention resolver does, appending to `pairs`. The delimiters
 * left between a new pair go to `queue`: micromark resolves a pair's inside
 * again (insideSpan), where runs that an earlier pair shrank can now pair.
 */
function pairList(
  state: InlineState,
  bottom: number,
  ids: Int32Array,
  pairs: number[],
  queue: Int32Array[],
): void {
  const delimiters = state.delimiters;
  const count = ids.length;
  const previous = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    previous[i] = i - 1;
  }
  const bottoms = new Int32Array(12);
  let index = 0;
  while (index < count) {
    const closer = delimiters[bottom + ids[index]];
    const marker = closer.marker;
    if (!closer.canClose || (marker !== ASTERISK && marker !== UNDERSCORE)) {
      index++;
      continue;
    }
    const closeSize = closer.end - closer.start;
    const key = (marker === ASTERISK ? 0 : 6) + (closeSize % 3) * 2 + (closer.canOpen ? 1 : 0);
    const limit = bottoms[key];
    let open = previous[index];
    for (; open >= limit; open = previous[open]) {
      workSteps.count++;
      const opener = delimiters[bottom + ids[open]];
      if (opener.marker !== marker || !opener.canOpen) {
        continue;
      }
      // The rule of three: when either side could do both, sizes that sum
      // to a multiple of 3 do not pair unless both are multiples of 3.
      const openSize = opener.end - opener.start;
      if (
        (opener.canClose || closer.canOpen) &&
        closeSize % 3 !== 0 &&
        (openSize + closeSize) % 3 === 0
      ) {
        continue;
      }
      break;
    }
    if (open < limit) {
      // Later closers like this one need not look below it.
      bottoms[key] = index;
      index++;
      continue;
    }
    const opener = delimiters[bottom + ids[open]];
    const use = opener.end - opener.start > 1 && closeSize > 1 ? 2 : 1;
    opener.end -= use;
    closer.start += use;
    pairs.push(ids[open], ids[index], use, opener.end, closer.start);
    // Everything between the pair drops out of this list and is paired again
    // on its own.
    let inside = 0;
    for (let k = previous[index]; k > open; k = previous[k]) {
      inside++;
    }
    if (inside > 1) {
      const list = new Int32Array(inside);
      let k = previous[index];
      for (let i = inside - 1; i >= 0; i--) {
        workSteps.count++;
        list[i] = ids[k];
        k = previous[k];
      }
      queue.push(list);
    }
    if (opener.end > opener.start) {
      previous[index] = open;
      for (let k = 0; k < 12; k++) {
        if (bottoms[k] > open) {
          bottoms[k] = open;
        }
      }
    } else {
      previous[index] = previous[open];
    }
    if (closer.end === closer.start) {
      if (index + 1 < count) {
        previous[index + 1] = previous[index];
      }
      index++;
    }
  }
}

/** Replaces the span's nodes with the emphasis and strong nodes of `pairs`. */
function rebuild(state: InlineState, bottom: number, count: number, pairs: number[]): void {
  const delimiters = state.delimiters;
  const source = state.source;
  const text = source.text;
  const pairCount = pairs.length / PAIR_SIZE;
  // Per delimiter: pairs it closes in pairing order (innermost first), and
  // pairs it opens in reverse order (outermost first).
  const closeHead = new Int32Array(count).fill(-1);
  const closeTail = new Int32Array(count).fill(-1);
  const openHead = new Int32Array(count).fill(-1);
  const nextClose = new Int32Array(pairCount).fill(-1);
  const nextOpen = new Int32Array(pairCount);
  for (let p = 0; p < pairCount; p++) {
    const opener = pairs[p * PAIR_SIZE + PAIR_OPENER];
    const closer = pairs[p * PAIR_SIZE + PAIR_CLOSER];
    nextOpen[p] = openHead[opener];
    openHead[opener] = p;
    if (closeTail[closer] === -1) {
      closeHead[closer] = p;
    } else {
      nextClose[closeTail[closer]] = p;
    }
    closeTail[closer] = p;
  }
  const nodes = state.nodes;
  const from = nodeIndex(state, delimiters[bottom].node);
  const root: PhrasingContent[] = [];
  const parents: PhrasingContent[][] = [];
  let children = root;
  let next = 0;
  for (let n = from; n < nodes.length; n++) {
    const node = nodes[n];
    if (next >= count || node !== delimiters[bottom + next].node) {
      children.push(node);
      continue;
    }
    const delimiter = delimiters[bottom + next];
    for (let p = closeHead[next]; p !== -1; p = nextClose[p]) {
      const inner = children;
      mergeText(inner);
      children = parents.pop()!;
      const base = p * PAIR_SIZE;
      const wrapper: Emphasis | Strong = {
        type: pairs[base + PAIR_USE] === 2 ? 'strong' : 'emphasis',
        children: inner,
        position: {
          start: point(source, pairs[base + PAIR_START]),
          end: point(source, pairs[base + PAIR_END]),
        },
      };
      children.push(wrapper);
    }
    if (delimiter.end > delimiter.start) {
      if (closeHead[next] !== -1 || openHead[next] !== -1) {
        delimiter.node.value = text.slice(delimiter.start, delimiter.end);
        delimiter.node.position = {
          start: point(source, delimiter.start),
          end: point(source, delimiter.end),
        };
      }
      children.push(delimiter.node);
    }
    for (let p = openHead[next]; p !== -1; p = nextOpen[p]) {
      parents.push(children);
      children = [];
    }
    next++;
  }
  nodes.length = from;
  for (const node of root) {
    nodes.push(node);
  }
}

function resolveEmphasis(state: InlineState, bottom: number): void {
  if (state.delimiters.length <= bottom) {
    return;
  }
  if (!emphasisPaths.mixedOnly && onlyEmphasis(state, bottom)) {
    resolveLinear(state, bottom);
  } else {
    resolveMixed(state, bottom);
  }
}

const emphasis: InlineRule = {
  name: 'emphasis',
  priority: 100,
  triggers: '*_',
  parse: parseRun,
  resolve: resolveEmphasis,
};

export default emphasis;
