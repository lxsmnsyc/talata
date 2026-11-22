import type { Extension } from '../api';
import containerDirective, { closingFence } from './container';
import leafDirective from './leaf';
import { labelAlts } from './labels';
import directiveSpread from './spread';
import textDirective from './text';

/** The directive rules, as one extension. */
export default function createDirective(): Extension {
  return {
    name: 'talata:directive',
    blockRules: [closingFence, containerDirective, leafDirective],
    inlineRules: [textDirective],
    transforms: [directiveSpread, labelAlts],
  };
}
