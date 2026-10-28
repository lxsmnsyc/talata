import type { BlockRule, ParagraphPrefixRule } from '../core/blocks';
import blockquote from './blockquote';
import codeFenced from './code-fenced';
import codeIndented from './code-indented';
import definition from './definition';
import footnoteDefinition from '../gfm/footnote';
import { taskListStart } from '../gfm/task-list';
import headingAtx from './heading-atx';
import headingSetext from './heading-setext';
import html from './html';
import listItem from './list-item';
import thematicBreak from './thematic-break';

// Registered block rules. Each rule lives in its own file; add one line here.
// Priorities (lower runs first), spaced so GFM and later rules fit between:
// blockquote 100, ATX heading 200, fenced code 300, HTML 400, setext
// underline 500, thematic break 600, list item 700, indented code 800.
export const blockRules: BlockRule[] = [
  blockquote,
  headingAtx,
  thematicBreak,
  listItem,
  codeFenced,
  html,
  headingSetext,
  codeIndented,
  footnoteDefinition,
  taskListStart,
];

// Registered paragraph prefix rules (link reference definitions).
export const paragraphPrefixRules: ParagraphPrefixRule[] = [definition];
