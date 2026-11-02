import type { PhrasingContent } from 'mdast';
import type { BlockState } from '../../core/blocks';
import { TAB, isSpaceOrTab } from '../../core/chars';
import { parseInline } from '../../core/inline';
import type { Source } from '../../core/source';
import { point, skipLineEnding } from '../../core/source';
import type { DocumentState } from '../../core/state';

// Label content. The reference keeps the spaces and tabs at the end of a
// label as text (`_contentTypeTextTrailing`); the inline parser drops them at
// the end of a leaf, so they are put back after the parse.

/** Start of the spaces and tabs that end `[start, end)`. */
function trailingStart(text: string, start: number, end: number): number {
  let from = end;
  while (from > start && isSpaceOrTab(text.charCodeAt(from - 1))) {
    from--;
  }
  return from;
}

/** Appends the spaces and tabs in `[from, to)` to `children` as text. */
function restoreTrailing(
  source: Source,
  children: PhrasingContent[],
  from: number,
  to: number,
): void {
  const tail = children.length > 0 ? children[children.length - 1] : undefined;
  // A last node may already hold the whitespace (a directive named by a tab).
  const covered = tail?.position?.end.offset ?? -1;
  if (covered >= to) {
    return;
  }
  if (covered > from) {
    from = covered;
  }
  const value = source.text.slice(from, to);
  if (tail?.type === 'text' && tail.position !== undefined && covered === from) {
    tail.value += value;
    tail.position.end = point(source, to);
    return;
  }
  children.push({
    type: 'text',
    value,
    position: { start: point(source, from), end: point(source, to) },
  });
}

/**
 * The indents of a leaf are keyed by line end. The last line of a label ends
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
  // The entry of this line is the first key from the bracket on (an outer
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

/** Parses the inline content of a text directive label, in place. */
export function parseLabel(
  state: DocumentState,
  ranges: number[],
  indents: number[] | undefined,
): PhrasingContent[] {
  const text = state.source.text;
  const children = parseInline(state, ranges, labelIndents(text, ranges, indents));
  const stop = ranges[ranges.length - 1];
  const lastStart = ranges[ranges.length - 2];
  if (ranges.length > 2 && lastStart === stop && text.charCodeAt(stop - 1) !== TAB) {
    // micromark feeds no empty last line to the label, so the line ending
    // before it ends at the line start, not after the container prefixes. A
    // tab that a quote marker split leaves columns there, which it feeds.
    const tail = children.length > 0 ? children[children.length - 1] : undefined;
    const lineStart = skipLineEnding(text, ranges[ranges.length - 3]);
    const position = tail?.type === 'text' || tail?.type === 'break' ? tail.position : undefined;
    if (position?.end.offset === stop && lineStart < stop) {
      position.end = point(state.source, lineStart);
    }
  }
  const from = trailingStart(text, lastStart, stop);
  if (from < stop) {
    restoreTrailing(state.source, children, from, stop);
  }
  return children;
}

/**
 * Queues the label `[start, end)` of a leaf or container directive for the
 * inline pass, into `node.children`.
 */
export function queueLabel(
  state: BlockState,
  node: { children: PhrasingContent[] },
  start: number,
  end: number,
): void {
  const from = trailingStart(state.source.text, start, end);
  if (from === end) {
    state.inline(node, [start, end]);
    return;
  }
  const source = state.source;
  // The inline pass assigns the parsed children; the trailing text follows.
  state.inline(
    {
      get children(): PhrasingContent[] {
        return node.children;
      },
      set children(value: PhrasingContent[]) {
        restoreTrailing(source, value, from, end);
        node.children = value;
      },
    },
    [start, end],
  );
}
