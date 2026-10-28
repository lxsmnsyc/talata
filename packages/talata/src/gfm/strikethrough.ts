import type { Delete, PhrasingContent, Text } from 'mdast';
import type { Delimiter, InlineRule, InlineState } from '../core/inline';
import { nodeIndex } from '../core/inline';
import { point } from '../core/source';
import { OTHER, PUNCTUATION, WHITESPACE, classifyCharacter } from '../inline/classify';
import { resolveAttentionFirst } from '../inline/emphasis';
import { workSteps } from '../inline/lines';
import { appendText, mergeText, pushNode } from '../inline/text';

// GFM strikethrough: `~a~` and `~~a~~`, as micromark-extension-gfm-strikethrough
// reads them. A run of one or two tildes is a delimiter; a closer pairs with
// the nearest opener of the same size.
//
// micromark resolves strikethrough and emphasis in the order their first
// sequence appeared in the leaf, and resolves the inside of every pair with
// strikethrough first. `attentionOrder` records which came first.

const TILDE = 126;
const PRIORITY = 50;

/**
 * For tests: `mixed` sends emphasis-first leaves through emphasis's general
 * path (quadratic, one pair at a time) instead of `resolveAttentionFirst`,
 * to compare both.
 */
export const strikethroughPaths: { mixed: boolean } = { mixed: false };

// The leaf whose first sequence was seen, and whether it was `*` or `_`.
let orderState: InlineState | undefined;
let attentionFirst = false;

function record(state: InlineState, attention: boolean): void {
  if (orderState !== state) {
    orderState = state;
    attentionFirst = attention;
  }
}

function parseTildes(state: InlineState): boolean {
  const text = state.source.text;
  const start = state.pos;
  const end = state.end;
  let pos = start + 1;
  while (pos < end && text.charCodeAt(pos) === TILDE) {
    pos++;
  }
  state.pos = pos;
  if (pos - start > 2) {
    // Three or more tildes are text. micromark fails on each of them.
    appendText(state, text.slice(start, pos), start, pos);
    return true;
  }
  record(state, false);
  // The edges of a range count as whitespace, like line endings.
  const before =
    start === state.ranges[state.range]
      ? WHITESPACE
      : classifyCharacter(text.charCodeAt(start - 1));
  const after = pos === end ? WHITESPACE : classifyCharacter(text.charCodeAt(pos));
  const canOpen = after === OTHER || (after === PUNCTUATION && before !== OTHER);
  const canClose = before === OTHER || (before === PUNCTUATION && after !== OTHER);
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
  state.delimiters.push({ marker: TILDE, node, start, end: pos, canOpen, canClose, active: true });
  return true;
}

/**
 * Pairs the tildes from `bottom` up, on the delimiters alone. Returns flat
 * [opener, closer] stack indices in pairing order (inner pairs first). A pair
 * turns every unpaired tilde inside it into text.
 */
function pairTildes(delimiters: Delimiter[], bottom: number): number[] {
  const pairs: number[] = [];
  const single: number[] = [];
  const double: number[] = [];
  for (let i = bottom; i < delimiters.length; i++) {
    const delimiter = delimiters[i];
    if (delimiter.marker !== TILDE) {
      continue;
    }
    if (__TALATA_TEST__) {
      workSteps.count++;
    }
    const size = delimiter.end - delimiter.start;
    const same = size === 1 ? single : double;
    if (delimiter.canClose && same.length > 0) {
      const open = same.pop()!;
      pairs.push(open, i);
      const other = size === 1 ? double : single;
      while (other.length > 0 && other[other.length - 1] > open) {
        if (__TALATA_TEST__) {
          workSteps.count++;
        }
        other.pop();
      }
      continue;
    }
    if (delimiter.canOpen) {
      same.push(i);
    }
  }
  return pairs;
}

/** Keeps only the tildes from `bottom` up, or only the other delimiters. */
function filterStack(delimiters: Delimiter[], bottom: number, keepTildes: boolean): void {
  let write = bottom;
  for (let i = bottom; i < delimiters.length; i++) {
    const delimiter = delimiters[i];
    if ((delimiter.marker === TILDE) === keepTildes) {
      delimiters[write] = delimiter;
      write++;
    }
  }
  delimiters.length = write;
}

/** Runs the resolvers after this one on `nodes` and `delimiters`, as their own span. */
function resolveRegion(
  state: InlineState,
  nodes: PhrasingContent[],
  delimiters: Delimiter[],
): void {
  if (delimiters.length === 0) {
    return;
  }
  // The other resolvers work on state.nodes and state.delimiters; swap the
  // region in for the call.
  const savedNodes = state.nodes;
  const savedDelimiters = state.delimiters;
  state.nodes = nodes;
  state.delimiters = delimiters;
  for (const rule of state.rules.inlineResolvers) {
    if (rule.priority > PRIORITY) {
      rule.resolve!(state, 0);
    }
  }
  state.nodes = savedNodes;
  state.delimiters = savedDelimiters;
}

