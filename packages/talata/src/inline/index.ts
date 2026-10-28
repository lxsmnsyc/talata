import type { InlineRule } from '../core/inline';
import autolink from './autolink';
import characterReference from './character-reference';
import codeSpan from './code-span';
import emphasis from './emphasis';
import escape from './escape';
import html from './html';
import link from './link';
import { footnoteCall } from '../gfm/footnote';
import taskListCheck from '../gfm/task-list';

// Registered inline rules. Each rule lives in its own file; add one line here.
// Plain text, soft breaks and trailing-space hard breaks are built in
// (`./text.ts`).
export const inlineRules: InlineRule[] = [
  escape,
  characterReference,
  codeSpan,
  emphasis,
  autolink,
  html,
  link,
  footnoteCall,
  taskListCheck,
];

// Helpers for inline rules.
export { appendText, flushText, mergeText, pushNode } from './text';
export { nodeIndex, resolveSpan } from '../core/inline';
