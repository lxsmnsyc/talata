import type { BlockRule, ParagraphPrefixRule } from './blocks';
import type { InlineRule } from './inline';
import type { ParseOptions } from './state';
import type { Transform } from './transform';

/** The rule lists as registered, before filtering and sorting. */
export interface RuleSet {
  blockRules: BlockRule[];
  paragraphPrefixRules: ParagraphPrefixRule[];
  inlineRules: InlineRule[];
  transforms: Transform[];
}

/** Rules ready for one parse: GFM rules filtered by options, sorted by priority, indexed by trigger. */
export interface Registry {
  /** For each ASCII code: rules triggered by it plus rules without triggers, by priority. */
  blockByChar: BlockRule[][];
  /** Rules without triggers, for lines that start with a non-ASCII character. */
  blockOther: BlockRule[];
  paragraphPrefixRules: ParagraphPrefixRule[];
  /** For each ASCII code: inline rules it triggers, by priority, or undefined. */
  inlineByChar: (InlineRule[] | undefined)[];
  /** Inline rules with a `resolve` step, by priority. */
  inlineResolvers: InlineRule[];
  transforms: Transform[];
}

interface Ranked {
  priority: number;
  gfm?: boolean;
}

/** Keeps the rules enabled by `options` and sorts them by priority, keeping registration order on ties. */
function select<T extends Ranked>(rules: T[], options: ParseOptions): T[] {
  const result: T[] = [];
  for (const rule of rules) {
    if (rule.gfm === true && !options.gfm) {
      continue;
    }
    let i = result.length;
    while (i > 0 && result[i - 1].priority > rule.priority) {
      i--;
    }
    result.splice(i, 0, rule);
  }
  return result;
}

function hasTrigger(triggers: string, code: number): boolean {
  for (let i = 0; i < triggers.length; i++) {
    if (triggers.charCodeAt(i) === code) {
      return true;
    }
  }
  return false;
}

export function createRegistry(set: RuleSet, options: ParseOptions): Registry {
  const blockRules = select(set.blockRules, options);
  const blockOther: BlockRule[] = [];
  for (const rule of blockRules) {
    if (rule.triggers === undefined) {
      blockOther.push(rule);
    }
  }
  const blockByChar: BlockRule[][] = [];
  for (let code = 0; code < 128; code++) {
    const list: BlockRule[] = [];
    for (const rule of blockRules) {
      if (rule.triggers === undefined || hasTrigger(rule.triggers, code)) {
        list.push(rule);
      }
    }
    blockByChar.push(list.length === blockOther.length ? blockOther : list);
  }

  const inlineRules = select(set.inlineRules, options);
  const inlineByChar: (InlineRule[] | undefined)[] = [];
  const inlineResolvers: InlineRule[] = [];
  for (let code = 0; code < 128; code++) {
    let list: InlineRule[] | undefined;
    for (const rule of inlineRules) {
      if (hasTrigger(rule.triggers, code)) {
        list ??= [];
        list.push(rule);
      }
    }
    inlineByChar.push(list);
  }
  for (const rule of inlineRules) {
    if (rule.resolve !== undefined) {
      inlineResolvers.push(rule);
    }
  }

  const transforms: Transform[] = [];
  for (const transform of set.transforms) {
    if (transform.gfm !== true || options.gfm) {
      transforms.push(transform);
    }
  }

  return {
    blockByChar,
    blockOther,
    paragraphPrefixRules: select(set.paragraphPrefixRules, options),
    inlineByChar,
    inlineResolvers,
    transforms,
  };
}
