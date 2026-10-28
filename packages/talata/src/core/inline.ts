import type { PhrasingContent, Text } from 'mdast';
import { endRange, flushText, mergeText, takeRun } from '../inline/text';
import type { DocumentState } from './state';

/**
 * A run of delimiter characters (`*`, `_`, `~`, `[`, `![`) waiting for the
 * resolve step. The rule that pushes it decides how to use the fields.
 *
 * While a delimiter is on `state.delimiters`, its node is a direct child in
 * `state.nodes`: a resolve removes every delimiter it handles, and a link
 * resolves the span inside it (`resolveSpan`) before it moves those nodes
 * into the link. Find the node's index with `nodeIndex`.
 */
export interface Delimiter {
  /** Character code of the marker. */
  marker: number;
  /** The text node in `nodes` that holds the run's characters. */
  node: Text;
  /** Offsets of the run. */
  start: number;
  end: number;
  canOpen: boolean;
  canClose: boolean;
  active: boolean;
}

/**
 * State of one inline parse: the ranges of one leaf block, the cursor, the
 * output nodes and the text not yet emitted.
 */
export interface InlineState extends DocumentState {
  /** Flat pairs of [start, end) offsets. Each pair but the last ends at a line ending. */
  ranges: number[];
  /** Index of the current pair's start in `ranges` (always even). */
  range: number;
  /** Cursor. A rule's `parse` starts with it on the trigger character and moves it past what it consumed. */
  pos: number;
  /** End of the current range. */
  end: number;
  /** Offset of the trigger character of the current `parse` call. */
  start: number;
  /** Start of plain source text not yet added to the pending text. */
  run: number;
  /** Nodes built so far. */
  nodes: PhrasingContent[];
  /** Pending text value, emitted as one text node by `flushText`. */
  text: string;
  /** Offsets the pending text covers; `textStart` is -1 when nothing is pending. */
  textStart: number;
  textEnd: number;
  delimiters: Delimiter[];
  /**
   * Flat triples for lines with whitespace after their container prefixes:
   * line ending offset, offset after the prefixes, split-tab columns. As
   * passed to `BlockState.inline`; undefined for leaves that did not pass any.
   */
  indents: number[] | undefined;
}

export interface InlineRule {
  name: string;
  /** Lower runs first among rules that share a trigger. */
  priority: number;
  /** ASCII characters that can start this rule. */
  triggers: string;
  /** True: only registered when `options.gfm` is true. */
  gfm?: boolean;
  /**
   * Tries to parse at `state.pos`. Text before the trigger is already in the
   * pending text. On success, emit with `pushNode` or `appendText`, move
   * `state.pos` (and `state.range` when crossing lines) past the construct and
   * return true. On failure, return false and change nothing.
   */
  parse(state: InlineState): boolean;
  /**
   * Pairs the delimiters at index `bottom` and above in `state.delimiters`,
   * replacing nodes in `state.nodes`, and removes them all from the stack.
   * `resolveSpan` calls it in priority order: for the whole leaf with
   * `bottom` 0 after scanning, and for link text when a link closes, so
   * delimiters never pair across a link boundary.
   */
  resolve?(state: InlineState, bottom: number): void;
}

export function createInlineState(
  state: DocumentState,
  ranges: number[],
  indents?: number[],
): InlineState {
  const first = ranges.length > 0 ? ranges[0] : 0;
  return {
    source: state.source,
    options: state.options,
    definitions: state.definitions,
    footnotes: state.footnotes,
    rules: state.rules,
    ranges,
    range: 0,
    pos: first,
    end: ranges.length > 1 ? ranges[1] : 0,
    start: first,
    run: first,
    nodes: [],
    text: '',
    textStart: -1,
    textEnd: -1,
    delimiters: [],
    indents,
  };
}

/**
 * Resolves the delimiters at index `bottom` and above: emits the pending
 * text, runs every rule's `resolve`, then drops what is left of the stack
 * above `bottom`.
 */
export function resolveSpan(state: InlineState, bottom: number): void {
  flushText(state);
  for (const rule of state.rules.inlineResolvers) {
    rule.resolve!(state, bottom);
  }
  if (state.delimiters.length > bottom) {
    state.delimiters.length = bottom;
  }
}

/** Index of `node` in `state.nodes`, searching from the end; -1 if absent. */
export function nodeIndex(state: InlineState, node: PhrasingContent): number {
  const nodes = state.nodes;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i] === node) {
      return i;
    }
  }
  return -1;
}

function tryRules(inline: InlineState, candidates: InlineRule[], pos: number): boolean {
  takeRun(inline, pos);
  inline.start = pos;
  for (const rule of candidates) {
    inline.pos = pos;
    if (rule.parse(inline)) {
      return true;
    }
  }
  inline.pos = pos;
  return false;
}

/**
 * Parses the inline content of `ranges`. Soft line breaks stay in text
 * values with their raw line ending. Trailing whitespace before a line ending
 * becomes a hard break when it is two or more spaces with no tab.
 */
export function parseInline(
  state: DocumentState,
  ranges: number[],
  indents?: number[],
): PhrasingContent[] {
  const inline = createInlineState(state, ranges, indents);
  const text = state.source.text;
  const table = state.rules.inlineByChar;
  while (inline.range < ranges.length) {
    inline.end = ranges[inline.range + 1];
    let pos = inline.pos;
    while (pos < inline.end) {
      const code = text.charCodeAt(pos);
      const candidates = code < 128 ? table[code] : undefined;
      if (candidates !== undefined && tryRules(inline, candidates, pos)) {
        pos = inline.pos;
        inline.run = pos;
        inline.end = ranges[inline.range + 1];
        continue;
      }
      pos++;
    }
    inline.pos = pos;
    endRange(inline);
    inline.range += 2;
    if (inline.range < ranges.length) {
      inline.pos = ranges[inline.range];
      inline.run = inline.pos;
    }
  }
  resolveSpan(inline, 0);
  mergeText(inline.nodes);
  return inline.nodes;
}