interface Region {
  nodes: PhrasingContent[];
  delimiters: Delimiter[];
  opener: Delimiter | undefined;
}

/**
 * Wraps the paired tildes in `delete` nodes in one pass over the span's
 * nodes. The inside of each pair is resolved on its own by the later
 * resolvers (emphasis); delimiters outside every pair stay on the stack.
 */
function rebuild(state: InlineState, bottom: number, pairs: number[]): void {
  const delimiters = state.delimiters;
  const count = delimiters.length - bottom;
  // Per delimiter: 1 opens a pair, 2 closes one.
  const role = new Uint8Array(count);
  for (let p = 0; p < pairs.length; p += 2) {
    role[pairs[p] - bottom] = 1;
    role[pairs[p + 1] - bottom] = 2;
  }
  const source = state.source;
  const nodes = state.nodes;
  const from = nodeIndex(state, delimiters[bottom].node);
  const regions: Region[] = [];
  let region: Region = { nodes: [], delimiters: [], opener: undefined };
  let next = 0;
  for (let n = from; n < nodes.length; n++) {
    const node = nodes[n];
    if (next >= count || node !== delimiters[bottom + next].node) {
      region.nodes.push(node);
      continue;
    }
    const delimiter = delimiters[bottom + next];
    const kind = role[next];
    next++;
    if (kind === 1) {
      regions.push(region);
      region = { nodes: [], delimiters: [], opener: delimiter };
    } else if (kind === 2) {
      resolveRegion(state, region.nodes, region.delimiters);
      mergeText(region.nodes);
      const opener = region.opener!;
      const wrapper: Delete = {
        type: 'delete',
        children: region.nodes,
        position: { start: point(source, opener.start), end: point(source, delimiter.end) },
      };
      region = regions.pop()!;
      region.nodes.push(wrapper);
    } else {
      region.nodes.push(node);
      if (delimiter.marker !== TILDE) {
        region.delimiters.push(delimiter);
      }
    }
  }
  nodes.length = from;
  for (const node of region.nodes) {
    nodes.push(node);
  }
  delimiters.length = bottom;
  for (const delimiter of region.delimiters) {
    delimiters.push(delimiter);
  }
}

/** Strikethrough first: pairs tildes, wraps them, resolves each inside. */
function resolveTildes(state: InlineState, bottom: number): void {
  const pairs = pairTildes(state.delimiters, bottom);
  if (pairs.length === 0) {
    filterStack(state.delimiters, bottom, false);
    return;
  }
  rebuild(state, bottom, pairs);
}

function hasTilde(delimiters: Delimiter[], bottom: number): boolean {
  for (let i = bottom; i < delimiters.length; i++) {
    if (delimiters[i].marker === TILDE) {
      return true;
    }
  }
  return false;
}

function resolveStrikethrough(state: InlineState, bottom: number): void {
  const emphasisFirst = bottom === 0 && orderState === state && attentionFirst;
  if (bottom === 0) {
    // The resolve of the whole leaf is its last step: drop the reference so
    // the leaf can be collected.
    orderState = undefined;
  }
  const delimiters = state.delimiters;
  if (!hasTilde(delimiters, bottom)) {
    return;
  }
  // Inside links and pairs, and when a tilde run came first in the leaf,
  // strikethrough resolves first.
  if (!emphasisFirst) {
    resolveTildes(state, bottom);
    return;
  }
  // Emphasis first. With no possible tilde pair, the tildes are text either
  // way, and emphasis keeps its linear path.
  if (pairTildes(delimiters, bottom).length === 0) {
    filterStack(delimiters, bottom, false);
    return;
  }
  // Emphasis resolves each of its pairs' insides with every rule
  // (micromark's insideSpan), then the tildes left pair.
  if (strikethroughPaths.mixed) {
    for (const rule of state.rules.inlineResolvers) {
      if (rule.priority > PRIORITY) {
        rule.resolve!(state, bottom);
      }
    }
    // Unpaired emphasis runs are text now.
    filterStack(delimiters, bottom, true);
    if (delimiters.length > bottom) {
      resolveTildes(state, bottom);
    }
    return;
  }
  resolveAttentionFirst(state, bottom);
}

const strikethrough: InlineRule = {
  name: 'strikethrough',
  priority: PRIORITY,
  triggers: '~',
  gfm: true,
  parse: parseTildes,
  resolve: resolveStrikethrough,
};

/**
 * Records that a `*` or `_` run came first in the leaf, then lets emphasis
 * (or a literal autolink at `_`) take it.
 */
export const attentionOrder: InlineRule = {
  name: 'attentionOrder',
  priority: 95,
  triggers: '*_',
  gfm: true,
  parse(state: InlineState): boolean {
    record(state, true);
    return false;
  },
};

export default strikethrough;
