import type { Extension } from '../api';
import containerDirective, { directiveEnd, directiveHtml } from './container';
import leafDirective from './leaf';
import directiveSpread from './spread';
import textDirective from './text';

/** The directive rules, as one extension. */
export default function createDirective(): Extension {
  return {
    name: 'talata:directive',
    blockRules: [directiveEnd, containerDirective, leafDirective, directiveHtml],
    inlineRules: [textDirective],
    transforms: [directiveSpread],
  };
}
