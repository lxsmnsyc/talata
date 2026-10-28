import type { InlineRule } from '../core/inline';

// Registered inline rules. Each rule lives in its own file; add one line here.
// Plain text, soft breaks and trailing-space hard breaks are built in
// (`./text.ts`).
export const inlineRules: InlineRule[] = [];

// Helpers for inline rules.
export { appendText, flushText, mergeText, pushNode } from './text';
export { nodeIndex, resolveSpan } from '../core/inline';
