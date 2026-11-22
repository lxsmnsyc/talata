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
  // The visual column at `pos`, and the columns of a tab before `pos` that
  // no container took yet (a quote's space or an indent took only part).
  let column = 0;
  let virtual = 0;
  let directive = false;
  // A quote inside a directive took a marker on this line.
  let quotedInside = false;
  // Depth of the innermost directive.
  let directiveDepth = 0;
  // A list item or a directive took the rest of the line, and the end of
  // the text follows.
  let takenToEnd = false;
  // Nothing is left of the line in the content of the innermost directive.
  let emptyContent = false;
  for (let depth = 1; depth <= bound; depth++) {
    const name = state.getBlock(depth)?.name;
    if (name === 'blockquote') {
      let i = pos;
      while (text.charCodeAt(i) === SPACE || text.charCodeAt(i) === TAB) {
        i++;
      }
      // A quote with only the end of the text after its marker does not
      // take the line, nor the quotes before it.
      if (text.charCodeAt(i) === 62 && i + 1 >= text.length) {
        return at;
      }
      if (text.charCodeAt(i) !== 62) {
        // In the content of a directive, a line that is not blank is lazy
        // from its start. So is one that list items took to the end of the
        // text, one with nothing left in the directive's content when the
        // line after it is lazy or missing (micromark ends the content
        // before it), and one that ends the text right after a quote marker
        // inside the directive and its space.
        const afterSpace = endsAfterSpace(text, at, pos) && quotedInside && pos === text.length;
        if (
          directive &&
          (!isBlankText(text, at) ||
            takenToEnd ||
            (emptyContent && nextIsLazy(state, directiveDepth, at)) ||
            afterSpace)
        ) {
          return at;
        }
        return pos;
      }
      column = columnAfter(text, pos, i, column + virtual) + 1;
      virtual = 0;
      pos = i + 1;
      const code = text.charCodeAt(pos);
      if (code === SPACE) {
        pos++;
        column++;
      } else if (code === TAB) {
        // The space is one column of the tab; the others are left.
        virtual = 3 - (column % 4);
        pos++;
        column++;
      }
      quotedInside ||= directive;
    } else if (name === 'listItem') {
      // A list item takes its content width; a footnote definition nothing.
      const block = state.getBlock(depth);
      const width =
        block !== undefined && 'size' in block && typeof block.size === 'number' ? block.size : 0;
      const taken = take(text, pos, column, virtual, width);
      // Not when only the end of the text follows, unless a tab in a
      // directive has columns left.
      if (taken.pos < text.length || (directive && taken.virtual > 0)) {
        pos = taken.pos;
        column = taken.column;
        virtual = taken.virtual;
      } else if (taken.virtual === 0) {
        takenToEnd = true;
      }
    } else if (name === 'containerDirective') {
      directive = true;
      directiveDepth = depth;
      // A directive takes the indent of its opening fence. A tab that the
      // indent only partly takes is still consumed (micromark splits it).
      const block = state.getBlock(depth);
      const indent =
        block !== undefined && 'indent' in block && typeof block.indent === 'number'
          ? block.indent
          : 0;
      const taken = take(text, pos, column, virtual, indent);
      const code = text.charCodeAt(taken.pos);
      emptyContent =
        takenToEnd ||
        (taken.virtual === 0 && (taken.pos >= text.length || code === 10 || code === 13));
      // Only on a blank line that the end of the text does not follow, or
      // whose tab the indent split (its columns are left).
      if ((taken.pos < text.length || taken.virtual > 0) && isBlankText(text, taken.pos)) {
        pos = taken.pos;
        column = taken.column;
        virtual = taken.virtual;
      } else if (taken.pos >= text.length && taken.virtual === 0) {
        takenToEnd = true;
      }
    }
  }
  return isBlankText(text, pos) ? pos : -1;
}

/**
 * Whether the line after the one at `at` is missing, or lazy for the
 * containers above depth `below`: a quote without its marker, a list item
 * or footnote definition without its indent on a line that is not blank.
 * The end of the text is a line no quote takes.
 */
