import type { BlockState } from '../../core/blocks';

// The container prefixes of a line that a flow construct reads past the
// block parser: where a lazy line starts, for the error that points there.

const SPACE = 32;
const TAB = 9;

/**
 * Where a lazy line at `at` starts after the containers up to depth `bound`
 * that take it, or -1 when every container takes it and it is not blank
 * (the content ended: the end of a container directive). List items and
 * footnote definitions take whitespace, a quote its marker and one space.
 */
export function prefixEnd(state: BlockState, bound: number, at: number): number {
  const text = state.source.text;
  let pos = at;
  let directive = false;
  for (let depth = 1; depth <= bound; depth++) {
    const name = state.getBlock(depth)?.name;
    if (name === 'blockquote') {
      let i = pos;
      while (text.charCodeAt(i) === SPACE || text.charCodeAt(i) === TAB) {
        i++;
      }
      // A quote with only the end of the text after its marker does not take the line.
      // A quote with only the end of the text after its marker does not
      // take the line, nor the quotes before it.
      if (text.charCodeAt(i) === 62 && i + 1 >= text.length) {
        return at;
      }
      if (text.charCodeAt(i) !== 62) {
        // In the content of a directive, a line that is not blank is lazy
        // from its start, and so is one that ends right after a quote
        // marker and its space.
        if (directive && (!isBlankText(text, at) || endsAfterSpace(text, at, pos))) {
          return at;
        }
        return pos;
      }
      pos = i + 1;
      if (text.charCodeAt(pos) === SPACE || text.charCodeAt(pos) === TAB) {
        pos++;
      }
    } else if (name === 'listItem') {
      // A list item takes its content width; a footnote definition nothing.
      const block = state.getBlock(depth);
      const width =
        block !== undefined && 'size' in block && typeof block.size === 'number' ? block.size : 0;
      // Columns, a tab to the next tab stop, from the start of the line.
      let column = 0;
      for (let i = at; i < pos; i++) {
        column = text.charCodeAt(i) === TAB ? column + 4 - (column % 4) : column + 1;
      }
      const goal = column + width;
      let after = pos;
      while (
        column < goal &&
        (text.charCodeAt(after) === SPACE || text.charCodeAt(after) === TAB)
      ) {
        column = text.charCodeAt(after) === TAB ? column + 4 - (column % 4) : column + 1;
        after++;
      }
      // Not when only the end of the text follows.
      if (after < text.length) {
        pos = after;
      }
    } else if (name === 'containerDirective') {
      directive = true;
      // A directive takes the indent of its opening fence.
      const block = state.getBlock(depth);
      const indent =
        block !== undefined && 'indent' in block && typeof block.indent === 'number'
          ? block.indent
          : 0;
      let after = pos;
      for (let taken = 0; taken < indent && text.charCodeAt(after) === SPACE; taken++) {
        after++;
      }
      // Only on a blank line that the end of the text does not follow.
      if (after < text.length && isBlankText(text, after)) {
        pos = after;
      }
    }
  }
  return isBlankText(text, pos) ? pos : -1;
}

/** Whether the line ends at `pos`, right after a quote marker and one space (a tab is split). */
function endsAfterSpace(text: string, at: number, pos: number): boolean {
  const code = text.charCodeAt(pos);
  const before = text.charCodeAt(pos - 1);
  return (
    pos - 2 >= at &&
    (pos === text.length || code === 10 || code === 13) &&
    before === SPACE &&
    text.charCodeAt(pos - 2) === 62
  );
}

/** Whether the line at `from` holds only whitespace and quote markers. */
export function isBlankText(text: string, from: number): boolean {
  for (let i = from; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10 || code === 13) {
      return true;
    }
    if (code !== SPACE && code !== TAB && code !== 62) {
      return false;
    }
  }
  return true;
}
