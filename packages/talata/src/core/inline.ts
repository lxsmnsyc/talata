import type { PhrasingContent, Text } from 'mdast';
import { endRange, flushText, takeRun } from '../inline/text';
import type { DocumentState } from './state';

/**
 * A run of delimiter characters (`*`, `_`, `~`, `[`, `![`) waiting for the
 * resolve step. The rule that pushes it decides how to use the fields.
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
  /** Runs once after the whole leaf is scanned, in priority order. Emphasis uses it for its delimiter stack. */
  resolve?(state: InlineState): void;
}

export function createInlineState(state: DocumentState, ranges: number[]): InlineState {
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
  };
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
export function parseInline(state: DocumentState, ranges: number[]): PhrasingContent[] {
  const inline = createInlineState(state, ranges);
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
  flushText(inline);
  for (const rule of state.rules.inlineResolvers) {
    rule.resolve!(inline);
  }
  return inline.nodes;
}