function nextIsLazy(state: BlockState, below: number, at: number): boolean {
  const text = state.source.text;
  let pos = at;
  while (pos < text.length && text.charCodeAt(pos) !== 10 && text.charCodeAt(pos) !== 13) {
    pos++;
  }
  if (pos >= text.length) {
    return true;
  }
  pos += text.charCodeAt(pos) === 13 && text.charCodeAt(pos + 1) === 10 ? 2 : 1;
  let column = 0;
  let virtual = 0;
  for (let depth = 1; depth < below; depth++) {
    const block = state.getBlock(depth);
    const name = block?.name;
    if (name === 'blockquote') {
      let i = pos;
      while (text.charCodeAt(i) === SPACE || text.charCodeAt(i) === TAB) {
        i++;
      }
      if (text.charCodeAt(i) !== 62) {
        return !startsContainer(state, pos);
      }
      column = columnAfter(text, pos, i, column + virtual) + 1;
      virtual = 0;
      pos = i + 1;
      const code = text.charCodeAt(pos);
      if (code === SPACE) {
        pos++;
        column++;
      } else if (code === TAB) {
        virtual = 3 - (column % 4);
        pos++;
        column++;
      }
    } else if (
      name === 'listItem' ||
      name === 'footnoteDefinition' ||
      name === 'containerDirective'
    ) {
      let width = 4;
      if (name === 'containerDirective') {
        width =
          block !== undefined && 'indent' in block && typeof block.indent === 'number'
            ? block.indent
            : 0;
      } else if (name === 'listItem') {
        width =
          block !== undefined && 'size' in block && typeof block.size === 'number' ? block.size : 0;
      }
      if (name !== 'containerDirective' && isBlankText(text, pos) && !hasMarker(text, pos)) {
        // A blank line goes on in a list item or a footnote definition.
        continue;
      }
      const taken = take(text, pos, column, virtual, width);
      if (name !== 'containerDirective' && taken.column < column + width) {
        return !startsContainer(state, pos);
      }
      pos = taken.pos;
      column = taken.column;
      virtual = taken.virtual;
    }
  }
  return false;
}

/**
 * Whether a quote, a list item or a footnote definition starts at `pos`:
 * micromark then closes the containers that did not go on, and the line is
 * not lazy.
 */
function startsContainer(state: BlockState, pos: number): boolean {
  const text = state.source.text;
  let i = pos;
  while (text.charCodeAt(i) === SPACE || text.charCodeAt(i) === TAB) {
    i++;
  }
  const code = text.charCodeAt(i);
  if (code === 62) {
    return true;
  }
  if (code === 45 || code === 42 || code === 43) {
    return endsMarker(text, i + 1) && !isThematicBreak(text, i, code);
  }
  if (code >= 48 && code <= 57) {
    let j = i;
    while (j - i < 9 && text.charCodeAt(j) >= 48 && text.charCodeAt(j) <= 57) {
      j++;
    }
    const after = text.charCodeAt(j);
    return (after === 46 || after === 41) && endsMarker(text, j + 1);
  }
  if (code === 91 && text.charCodeAt(i + 1) === 94 && state.options.gfm) {
    let j = i + 2;
    while (j < text.length && text.charCodeAt(j) !== 93 && text.charCodeAt(j) !== 10) {
      j++;
    }
    return j > i + 2 && text.charCodeAt(j) === 93 && text.charCodeAt(j + 1) === 58;
  }
  return false;
}

/** Whether a list marker ending before `i` is followed by whitespace or the end of the line. */
function endsMarker(text: string, i: number): boolean {
  const code = text.charCodeAt(i);
  return i >= text.length || code === SPACE || code === TAB || code === 10 || code === 13;
}

/** Whether the line from `from` is three or more `marker`s with whitespace between. */
function isThematicBreak(text: string, from: number, marker: number): boolean {
  if (marker === 43) {
    return false;
  }
  let count = 0;
  for (let i = from; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10 || code === 13) {
      break;
    }
    if (code === marker) {
      count++;
    } else if (code !== SPACE && code !== TAB) {
      return false;
    }
  }
  return count >= 3;
}

/** Whether the line at `from` holds a quote marker. */
function hasMarker(text: string, from: number): boolean {
  for (let i = from; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10 || code === 13) {
      return false;
    }
    if (code === 62) {
      return true;
    }
  }
  return false;
}

/** The visual column after `text` from `from` to `to`, from `column`. */
function columnAfter(text: string, from: number, to: number, column: number): number {
  for (let i = from; i < to; i++) {
    column = text.charCodeAt(i) === TAB ? column + 4 - (column % 4) : column + 1;
  }
  return column;
}

interface Taken {
  pos: number;
  column: number;
  virtual: number;
}

/**
 * Takes up to `width` columns of whitespace at `pos`: first the columns
 * left of a tab before it, then spaces and tabs. A tab that goes past the
 * width is consumed, and its other columns are left.
 */
function take(text: string, pos: number, column: number, virtual: number, width: number): Taken {
  const goal = column + width;
  const used = Math.min(virtual, width);
  column += used;
  virtual -= used;
  while (column < goal && (text.charCodeAt(pos) === SPACE || text.charCodeAt(pos) === TAB)) {
    const next = text.charCodeAt(pos) === TAB ? column + 4 - (column % 4) : column + 1;
    pos++;
    if (next > goal) {
      virtual = next - goal;
      column = goal;
    } else {
      column = next;
    }
  }
  return { pos, column, virtual };
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
