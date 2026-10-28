import { CR, LF, SPACE, TAB } from './chars';
import type { Registry } from './registry';
import type { Source } from './source';

export interface ParseOptions {
  gfm: boolean;
}

/** Facts shared across the whole document. */
export interface DocumentState {
  source: Source;
  options: ParseOptions;
  /** Normalized labels of link reference definitions. */
  definitions: Set<string>;
  /** Normalized labels of GFM footnote definitions. */
  footnotes: Set<string>;
  /** The rules in effect for this parse, sorted and filtered by `options`. */
  rules: Registry;
}

export function createDocumentState(
  source: Source,
  options: ParseOptions,
  rules: Registry,
): DocumentState {
  return { source, options, definitions: new Set(), footnotes: new Set(), rules };
}

/**
 * Normalizes a label as micromark-util-normalize-identifier does: collapse
 * runs of spaces, tabs and line endings to one space, trim, then
 * `toLowerCase().toUpperCase()`.
 */
export function normalizeIdentifier(label: string): string {
  let result = '';
  let pendingSpace = false;
  let segmentStart = -1;
  const length = label.length;
  for (let i = 0; i < length; i++) {
    const code = label.charCodeAt(i);
    if (code === SPACE || code === TAB || code === LF || code === CR) {
      if (segmentStart !== -1) {
        result += label.slice(segmentStart, i);
        segmentStart = -1;
        pendingSpace = true;
      }
    } else if (segmentStart === -1) {
      if (pendingSpace) {
        result += ' ';
        pendingSpace = false;
      }
      segmentStart = i;
    }
  }
  if (segmentStart !== -1) {
    result += label.slice(segmentStart);
  }
  return result.toLowerCase().toUpperCase();
}
