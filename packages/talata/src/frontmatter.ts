import { cachedExtension } from './ext/api';
import type { Extension } from './ext/api';

/** Name of a frontmatter style: `'yaml'` uses `---` fences, `'toml'` uses `+++`. */
export type Preset = 'toml' | 'yaml';

/** Opening and closing sequence of a fence or marker. */
export interface Info {
  close: string;
  open: string;
}

interface MatterProps {
  /** Node type to produce, such as `'yaml'`. */
  type: string;
  /** Recognize the matter anywhere in the document, not only at its start. */
  anywhere?: boolean | null | undefined;
}

/** A kind of matter. `marker` is repeated 3 times to make the fence; `fence` is the whole fence. They are exclusive. */
export type Matter =
  | (MatterProps & { marker: Info | string; fence?: never })
  | (MatterProps & { fence: Info | string; marker?: never });

/** Same as the `Options` of `micromark-extension-frontmatter`. The default is `'yaml'`. */
export type Options = Matter | Preset | (Matter | Preset)[];

/**
 * Frontmatter at the start of the document, as a `yaml` or `toml` node.
 * Matches `micromark-extension-frontmatter` with `mdast-util-frontmatter`.
 */
export function frontmatter(options?: Options | null): Extension {
  return cachedExtension(`frontmatter:${JSON.stringify(options ?? 'yaml')}`, () => ({
    name: 'talata:frontmatter',
  }));
}
