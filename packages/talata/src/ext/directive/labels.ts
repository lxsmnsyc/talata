import type { PhrasingContent, Root, RootContent } from 'mdast';
import type { BlockState } from '../../core/blocks';
import { isSpaceOrTab } from '../../core/chars';
import { parseInline } from '../../core/inline';
import type { InlineState } from '../../core/inline';
import type { Transform } from '../../core/transform';
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

/** Whether the line that ends at `lineEnd` keeps columns of a split tab after its prefixes. */
function hasSplitTab(indents: number[] | undefined, lineEnd: number): boolean {
  if (indents === undefined) {
    return false;
  }
  for (let i = 0; i < indents.length; i += 3) {
    if (indents[i] === lineEnd) {
      return indents[i + 2] > 0;
    }
  }
  return false;
}

/** Parses the inline content of a text directive label, in place. */
export function parseLabel(
  state: DocumentState,
  ranges: number[],
  indents: number[] | undefined,
): PhrasingContent[] {
  const text = state.source.text;
  const lines = labelIndents(text, ranges, indents);
  const children = parseInline(state, ranges, lines);
  const stop = ranges[ranges.length - 1];
  const lastStart = ranges[ranges.length - 2];
  if (ranges.length > 2 && lastStart === stop && !hasSplitTab(lines, stop)) {
    // micromark feeds no empty last line to the label, so the line ending
    // before it ends at the line start, not after the container prefixes. A
    // tab that a quote marker split leaves columns there, which it feeds; a
    // tab that a footnote definition's indent takes whole leaves none.
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

// A text directive label is parsed after the text it is in, but an image
// around it takes its `alt` from that text at once. The label's children
// hold a marker until then: NUL, the label's number, NUL (the parser reads
// no NUL, `core/source.ts`). The transform puts each label's text in its
// place in the alts.

const NUL = '\u0000';

/** The children of each queued label of a parse, by number. */
const queuedLabels = new WeakMap<Source, PhrasingContent[][]>();

/**
 * Queues the label `ranges` of a text directive into `children`. The label
 * is a chunk of its own, parsed one pass after the text it is in, so it sees
 * the definitions of the contents parsed in between.
 */
export function queueTextLabel(
  state: InlineState,
  children: PhrasingContent[],
  ranges: number[],
): void {
  let labels = queuedLabels.get(state.source);
  if (labels === undefined) {
    labels = [];
    queuedLabels.set(state.source, labels);
  }
  children.push({ type: 'text', value: NUL + labels.length + NUL });
  labels.push(children);
  const indents = state.indents;
  const queue = state.queue;
  queue.add(queue.pass + 1, ranges[0], () => {
    children.length = 0;
    for (const child of parseLabel(state, ranges, indents)) {
      children.push(child);
    }
  });
}

/** Plain text of nodes, as mdast-util-to-string gives an image's `alt`. */
function toPlainText(nodes: PhrasingContent[]): string {
  let result = '';
  for (const node of nodes) {
    if ('value' in node) {
      result += node.value;
    } else if ('alt' in node) {
      result += node.alt ?? '';
    } else if ('children' in node) {
      result += toPlainText(node.children);
    }
  }
  return result;
}

/** `alt` with the text of each label marker in it. */
function replaceMarkers(alt: string, labels: PhrasingContent[][]): string {
  let result = '';
  let from = 0;
  for (;;) {
    const open = alt.indexOf(NUL, from);
    if (open === -1) {
      return result + alt.slice(from);
    }
    const close = alt.indexOf(NUL, open + 1);
    // An image in the label has the markers of the labels in it.
    const text = toPlainText(labels[Number(alt.slice(open + 1, close))]);
    result += alt.slice(from, open) + replaceMarkers(text, labels);
    from = close + 1;
  }
}

function fixAlts(node: Root | RootContent, labels: PhrasingContent[][]): void {
  if ('alt' in node && typeof node.alt === 'string' && node.alt.includes(NUL)) {
    node.alt = replaceMarkers(node.alt, labels);
  }
  if ('children' in node) {
    for (const child of node.children) {
      fixAlts(child, labels);
    }
  }
}

/** Image alts with the text of the text directive labels in them. */
export const labelAlts: Transform = {
  name: 'directiveLabelAlts',
  transform(tree: Root, state: DocumentState): void {
    const labels = queuedLabels.get(state.source);
    if (labels !== undefined) {
      queuedLabels.delete(state.source);
      fixAlts(tree, labels);
    }
  },
};
