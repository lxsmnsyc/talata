import type { PhrasingContent } from 'mdast';
import { SPACE, TAB } from '../core/chars';
import type { InlineState } from '../core/inline';
import { point, skipLineEnding } from '../core/source';
import { containerEnd, wasReached } from './lines';

// Plain text, soft line breaks and trailing-space hard breaks. These are not
// a rule: the inline parser calls them for every character that no rule
// consumes and at every range end.

/** Adds `value`, covering source offsets [start, end), to the pending text. */
export function appendText(state: InlineState, value: string, start: number, end: number): void {
  if (state.textStart === -1) {
    state.textStart = start;
    state.text = value;
  } else {
    state.text += value;
  }
  state.textEnd = end;
}

/** Adds the plain source text from `state.run` to `upTo` to the pending text. */
export function takeRun(state: InlineState, upTo: number): void {
  const run = state.run;
  if (upTo > run) {
    appendText(state, state.source.text.slice(run, upTo), run, upTo);
    state.run = upTo;
  }
}

/** Emits the pending text as one text node. */
export function flushText(state: InlineState): void {
  if (state.textStart === -1) {
    return;
  }
  const source = state.source;
  state.nodes.push({
    type: 'text',
    value: state.text,
    position: { start: point(source, state.textStart), end: point(source, state.textEnd) },
  });
  state.text = '';
  state.textStart = -1;
}

/**
 * Merges adjacent text nodes in place, as the reference does. Delimiter runs
 * left unpaired stay as separate text nodes until this runs. The inline
 * parser runs it on the leaf's nodes; a link runs it on its children.
 */
export function mergeText(nodes: PhrasingContent[]): void {
  let write = 0;
  for (let read = 0; read < nodes.length; read++) {
    const node = nodes[read];
    const previous = write > 0 ? nodes[write - 1] : undefined;
    if (node.type === 'text' && previous?.type === 'text') {
      previous.value += node.value;
      if (previous.position !== undefined && node.position !== undefined) {
        previous.position.end = node.position.end;
      }
    } else {
      nodes[write] = node;
      write++;
    }
  }
  nodes.length = write;
}

/** Emits the pending text, then `node`. */
export function pushNode(state: InlineState, node: PhrasingContent): void {
  flushText(state);
  state.nodes.push(node);
}

/**
 * Handles the end of the current range: drops trailing spaces and tabs, then
 * emits the line ending as a hard break or as text. A break pushed right
 * before the line ending (a backslash break) is extended over it.
 */
export function endRange(state: InlineState): void {
  const text = state.source.text;
  const end = state.end;
  let whitespace = end;
  let tabs = false;
  while (whitespace > state.run) {
    const code = text.charCodeAt(whitespace - 1);
    if (code === SPACE) {
      whitespace--;
    } else if (code === TAB) {
      tabs = true;
      whitespace--;
    } else {
      break;
    }
  }
  takeRun(state, whitespace);
  state.run = end;
  if (state.range + 2 >= state.ranges.length) {
    return;
  }
  // After a lookahead reached the next line, micromark's line ending ends
  // after that line's container prefixes, else at the start of the line.
  const next = wasReached(state, state.range + 2)
    ? containerEnd(state, state.range + 2)
    : skipLineEnding(text, end);
  const nodes = state.nodes;
  if (
    whitespace === end &&
    state.textStart === -1 &&
    nodes.length > 0 &&
    nodes[nodes.length - 1].type === 'break'
  ) {
    const last = nodes[nodes.length - 1];
    if (last.position !== undefined) {
      last.position.end = point(state.source, next);
    }
    return;
  }
  if (!tabs && end - whitespace >= 2) {
    pushNode(state, {
      type: 'break',
      position: { start: point(state.source, whitespace), end: point(state.source, next) },
    });
    return;
  }
  appendText(state, text.slice(end, skipLineEnding(text, end)), end, next);
}
