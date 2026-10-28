import type { Extension } from '../api';
import containerDirective, { directiveCode, insideRules, lazyHtml } from './container';
import { directiveTransform } from './fixes';
import leafDirective from './leaf';
import textDirective from './text';

/** The directive rules, as one extension. */
export default function createDirective(): Extension {
  return {
    name: 'talata:directive',
    blockRules: [containerDirective, leafDirective, directiveCode, lazyHtml, ...insideRules],
    inlineRules: [textDirective],
    transforms: [directiveTransform],
  };
}
