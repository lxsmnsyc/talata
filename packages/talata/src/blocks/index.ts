import type { BlockRule, ParagraphPrefixRule } from '../core/blocks';
import headingAtx from './heading-atx';
import thematicBreak from './thematic-break';

// Registered block rules. Each rule lives in its own file; add one line here.
// Priorities (lower runs first), spaced so GFM and later rules fit between:
// blockquote 100, ATX heading 200, fenced code 300, HTML 400, setext
// underline 500, thematic break 600, list item 700, indented code 800.
export const blockRules: BlockRule[] = [headingAtx, thematicBreak];

// Registered paragraph prefix rules (link reference definitions).
export const paragraphPrefixRules: ParagraphPrefixRule[] = [];
