import { cachedExtension } from './ext/api';
import type { Extension } from './ext/api';
import { matterRule } from './ext/frontmatter/matter';
import type { ResolvedMatter } from './ext/frontmatter/matter';

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
  return cachedExtension(`frontmatter:${JSON.stringify(options ?? 'yaml')}`, () => {
    const list = Array.isArray(options) ? options : [options ?? 'yaml'];
    const matters: ResolvedMatter[] = [];
    for (const item of list) {
      matters.push(resolve(item));
    }
    return { name: 'talata:frontmatter', blockRules: [matterRule(matters)] };
  });
}

function pick(schema: Info | string, prop: 'close' | 'open'): string {
  return typeof schema === 'string' ? schema : schema[prop];
}

/** A matter as checked at run time, where a caller without types may leave fields out. */
interface Loose {
  type?: string | undefined;
  marker?: Info | string | undefined;
  fence?: Info | string | undefined;
  anywhere?: boolean | null | undefined;
}

function resolve(option: Loose | string): ResolvedMatter {
  let matter: Loose;
  if (typeof option === 'string') {
    if (option !== 'yaml' && option !== 'toml') {
      throw new Error(`Missing matter definition for \`${option}\``);
    }
    matter = { type: option, marker: option === 'yaml' ? '-' : '+' };
  } else {
    matter = option;
  }
  if (matter.type === undefined) {
    throw new Error('Missing `type` in matter');
  }
  let open: string;
  let close: string;
  if (matter.marker === undefined && matter.fence === undefined) {
    throw new Error('Missing `marker` or `fence` in matter');
  }
  if (matter.marker === undefined) {
    open = pick(matter.fence ?? '', 'open');
    close = pick(matter.fence ?? '', 'close');
  } else {
    open = pick(matter.marker, 'open').repeat(3);
    close = pick(matter.marker, 'close').repeat(3);
  }
  return { type: matter.type, open, close, anywhere: matter.anywhere === true };
}
