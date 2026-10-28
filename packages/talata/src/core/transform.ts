import type { Root } from 'mdast';
import type { DocumentState } from './state';

/** A tree pass that runs after inline parsing, in registration order. */
export interface Transform {
  name: string;
  /** True: only registered when `options.gfm` is true. */
  gfm?: boolean;
  transform(tree: Root, state: DocumentState): void;
}

/** Registered transforms. Add one line per transform. */
export const transforms: Transform[] = [];
