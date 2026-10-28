export interface Difference {
  path: string;
  expected: unknown;
  actual: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function childPath(path: string, key: string, isIndex: boolean): string {
  return isIndex ? `${path}[${key}]` : `${path}.${key}`;
}

function walk(expected: unknown, actual: unknown, path: string): Difference | undefined {
  if (Object.is(expected, actual)) {
    return undefined;
  }
  if (!isObject(expected) || !isObject(actual)) {
    return { path, expected, actual };
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return { path, expected, actual };
    }
    const left: unknown[] = expected;
    const right: unknown[] = actual;
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i++) {
      const found = walk(left[i], right[i], childPath(path, String(i), true));
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  // Keys in the reference's order first, then keys only talata has. A key with
  // the value undefined counts as missing, like vitest's toEqual.
  for (const key of Object.keys(expected)) {
    const found = walk(expected[key], actual[key], childPath(path, key, false));
    if (found) {
      return found;
    }
  }
  for (const key of Object.keys(actual)) {
    if (!(key in expected)) {
      const found = walk(undefined, actual[key], childPath(path, key, false));
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Finds the first difference between two trees, in document order.
 * `expected` is the reference tree. Returns undefined when the trees are equal.
 */
export function firstDiff(expected: unknown, actual: unknown): Difference | undefined {
  return walk(expected, actual, 'root');
}

function clip(text: string): string {
  return text.length > 600 ? `${text.slice(0, 600)}... (${text.length} chars)` : text;
}

export function describeValue(value: unknown): string {
  return value === undefined ? '(missing)' : clip(JSON.stringify(value));
}

/** A one-line description of a difference, or undefined when there is none. */
export function describeDiff(found: Difference | undefined): string | undefined {
  if (!found) {
    return undefined;
  }
  return `${found.path}\n  reference: ${describeValue(found.expected)}\n  talata:    ${describeValue(found.actual)}`;
}
