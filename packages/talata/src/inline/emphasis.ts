import type { Emphasis, PhrasingContent, Strong, Text } from 'mdast';
import { ASTERISK, UNDERSCORE } from '../core/chars';
import type { InlineRule, InlineState } from '../core/inline';
import { nodeIndex, resolveSpan } from '../core/inline';
import { point } from '../core/source';
import { OTHER, PUNCTUATION, WHITESPACE, classifyCharacter } from './classify';
import { appendText, mergeText, pushNode } from './text';

// Emphasis and strong emphasis with `*` and `_`, following micromark's
// attention construct: each run is a delimiter, and `resolve` pairs closers
// with the nearest matching opener.

const TILDE = 126;

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

function resolveEmphasis(state: InlineState, bottom: number): void {
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

const emphasis: InlineRule = {
  name: 'emphasis',
  priority: 100,
  triggers: '*_',
  parse: parseRun,
  resolve: resolveEmphasis,
};

export default emphasis;
