/** Numbers per line in `Spans.data`: source line index, start, end, visual column, split-tab columns. */
export const SPAN_SIZE = 5;

/** Lines of a nested document, after the containers around took their prefixes. */
export interface Spans {
  data: number[];
  /** First and after-last line, counted in lines. A collector may share its parent's `data`. */
  from: number;
  to: number;
  /**
   * The last line keeps its line ending. The document then ends with one more
   * empty line at the start of the next source line, before any prefix
   * (`source.lineStarts[index + 1]`), as a source with a final line ending.
   */
  finalLineEnding: boolean;
}
