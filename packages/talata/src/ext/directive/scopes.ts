import type { RootContent } from 'mdast';
import type { BlockState } from '../../core/blocks';
import type { Source } from '../../core/source';
import type { DocumentState } from '../../core/state';

// micromark parses the content of a container directive as a document of its
// own, in a later pass than the document around it. A definition or footnote
// definition inside a directive is therefore unknown to the text that
// micromark reads in the same or an earlier pass. With `depth` the number of
// directive containers around a block, a definition at depth D is known to
// text at depth T when D <= T, or when D == T + 1 and the text comes after
// the directive's opening line. It is never known when D >= T + 2.
//
// The block parser fills `definitions` and `footnotes` for the whole
// document. A directive takes out of them what its content added when it
// closes (`hide`). Queued hooks put labels back while the inline pass
// runs: `enter` and `leave` mark where a directive's content starts and
// ends in the queue of leaves.

export interface Scope {
  /** The inline pass has passed the opening line. */
  started: boolean;
}

/** One hidden definition: a label in `set`, defined at `depth` inside `scope`. */
interface Site {
  set: Set<string>;
  label: string;
  depth: number;
  scope: Scope;
}

interface Manager {
  /** Directive containers around the leaf the inline pass is on. */
  depth: number;
  sites: Site[];
  /** False until the first hook runs, when the block pass is over. */
  checked: boolean;
}

const managers = new WeakMap<Source, Manager>();

function getManager(source: Source): Manager {
  let found = managers.get(source);
  if (found === undefined) {
    found = { depth: 0, sites: [], checked: false };
    managers.set(source, found);
  }
  return found;
}

/** Sizes of `definitions` and `footnotes` when a directive's content starts. */
export interface Snapshot {
  definitions: number;
  footnotes: number;
}

export function snapshot(state: DocumentState): Snapshot {
  return { definitions: state.definitions.size, footnotes: state.footnotes.size };
}

/** Identifiers of the definitions in `nodes`, outside the directives inside (they hid their own). */
function collectIdentifiers(
  nodes: RootContent[],
  definitions: Set<string>,
  footnotes: Set<string>,
): void {
  for (const node of nodes) {
    if (node.type === 'definition') {
      definitions.add(node.identifier);
    } else if (node.type === 'footnoteDefinition') {
      footnotes.add(node.identifier);
    }
    if (node.type !== ('containerDirective' as string) && 'children' in node) {
      collectIdentifiers(node.children, definitions, footnotes);
    }
  }
}

/** Moves the labels that `set` gained after `from` and `inside` defines into `into`. */
function take(
  set: Set<string>,
  from: number,
  inside: Set<string>,
  depth: number,
  scope: Scope,
  into: Site[],
): void {
  if (set.size <= from || inside.size === 0) {
    return;
  }
  const labels: string[] = [];
  let index = 0;
  for (const label of set) {
    if (index++ >= from && inside.has(label.toLowerCase())) {
      labels.push(label);
    }
  }
  for (const label of labels) {
    set.delete(label);
    into.push({ set, label, depth, scope });
  }
}

/**
 * Takes out what a directive's content added since `before`. `children` is
 * its content and `depth` that content's depth.
 */
export function hide(
  state: BlockState,
  before: Snapshot,
  children: RootContent[],
  depth: number,
  scope: Scope,
): void {
  const definitions = new Set<string>();
  const footnotes = new Set<string>();
  collectIdentifiers(children, definitions, footnotes);
  const found = getManager(state.source);
  take(state.definitions, before.definitions, definitions, depth, scope, found.sites);
  take(state.footnotes, before.footnotes, footnotes, depth, scope, found.sites);
}

/**
 * Whether `site` is known to text at `depth`. A leaf also knows the
 * definitions one level deeper whose directive opened before it; a label
 * does not.
 */
function isVisible(site: Site, depth: number, label: boolean): boolean {
  if (site.depth <= depth) {
    return true;
  }
  return !label && site.depth === depth + 1 && site.scope.started;
}

/** Adds or removes each hidden label for text at `depth`. */
function update(found: Manager, depth: number, label: boolean): void {
  const sites = found.sites;
  if (!found.checked) {
    // A label still in the set after the block pass has a definition
    // outside every directive, known everywhere.
    found.checked = true;
    let write = 0;
    for (const site of sites) {
      if (!site.set.has(site.label)) {
        sites[write++] = site;
      }
    }
    sites.length = write;
  }
  if (sites.length === 0) {
    return;
  }
  // A label is known when one of its definitions is.
  const known = new Map<Set<string>, Set<string>>();
  for (const site of sites) {
    let labels = known.get(site.set);
    if (labels === undefined) {
      labels = new Set();
      known.set(site.set, labels);
    }
    if (isVisible(site, depth, label)) {
      labels.add(site.label);
    }
  }
  for (const site of sites) {
    if (known.get(site.set)!.has(site.label)) {
      site.set.add(site.label);
    } else {
      site.set.delete(site.label);
    }
  }
}

/** Queues `run` in the inline pass, between the leaves queued before and after. */
function queueHook(state: BlockState, run: () => void): void {
  state.inline(
    {
      get children(): [] {
        return [];
      },
      set children(_value: unknown) {
        run();
      },
    },
    [],
  );
}

/** Queues the point where the content of a directive starts. */
export function enter(state: BlockState, scope: Scope): void {
  const found = getManager(state.source);
  queueHook(state, () => {
    scope.started = true;
    found.depth++;
    update(found, found.depth, false);
  });
}

/** Queues the point where the content of a directive ends. */
export function leave(state: BlockState): void {
  const found = getManager(state.source);
  queueHook(state, () => {
    found.depth--;
    update(found, found.depth, false);
  });
}

/**
 * Runs `parse` as the reference reads a text directive label: one pass later
 * than the leaf it is in, so as text one level deeper.
 */
export function inLabel<T>(source: Source, parse: () => T): T {
  const found = managers.get(source);
  if (found === undefined || found.sites.length === 0) {
    return parse();
  }
  const depth = found.depth;
  found.depth = depth + 1;
  update(found, depth + 1, true);
  const result = parse();
  found.depth = depth;
  update(found, depth, false);
  return result;
}
