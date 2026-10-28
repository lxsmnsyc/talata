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
// closes, and puts it back through hooks in the inline queue: queued nodes
// whose `children` setter runs when the inline parser reaches that position.

export interface Scope {
  /** The opening line has been passed in the inline queue. */
  started: boolean;
  /** Offset where the content starts. */
  start: number;
}

interface Hidden {
  label: string;
  set: Set<string>;
  depth: number;
  scope: Scope;
}

interface Manager {
  /** Directive containers around the leaf being parsed, in queue order. */
  depth: number;
  hidden: Hidden[];
}

const managers = new WeakMap<Source, Manager>();

function manager(source: Source): Manager {
  let found = managers.get(source);
  if (found === undefined) {
    found = { depth: 0, hidden: [] };
    managers.set(source, found);
  }
  return found;
}

const counts = new WeakMap<Set<string>, Map<string, number>>();

/** Counts the labels added to `definitions` and `footnotes` from now on, duplicates too. */
export function track(state: DocumentState): void {
  for (const set of [state.definitions, state.footnotes]) {
    if (counts.has(set)) {
      continue;
    }
    const map = new Map<string, number>();
    counts.set(set, map);
    const add = set.add.bind(set);
    Object.defineProperty(set, 'add', {
      configurable: true,
      value(label: string): Set<string> {
        map.set(label, (map.get(label) ?? 0) + 1);
        return add(label);
      },
    });
  }
}

/** How many times each lowercase identifier is defined in a directive, by kind. */
export interface Inside {
  definitions: Map<string, number>;
  footnotes: Map<string, number>;
}

export interface Snapshot {
  definitions: number;
  footnotes: number;
}

export function snapshot(state: DocumentState): Snapshot {
  return { definitions: state.definitions.size, footnotes: state.footnotes.size };
}

function take(
  set: Set<string>,
  from: number,
  inside: Map<string, number>,
  depth: number,
  scope: Scope,
  into: Hidden[],
): void {
  if (set.size <= from) {
    return;
  }
  const labels: string[] = [];
  let index = 0;
  for (const label of set) {
    // A label that was added more often than the directive defines it has a definition outside.
    if (index++ >= from && inside.get(label.toLowerCase()) === (counts.get(set)?.get(label) ?? 0)) {
      labels.push(label);
    }
  }
  for (const label of labels) {
    set.delete(label);
    into.push({ label, set, depth, scope });
  }
}

/** Takes out what the directive's content added (`inside` holds the lowercase identifiers of the definitions in its children); `depth` is that content's depth. */
export function hide(
  state: DocumentState,
  before: Snapshot,
  inside: Inside,
  depth: number,
  scope: Scope,
): void {
  const found = manager(state.source);
  take(state.definitions, before.definitions, inside.definitions, depth, scope, found.hidden);
  take(state.footnotes, before.footnotes, inside.footnotes, depth, scope, found.hidden);
}

function update(found: Manager, depth: number, offset: number): void {
  for (const entry of found.hidden) {
    const visible =
      entry.depth <= depth ||
      (entry.depth === depth + 1 &&
        (offset < 0 ? entry.scope.started : entry.scope.start < offset));
    if (visible) {
      entry.set.add(entry.label);
    } else {
      entry.set.delete(entry.label);
    }
  }
}

interface Queued {
  children: unknown[];
}

function hook(state: { inline(node: Queued, ranges: number[]): void }, run: () => void): void {
  state.inline(
    {
      get children(): unknown[] {
        return [];
      },
      set children(_value: unknown[]) {
        run();
      },
    },
    [],
  );
}

/** Queues the point where the content of the directive starts. */
export function enter(
  state: { source: Source; inline(node: Queued, ranges: number[]): void },
  scope: Scope,
): void {
  const found = manager(state.source);
  hook(state, () => {
    scope.started = true;
    found.depth++;
    update(found, found.depth, -1);
  });
}

/** Queues the point where the content of the directive ends. */
export function leave(state: {
  source: Source;
  inline(node: Queued, ranges: number[]): void;
}): void {
  const found = manager(state.source);
  hook(state, () => {
    found.depth--;
    update(found, found.depth, -1);
  });
}

/** The depth of the leaf the inline parser is on. */
export function currentDepth(source: Source): number {
  return manager(source).depth;
}

/**
 * Sets what a label parsed after its leaf sees: the label is text one pass
 * later than the leaf, so it counts as text one level deeper, at `offset`.
 */
export function viewLabel(source: Source, depth: number, offset: number): void {
  const found = manager(source);
  found.depth = depth + 1;
  update(found, found.depth, offset);
}
